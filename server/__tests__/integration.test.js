import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';

import JsonTableStorage from '../data/storage.js';
import { readPortfolioState } from '../data/portfolioState.js';
import { runDailyClose } from '../jobs/daily_close.js';
import { createSessionTestApp, withSession } from './sessionTestUtils.js';

const noopLogger = { info() {}, warn() {}, error() {} };
const API_BASES = ['/api', '/api/v1'];

let dataDir;
let buildApp;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'portfolio-int-'));
  buildApp = (overrides = {}) => {
    const baseConfig = {
      featureFlags: { cashBenchmarks: true },
      cors: { allowedOrigins: [] },
      security: {
        bruteForce: {
          maxAttempts: 5,
          attemptWindowSeconds: 120,
          baseLockoutSeconds: 2,
          maxLockoutSeconds: 30,
          progressiveMultiplier: 2,
          checkPeriodSeconds: 1,
        },
      },
    };
    const { config: configOverrides = {}, ...rest } = overrides;
    const mergedConfig = {
      ...baseConfig,
      ...configOverrides,
      security: {
        ...baseConfig.security,
        ...(configOverrides.security ?? {}),
        bruteForce: {
          ...baseConfig.security.bruteForce,
          ...(configOverrides.security?.bruteForce ?? {}),
        },
      },
    };
    return createSessionTestApp({
      dataDir,
      logger: noopLogger,
      config: mergedConfig,
      ...rest,
    });
  };
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

for (const basePath of API_BASES) {
  test(`portfolio lifecycle persists transactions and signals with session auth (${basePath})`, async () => {
    const app = buildApp();
    const portfolioId = 'life-' + randomUUID();
    const withBase = (suffix) => `${basePath}${suffix}`;

    const bootstrap = await withSession(
      request(app)
        .post(withBase('/portfolio/' + portfolioId))
        .set('X-Request-ID', ' inbound-trace ')
        .send({ transactions: [], signals: {} }),
    );
    assert.equal(bootstrap.status, 200);
    assert.deepEqual(bootstrap.body, { status: 'ok' });
    assert.equal(bootstrap.headers['x-request-id'], 'inbound-trace');
    assert.equal(bootstrap.headers['x-api-version'], basePath === '/api' ? 'legacy' : 'v1');
    if (basePath === '/api') {
      assert.ok(String(bootstrap.headers.warning ?? '').includes('/api/v1'));
    }

    const updatePayload = {
      transactions: [
        { date: '2024-01-02', type: 'BUY', ticker: 'aapl', amount: -500, price: 125, shares: 4 },
        { date: '2024-01-01', type: 'DEPOSIT', amount: 1000 },
      ],
      signals: { spy: { pct: 42 } },
      settings: {
        autoClip: false,
        notifications: {
          email: true,
          push: false,
          signalTransitions: false,
        },
        alerts: {
          rebalance: false,
          drawdownThreshold: 12,
          marketStatus: false,
          roiFallback: false,
        },
        privacy: {
          hideBalances: true,
        },
        display: {
          currency: 'EUR',
          refreshInterval: 10,
          compactTables: true,
        },
      },
    };

    const update = await withSession(
      request(app)
        .post(withBase('/portfolio/' + portfolioId))
        .send(updatePayload),
    );
    assert.equal(update.status, 200);
    assert.deepEqual(update.body, { status: 'ok' });

    const fetched = await withSession(
      request(app).get(withBase('/portfolio/' + portfolioId)),
    );
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.transactions.length, 2);
    const tickers = fetched.body.transactions.map((tx) => tx.ticker).filter(Boolean);
    assert.ok(tickers.every((ticker) => ticker === ticker.toUpperCase()));
    assert.deepEqual(fetched.body.signals, { SPY: { pct: 42 } });
    assert.deepEqual(fetched.body.settings, updatePayload.settings);

    const storage = new JsonTableStorage({ dataDir, logger: noopLogger });
    const persisted = await readPortfolioState(storage, portfolioId);
    assert.equal(persisted.transactions.length, 2);
    assert.ok(persisted.transactions.every((tx) => typeof tx.uid === 'string' && tx.uid.length > 0));
    assert.deepEqual(persisted.settings, updatePayload.settings);
  });
}

