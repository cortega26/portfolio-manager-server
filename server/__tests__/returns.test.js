import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  computeAllSpySeries,
  computeDailyReturnRows,
  computeReturnStep,
  summarizeReturns,
  computeMoneyWeightedReturn,
} from '../finance/returns.js';
import { d, roundDecimal } from '../finance/decimal.js';
import { computeDailyStates } from '../finance/portfolio.js';
import { toDateKey } from '../finance/cash.js';

test('computeReturnStep handles flows correctly', () => {
  const result = computeReturnStep(1000, 1100, 50);
  assert.equal(roundDecimal(result, 4).toNumber(), 0.05);
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
    ['2024-01-01', d(1000)],
    ['2024-01-03', d(500)],
  ]);
  const spyPrices = new Map([
    ['2024-01-01', 100],
    ['2024-01-02', 102],
    ['2024-01-03', 101],
    ['2024-01-04', 105],
  ]);
  const { returns } = computeAllSpySeries({ dates, flowsByDate: flows, spyPrices });

  let navPrev = d(0);
  let prevPrice = null;
  let total = d(1);
  for (const date of dates) {
    const price = spyPrices.get(date);
    const flow = flows.get(date) ?? d(0);
    if (prevPrice === null) {
      navPrev = flow;
      prevPrice = price;
      continue;
    }
    const navBefore = navPrev.times(price).dividedBy(prevPrice);
    const navAfter = navBefore.plus(flow);
    const twr = navPrev.gt(0) ? navBefore.dividedBy(navPrev).minus(1) : d(0);
    const computed = returns.get(date) ?? d(0);
    assert.ok(computed.minus(twr).abs().lt(2e-6));
    total = total.times(d(1).plus(computed));
    navPrev = navAfter;
    prevPrice = price;
  }
  assert.ok(total.gt(0));
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

test('computeReturnStep reconstructs random sequences without drift', () => {
  let nav = d(1000);
  const rng = () => {
    const seed = Math.sin(nav.toNumber());
    return seed - Math.floor(seed);
  };
  for (let i = 0; i < 250; i += 1) {
    const flow = d((rng() - 0.5) * 200);
    const gross = d((rng() - 0.5) * 0.06);
    const navAfterFlows = nav.times(d(1).plus(gross)).plus(flow);
    const step = computeReturnStep(nav, navAfterFlows, flow);
    if (nav.lte(0)) {
      assert.equal(step.toNumber(), 0);
    } else {
      assert.ok(step.minus(gross).abs().lt(1e-6));
    }
    nav = navAfterFlows;
  }
});

test('daily return rows survive JSON save/load round-trip for long sequences', () => {
  const transactions = [
    { date: '2024-01-01', type: 'DEPOSIT', amount: 10000 },
  ];
  const tickers = ['SPY', 'QQQ'];
  let runningDate = new Date('2024-01-01T00:00:00Z');
  for (let i = 0; i < 60; i += 1) {
    runningDate = new Date(runningDate.getTime() + 86_400_000);
    const dateKey = toDateKey(runningDate);
    if (i % 5 === 0) {
      transactions.push({
        date: dateKey,
        type: 'DEPOSIT',
        amount: 500 + (i % 3) * 10,
      });
    }
    transactions.push({
      date: dateKey,
      type: 'BUY',
      ticker: tickers[i % tickers.length],
      amount: 250 + (i % 7) * 3,
      quantity: 2 + (i % 4) * 0.1,
    });
  }

  const dates = transactions
    .map((tx) => tx.date)
    .sort((a, b) => a.localeCompare(b));
  const uniqueDates = Array.from(new Set(dates));
  const pricesByDate = new Map();
  for (const date of uniqueDates) {
    const priceMap = new Map();
    priceMap.set('SPY', 400 + uniqueDates.indexOf(date));
    priceMap.set('QQQ', 350 + uniqueDates.indexOf(date) * 1.2);
    pricesByDate.set(date, priceMap);
  }

  const states = computeDailyStates({
    transactions,
    pricesByDate,
    dates: uniqueDates,
  });

  const rows = computeDailyReturnRows({
    states,
    rates: [{ effective_date: '2024-01-01', apy: 0.04 }],
    spyPrices: new Map(uniqueDates.map((date, idx) => [date, 400 + idx])),
    transactions,
  });

  const stored = JSON.parse(
    JSON.stringify(
      states.map((state) => ({
        ...state,
        holdings: Object.fromEntries(state.holdings.entries()),
      })),
    ),
  );

  const restoredStates = stored.map((state) => ({
    ...state,
    holdings: new Map(Object.entries(state.holdings)),
  }));

  const restoredRows = computeDailyReturnRows({
    states: restoredStates,
    rates: [{ effective_date: '2024-01-01', apy: 0.04 }],
    spyPrices: new Map(uniqueDates.map((date, idx) => [date, 400 + idx])),
    transactions,
  });

  assert.deepEqual(rows, restoredRows);
  const summaryOriginal = summarizeReturns(rows);
  const summaryRestored = summarizeReturns(restoredRows);
  assert.deepEqual(summaryOriginal, summaryRestored);
});

test('computeMoneyWeightedReturn annualises single deposit', () => {
  const transactions = [
    { date: '2024-01-01', type: 'DEPOSIT', amount: 1000 },
  ];
  const navRows = [
    { date: '2024-01-01', portfolio_nav: 1000 },
    { date: '2024-01-31', portfolio_nav: 1100 },
  ];
  const result = computeMoneyWeightedReturn({
    transactions,
    navRows,
    startDate: '2024-01-01',
    endDate: '2024-01-31',
  }).toNumber();
  const expected = Math.pow(1100 / 1000, 365 / 30) - 1;
  assert.ok(Math.abs(result - expected) < 1e-6);
});

test('computeMoneyWeightedReturn balances NPV for mixed flows', () => {
  const transactions = [
    { date: '2024-01-01', type: 'DEPOSIT', amount: 1000 },
    { date: '2024-02-10', type: 'DEPOSIT', amount: 200 },
    { date: '2024-02-20', type: 'WITHDRAWAL', amount: 150 },
  ];
  const navRows = [
    { date: '2024-01-01', portfolio_nav: 1000 },
    { date: '2024-02-29', portfolio_nav: 1175 },
  ];
  const rate = computeMoneyWeightedReturn({
    transactions,
    navRows,
    startDate: '2024-01-01',
    endDate: '2024-02-29',
  }).toNumber();
  const MS_PER_DAY = 86_400_000;
  const earliest = new Date('2024-01-01T00:00:00Z');
  const flows = [
    { date: '2024-01-01', amount: -1000 },
    { date: '2024-02-10', amount: -200 },
    { date: '2024-02-20', amount: 150 },
    { date: '2024-02-29', amount: 1175 },
  ];
  const presentValue = flows.reduce((acc, flow) => {
    const current = new Date(`${flow.date}T00:00:00Z`);
    const years = (current.getTime() - earliest.getTime()) / MS_PER_DAY / 365;
    const discount = (1 + rate) ** years;
    return acc + flow.amount / discount;
  }, 0);
  assert.ok(Math.abs(presentValue) < 1e-6);
});
