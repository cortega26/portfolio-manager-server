import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';

import { computeDailyStates, projectStateUntil } from '../finance/portfolio.js';
import { createSessionTestApp, withSession } from './sessionTestUtils.js';

const noopLogger = { info() {}, warn() {}, error() {} };

function withTempApp(run) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'portfolio-edge-'));
  const app = createSessionTestApp({
    dataDir,
    logger: noopLogger,
  });
  return run({ app, dataDir }).finally(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });
}

test('computeDailyStates handles same-day ordering without negative cash', () => {
  const transactions = [
    { date: '2024-01-01', type: 'BUY', ticker: 'AAPL', amount: -500, quantity: 2 },
    { date: '2024-01-01', type: 'DEPOSIT', amount: 1000 },
  ];
  const pricesByDate = new Map([
    ['2024-01-01', new Map([['AAPL', 250]])],
  ]);
  const states = computeDailyStates({
    transactions,
    pricesByDate,
    dates: ['2024-01-01'],
  });
  assert.equal(states.length, 1);
  const state = states[0];
  assert.ok(state.cash >= 0, 'cash balance should remain non-negative');
  assert.equal(state.holdings.get('AAPL'), 2);
});

test('oversell prevention rejects sales beyond available shares', async () => {
  await withTempApp(async ({ app }) => {
    const portfolioId = 'edge-oversell-' + randomUUID();
    const response = await withSession(
      request(app)
        .post('/api/portfolio/' + portfolioId)
        .send({
          transactions: [
            {
              date: '2024-01-01',
              type: 'BUY',
              ticker: 'TSLA',
              amount: -1000,
              price: 100,
              shares: 10,
            },
            {
              date: '2024-01-02',
              type: 'SELL',
              ticker: 'TSLA',
              amount: 1500,
              price: 150,
              shares: 15,
            },
          ],
          settings: { autoClip: false },
        }),
    );
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'E_OVERSELL');
    assert.equal(response.body.details?.ticker, 'TSLA');
    assert.ok((response.body.details?.requested ?? 0) > (response.body.details?.available ?? 0));
  });
});

test('rejects withdrawals that exceed available cash', async () => {
  await withTempApp(async ({ app }) => {
    const portfolioId = 'edge-cash-' + randomUUID();
    const response = await withSession(
      request(app)
        .post('/api/portfolio/' + portfolioId)
        .send({
          transactions: [
            { date: '2025-10-09', type: 'DEPOSIT', amount: 500 },
            { date: '2025-10-09', type: 'WITHDRAWAL', amount: 501 },
          ],
          settings: { autoClip: false },
        }),
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'E_CASH_OVERDRAW');
    assert.equal(response.body.details?.date, '2025-10-09');
    assert.equal(response.body.details?.type, 'WITHDRAWAL');
  });
});

test('projectStateUntil preserves fractional precision', () => {
  const transactions = [
    { date: '2024-01-01', type: 'DEPOSIT', amount: 1000 },
    { date: '2024-01-02', type: 'BUY', ticker: 'GOOG', amount: 999.97, quantity: 9.9997 },
    { date: '2024-01-03', type: 'DIVIDEND', amount: 0.12 },
  ];
  const state = projectStateUntil(transactions, '2024-01-03');
  assert.ok(Math.abs(state.cash - 0.15) < 1e-6);
  assert.ok(Math.abs(state.holdings.get('GOOG') - 9.9997) < 1e-6);
});

test('projectStateUntil normalizes bounded micro-share dust back to zero', () => {
  const transactions = [
    { date: '2024-01-01', type: 'BUY', ticker: 'META', amount: -10, quantity: 0.0220064 },
    { date: '2024-01-02', type: 'SELL', ticker: 'META', amount: 10, quantity: -0.0220104 },
  ];
  const state = projectStateUntil(transactions, '2024-01-02');
  assert.equal(state.holdings.has('META'), false);
});

