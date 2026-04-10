import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  annualizeReturn,
  computeAllSpySeries,
  computeDailyReturnRows,
  computeMatchedBenchmarkMoneyWeightedReturn,
  computeMaxDrawdown,
  computeReturnStep,
  summarizeReturns,
  computeMoneyWeightedReturn,
  cumulativeDifference,
} from '../finance/returns.js';
import { d, roundDecimal } from '../finance/decimal.js';
import { computeDailyStates } from '../finance/portfolio.js';
import { dailyRateFromApy, toDateKey } from '../finance/cash.js';

test('computeReturnStep handles flows correctly', () => {
  const result = computeReturnStep(1000, 1100, 50);
  assert.equal(roundDecimal(result, 4).toNumber(), 0.05);
});

test('cash flows on non-valuation days align to the next available state', () => {
  const states = [
    { date: '2024-01-05', nav: 1000, cash: 1000, riskValue: 0 },
    { date: '2024-01-08', nav: 1500, cash: 1500, riskValue: 0 },
  ];
  const rates = [{ effective_date: '2024-01-01', apy: 0 }];
  const spyPrices = new Map([
    ['2024-01-05', 100],
    ['2024-01-08', 100],
  ]);
  const transactions = [
    { date: '2024-01-06', type: 'DEPOSIT', amount: 500 },
  ];
  const rows = computeDailyReturnRows({ states, rates, spyPrices, transactions });
  assert.equal(rows.length, 2);
  const mondayRow = rows[1];
  assert.ok(Math.abs(mondayRow.r_port) < 1e-10);
  assert.ok(Math.abs(mondayRow.r_ex_cash) < 1e-10);
});

