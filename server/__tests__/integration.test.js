import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';

import { createApp } from '../app.js';

const noopLogger = { info() {}, warn() {}, error() {} };

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
    return createApp({
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

test('portfolio lifecycle persists transactions, signals, and key rotation', async () => {
  const app = buildApp();
  const portfolioId = 'life-' + randomUUID();
  const apiKey = 'ValidKey123!';
  const rotatedKey = 'ValidKey321!';

  const bootstrap = await request(app)
    .post('/api/portfolio/' + portfolioId)
    .set('X-Portfolio-Key', apiKey)
    .send({ transactions: [], signals: {} });
  assert.equal(bootstrap.status, 200);
  assert.deepEqual(bootstrap.body, { status: 'ok' });

  const updatePayload = {
    transactions: [
      { date: '2024-01-02', type: 'BUY', ticker: 'aapl', amount: -500, price: 125, shares: 4 },
      { date: '2024-01-01', type: 'DEPOSIT', amount: 1000 },
    ],
    signals: { spy: { pct: 42 } },
    settings: { autoClip: false },
  };

  const update = await request(app)
    .post('/api/portfolio/' + portfolioId)
    .set('X-Portfolio-Key', apiKey)
    .send(updatePayload);
  assert.equal(update.status, 200);
  assert.deepEqual(update.body, { status: 'ok' });

  const fetched = await request(app)
    .get('/api/portfolio/' + portfolioId)
    .set('X-Portfolio-Key', apiKey);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.transactions.length, 2);
  const tickers = fetched.body.transactions.map((tx) => tx.ticker).filter(Boolean);
  assert.ok(tickers.every((ticker) => ticker === ticker.toUpperCase()));
  assert.deepEqual(fetched.body.signals, { SPY: { pct: 42 } });

  const rotate = await request(app)
    .post('/api/portfolio/' + portfolioId)
    .set('X-Portfolio-Key', apiKey)
    .set('X-Portfolio-Key-New', rotatedKey)
    .send(updatePayload);
  assert.equal(rotate.status, 200);
  assert.deepEqual(rotate.body, { status: 'ok' });

  const legacyKeyRead = await request(app)
    .get('/api/portfolio/' + portfolioId)
    .set('X-Portfolio-Key', apiKey);
  assert.equal(legacyKeyRead.status, 403);
  assert.equal(legacyKeyRead.body.error, 'INVALID_KEY');

  const rotatedKeyRead = await request(app)
    .get('/api/portfolio/' + portfolioId)
    .set('X-Portfolio-Key', rotatedKey);
  assert.equal(rotatedKeyRead.status, 200);

  const storedPath = path.join(dataDir, 'portfolio_' + portfolioId + '.json');
  const persisted = JSON.parse(readFileSync(storedPath, 'utf8'));
  assert.equal(persisted.transactions.length, 2);
  assert.ok(persisted.transactions.every((tx) => typeof tx.uid === 'string' && tx.uid.length > 0));
});

test('concurrent portfolio modifications remain consistent', async () => {
  const app = buildApp();
  const portfolioId = 'con-' + randomUUID();
  const apiKey = 'ValidKeyABC1!';

  await request(app)
    .post('/api/portfolio/' + portfolioId)
    .set('X-Portfolio-Key', apiKey)
    .send({ transactions: [], signals: {} });

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
    request(app)
      .post('/api/portfolio/' + portfolioId)
      .set('X-Portfolio-Key', apiKey)
      .send(payloadA),
    request(app)
      .post('/api/portfolio/' + portfolioId)
      .set('X-Portfolio-Key', apiKey)
      .send(payloadB),
  ]);

  assert.equal(responseA.status, 200);
  assert.equal(responseB.status, 200);

  const final = await request(app)
    .get('/api/portfolio/' + portfolioId)
    .set('X-Portfolio-Key', apiKey);
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

test('brute-force guard blocks repeated invalid key attempts and allows recovery', async () => {
  const app = buildApp();
  const portfolioId = 'bf-' + randomUUID();
  const apiKey = 'ValidKeyLock1!';

  await request(app)
    .post('/api/portfolio/' + portfolioId)
    .set('X-Portfolio-Key', apiKey)
    .send({ transactions: [], signals: {} });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const invalid = await request(app)
      .get('/api/portfolio/' + portfolioId)
      .set('X-Portfolio-Key', 'invalid-' + attempt);
    assert.equal(invalid.status, 403);
    assert.equal(invalid.body.error, 'INVALID_KEY');
  }

  const blocked = await request(app)
    .get('/api/portfolio/' + portfolioId)
    .set('X-Portfolio-Key', 'invalid-final');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error, 'TOO_MANY_KEY_ATTEMPTS');
  assert.ok(Number.isFinite(Number.parseInt(blocked.headers['retry-after'] ?? '0', 10)));

  const retryAfterSeconds = Number.parseInt(blocked.headers['retry-after'] ?? '0', 10);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000 + 100));
  }

  const recovery = await request(app)
    .get('/api/portfolio/' + portfolioId)
    .set('X-Portfolio-Key', apiKey);
  assert.equal(recovery.status, 200);
  assert.deepEqual(recovery.body.transactions, []);
});