test('projectStateUntil handles large transaction volumes deterministically', () => {
  const transactions = [];
  let expectedCash = 0;
  for (let i = 0; i < 5000; i += 1) {
    const month = ((i % 12) + 1).toString().padStart(2, '0');
    const day = ((i % 28) + 1).toString().padStart(2, '0');
    const date = '2024-' + month + '-' + day;
    if (i % 2 === 0) {
      transactions.push({ date, type: 'DEPOSIT', amount: 100 });
      expectedCash += 100;
    } else {
      transactions.push({ date, type: 'WITHDRAWAL', amount: 40 });
      expectedCash -= 40;
    }
  }
  const state = projectStateUntil(transactions, '2025-12-31');
  assert.equal(Number(state.cash.toFixed(2)), Number(expectedCash.toFixed(2)));
});

test('signal preview tolerates bounded oversell drift from imported fractional shares', async () => {
  await withTempApp(async ({ app }) => {
    const response = await withSession(
      request(app)
        .post('/api/signals')
        .send({
          transactions: [
            { date: '2024-01-01', type: 'DEPOSIT', amount: 100 },
            { date: '2024-01-02', type: 'BUY', ticker: 'META', amount: -10, quantity: 0.0220064 },
            { date: '2024-01-03', type: 'SELL', ticker: 'META', amount: 10, quantity: -0.0220104 },
          ],
          signals: {
            META: { pct: 5 },
          },
          settings: { autoClip: false },
        }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.rows, []);
    assert.equal(response.body.errors?.META, undefined);
  });
});

test('signal preview ignores historical cash overdrafts from imported same-day rebalances', async () => {
  await withTempApp(async ({ app }) => {
    const response = await withSession(
      request(app)
        .post('/api/signals')
        .send({
          transactions: [
            { date: '2024-01-22', type: 'DEPOSIT', amount: 2 },
            { date: '2024-01-22', type: 'BUY', ticker: 'SPY', amount: -1.06, quantity: 0.002197377 },
            { date: '2024-01-23', type: 'BUY', ticker: 'NVDA', amount: -1.06, quantity: 0.01783046 },
            { date: '2024-01-23', type: 'SELL', ticker: 'SPY', amount: 1.06, quantity: -0.002197377 },
          ],
          signals: {
            NVDA: { pct: 5 },
          },
          settings: { autoClip: false },
        }),
    );

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.body.rows));
  });
});

test('portfolio save tolerates bounded oversell drift from imported fractional shares', async () => {
  await withTempApp(async ({ app }) => {
    const portfolioId = 'edge-oversell-dust-' + randomUUID();
    const response = await withSession(
      request(app)
        .post('/api/portfolio/' + portfolioId)
        .send({
          transactions: [
            { date: '2024-01-01', type: 'DEPOSIT', amount: 100 },
            { date: '2024-01-02', type: 'BUY', ticker: 'META', amount: -10, quantity: 0.0220064 },
            { date: '2024-01-03', type: 'SELL', ticker: 'META', amount: 10, quantity: -0.0220104 },
          ],
          settings: { autoClip: false },
        }),
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'ok');
  });
});

test('portfolio save still rejects oversells beyond the dust tolerance', async () => {
  await withTempApp(async ({ app }) => {
    const portfolioId = 'edge-oversell-beyond-dust-' + randomUUID();
    const response = await withSession(
      request(app)
        .post('/api/portfolio/' + portfolioId)
        .send({
          transactions: [
            { date: '2024-01-01', type: 'DEPOSIT', amount: 100 },
            { date: '2024-01-02', type: 'BUY', ticker: 'META', amount: -10, quantity: 0.0220064 },
            { date: '2024-01-03', type: 'SELL', ticker: 'META', amount: 10, quantity: -0.0220124 },
          ],
          settings: { autoClip: false },
        }),
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'E_OVERSELL');
  });
});

