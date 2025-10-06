import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';

import { createApp } from '../app.js';
import { computeDailyStates, projectStateUntil } from '../finance/portfolio.js';

const noopLogger = { info() {}, warn() {}, error() {} };

function withTempApp(run) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'portfolio-edge-'));
  const app = createApp({
    dataDir,
    logger: noopLogger,
    config: { featureFlags: { cashBenchmarks: true }, cors: { allowedOrigins: [] } },
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
    const apiKey = 'ValidKeyEdge1!';
    const response = await request(app)
      .post('/api/portfolio/' + portfolioId)
      .set('X-Portfolio-Key', apiKey)
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
      });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'E_OVERSELL');
    assert.equal(response.body.details?.ticker, 'TSLA');
    assert.ok((response.body.details?.requested ?? 0) > (response.body.details?.available ?? 0));
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

test('validation rejects negative prices before persistence', async () => {
  await withTempApp(async ({ app }) => {
    const portfolioId = 'edge-validate-' + randomUUID();
    const apiKey = 'ValidKeyEdge2!';
    const response = await request(app)
      .post('/api/portfolio/' + portfolioId)
      .set('X-Portfolio-Key', apiKey)
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
      });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'VALIDATION_ERROR');
    const details = Array.isArray(response.body.details) ? response.body.details : [];
    assert.ok(details.some((detail) => detail.path?.includes('price')));
  });
});
