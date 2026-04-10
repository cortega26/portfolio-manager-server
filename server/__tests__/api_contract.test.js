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
const API_PREFIXES = ['/api', '/api/v1'];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const specPath = path.resolve(__dirname, '../../docs/reference/openapi.yaml');

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
  await storage.ensureTable('prices', []);
  await storage.ensureTable('roi_daily', []);
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

for (const basePath of API_PREFIXES) {
  test(`GET ${basePath}/returns/daily matches the OpenAPI contract`, async () => {
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
      `${basePath}/returns/daily?from=2024-01-01&to=2024-01-02&views=port,excash,spy,bench`,
    );

    assert.equal(response.status, 200);
    const validator = getValidator(`${basePath}/returns/daily`);
    expectValidResponse(validator, response.body);
  });
}

for (const basePath of API_PREFIXES) {
  test(`GET ${basePath}/prices/bulk returns multiple price series`, async () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const todayKey = today.toISOString().slice(0, 10);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);
    const priceProvider = {
      async getDailyAdjustedClose(symbol) {
        return [
          { date: yesterdayKey, adjClose: symbol === 'MSFT' ? 222.22 : 123.45 },
          { date: todayKey, adjClose: symbol === 'MSFT' ? 223.33 : 124.56 },
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

    const response = await request(app).get(`${basePath}/prices/bulk?symbols=AAPL,MSFT&range=1y`);

    assert.equal(response.status, 200);
    const validator = getValidator(`${basePath}/prices/bulk`);
    expectValidResponse(validator, response.body);
    assert.ok(response.body?.series?.AAPL);
    assert.ok(response.body?.series?.MSFT);
    assert.equal(Array.isArray(response.body.series.AAPL), true);
    assert.equal(Array.isArray(response.body.series.MSFT), true);
    assert.equal((response.headers["x-cache"] ?? "MISS").toUpperCase(), "MISS");
  });
}

for (const basePath of API_PREFIXES) {
  test(`GET ${basePath}/roi/daily matches the OpenAPI contract`, async () => {
    await storage.writeTable('roi_daily', [
      {
        date: '2024-01-01',
        portfolio_nav: 1000,
        net_contributions: 1000,
        roi_portfolio_pct: 0,
        roi_sp500_pct: 0,
        roi_ndx_pct: 0,
        source: 'reconstructed',
        updated_at: '2024-01-02T00:00:00.000Z',
      },
      {
        date: '2024-01-02',
        portfolio_nav: 1010,
        net_contributions: 1000,
        roi_portfolio_pct: 1,
        roi_sp500_pct: 0.5,
        roi_ndx_pct: 0.75,
        source: 'reconstructed',
        updated_at: '2024-01-02T00:00:00.000Z',
      },
    ]);
    await storage.writeTable('returns_daily', [
      {
        date: '2024-01-01',
        r_port: 0,
        r_ex_cash: 0,
        r_spy_100: 0,
        r_bench_blended: 0,
        r_cash: 0,
      },
      {
        date: '2024-01-02',
        r_port: 0.01,
        r_ex_cash: 0.011,
        r_spy_100: 0.005,
        r_bench_blended: 0.0075,
        r_cash: 0.0001,
      },
    ]);

    const app = buildApp();
    const response = await request(app).get(
      `${basePath}/roi/daily?from=2024-01-01&to=2024-01-02`,
    );

    assert.equal(response.status, 200);
    const validator = getValidator(`${basePath}/roi/daily`);
    expectValidResponse(validator, response.body);
  });
}

for (const basePath of API_PREFIXES) {
  test(`GET ${basePath}/benchmarks matches the OpenAPI contract`, async () => {
    const app = buildApp({
      config: {
        featureFlags: { cashBenchmarks: true },
        cors: { allowedOrigins: [] },
        benchmarks: {
          tickers: ["QQQ"],
          defaultSelection: ["qqq"],
        },
      },
    });

    const response = await request(app).get(`${basePath}/benchmarks`);

    assert.equal(response.status, 200);
    assert.equal(response.body.available[0].id, "qqq");
    assert.equal(response.body.available[0].ticker, "QQQ");
    assert.ok(response.body.derived.some((entry) => entry.id === "blended"));
    const validator = getValidator(`${basePath}/benchmarks`);
    expectValidResponse(validator, response.body);
  });
}

for (const basePath of API_PREFIXES) {
  test(`GET ${basePath}/nav/daily matches the OpenAPI contract`, async () => {
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
    const response = await request(app).get(`${basePath}/nav/daily?from=2024-01-01&to=2024-01-02`);

    assert.equal(response.status, 200);
    const validator = getValidator(`${basePath}/nav/daily`);
    expectValidResponse(validator, response.body);
  });
}

for (const basePath of API_PREFIXES) {
  test(`GET ${basePath}/benchmarks/summary matches the OpenAPI contract`, async () => {
    await storage.writeTable('returns_daily', [
      {
        date: '2024-01-01',
        r_port: 0.01,
        r_ex_cash: 0.009,
        r_spy_100: 0.012,
        r_qqq_100: 0.013,
        r_bench_blended: 0.011,
        r_cash: 0.0001,
      },
      {
        date: '2024-01-02',
        r_port: 0.015,
        r_ex_cash: 0.014,
        r_spy_100: 0.017,
        r_qqq_100: 0.018,
        r_bench_blended: 0.016,
        r_cash: 0.0002,
      },
    ]);
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
        portfolio_nav: 1015,
        ex_cash_nav: 805,
        cash_balance: 210,
        risk_assets_value: 805,
        stale_price: false,
      },
    ]);
    await storage.writeTable('transactions', [
      { date: '2024-01-01', type: 'DEPOSIT', amount: 1000 },
    ]);
    await storage.writeTable('prices', [
      { ticker: 'SPY', date: '2024-01-01', adj_close: 100 },
      { ticker: 'SPY', date: '2024-01-02', adj_close: 101 },
      { ticker: 'QQQ', date: '2024-01-01', adj_close: 200 },
      { ticker: 'QQQ', date: '2024-01-02', adj_close: 204 },
    ]);

    const app = buildApp();
    const response = await request(app).get(
      `${basePath}/benchmarks/summary?from=2024-01-01&to=2024-01-02`,
    );

    assert.equal(response.status, 200);
    const validator = getValidator(`${basePath}/benchmarks/summary`);
    expectValidResponse(validator, response.body);
  });
}