for (const basePath of API_BASES) {
  test(`concurrent portfolio modifications remain consistent (${basePath})`, async () => {
    const app = buildApp();
    const portfolioId = 'con-' + randomUUID();
    const withBase = (suffix) => `${basePath}${suffix}`;

    await withSession(
      request(app)
        .post(withBase('/portfolio/' + portfolioId))
        .send({ transactions: [], signals: {} }),
    );

    const payloadA = {
      transactions: [
        { date: '2024-02-01', type: 'DEPOSIT', amount: 5000 },
        { date: '2024-02-02', type: 'BUY', ticker: 'MSFT', amount: -2500, price: 250, shares: 10 },
      ],
      signals: {},
    };
    const payloadB = {
      transactions: [
        { date: '2024-02-05', type: 'DEPOSIT', amount: 3000 },
        { date: '2024-02-06', type: 'BUY', ticker: 'NVDA', amount: -1200, price: 300, shares: 4 },
      ],
      signals: { nvda: { pct: 10 } },
    };

    const [responseA, responseB] = await Promise.all([
      withSession(
        request(app)
          .post(withBase('/portfolio/' + portfolioId))
          .send(payloadA),
      ),
      withSession(
        request(app)
          .post(withBase('/portfolio/' + portfolioId))
          .send(payloadB),
      ),
    ]);

    assert.equal(responseA.status, 200);
    assert.equal(responseB.status, 200);

    const final = await withSession(
      request(app).get(withBase('/portfolio/' + portfolioId)),
    );
    assert.equal(final.status, 200);
    assert.ok(
      final.body.transactions.length === payloadA.transactions.length
        || final.body.transactions.length === payloadB.transactions.length,
    );
    final.body.transactions.forEach((tx) => {
      assert.equal(typeof tx.uid, 'string');
      assert.ok(tx.uid.length > 0);
    });

    const expectedSignals = final.body.transactions[0].ticker === 'MSFT'
      ? {}
      : { NVDA: { pct: 10 } };
    assert.deepEqual(final.body.signals, expectedSignals);
  });
}

for (const basePath of API_BASES) {
  test(`session auth rejects missing and invalid desktop tokens (${basePath})`, async () => {
    const app = buildApp();
    const withBase = (suffix) => `${basePath}${suffix}`;

    const missing = await request(app).get(withBase('/portfolio/' + randomUUID()));
    assert.equal(missing.status, 401);
    assert.equal(missing.body.error, 'NO_SESSION_TOKEN');

    const invalid = await withSession(
      request(app).get(withBase('/portfolio/' + randomUUID())),
      'invalid-session-token',
    );
    assert.equal(invalid.status, 403);
    assert.equal(invalid.body.error, 'INVALID_SESSION_TOKEN');
  });
}

for (const basePath of API_BASES) {
  test(`signal preview evaluates rows without persisting portfolio state (${basePath})`, async () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const todayKey = today.toISOString().slice(0, 10);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);
    const app = buildApp({
      priceProvider: {
        async getDailyAdjustedClose(symbol) {
          return [
            { date: yesterdayKey, adjClose: symbol === "MSFT" ? 118 : 100 },
            { date: todayKey, adjClose: symbol === "MSFT" ? 121 : 105 },
          ];
        },
      },
      config: {
        freshness: { maxStaleTradingDays: 30 },
      },
    });

    const response = await withSession(
      request(app)
        .post(`${basePath}/signals`)
        .send({
          transactions: [
            { date: "2024-01-01", type: "DEPOSIT", amount: 1000 },
            { date: "2024-01-02", type: "BUY", ticker: "msft", amount: -500, price: 100, shares: 5 },
          ],
          signals: {
            msft: { pct: 5 },
          },
        }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.prices, { MSFT: 121 });
    assert.equal(response.body.rows.length, 1);
    assert.deepEqual(response.body.rows[0], {
      ticker: "MSFT",
      pctWindow: 5,
      status: "TRIM_ZONE",
      currentPrice: 121,
      currentPriceAsOf: todayKey,
      lowerBound: 95,
      upperBound: 105,
      referencePrice: 100,
      referenceDate: "2024-01-02",
      referenceType: "BUY",
      sanityRejected: false,
    });

    const storage = new JsonTableStorage({ dataDir, logger: noopLogger });
    const persisted = await readPortfolioState(storage, "signals-preview");
    assert.equal(persisted, null);
  });
}

for (const basePath of API_BASES) {
  test(`signal preview rejects invalid draft payloads (${basePath})`, async () => {
    const app = buildApp();

    const response = await withSession(
      request(app)
        .post(`${basePath}/signals`)
        .send({
          transactions: [
            { date: "2024-01-02", type: "BUY", ticker: "AAPL", amount: -100, price: -10, shares: 1 },
          ],
          signals: {},
        }),
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "VALIDATION_ERROR");
  });
}