test('cash policy timeline normalizes overlapping entries', () => {
  const states = [
    { date: '2024-01-14', nav: 1000, cash: 1000, riskValue: 0 },
    { date: '2024-01-15', nav: 1000, cash: 1000, riskValue: 0 },
    { date: '2024-02-01', nav: 1000, cash: 1000, riskValue: 0 },
  ];
  const cashPolicy = {
    currency: 'USD',
    apyTimeline: [
      { from: '2024-01-01', apy: 0.02 },
      { from: '2024-02-01', apy: 0.05 },
      { from: '2024-01-15', apy: 0.04 },
    ],
  };
  const spyPrices = new Map(states.map((state) => [state.date, 100]));
  const transactions = [{ date: '2024-01-01', type: 'DEPOSIT', amount: 1000 }];
  const rows = computeDailyReturnRows({ states, cashPolicy, spyPrices, transactions });
  const jan14 = rows.find((row) => row.date === '2024-01-14');
  const jan15 = rows.find((row) => row.date === '2024-01-15');
  const feb01 = rows.find((row) => row.date === '2024-02-01');
  assert.ok(jan14);
  assert.ok(jan15);
  assert.ok(feb01);
  assert.ok(Math.abs(jan14.r_cash - dailyRateFromApy(0.02).toNumber()) < 1e-6);
  assert.ok(Math.abs(jan15.r_cash - dailyRateFromApy(0.04).toNumber()) < 1e-6);
  assert.ok(Math.abs(feb01.r_cash - dailyRateFromApy(0.05).toNumber()) < 1e-6);
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

test('first day time-weighted return starts at zero to provide a clean benchmark baseline', () => {
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

  assert.equal(rows[0].r_port, 0);
  assert.equal(rows[0].r_ex_cash, 0);
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

test('computeMatchedBenchmarkMoneyWeightedReturn matches a synthetic benchmark with initial capital and a later deposit', () => {
  const transactions = [
    { date: '2024-01-02', type: 'DEPOSIT', amount: 1000 },
    { date: '2024-01-10', type: 'DEPOSIT', amount: 500 },
  ];
  const navRows = [
    { date: '2024-01-02', portfolio_nav: 1000 },
    { date: '2024-01-31', portfolio_nav: 1600 },
  ];
  const benchmarkPrices = new Map([
    ['2024-01-02', 100],
    ['2024-01-10', 110],
    ['2024-01-31', 121],
  ]);

  const result = computeMatchedBenchmarkMoneyWeightedReturn({
    benchmarkPrices,
    transactions,
    navRows,
    startDate: '2024-01-02',
    endDate: '2024-01-31',
  });

  const terminalValue = d(1000)
    .dividedBy(100)
    .plus(d(500).dividedBy(110))
    .times(121);
  const expected = computeMoneyWeightedReturn({
    transactions,
    navRows: [
      { date: '2024-01-02', portfolio_nav: 1000 },
      { date: '2024-01-31', portfolio_nav: terminalValue.toNumber() },
    ],
    startDate: '2024-01-02',
    endDate: '2024-01-31',
  });

  assert.ok(result);
  assert.ok(result.minus(expected).abs().lt(1e-10));
});

test('computeMatchedBenchmarkMoneyWeightedReturn reflects withdrawals in the synthetic benchmark schedule', () => {
  const transactions = [
    { date: '2024-01-02', type: 'DEPOSIT', amount: 1000 },
    { date: '2024-01-10', type: 'WITHDRAWAL', amount: 300 },
  ];
  const navRows = [
    { date: '2024-01-02', portfolio_nav: 1000 },
    { date: '2024-01-31', portfolio_nav: 900 },
  ];
  const benchmarkPrices = new Map([
    ['2024-01-02', 100],
    ['2024-01-10', 120],
    ['2024-01-31', 132],
  ]);

  const result = computeMatchedBenchmarkMoneyWeightedReturn({
    benchmarkPrices,
    transactions,
    navRows,
    startDate: '2024-01-02',
    endDate: '2024-01-31',
  });

  const terminalValue = d(1000)
    .dividedBy(100)
    .minus(d(300).dividedBy(120))
    .times(132);
  const expected = computeMoneyWeightedReturn({
    transactions,
    navRows: [
      { date: '2024-01-02', portfolio_nav: 1000 },
      { date: '2024-01-31', portfolio_nav: terminalValue.toNumber() },
    ],
    startDate: '2024-01-02',
    endDate: '2024-01-31',
  });

  assert.ok(result);
  assert.ok(result.minus(expected).abs().lt(1e-10));
});

test('computeMatchedBenchmarkMoneyWeightedReturn aligns external flows to the next trading day when prices are missing', () => {
  const transactions = [
    { date: '2024-01-05', type: 'DEPOSIT', amount: 1000 },
    { date: '2024-01-06', type: 'DEPOSIT', amount: 500 },
  ];
  const navRows = [
    { date: '2024-01-05', portfolio_nav: 1000 },
    { date: '2024-01-12', portfolio_nav: 1800 },
  ];
  const benchmarkPrices = new Map([
    ['2024-01-05', 100],
    ['2024-01-08', 125],
    ['2024-01-12', 150],
  ]);

  const result = computeMatchedBenchmarkMoneyWeightedReturn({
    benchmarkPrices,
    transactions,
    navRows,
    startDate: '2024-01-05',
    endDate: '2024-01-12',
  });

  const terminalValue = d(1000)
    .dividedBy(100)
    .plus(d(500).dividedBy(125))
    .times(150);
  const expected = computeMoneyWeightedReturn({
    transactions: [
      { date: '2024-01-05', type: 'DEPOSIT', amount: 1000 },
      { date: '2024-01-08', type: 'DEPOSIT', amount: 500 },
    ],
    navRows: [
      { date: '2024-01-05', portfolio_nav: 1000 },
      { date: '2024-01-12', portfolio_nav: terminalValue.toNumber() },
    ],
    startDate: '2024-01-05',
    endDate: '2024-01-12',
  });

  assert.ok(result);
  assert.ok(result.minus(expected).abs().lt(1e-10));
});

test('computeMatchedBenchmarkMoneyWeightedReturn returns null when the benchmark cannot be priced across the window', () => {
  const result = computeMatchedBenchmarkMoneyWeightedReturn({
    benchmarkPrices: new Map([
      ['2024-01-10', 110],
      ['2024-01-31', 121],
    ]),
    transactions: [{ date: '2024-01-02', type: 'DEPOSIT', amount: 1000 }],
    navRows: [
      { date: '2024-01-02', portfolio_nav: 1000 },
      { date: '2024-01-31', portfolio_nav: 1200 },
    ],
    startDate: '2024-01-02',
    endDate: '2024-01-31',
  });

  assert.equal(result, null);
});

test('cumulativeDifference compares blended drag to portfolio growth', () => {
  const rows = [
    { r_port: 0.01, r_ex_cash: 0.005 },
    { r_port: -0.002, r_ex_cash: 0.001 },
  ];
  const drag = cumulativeDifference(rows);
  const blended = d(1)
    .plus(rows[0].r_port)
    .times(d(1).plus(rows[1].r_port));
  const exCash = d(1)
    .plus(rows[0].r_ex_cash)
    .times(d(1).plus(rows[1].r_ex_cash));
  const expected = exCash.minus(blended).dividedBy(blended);
  assert.ok(
    expected.minus(d(drag)).abs().lt(5e-6),
    'drag mismatch exceeds rounding tolerance',
  );
});

test('computeDailyReturnRows includes a QQQ benchmark track when QQQ prices are available', () => {
  const states = [
    { date: '2024-01-01', nav: 1000, cash: 1000, riskValue: 0 },
    { date: '2024-01-02', nav: 1100, cash: 1100, riskValue: 0 },
  ];
  const rates = [{ effective_date: '2024-01-01', apy: 0 }];
  const spyPrices = new Map([
    ['2024-01-01', 100],
    ['2024-01-02', 110],
  ]);
  const qqqPrices = new Map([
    ['2024-01-01', 200],
    ['2024-01-02', 230],
  ]);
  const transactions = [{ date: '2024-01-01', type: 'DEPOSIT', amount: 1000 }];

  const rows = computeDailyReturnRows({ states, rates, spyPrices, qqqPrices, transactions });

  assert.equal(rows[0].r_qqq_100, 0);
  assert.ok(Math.abs(rows[1].r_qqq_100 - 0.15) < 1e-8);

  const summary = summarizeReturns(rows);
  assert.ok(Math.abs(summary.r_qqq_100 - 0.15) < 1e-6);
});

// --- annualizeReturn tests (PM-AUD-008) ---

test('annualizeReturn golden: 50% cumulative over 730 days → ~0.2247', () => {
  const result = annualizeReturn(0.50, 730);
  assert.ok(result !== null);
  assert.ok(Math.abs(result - 0.2247) < 1e-4, `expected ~0.2247, got ${result}`);
});

test('annualizeReturn golden: -20% over exactly 365 days → -0.20 (identity)', () => {
  const result = annualizeReturn(-0.20, 365);
  assert.ok(result !== null);
  assert.ok(Math.abs(result - (-0.20)) < 1e-8, `expected -0.20, got ${result}`);
});

test('annualizeReturn edge: 10% over 180 days → null (period < 365)', () => {
  const result = annualizeReturn(0.10, 180);
  assert.equal(result, null);
});

test('annualizeReturn edge: 0% cumulative over 730 days → 0', () => {
  const result = annualizeReturn(0, 730);
  assert.equal(result, 0);
});

test('annualizeReturn edge: -100% cumulative over 730 days → -1.0 (total loss)', () => {
  const result = annualizeReturn(-1.0, 730);
  assert.ok(result !== null);
  assert.ok(Math.abs(result - (-1.0)) < 1e-8, `expected -1.0, got ${result}`);
});

// --- computeMaxDrawdown tests (PM-AUD-011) ---

test('computeMaxDrawdown golden: [100, 110, 77, 90, 115] → maxDD = -0.30, peak=day2, trough=day3', () => {
  // Cumulative values: 1.0, 1.1, 0.77, 0.9, 1.15
  // Daily returns: day1=0%, day2=+10%, day3=-30%, day4=+16.88%, day5=+27.78%
  const rows = [
    { date: '2024-01-01', r_port: 0 },
    { date: '2024-01-02', r_port: 0.10 },
    { date: '2024-01-03', r_port: -0.30 },
    { date: '2024-01-04', r_port: 90 / 77 - 1 },
    { date: '2024-01-05', r_port: 115 / 90 - 1 },
  ];
  const result = computeMaxDrawdown(rows);
  assert.ok(result !== null);
  assert.ok(Math.abs(result.maxDrawdown - (-0.30)) < 1e-4, `expected ~-0.30, got ${result.maxDrawdown}`);
  assert.equal(result.peakDate, '2024-01-02');
  assert.equal(result.troughDate, '2024-01-03');
});

test('computeMaxDrawdown edge: single point → null', () => {
  const result = computeMaxDrawdown([{ date: '2024-01-01', r_port: 0 }]);
  assert.equal(result, null);
});

test('computeMaxDrawdown edge: empty array → null', () => {
  const result = computeMaxDrawdown([]);
  assert.equal(result, null);
});

test('computeMaxDrawdown edge: all flat → maxDrawdown = 0', () => {
  const rows = [
    { date: '2024-01-01', r_port: 0 },
    { date: '2024-01-02', r_port: 0 },
    { date: '2024-01-03', r_port: 0 },
  ];
  const result = computeMaxDrawdown(rows);
  assert.ok(result !== null);
  assert.equal(result.maxDrawdown, 0);
});

test('computeMaxDrawdown edge: all declining → maxDD = total decline from first point', () => {
  // cumulative: 1.0, 0.95, 0.855, 0.7695
  const rows = [
    { date: '2024-01-01', r_port: 0 },
    { date: '2024-01-02', r_port: -0.05 },
    { date: '2024-01-03', r_port: -0.10 },
    { date: '2024-01-04', r_port: -0.10 },
  ];
  const result = computeMaxDrawdown(rows);
  assert.ok(result !== null);
  // Expected: (0.7695 - 1.0) / 1.0 = -0.2305
  assert.ok(Math.abs(result.maxDrawdown - (-0.2305)) < 1e-4, `expected ~-0.2305, got ${result.maxDrawdown}`);
  assert.equal(result.peakDate, '2024-01-01');
  assert.equal(result.troughDate, '2024-01-04');
});

test('computeMaxDrawdown edge: monotonically increasing → maxDrawdown = 0', () => {
  const rows = [
    { date: '2024-01-01', r_port: 0 },
    { date: '2024-01-02', r_port: 0.02 },
    { date: '2024-01-03', r_port: 0.03 },
    { date: '2024-01-04', r_port: 0.01 },
  ];
  const result = computeMaxDrawdown(rows);
  assert.ok(result !== null);
  assert.equal(result.maxDrawdown, 0);
});
