/**
 * SR-002 — Portfolio health summary endpoint
 *
 * Integration tests for GET /api/portfolio/:id/health
 * Covers: endpoint exists, returns correct shape, freshness logic,
 * confidence logic, and action_count from inbox items.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  createSessionTestApp,
  withSession,
  closeApp,
  request,
  TEST_SESSION_TOKEN,
} from '../../server/__tests__/helpers/fastifyTestApp.js';

const PORTFOLIO_ID = 'test-portfolio';
let dataDir;
let app;

const BASE_TRANSACTIONS = [
  { id: 'tx-deposit', date: '2024-01-02', type: 'DEPOSIT', amount: 10000 },
  {
    id: 'tx-buy',
    date: '2024-01-02',
    type: 'BUY',
    ticker: 'SPY',
    shares: 10,
    amount: 4000,
    price: 400,
  },
];

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'health-test-'));
  app = await createSessionTestApp({ dataDir });
  // Seed portfolio
  await withSession(
    request(app).post(`/api/portfolio/${PORTFOLIO_ID}`).send({
      transactions: BASE_TRANSACTIONS,
      signals: {},
      settings: {},
    }),
    TEST_SESSION_TOKEN
  );
});

afterEach(async () => {
  await closeApp(app);
  rmSync(dataDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

test('GET /health: returns 200 with required fields', async () => {
  const res = await withSession(
    request(app).get(`/api/portfolio/${PORTFOLIO_ID}/health`),
    TEST_SESSION_TOKEN
  );
  assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);

  const body = res.body;
  assert.ok('portfolio_id' in body, 'missing portfolio_id');
  assert.ok('freshness_state' in body, 'missing freshness_state');
  assert.ok('confidence_state' in body, 'missing confidence_state');
  assert.ok('degraded_reasons' in body, 'missing degraded_reasons');
  assert.ok('unresolved_exception_count' in body, 'missing unresolved_exception_count');
  assert.ok('action_count' in body, 'missing action_count');
  assert.ok('as_of' in body, 'missing as_of');
  assert.equal(body.portfolio_id, PORTFOLIO_ID);
});

test('GET /health: degraded_reasons is an array', async () => {
  const res = await withSession(
    request(app).get(`/api/portfolio/${PORTFOLIO_ID}/health`),
    TEST_SESSION_TOKEN
  );
  assert.ok(Array.isArray(res.body.degraded_reasons), 'degraded_reasons must be an array');
});

test('GET /health: action_count is a non-negative integer', async () => {
  const res = await withSession(
    request(app).get(`/api/portfolio/${PORTFOLIO_ID}/health`),
    TEST_SESSION_TOKEN
  );
  const { action_count } = res.body;
  assert.ok(typeof action_count === 'number', 'action_count must be a number');
  assert.ok(Number.isInteger(action_count), 'action_count must be an integer');
  assert.ok(action_count >= 0, 'action_count must be >= 0');
});

test('GET /health: as_of is a valid ISO-8601 timestamp', async () => {
  const res = await withSession(
    request(app).get(`/api/portfolio/${PORTFOLIO_ID}/health`),
    TEST_SESSION_TOKEN
  );
  const { as_of } = res.body;
  assert.ok(typeof as_of === 'string', 'as_of must be a string');
  const date = new Date(as_of);
  assert.ok(!Number.isNaN(date.getTime()), `as_of is not valid ISO-8601: ${as_of}`);
});

// ---------------------------------------------------------------------------
// Freshness logic
// ---------------------------------------------------------------------------

test('GET /health: no holdings with prices → freshness_state is unknown', async () => {
  // Portfolio with only a deposit (no BUY), so no holdings with prices
  const noHoldingsDir = mkdtempSync(path.join(tmpdir(), 'health-noholdings-'));
  const noHoldingsApp = await createSessionTestApp({ dataDir: noHoldingsDir });

  try {
    await withSession(
      request(noHoldingsApp)
        .post(`/api/portfolio/empty-portfolio`)
        .send({
          transactions: [{ id: 'dep', date: '2024-01-02', type: 'DEPOSIT', amount: 5000 }],
          signals: {},
          settings: {},
        }),
      TEST_SESSION_TOKEN
    );

    const res = await withSession(
      request(noHoldingsApp).get('/api/portfolio/empty-portfolio/health'),
      TEST_SESSION_TOKEN
    );
    assert.equal(res.status, 200);
    assert.equal(
      res.body.freshness_state,
      'unknown',
      'No holdings → freshness_state should be unknown'
    );
  } finally {
    await closeApp(noHoldingsApp);
    rmSync(noHoldingsDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Confidence logic
// ---------------------------------------------------------------------------

test('GET /health: freshness unknown → confidence_state is not high', async () => {
  const noHoldingsDir = mkdtempSync(path.join(tmpdir(), 'health-conf-'));
  const noHoldingsApp = await createSessionTestApp({ dataDir: noHoldingsDir });

  try {
    await withSession(
      request(noHoldingsApp)
        .post('/api/portfolio/noconf')
        .send({
          transactions: [{ id: 'dep', date: '2024-01-02', type: 'DEPOSIT', amount: 5000 }],
          signals: {},
          settings: {},
        }),
      TEST_SESSION_TOKEN
    );

    const res = await withSession(
      request(noHoldingsApp).get('/api/portfolio/noconf/health'),
      TEST_SESSION_TOKEN
    );
    assert.equal(res.status, 200);
    assert.notEqual(
      res.body.confidence_state,
      'high',
      'unknown freshness should not yield high confidence'
    );
  } finally {
    await closeApp(noHoldingsApp);
    rmSync(noHoldingsDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 404 for non-existent portfolio
// ---------------------------------------------------------------------------

test('GET /health: 404 for portfolio that does not exist', async () => {
  const res = await withSession(
    request(app).get('/api/portfolio/nonexistent-portfolio/health'),
    TEST_SESSION_TOKEN
  );
  assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
});
