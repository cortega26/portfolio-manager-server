import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import request from 'supertest';

import { createApp } from '../app.js';
import JsonTableStorage from '../data/storage.js';

const noopLogger = { info() {}, warn() {}, error() {} };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const specPath = path.resolve(__dirname, '../../docs/openapi.yaml');

let apiDocument;
const ajv = new Ajv({ strict: false, allErrors: true, allowUnionTypes: true });
addFormats(ajv);

const validatorCache = new Map();

function getValidator(pathKey, method = 'get', statusCode = '200') {
  const cacheKey = `${method.toLowerCase()} ${pathKey} ${statusCode}`;
  if (validatorCache.has(cacheKey)) {
    return validatorCache.get(cacheKey);
  }
  const operation = apiDocument.paths?.[pathKey]?.[method.toLowerCase()];
  assert.ok(operation, `operation not found for ${method.toUpperCase()} ${pathKey}`);
  const response = operation.responses?.[statusCode];
  assert.ok(response, `response ${statusCode} not defined for ${method.toUpperCase()} ${pathKey}`);
  const schema = response.content?.['application/json']?.schema;
  assert.ok(schema, `JSON schema missing for ${method.toUpperCase()} ${pathKey} status ${statusCode}`);
  const validator = ajv.compile(schema);
  validatorCache.set(cacheKey, validator);
  return validator;
}

function expectValidResponse(validator, payload) {
  const valid = validator(payload);
  const failureMessage = !valid
    ? ajv.errorsText(validator.errors ?? [], { dataVar: 'response.body' })
    : '';
  assert.equal(valid, true, failureMessage);
}

let dataDir;
let storage;
let buildApp;

before(async () => {
  apiDocument = await SwaggerParser.dereference(specPath);
});

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'api-contract-'));
  storage = new JsonTableStorage({ dataDir, logger: noopLogger });
  await storage.ensureTable('transactions', []);
  await storage.ensureTable('cash_rates', []);
  await storage.ensureTable('returns_daily', []);
  await storage.ensureTable('nav_snapshots', []);
  buildApp = (overrides = {}) =>
    createApp({
      dataDir,
      logger: noopLogger,
      config: { featureFlags: { cashBenchmarks: true }, cors: { allowedOrigins: [] } },
      ...overrides,
    });
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  validatorCache.clear();
});

test('GET /api/returns/daily matches the OpenAPI contract', async () => {
  await storage.writeTable('returns_daily', [
    {
      date: '2024-01-01',
      r_port: 0.01,
      r_ex_cash: 0.009,
      r_spy_100: 0.012,
      r_bench_blended: 0.011,
      r_cash: 0.0001,
    },
    {
      date: '2024-01-02',
      r_port: 0.015,
      r_ex_cash: 0.014,
      r_spy_100: 0.017,
      r_bench_blended: 0.016,
      r_cash: 0.0001,
    },
  ]);

  const app = buildApp();
  const response = await request(app).get(
    '/api/returns/daily?from=2024-01-01&to=2024-01-02&views=port,excash,spy,bench',
  );

  assert.equal(response.status, 200);
  const validator = getValidator('/api/returns/daily');
  expectValidResponse(validator, response.body);
});

test('GET /api/nav/daily matches the OpenAPI contract', async () => {
  await storage.writeTable('nav_snapshots', [
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
      stale_price: true,
    },
  ]);

  const app = buildApp();
  const response = await request(app).get('/api/nav/daily?from=2024-01-01&to=2024-01-02');

  assert.equal(response.status, 200);
  const validator = getValidator('/api/nav/daily');
  expectValidResponse(validator, response.body);
});

test('GET /api/benchmarks/summary matches the OpenAPI contract', async () => {
  await storage.writeTable('returns_daily', [
    {
      date: '2024-01-01',
      r_port: 0.01,
      r_ex_cash: 0.009,
      r_spy_100: 0.012,
      r_bench_blended: 0.011,
      r_cash: 0.0001,
    },
    {
      date: '2024-01-02',
      r_port: 0.015,
      r_ex_cash: 0.014,
      r_spy_100: 0.017,
      r_bench_blended: 0.016,
      r_cash: 0.0002,
    },
  ]);

  const app = buildApp();
  const response = await request(app).get('/api/benchmarks/summary?from=2024-01-01&to=2024-01-02');

  assert.equal(response.status, 200);
  const validator = getValidator('/api/benchmarks/summary');
  expectValidResponse(validator, response.body);
});

test('GET /api/prices/:symbol matches the OpenAPI contract', async () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const todayKey = today.toISOString().slice(0, 10);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);
  const priceProvider = {
    async getDailyAdjustedClose() {
      return [
        { date: yesterdayKey, adjClose: 123.45 },
        { date: todayKey, adjClose: 124.56 },
      ];
    },
  };

  const app = buildApp({
    priceProvider,
    config: {
      featureFlags: { cashBenchmarks: true },
      cors: { allowedOrigins: [] },
      freshness: { maxStaleTradingDays: 30 },
    },
  });
  const response = await request(app).get('/api/prices/AAPL');

  assert.equal(response.status, 200);
  const validator = getValidator('/api/prices/{symbol}');
  expectValidResponse(validator, response.body);
});
