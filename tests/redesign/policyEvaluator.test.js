/**
 * SR-060/061 — Portfolio policy schema + evaluation
 *
 * Tests for the policy evaluator pure function.
 * Covers: concentration rule, allocation drift, cash range, review cadence.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluatePolicy, DEFAULT_POLICY } from '../../shared/policy.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHoldings(overrides = []) {
  return [
    { ticker: 'SPY', weight: 0.5, shares: 10, currentValue_cents: 50000 },
    { ticker: 'AAPL', weight: 0.3, shares: 5, currentValue_cents: 30000 },
    { ticker: 'CASH', weight: 0.2, shares: 1, currentValue_cents: 20000, isCash: true },
    ...overrides,
  ];
}

function makePolicy(overrides = {}) {
  return { ...DEFAULT_POLICY, portfolio_id: 'test-portfolio', ...overrides };
}

// ---------------------------------------------------------------------------
// DEFAULT_POLICY existence
// ---------------------------------------------------------------------------

test('DEFAULT_POLICY: has required fields', () => {
  assert.ok(
    typeof DEFAULT_POLICY.max_concentration_pct === 'number',
    'max_concentration_pct missing'
  );
  assert.ok(typeof DEFAULT_POLICY.min_cash_pct === 'number', 'min_cash_pct missing');
  assert.ok(typeof DEFAULT_POLICY.max_cash_pct === 'number', 'max_cash_pct missing');
  assert.ok(typeof DEFAULT_POLICY.review_cadence_days === 'number', 'review_cadence_days missing');
  assert.ok(
    typeof DEFAULT_POLICY.rebalance_tolerance_pct === 'number',
    'rebalance_tolerance_pct missing'
  );
  assert.ok(Array.isArray(DEFAULT_POLICY.allocation_targets), 'allocation_targets must be array');
});

test('DEFAULT_POLICY: max_concentration_pct is between 10 and 100', () => {
  assert.ok(
    DEFAULT_POLICY.max_concentration_pct >= 10 && DEFAULT_POLICY.max_concentration_pct <= 100
  );
});

// ---------------------------------------------------------------------------
// Concentration rule
// ---------------------------------------------------------------------------

test('evaluatePolicy: holding exceeding max_concentration_pct generates trim recommendation', () => {
  const policy = makePolicy({ max_concentration_pct: 25 });
  // SPY is at 50%, exceeds 25%
  const holdings = makeHoldings();
  const recs = evaluatePolicy({ policy, holdings });

  const trimRec = recs.find((r) => r.type === 'trim' && r.ticker === 'SPY');
  assert.ok(trimRec, 'Expected a trim recommendation for SPY (50% > 25% max)');
  assert.equal(trimRec.severity, 'high');
  assert.ok(trimRec.rationale && trimRec.rationale.length > 0, 'rationale must be non-empty');
  assert.ok(trimRec.evidence?.current_pct !== undefined, 'evidence must include current_pct');
});

test('evaluatePolicy: holding within max_concentration_pct does not generate trim', () => {
  const policy = makePolicy({ max_concentration_pct: 60 });
  // SPY is at 50%, within 60% limit
  const holdings = makeHoldings();
  const recs = evaluatePolicy({ policy, holdings });
  const trimRec = recs.find((r) => r.type === 'trim' && r.ticker === 'SPY');
  assert.ok(!trimRec, 'SPY should not trigger trim when within max concentration');
});

// ---------------------------------------------------------------------------
// Cash range rule
// ---------------------------------------------------------------------------

test('evaluatePolicy: cash below min_cash_pct generates deposit recommendation', () => {
  const policy = makePolicy({ min_cash_pct: 30, max_cash_pct: 50 }); // Cash must be 30-50%
  const holdings = makeHoldings(); // Cash is 20%
  const recs = evaluatePolicy({ policy, holdings });

  const depositRec = recs.find((r) => r.type === 'add');
  assert.ok(depositRec, 'Expected an add/deposit recommendation when cash < min_cash_pct');
  assert.ok(depositRec.rationale.length > 0);
});

test('evaluatePolicy: cash above max_cash_pct generates trim recommendation', () => {
  const policy = makePolicy({ min_cash_pct: 1, max_cash_pct: 10 }); // Cash must be ≤ 10%
  const holdings = makeHoldings(); // Cash is 20%
  const recs = evaluatePolicy({ policy, holdings });

  const cashRec = recs.find(
    (r) => r.ticker === 'CASH' || r.rationale?.toLowerCase().includes('cash')
  );
  assert.ok(cashRec, 'Expected a recommendation addressing high cash position');
});

test('evaluatePolicy: cash within range generates no cash recommendation', () => {
  const policy = makePolicy({ min_cash_pct: 10, max_cash_pct: 30 }); // Cash 10-30%, current is 20%
  const holdings = makeHoldings();
  const recs = evaluatePolicy({ policy, holdings });

  const cashRec = recs.find((r) => r.ticker === 'CASH');
  assert.ok(!cashRec, 'No cash recommendation expected when cash is within range');
});

// ---------------------------------------------------------------------------
// Allocation drift rule
// ---------------------------------------------------------------------------

test('evaluatePolicy: holding outside target allocation band generates rebalance rec', () => {
  const policy = makePolicy({
    allocation_targets: [
      { ticker: 'SPY', target_pct: 30, tolerance_pct: 5 }, // target 30±5%, actual 50%
    ],
  });
  const holdings = makeHoldings();
  const recs = evaluatePolicy({ policy, holdings });

  const rebalanceRec = recs.find(
    (r) => r.ticker === 'SPY' && (r.type === 'rebalance' || r.type === 'trim')
  );
  assert.ok(rebalanceRec, 'Expected rebalance/trim recommendation for SPY out of band');
  assert.ok(rebalanceRec.evidence?.target_pct !== undefined);
  assert.ok(rebalanceRec.evidence?.current_pct !== undefined);
});

test('evaluatePolicy: holding within target allocation band generates no_action', () => {
  const policy = makePolicy({
    allocation_targets: [
      { ticker: 'SPY', target_pct: 50, tolerance_pct: 10 }, // target 50±10%, actual 50%
    ],
  });
  const holdings = makeHoldings();
  const recs = evaluatePolicy({ policy, holdings });

  const spyRecs = recs.filter((r) => r.ticker === 'SPY' && r.type === 'trim');
  assert.equal(spyRecs.length, 0, 'No trim expected when within tolerance band');
});

// ---------------------------------------------------------------------------
// Pure function guarantee
// ---------------------------------------------------------------------------

test('evaluatePolicy: same inputs produce same outputs (pure function)', () => {
  const policy = makePolicy({ max_concentration_pct: 25 });
  const holdings = makeHoldings();

  const recs1 = evaluatePolicy({ policy, holdings });
  const recs2 = evaluatePolicy({ policy, holdings });
  assert.deepEqual(recs1, recs2, 'Policy evaluator must be a pure function');
});

// ---------------------------------------------------------------------------
// All recommendations have required fields
// ---------------------------------------------------------------------------

test('evaluatePolicy: every recommendation has required fields', () => {
  const policy = makePolicy({ max_concentration_pct: 25 });
  const holdings = makeHoldings();
  const recs = evaluatePolicy({ policy, holdings });

  for (const rec of recs) {
    assert.ok(rec.id, `recommendation missing id: ${JSON.stringify(rec)}`);
    assert.ok(rec.type, `recommendation missing type`);
    assert.ok(rec.severity, `recommendation missing severity`);
    assert.ok(rec.rationale && rec.rationale.length > 0, `recommendation missing rationale`);
    assert.ok(typeof rec.evidence === 'object', `recommendation missing evidence`);
  }
});