for (const basePath of API_PREFIXES) {
  test(`GET ${basePath}/prices/:symbol matches the OpenAPI contract`, async () => {
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
    const response = await request(app).get(`${basePath}/prices/AAPL`);

    assert.equal(response.status, 200);
    const validator = getValidator(`${basePath}/prices/{symbol}`);
    expectValidResponse(validator, response.body);
  });
}

for (const basePath of API_PREFIXES) {
  test(`POST ${basePath}/signals matches the OpenAPI contract`, async () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const todayKey = today.toISOString().slice(0, 10);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);
    const priceProvider = {
      async getDailyAdjustedClose() {
        return [
          { date: yesterdayKey, adjClose: 100 },
          { date: todayKey, adjClose: 105 },
        ];
      },
    };

    const app = buildApp({
      priceProvider,
      config: {
        featureFlags: { cashBenchmarks: true },
        cors: { allowedOrigins: [] },
        freshness: { maxStaleTradingDays: 30 },
        security: {
          auth: {
            sessionToken: 'test-session-token',
          },
        },
      },
    });

    const response = await request(app)
      .post(`${basePath}/signals`)
      .set('X-Session-Token', 'test-session-token')
      .send({
        transactions: [
          { date: '2024-01-01', type: 'DEPOSIT', amount: 1000 },
          { date: '2024-01-02', type: 'BUY', ticker: 'AAPL', amount: -500, price: 100, shares: 5 },
        ],
        signals: {
          AAPL: { pct: 5 },
        },
      });

    assert.equal(response.status, 200);
    const validator = getValidator(`${basePath}/signals`, 'post');
    expectValidResponse(validator, response.body);
  });
}
