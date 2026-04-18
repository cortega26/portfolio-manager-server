import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createSessionTestApp, request, closeApp } from './helpers/fastifyTestApp.js';
import { flushPriceCache } from '../cache/priceCache.js';
import JsonTableStorage from '../data/storage.js';

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {}, child() { return this; } };

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
  flushPriceCache();
});

afterEach(() => {
  flushPriceCache();
  rmSync(dataDir, { recursive: true, force: true });
});

test('prices endpoint returns 503 for stale data', async () => {
  const staleProvider = new StaticPriceProvider([
    { date: '2000-01-03', adjClose: 100 },
  ]);
  const app = await createSessionTestApp({
    dataDir,
    logger: noopLogger,
    priceProvider: staleProvider,
    config: {
      freshness: { maxStaleTradingDays: 1 },
    },
  });
  const response = await request(app).get('/api/prices/SPY');
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { error: 'STALE_DATA' });
  await closeApp(app);
});

test('bulk prices endpoint returns partial success when some symbols are stale', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const priceProvider = {
    async getDailyAdjustedClose(symbol) {
      if (symbol === 'AAPL') {
        return [{ date: '2000-01-03', adjClose: 100 }];
      }
      return [{ date: today, adjClose: 250 }];
    },
  };
  const app = await createSessionTestApp({
    dataDir,
    logger: noopLogger,
    priceProvider,
    config: {
      freshness: { maxStaleTradingDays: 1 },
    },
  });

  const response = await request(app).get('/api/prices/bulk?symbols=AAPL,MSFT&latest=1');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.errors.AAPL, {
    code: 'STALE_DATA',
    status: 503,
    message: 'Historical prices are stale for this symbol.',
  });
  assert.equal(Array.isArray(response.body.series.AAPL), true);
  assert.equal(response.body.series.AAPL.length, 0);
  assert.equal(response.body.series.MSFT.length, 1);
  assert.equal(response.body.series.MSFT[0].close, 250);
  await closeApp(app);
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
  const app = await createSessionTestApp({
    dataDir,
    logger: noopLogger,
    config: {
      freshness: { maxStaleTradingDays: 1 },
    },
  });
  const response = await request(app).get('/api/benchmarks/summary');
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { error: 'STALE_DATA' });
  await closeApp(app);
});
