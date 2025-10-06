import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import request from 'supertest';

import { createApp } from '../app.js';
import JsonTableStorage from '../data/storage.js';

const noopLogger = { info() {}, warn() {}, error() {} };

let dataDir;
let app;
let storage;

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'api-validation-'));
  storage = new JsonTableStorage({ dataDir, logger: noopLogger });
  await storage.ensureTable('transactions', []);
  await storage.ensureTable('cash_rates', []);
  await storage.ensureTable('returns_daily', []);
  await storage.ensureTable('nav_snapshots', []);
  app = createApp({
    dataDir,
    logger: noopLogger,
    config: { featureFlags: { cashBenchmarks: true }, cors: { allowedOrigins: [] } },
  });
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test('POST /api/portfolio rejects invalid payloads with validation details', async () => {
  const response = await request(app)
    .post('/api/portfolio/test123')
    .send({ transactions: [{ type: 'BUY', amount: 'invalid' }] })
    .set('Content-Type', 'application/json')
    .set('X-Portfolio-Key', 'ValidKey123!');

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(response.body.details));
  assert.ok(response.body.details.length > 0);
});

test('POST /api/portfolio rejects invalid portfolio id', async () => {
  const response = await request(app)
    .post('/api/portfolio/bad id')
    .send({ transactions: [] })
    .set('Content-Type', 'application/json')
    .set('X-Portfolio-Key', 'ValidKey123!');

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(response.body.details));
});

test('GET /api/returns/daily paginates and emits ETag', async () => {
  const rows = [
    { date: '2024-01-01', r_port: 0.01, r_ex_cash: 0.009, r_spy_100: 0.012, r_bench_blended: 0.011, r_cash: 0.0001 },
    { date: '2024-01-02', r_port: 0.02, r_ex_cash: 0.018, r_spy_100: 0.019, r_bench_blended: 0.0185, r_cash: 0.0002 },
    { date: '2024-01-03', r_port: -0.005, r_ex_cash: -0.006, r_spy_100: -0.004, r_bench_blended: -0.0045, r_cash: 0.0003 },
  ];
  await storage.writeTable('returns_daily', rows);

  const first = await request(app).get('/api/returns/daily?per_page=2');
  assert.equal(first.status, 200);
  assert.ok(first.headers.etag);
  assert.equal(first.body.meta.page, 1);
  assert.equal(first.body.meta.per_page, 2);
  assert.equal(first.body.meta.total, 3);
  assert.equal(first.body.meta.total_pages, 2);
  assert.equal(first.body.series.r_port.length, 2);
  assert.equal(first.body.series.r_cash.length, 2);

  const second = await request(app)
    .get('/api/returns/daily?per_page=2')
    .set('If-None-Match', first.headers.etag);
  assert.equal(second.status, 304);
});

test('GET /api/returns/daily validates pagination parameters', async () => {
  const response = await request(app).get('/api/returns/daily?per_page=0');
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(response.body.details));
});

test('GET /api/nav/daily returns paginated snapshots with ETag', async () => {
  const rows = [
    {
      date: '2024-01-01',
      portfolio_nav: 1000,
      ex_cash_nav: 800,
      cash_balance: 200,
      risk_assets_value: 800,
      stale_price: false,
    },
    {
      date: '2024-01-02',
      portfolio_nav: 1010,
      ex_cash_nav: 805,
      cash_balance: 205,
      risk_assets_value: 805,
      stale_price: false,
    },
    {
      date: '2024-01-03',
      portfolio_nav: 1020,
      ex_cash_nav: 810,
      cash_balance: 210,
      risk_assets_value: 810,
      stale_price: true,
    },
  ];
  await storage.writeTable('nav_snapshots', rows);

  const response = await request(app).get('/api/nav/daily?per_page=2&page=2');
  assert.equal(response.status, 200);
  assert.ok(response.headers.etag);
  assert.equal(response.body.meta.page, 2);
  assert.equal(response.body.meta.per_page, 2);
  assert.equal(response.body.meta.total, 3);
  assert.equal(response.body.meta.total_pages, 2);
  assert.equal(response.body.data.length, 1);
  assert.equal(response.body.data[0].date, '2024-01-03');
});

test('POST /api/admin/cash-rate enforces body validation', async () => {
  const response = await request(app)
    .post('/api/admin/cash-rate')
    .send({ effective_date: 'not-a-date', apy: 'abc' })
    .set('Content-Type', 'application/json');

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(response.body.details));
});

test('POST /api/portfolio enforces rate limiting', async () => {
  const payload = { transactions: [], signals: {} };
  const responses = [];
  for (let index = 0; index < 21; index += 1) {
    const response = await request(app)
      .post('/api/portfolio/ratelimit')
      .send(payload)
      .set('Content-Type', 'application/json')
      .set('X-Portfolio-Key', 'ValidKey456!');
    responses.push(response);
  }

  for (let index = 0; index < 20; index += 1) {
    assert.equal(responses[index].status, 200);
  }

  const last = responses[responses.length - 1];
  assert.equal(last.status, 429);
  assert.equal(Number(last.headers['ratelimit-remaining'] ?? '0'), 0);
});
