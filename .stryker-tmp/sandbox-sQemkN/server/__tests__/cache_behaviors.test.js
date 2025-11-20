// @ts-nocheck
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';

import { createApp } from '../app.js';
import JsonTableStorage from '../data/storage.js';

const noopLogger = {
  info() {},
  warn() {},
  error() {},
};

const CACHE_TTL_SECONDS = 450;

let dataDir;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'portfolio-cache-tests-'));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

async function seedReturnsTable(rows) {
  const storage = new JsonTableStorage({ dataDir, logger: noopLogger });
  await storage.writeTable('returns_daily', rows);
}

test('GET /api/prices/:symbol caches responses for warm hits and exposes TTL header', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const csv = `Date,Open,High,Low,Close,Volume\n${today},1,1,1,200.12,1000`;
  let fetchCount = 0;
  const fetchImpl = async () => {
    fetchCount += 1;
    return { ok: true, text: async () => csv };
  };
  const app = createApp({
    dataDir,
    logger: noopLogger,
    fetchImpl,
    config: {
      cache: {
        ttlSeconds: CACHE_TTL_SECONDS,
        price: { ttlSeconds: CACHE_TTL_SECONDS, checkPeriodSeconds: 60 },
      },
    },
  });

  const first = await request(app).get('/api/prices/MSFT');
  assert.equal(first.status, 200);
  assert.equal(fetchCount, 1);
  assert.equal(first.headers['cache-control'], `private, max-age=${CACHE_TTL_SECONDS}`);
  assert.equal(first.headers['x-cache'], 'MISS');
  assert.ok(Array.isArray(first.body));
  assert.equal(first.body.length, 1);

  const second = await request(app).get('/api/prices/MSFT');
  assert.equal(second.status, 200);
  assert.equal(fetchCount, 1, 'warm cache should avoid a new fetch');
  assert.deepEqual(second.body, first.body);
  assert.equal(second.headers['cache-control'], `private, max-age=${CACHE_TTL_SECONDS}`);
  assert.equal(second.headers['x-cache'], 'HIT');
});

test('GET /api/returns/daily serves cached payloads even when storage mutates', async () => {
  const baseRows = [
    {
      date: '2024-01-01',
      r_port: 0.01,
      r_ex_cash: 0.011,
      r_spy_100: 0.012,
      r_bench_blended: 0.013,
      r_cash: 0.0001,
    },
  ];
  await seedReturnsTable(baseRows);
  const app = createApp({
    dataDir,
    logger: noopLogger,
    config: { cache: { ttlSeconds: CACHE_TTL_SECONDS } },
  });

  const first = await request(app).get('/api/returns/daily');
  assert.equal(first.status, 200);
  assert.equal(first.headers['cache-control'], `private, max-age=${CACHE_TTL_SECONDS}`);
  assert.equal(first.body.series.r_port.length, 1);

  const mutatedRows = [
    {
      ...baseRows[0],
      r_port: 0.5,
      date: '2024-01-02',
    },
  ];
  await seedReturnsTable(mutatedRows);

  const second = await request(app).get('/api/returns/daily');
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body, 'warm cache should ignore storage mutation');
});

test('GET /api/returns/daily negotiates 304 when If-None-Match matches cached ETag', async () => {
  const rows = [
    {
      date: '2024-02-01',
      r_port: 0.02,
      r_ex_cash: 0.021,
      r_spy_100: 0.023,
      r_bench_blended: 0.019,
      r_cash: 0.0002,
    },
  ];
  await seedReturnsTable(rows);
  const app = createApp({
    dataDir,
    logger: noopLogger,
    config: { cache: { ttlSeconds: CACHE_TTL_SECONDS } },
  });

  const first = await request(app).get('/api/returns/daily');
  assert.equal(first.status, 200);
  const etag = first.headers.etag;
  assert.ok(typeof etag === 'string' && etag.length > 0);

  const second = await request(app)
    .get('/api/returns/daily')
    .set('If-None-Match', etag);
  assert.equal(second.status, 304);
  assert.equal(second.headers.etag, etag);
  assert.equal(second.headers['cache-control'], `private, max-age=${CACHE_TTL_SECONDS}`);
  assert.equal(second.text, '');
});

test('POST /api/portfolio/:id flushes cached analytics responses', async () => {
  const initialRows = [
    {
      date: '2024-03-01',
      r_port: 0.01,
      r_ex_cash: 0.015,
      r_spy_100: 0.02,
      r_bench_blended: 0.018,
      r_cash: 0.0003,
    },
  ];
  await seedReturnsTable(initialRows);
  const app = createApp({
    dataDir,
    logger: noopLogger,
    config: { cache: { ttlSeconds: CACHE_TTL_SECONDS } },
  });

  const first = await request(app).get('/api/returns/daily');
  assert.equal(first.status, 200);
  const initialValue = first.body.series.r_port[0].value;
  assert.equal(initialValue, initialRows[0].r_port);

  const updatedRows = [
    {
      date: '2024-03-01',
      r_port: 0.25,
      r_ex_cash: 0.03,
      r_spy_100: 0.04,
      r_bench_blended: 0.033,
      r_cash: 0.0004,
    },
  ];
  await seedReturnsTable(updatedRows);

  const cached = await request(app).get('/api/returns/daily');
  assert.equal(cached.status, 200);
  assert.equal(
    cached.body.series.r_port[0].value,
    initialValue,
    'cache should still serve stale data before invalidation',
  );

  const payload = {
    transactions: [],
    signals: {},
    settings: { autoClip: false },
    cash: { currency: 'USD', apyTimeline: [] },
  };
  const saveResponse = await request(app)
    .post('/api/portfolio/cache-test')
    .set('X-Portfolio-Key', 'Abcd1234!@#$')
    .send(payload);
  assert.equal(saveResponse.status, 200);

  const refreshed = await request(app).get('/api/returns/daily');
  assert.equal(refreshed.status, 200);
  assert.equal(
    refreshed.body.series.r_port[0].value,
    updatedRows[0].r_port,
    'portfolio save should flush cached analytics data',
  );
});