test('portfolio save accepts imported same-day rebalances that net cash by end of day', async () => {
  await withTempApp(async ({ app }) => {
    const portfolioId = 'edge-imported-rebalance-' + randomUUID();
    const importedMetadata = {
      system: {
        import: {
          source: 'csv-bootstrap',
          cashChronology: 'day-netted',
        },
      },
    };
    const response = await withSession(
      request(app)
        .post('/api/portfolio/' + portfolioId)
        .send({
          transactions: [
            { date: '2024-01-22', type: 'DEPOSIT', amount: 2, metadata: importedMetadata },
            {
              date: '2024-01-22',
              type: 'BUY',
              ticker: 'SPY',
              amount: -1.06,
              quantity: 0.002197377,
              metadata: importedMetadata,
            },
            {
              date: '2024-01-23',
              type: 'BUY',
              ticker: 'NVDA',
              amount: -1.06,
              quantity: 0.01783046,
              metadata: importedMetadata,
            },
            {
              date: '2024-01-23',
              type: 'SELL',
              ticker: 'SPY',
              amount: 1.06,
              quantity: -0.002197377,
              metadata: importedMetadata,
            },
          ],
          settings: { autoClip: false },
        }),
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'ok');
  });
});

test('portfolio save rejects manual same-day buy before later sell when cash would overdraw', async () => {
  await withTempApp(async ({ app }) => {
    const portfolioId = 'edge-manual-cash-overdraw-' + randomUUID();
    const response = await withSession(
      request(app)
        .post('/api/portfolio/' + portfolioId)
        .send({
          transactions: [
            { date: '2024-01-22', type: 'DEPOSIT', amount: 2, createdAt: 1000, seq: 1 },
            {
              date: '2024-01-22',
              type: 'BUY',
              ticker: 'SPY',
              amount: -1.06,
              quantity: 0.002197377,
              createdAt: 1500,
              seq: 2,
            },
            {
              date: '2024-01-23',
              type: 'BUY',
              ticker: 'NVDA',
              amount: -1.06,
              quantity: 0.01783046,
              createdAt: 2500,
              seq: 3,
            },
            {
              date: '2024-01-23',
              type: 'SELL',
              ticker: 'SPY',
              amount: 1.06,
              quantity: -0.002197377,
              createdAt: 3500,
              seq: 4,
            },
          ],
          settings: { autoClip: false },
        }),
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'E_CASH_OVERDRAW');
  });
});

test('portfolio save accepts manual same-day sell before buy when chronology funds the purchase', async () => {
  await withTempApp(async ({ app }) => {
    const portfolioId = 'edge-manual-cash-chronology-' + randomUUID();
    const response = await withSession(
      request(app)
        .post('/api/portfolio/' + portfolioId)
        .send({
          transactions: [
            { date: '2024-01-22', type: 'DEPOSIT', amount: 2, createdAt: 1000, seq: 1 },
            {
              date: '2024-01-22',
              type: 'BUY',
              ticker: 'SPY',
              amount: -1.06,
              quantity: 0.002197377,
              createdAt: 1500,
              seq: 2,
            },
            {
              date: '2024-01-23',
              type: 'SELL',
              ticker: 'SPY',
              amount: 1.06,
              quantity: -0.002197377,
              createdAt: 2500,
              seq: 3,
            },
            {
              date: '2024-01-23',
              type: 'BUY',
              ticker: 'NVDA',
              amount: -1.06,
              quantity: 0.01783046,
              createdAt: 3500,
              seq: 4,
            },
          ],
          settings: { autoClip: false },
        }),
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'ok');
  });
});

test('validation rejects negative prices before persistence', async () => {
  await withTempApp(async ({ app }) => {
    const portfolioId = 'edge-validate-' + randomUUID();
    const response = await withSession(
      request(app)
        .post('/api/portfolio/' + portfolioId)
        .send({
          transactions: [
            {
              date: '2024-03-01',
              type: 'BUY',
              ticker: 'MSFT',
              amount: -1000,
              price: -10,
              shares: 10,
            },
          ],
        }),
    );
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'VALIDATION_ERROR');
    const details = Array.isArray(response.body.details) ? response.body.details : [];
    assert.ok(details.some((detail) => detail.path?.includes('price')));
  });
});
