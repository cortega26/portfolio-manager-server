// @ts-nocheck
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

function buildApp(priceProvider) {
  return createApp({
    dataDir,
    logger: noopLogger,
    priceProvider,
    config: {
      featureFlags: { cashBenchmarks: true },
      cors: { allowedOrigins: [] },
      cache: {
        ttlSeconds: 600,
        price: { ttlSeconds: 600, checkPeriodSeconds: 120 },
      },
    },
  });
}

function makeStubData() {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const prior = new Date(today);
  prior.setDate(prior.getDate() - 1);
  const priorKey = prior.toISOString().slice(0, 10);
  return [
    { date: priorKey, adjClose: 100 },
    { date: todayKey, adjClose: 102 },
  ];
}

test('returns cached price on subsequent requests', async () => {
  const provider = new StubPriceProvider(makeStubData());
  const app = buildApp(provider);

  const first = await request(app).get('/api/prices/AAPL?range=1y');
  assert.equal(first.status, 200);
  assert.equal(first.headers['x-cache'], 'MISS');
  const etag = first.headers.etag;
  assert.equal(provider.calls, 1);

  const second = await request(app).get('/api/prices/AAPL?range=1y');
  assert.equal(second.status, 200);
  assert.equal(second.headers['x-cache'], 'HIT');
  assert.equal(second.headers.etag, etag);
  assert.equal(provider.calls, 1);
});

test('supports conditional requests with ETag', async () => {
  const provider = new StubPriceProvider(makeStubData());
  const app = buildApp(provider);

  const first = await request(app).get('/api/prices/AAPL?range=1y');
  const etag = first.headers.etag;

  const conditional = await request(app)
    .get('/api/prices/AAPL?range=1y')
    .set('If-None-Match', etag);

  assert.equal(conditional.status, 304);
  assert.equal(conditional.headers['x-cache'], 'HIT');
  assert.equal(provider.calls, 1);
});

test('exposes cache stats endpoint', async () => {
  const provider = new StubPriceProvider(makeStubData());
  const app = buildApp(provider);

  await request(app).get('/api/prices/AAPL?range=1y');

  const stats = await request(app).get('/api/cache/stats');
  assert.equal(stats.status, 200);
  assert.ok('keys' in stats.body);
  assert.ok('hitRate' in stats.body);
});
