// @ts-nocheck
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';

import { createApp } from '../app.js';
import JsonTableStorage from '../data/storage.js';

const noopLogger = { info() {}, warn() {}, error() {} };

class StaticPriceProvider {
  constructor(rows) {
    this.rows = rows;
  }

  async getDailyAdjustedClose() {
    return this.rows;
  }
}

let dataDir;
let storage;

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'stale-guard-'));
  storage = new JsonTableStorage({ dataDir, logger: noopLogger });
  await storage.ensureTable('returns_daily', []);
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test('prices endpoint returns 503 for stale data', async () => {
  const staleProvider = new StaticPriceProvider([
    { date: '2000-01-03', adjClose: 100 },
  ]);
  const app = createApp({
    logger: noopLogger,
    priceProvider: staleProvider,
    config: {
      freshness: { maxStaleTradingDays: 1 },
      featureFlags: { cashBenchmarks: true },
    },
  });
  const response = await request(app).get('/api/prices/SPY');
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { error: 'STALE_DATA' });
});

test('benchmarks summary returns 503 when latest return is stale', async () => {
  await storage.upsertRow(
    'returns_daily',
    {
      date: '2000-01-03',
      r_port: 0,
      r_ex_cash: 0,
      r_bench_blended: 0,
      r_spy_100: 0,
      r_cash: 0,
    },
    ['date'],
  );
  const app = createApp({
    dataDir,
    logger: noopLogger,
    config: {
      freshness: { maxStaleTradingDays: 1 },
      featureFlags: { cashBenchmarks: true },
    },
  });
  const response = await request(app).get('/api/benchmarks/summary');
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { error: 'STALE_DATA' });
});
