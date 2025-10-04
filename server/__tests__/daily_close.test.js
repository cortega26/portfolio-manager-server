import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';

import JsonTableStorage from '../data/storage.js';
import { runDailyClose } from '../jobs/daily_close.js';
import { createApp } from '../app.js';

const noopLogger = { info() {}, warn() {}, error() {} };

class FakePriceProvider {
  constructor(pricesBySymbol) {
    this.pricesBySymbol = pricesBySymbol;
  }

  async getDailyAdjustedClose(symbol, from, to) {
    const data = this.pricesBySymbol[symbol] ?? [];
    return data.filter((row) => row.date >= from && row.date <= to);
  }
}

let dataDir;
let storage;

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'job-test-'));
  storage = new JsonTableStorage({ dataDir, logger: noopLogger });
  await storage.ensureTable('transactions', []);
  await storage.ensureTable('cash_rates', []);
  await storage.ensureTable('prices', []);
  await storage.ensureTable('returns_daily', []);
  await storage.ensureTable('nav_snapshots', []);
  await storage.ensureTable('jobs_state', []);
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test('runDailyClose accrues interest and is idempotent', async () => {
  await storage.upsertRow(
    'cash_rates',
    { effective_date: '2023-12-01', apy: 0.0365 },
    ['effective_date'],
  );
  await storage.upsertRow(
    'transactions',
    { id: 'd1', type: 'DEPOSIT', ticker: 'CASH', date: '2024-01-01', amount: 1000 },
    ['id'],
  );
  await storage.upsertRow(
    'transactions',
    { id: 'b1', type: 'BUY', ticker: 'SPY', date: '2024-01-01', quantity: 5, amount: 500 },
    ['id'],
  );

  const provider = new FakePriceProvider({
    SPY: [
      { date: '2024-01-01', adjClose: 100 },
      { date: '2024-01-02', adjClose: 101 },
      { date: '2024-01-03', adjClose: 102 },
    ],
  });

  await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-02T00:00:00Z'),
    priceProvider: provider,
  });
  await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-03T00:00:00Z'),
    priceProvider: provider,
  });
  await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-03T00:00:00Z'),
    priceProvider: provider,
  });

  const transactions = await storage.readTable('transactions');
  const interest = transactions.filter((tx) => tx.type === 'INTEREST');
  assert.equal(interest.length, 2);

  const returns = await storage.readTable('returns_daily');
  assert.ok(returns.find((row) => row.date === '2024-01-02'));
  assert.ok(returns.find((row) => row.date === '2024-01-03'));
});

test('API endpoints expose computed series', async () => {
  await storage.upsertRow(
    'cash_rates',
    { effective_date: '2023-12-01', apy: 0.0365 },
    ['effective_date'],
  );
  await storage.upsertRow(
    'transactions',
    { id: 'd1', type: 'DEPOSIT', ticker: 'CASH', date: '2024-01-01', amount: 1000 },
    ['id'],
  );
  const provider = new FakePriceProvider({
    SPY: [
      { date: '2024-01-01', adjClose: 100 },
      { date: '2024-01-02', adjClose: 101 },
    ],
  });
  await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-02T00:00:00Z'),
    priceProvider: provider,
  });

  const app = createApp({
    dataDir,
    logger: noopLogger,
    config: { featureFlags: { cashBenchmarks: true } },
  });
  const returnsResponse = await request(app).get(
    '/api/returns/daily?from=2024-01-01&to=2024-01-02&views=port,bench',
  );
  assert.equal(returnsResponse.status, 200);
  assert.ok(Array.isArray(returnsResponse.body.series.r_port));

  const navResponse = await request(app).get(
    '/api/nav/daily?from=2024-01-02&to=2024-01-02',
  );
  assert.equal(navResponse.status, 200);
  assert.ok(Array.isArray(navResponse.body.data));
  assert.equal(navResponse.body.data[0].stale_price, false);

  const summaryResponse = await request(app).get(
    '/api/benchmarks/summary?from=2024-01-01&to=2024-01-02',
  );
  assert.equal(summaryResponse.status, 200);
  assert.ok(summaryResponse.body.summary);

  const postRate = await request(app)
    .post('/api/admin/cash-rate')
    .send({ effective_date: '2024-01-15', apy: 0.04 });
  assert.equal(postRate.status, 200);
});

test('stale prices set flag when latest close missing', async () => {
  await storage.upsertRow(
    'cash_rates',
    { effective_date: '2023-12-01', apy: 0.02 },
    ['effective_date'],
  );
  await storage.upsertRow(
    'transactions',
    { id: 'd1', type: 'DEPOSIT', ticker: 'CASH', date: '2024-01-01', amount: 1000 },
    ['id'],
  );
  await storage.upsertRow(
    'transactions',
    { id: 'b1', type: 'BUY', ticker: 'SPY', date: '2024-01-01', quantity: 5, amount: 500 },
    ['id'],
  );

  const provider = new FakePriceProvider({
    SPY: [
      { date: '2024-01-01', adjClose: 100 },
      // intentionally missing 2024-01-02 to force carry forward
    ],
  });

  await runDailyClose({
    dataDir,
    logger: noopLogger,
    date: new Date('2024-01-02T00:00:00Z'),
    priceProvider: provider,
  });

  const navSnapshots = await storage.readTable('nav_snapshots');
  const target = navSnapshots.find((row) => row.date === '2024-01-02');
  assert.ok(target);
  assert.equal(target.stale_price, true);
});
