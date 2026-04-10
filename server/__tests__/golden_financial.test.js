import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { annualizeReturn, computeMaxDrawdown } from '../finance/returns.js';
import { weightsFromState } from '../finance/portfolio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures/returns/golden_annualized.json'), 'utf8'),
);

// --- PM-AUD-018: Golden annualized return from fixture ---

test('golden: annualizeReturn matches manually verified fixture (50% over 730d → ~22.47%)', () => {
  const { cumulative_return, days, expected_annualized } = fixture.annualized;
  const result = annualizeReturn(cumulative_return, days);
  assert.ok(result !== null);
  assert.ok(
    Math.abs(result - expected_annualized) < 1e-4,
    `expected ~${expected_annualized}, got ${result}`,
  );
});

test('golden: annualizeReturn edge cases from fixture', () => {
  for (const tc of fixture.annualized_edge_cases) {
    const result = annualizeReturn(tc.cumulative, tc.days);
    if (tc.expected === null) {
      assert.equal(result, null, `${tc.label}: expected null`);
    } else if (tc.expected_approx !== undefined) {
      assert.ok(result !== null, `${tc.label}: expected non-null`);
      assert.ok(
        Math.abs(result - tc.expected_approx) < 1e-3,
        `${tc.label}: expected ~${tc.expected_approx}, got ${result}`,
      );
    } else {
      assert.ok(
        result === tc.expected || Math.abs(result - tc.expected) < 1e-8,
        `${tc.label}: expected ${tc.expected}, got ${result}`,
      );
    }
  }
});

// --- PM-AUD-018: Golden max drawdown from fixture ---

test('golden: computeMaxDrawdown matches fixture (peak→trough = -30%)', () => {
  const result = computeMaxDrawdown(fixture.drawdown_series);
  assert.ok(result !== null);
  assert.ok(
    Math.abs(result.maxDrawdown - fixture.drawdown_expected.maxDrawdown) < 1e-4,
    `expected maxDrawdown ~${fixture.drawdown_expected.maxDrawdown}, got ${result.maxDrawdown}`,
  );
  assert.equal(result.peakDate, fixture.drawdown_expected.peakDate);
  assert.equal(result.troughDate, fixture.drawdown_expected.troughDate);
});

// --- PM-AUD-018: weightsFromState negative NAV from fixture ---

test('golden: weightsFromState with negative NAV returns zeros (from fixture)', () => {
  const result = weightsFromState(fixture.negative_nav_state);
  assert.deepEqual(result, fixture.negative_nav_expected);
});

// --- PM-AUD-018: Additional drawdown edge cases ---

test('drawdown: double-dip selects the deepest trough', () => {
  const rows = [
    { date: '2024-01-01', r_port: 0 },
    { date: '2024-01-02', r_port: 0.10 },
    { date: '2024-01-03', r_port: -0.20 },
    { date: '2024-01-04', r_port: 0.30 },
    { date: '2024-01-05', r_port: -0.40 },
  ];
  // cumulative: 1.0, 1.1, 0.88, 1.144, 0.6864
  // First dip: (0.88 - 1.1)/1.1 = -0.2
  // Second dip: (0.6864 - 1.144)/1.144 = -0.4
  const result = computeMaxDrawdown(rows);
  assert.ok(result !== null);
  assert.ok(
    Math.abs(result.maxDrawdown - (-0.4)) < 1e-4,
    `expected ~-0.40, got ${result.maxDrawdown}`,
  );
  assert.equal(result.peakDate, '2024-01-04');
  assert.equal(result.troughDate, '2024-01-05');
});

test('annualizeReturn: exactly 366 days returns non-null', () => {
  const result = annualizeReturn(0.10, 366);
  assert.ok(result !== null);
  assert.ok(result > 0);
  // Should be slightly less than 10% since period is barely > 1 year
  assert.ok(Math.abs(result - 0.10) < 0.005);
});

test('annualizeReturn: NaN days returns null', () => {
  assert.equal(annualizeReturn(0.10, NaN), null);
});

test('annualizeReturn: Infinity days returns null', () => {
  assert.equal(annualizeReturn(0.10, Infinity), null);
});
