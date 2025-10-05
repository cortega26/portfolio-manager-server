import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  computeAllSpySeries,
  computeDailyReturnRows,
  computeReturnStep,
} from '../finance/returns.js';

test('computeReturnStep handles flows correctly', () => {
  const result = computeReturnStep(1000, 1100, 50);
  assert.equal(Number(result.toFixed(4)), 0.05);
});

test('daily returns align with blended expectation for 50% cash', () => {
  const states = [
    { date: '2024-01-01', nav: 1000, cash: 500, riskValue: 500 },
    { date: '2024-01-02', nav: 1005.05, cash: 500.05, riskValue: 505 },
    { date: '2024-01-03', nav: 1010.1501, cash: 500.100005, riskValue: 510.050095 },
  ];
  const rates = [{ effective_date: '2023-12-01', apy: 0.0365 }];
  const spyPrices = new Map([
    ['2024-01-01', 400],
    ['2024-01-02', 404],
    ['2024-01-03', 408.04],
  ]);
  const transactions = [];
  const rows = computeDailyReturnRows({ states, rates, spyPrices, transactions });
  let cumulativeExpected = 1;
  let cumulativeActual = 1;
  const entries = Array.from(spyPrices.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const state = states[i];
    const weightCash = state.cash / state.nav;
    const [, prevPrice] = entries[i - 1];
    const [, price] = entries[i];
    const rSpy = price / prevPrice - 1;
    const expected = weightCash * row.r_cash + (1 - weightCash) * rSpy;
    cumulativeExpected *= 1 + expected;
    cumulativeActual *= 1 + row.r_port;
  }
  assert.ok(Math.abs(cumulativeActual - cumulativeExpected) < 0.0001);
});

test('All-SPY track equals TWR of synthetic SPY with same flows', () => {
  const dates = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04'];
  const flows = new Map([
    ['2024-01-01', 1000],
    ['2024-01-03', 500],
  ]);
  const spyPrices = new Map([
    ['2024-01-01', 100],
    ['2024-01-02', 102],
    ['2024-01-03', 101],
    ['2024-01-04', 105],
  ]);
  const { returns } = computeAllSpySeries({ dates, flowsByDate: flows, spyPrices });

  let navPrev = 0;
  let prevPrice = null;
  let total = 1;
  for (const date of dates) {
    const price = spyPrices.get(date);
    const flow = flows.get(date) ?? 0;
    if (prevPrice === null) {
      navPrev = flow;
      prevPrice = price;
      continue;
    }
    const navBefore = navPrev * (price / prevPrice);
    const navAfter = navBefore + flow;
    const twr = navPrev > 0 ? (navBefore - 0) / navPrev - 1 : 0;
    const computed = returns.get(date) ?? 0;
    assert.ok(Math.abs(computed - twr) < 1e-8);
    total *= 1 + computed;
    navPrev = navAfter;
    prevPrice = price;
  }
  assert.ok(total > 0);
});

test('first day return is calculated correctly', () => {
  const states = [
    { date: '2024-01-01', nav: 10200, cash: 200, riskValue: 10000 },
  ];
  const transactions = [
    { date: '2024-01-01', type: 'DEPOSIT', amount: 10000 },
  ];
  const spyPrices = new Map([
    ['2024-01-01', 100],
  ]);
  const rates = [{ effective_date: '2023-12-01', apy: 0.04 }];

  const rows = computeDailyReturnRows({ states, rates, spyPrices, transactions });

  assert.ok(Math.abs(rows[0].r_port - 0.02) < 0.001);
});
