import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeSharpeRatio,
  computeCurrentDrawdown,
  computeRollingWindowReturns,
} from '../finance/returns.js';

// These functions only read `date`, `r_port`, and `r_cash`.
function makeRow(date, r_port, r_cash = 0) {
  return {
    date,
    r_port,
    r_ex_cash: 0,
    r_bench_blended: 0,
    r_spy_100: 0,
    r_qqq_100: 0,
    r_cash,
  };
}

describe('computeSharpeRatio', () => {
  it('returns null for empty array', () => {
    assert.equal(computeSharpeRatio([]), null);
  });

  it('returns null for single row', () => {
    assert.equal(computeSharpeRatio([makeRow('2024-01-01', 0.01)]), null);
  });

  it('returns null for constant excess returns (std ≈ 0)', () => {
    const rows = [
      makeRow('2024-01-01', 0.01, 0),
      makeRow('2024-01-02', 0.01, 0),
      makeRow('2024-01-03', 0.01, 0),
    ];
    assert.equal(computeSharpeRatio(rows, 0), null);
  });

  it('returns a positive finite number for varying positive excess', () => {
    const rows = [
      makeRow('2024-01-01', 0.01, 0),
      makeRow('2024-01-02', 0.02, 0),
      makeRow('2024-01-03', 0.03, 0),
    ];
    const result = computeSharpeRatio(rows, 0);
    assert.equal(typeof result, 'number');
    assert.equal(Number.isFinite(result), true);
    assert.ok(result > 0);
  });
});

describe('computeCurrentDrawdown', () => {
  it('returns null for empty array', () => {
    assert.equal(computeCurrentDrawdown([]), null);
  });

  it('returns null for single row', () => {
    assert.equal(computeCurrentDrawdown([makeRow('2024-01-01', 0)]), null);
  });

  it('returns drawdown 0 at a new peak', () => {
    const rows = [makeRow('d0', 0), makeRow('d1', 0.1), makeRow('d2', 0.1)];
    const result = computeCurrentDrawdown(rows);
    assert.notEqual(result, null);
    assert.equal(result.currentDrawdown, 0);
    assert.equal(result.peakDate, 'd2');
    assert.equal(result.currentDate, 'd2');
  });

  it('returns negative drawdown after peak then decline', () => {
    const rows = [makeRow('d0', 0), makeRow('d1', 0.1), makeRow('d2', -0.5)];
    const result = computeCurrentDrawdown(rows);
    assert.notEqual(result, null);
    assert.equal(result.currentDrawdown, -0.5);
    assert.equal(result.peakDate, 'd1');
    assert.equal(result.currentDate, 'd2');
  });
});

describe('computeRollingWindowReturns', () => {
  it('returns null windows for empty array', () => {
    const result = computeRollingWindowReturns([]);
    assert.equal(result.oneMonth.cumulative, null);
    assert.equal(result.threeMonth.cumulative, null);
    assert.equal(result.oneYear.cumulative, null);
  });

  it('returns null windows for insufficient rows (10 rows)', () => {
    const rows = Array.from({ length: 10 }, (_, i) => makeRow('d' + i, 0));
    const result = computeRollingWindowReturns(rows);
    assert.equal(result.oneMonth.cumulative, null);
    assert.equal(result.threeMonth.cumulative, null);
    assert.equal(result.oneYear.cumulative, null);
  });

  it('returns oneMonth cumulative 0 for exactly 22 flat rows', () => {
    const rows = Array.from({ length: 22 }, (_, i) => makeRow('d' + i, 0));
    const result = computeRollingWindowReturns(rows);
    assert.equal(result.oneMonth.cumulative, 0);
    assert.equal(result.oneMonth.annualized, null);
    // 22 rows < 64 so threeMonth is still null
    assert.equal(result.threeMonth.cumulative, null);
  });
});