for (const basePath of API_BASES) {
  test(`portfolio signal notifications expose persisted backend alerts (${basePath})`, async () => {
    const app = buildApp();
    const portfolioId = 'alerts-' + randomUUID();
    const withBase = (suffix) => `${basePath}${suffix}`;

    const saveResponse = await withSession(
      request(app)
        .post(withBase('/portfolio/' + portfolioId))
        .send({
          transactions: [
            { date: '2024-01-01', type: 'DEPOSIT', amount: 1000 },
            { date: '2024-01-02', type: 'BUY', ticker: 'AAPL', amount: -500, price: 100, shares: 5 },
          ],
          signals: { AAPL: { pct: 5 } },
          settings: {
            notifications: {
              email: true,
              push: true,
              signalTransitions: true,
            },
          },
        }),
    );
    assert.equal(saveResponse.status, 200);

    await runDailyClose({
      dataDir,
      logger: noopLogger,
      date: new Date('2024-01-03T00:00:00Z'),
      priceProvider: {
        async getDailyAdjustedClose(symbol, from, to) {
          const rowsBySymbol = {
            SPY: [
              { date: '2024-01-02', adjClose: 100 },
              { date: '2024-01-03', adjClose: 101 },
            ],
            AAPL: [
              { date: '2024-01-02', adjClose: 100 },
              { date: '2024-01-03', adjClose: 94 },
            ],
          };
          return (rowsBySymbol[symbol] ?? []).filter(
            (row) => row.date >= from && row.date <= to,
          );
        },
      },
      config: {
        featureFlags: { cashBenchmarks: true },
      },
    });

    const response = await withSession(
      request(app).get(withBase('/portfolio/' + portfolioId + '/signal-notifications')),
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].ticker, 'AAPL');
    assert.equal(response.body.data[0].status, 'BUY_ZONE');
    assert.equal(response.body.data[0].delivery.email.status, 'pending');
  });
}

for (const basePath of API_BASES) {
  test(`portfolio signal notification requeue reuses the persisted row (${basePath})`, async () => {
    const app = buildApp();
    const portfolioId = 'alerts-requeue-' + randomUUID();
    const withBase = (suffix) => `${basePath}${suffix}`;

    const saveResponse = await withSession(
      request(app)
        .post(withBase('/portfolio/' + portfolioId))
        .send({
          transactions: [
            { date: '2024-01-01', type: 'DEPOSIT', amount: 1000 },
            { date: '2024-01-02', type: 'BUY', ticker: 'AAPL', amount: -500, price: 100, shares: 5 },
          ],
          signals: { AAPL: { pct: 5 } },
          settings: {
            notifications: {
              email: true,
              push: false,
              signalTransitions: true,
            },
          },
        }),
    );
    assert.equal(saveResponse.status, 200);

    await runDailyClose({
      dataDir,
      logger: noopLogger,
      date: new Date('2024-01-03T00:00:00Z'),
      priceProvider: {
        async getDailyAdjustedClose(symbol, from, to) {
          const rowsBySymbol = {
            SPY: [
              { date: '2024-01-02', adjClose: 100 },
              { date: '2024-01-03', adjClose: 101 },
            ],
            AAPL: [
              { date: '2024-01-02', adjClose: 100 },
              { date: '2024-01-03', adjClose: 94 },
            ],
          };
          return (rowsBySymbol[symbol] ?? []).filter(
            (row) => row.date >= from && row.date <= to,
          );
        },
      },
      config: {
        featureFlags: { cashBenchmarks: true },
      },
    });

    const storage = new JsonTableStorage({ dataDir, logger: noopLogger });
    const notifications = await storage.readTable('signal_notifications');
    assert.equal(notifications.length, 1);
    const [notification] = notifications;
    await storage.upsertRow(
      'signal_notifications',
      {
        ...notification,
        delivery: {
          ...notification.delivery,
          email: {
            ...notification.delivery.email,
            status: 'exhausted',
            attempts: 3,
            lastAttemptAt: '2024-01-03T12:00:00.000Z',
            nextRetryAt: null,
            exhaustedAt: '2024-01-03T12:00:00.000Z',
          },
        },
      },
      ['id'],
    );

    const requeueResponse = await withSession(
      request(app).post(
        withBase(
          '/portfolio/'
            + portfolioId
            + '/signal-notifications/'
            + encodeURIComponent(notification.id)
            + '/requeue-email',
        ),
      ),
    );
    assert.equal(requeueResponse.status, 200);
    assert.equal(requeueResponse.body.status, 'ok');
    assert.equal(requeueResponse.body.changed, true);
    assert.equal(requeueResponse.body.reason, 'requeued');
    assert.equal(requeueResponse.body.data.id, notification.id);
    assert.equal(requeueResponse.body.data.delivery.email.status, 'pending');

    const refreshed = await storage.readTable('signal_notifications');
    assert.equal(refreshed.length, 1);
    assert.equal(refreshed[0].id, notification.id);
    assert.equal(refreshed[0].delivery.email.status, 'pending');
    assert.equal(refreshed[0].delivery.email.exhaustedAt, null);
  });
}

for (const basePath of API_BASES) {
  test(`incoming request id header is normalized and echoed (${basePath})`, async () => {
    const app = buildApp();
    const paddedId = 'x'.repeat(140);
    const response = await request(app)
      .get(`${basePath}/monitoring`)
      .set('X-Request-ID', `  ${paddedId}  `);
    assert.equal(response.status, 200);
    assert.equal(response.headers['x-request-id'], 'x'.repeat(128));
  });
}
