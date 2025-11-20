import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'path';
import { tmpdir } from 'node:os';

import request from 'supertest';

import { createApp } from '../app.js';
import {
  configurePriceCache,
  flushPriceCache,
} from '../cache/priceCache.js';

const noopLogger = { info() {}, warn() {}, error() {} };

function todayKey(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

class StubPriceProvider {
  constructor(data) {
    this.data = data;
    this.calls = 0;
  }

  async getDailyAdjustedClose() {
    this.calls += 1;
    return this.data;
  }
}

let dataDir;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'price-cache-test-'));
  configurePriceCache({ ttlSeconds: 600, checkPeriodSeconds: 120 });
  flushPriceCache();
});

afterEach(() => {
  flushPriceCache();
  rmSync(dataDir, { recursive: true, force: true });
});

test('returns cached price on subsequent requests', async () => {
  const provider = new StubPriceProvider([
    { date: todayKey(), adjClose: 100 },
    { date: todayKey(1), adjClose: 101 },
  ]);
  const app = createApp({
    dataDir,
    logger: noopLogger,
    priceProvider: provider,
  });

  const first = await request(app)
    .get('/api/prices/AAPL?range=1y')
    .set('X-API-Version', 'legacy');
  assert.equal(first.status, 200);
  assert.equal(first.body.length, 2);

  const second = await request(app)
    .get('/api/prices/AAPL?range=1y')
    .set('X-API-Version', 'legacy');
  assert.equal(second.status, 200);
  assert.equal(second.headers['x-cache'], 'HIT');
  assert.equal(second.body.length, 2);

  // Ensure provider was called only once due to cache hit
  assert.equal(provider.calls, 1);
});

test('supports conditional requests with ETag', async () => {
  const provider = new StubPriceProvider([{ date: todayKey(), adjClose: 100 }]);
  const app = createApp({
    dataDir,
    logger: noopLogger,
    priceProvider: provider,
  });

  const first = await request(app)
    .get('/api/prices/AAPL?range=1y')
    .set('X-API-Version', 'legacy');
  assert.equal(first.status, 200);
  const etag = first.headers.etag;
  assert.ok(etag);

  const second = await request(app)
    .get('/api/prices/AAPL?range=1y')
    .set('If-None-Match', etag);
  assert.equal(second.status, 304);
});

test('exposes cache stats endpoint', async () => {
  const app = createApp({
    dataDir,
    logger: noopLogger,
    priceProvider: new StubPriceProvider([{ date: '2024-01-01', adjClose: 100 }]),
  });

  const stats = await request(app).get('/api/cache/stats');
  assert.equal(stats.status, 200);
  assert.equal(typeof stats.body.hits, 'number');
  assert.equal(typeof stats.body.misses, 'number');
});
