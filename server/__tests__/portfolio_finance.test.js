import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  externalFlowsByDate,
  computeDailyStates,
  holdingsToObject,
  weightsFromState,
} from '../finance/portfolio.js';
import { d, roundDecimal } from '../finance/decimal.js';
import { toDateKey } from '../finance/cash.js';

function deterministicAmount(seed) {
  const value = Math.sin(seed) * 500;
  return Number(value.toFixed(2));
}

test('externalFlowsByDate accumulates flows without precision drift', () => {
  const baseDate = new Date('2024-01-01T00:00:00Z');
  const transactions = [];
  for (let i = 0; i < 180; i += 1) {
    const date = toDateKey(new Date(baseDate.getTime() + i * 86_400_000));
    const amount = deterministicAmount(i + 1);
    const type = i % 3 === 0 ? 'WITHDRAWAL' : 'DEPOSIT';
    transactions.push({ date, type, amount: Math.abs(amount) });
  }
  const flows = externalFlowsByDate(transactions);
  const manual = new Map();
  for (const tx of transactions) {
    const signed = tx.type === 'WITHDRAWAL' ? -Math.abs(tx.amount) : Math.abs(tx.amount);
    const current = manual.get(tx.date) ?? d(0);
    manual.set(tx.date, current.plus(signed));
  }
  for (const [date, value] of manual.entries()) {
    const reported = flows.get(date);
    assert.ok(reported, `missing flow for ${date}`);
    assert.ok(reported.minus(value).abs().lt(0.005));
  }
});

test('computeDailyStates valuations remain stable across long ledgers', () => {
  const baseDate = new Date('2024-01-01T00:00:00Z');
  const transactions = [
    { date: toDateKey(baseDate), type: 'DEPOSIT', amount: 10000 },
  ];
  const tickers = ['SPY', 'QQQ', 'IWM'];
  for (let i = 1; i <= 120; i += 1) {
    const date = toDateKey(new Date(baseDate.getTime() + i * 86_400_000));
    const ticker = tickers[i % tickers.length];
    transactions.push({
      date,
      type: i % 4 === 0 ? 'SELL' : 'BUY',
      ticker,
      amount: 150 + (i % 9) * 7,
      quantity: (i % 4 === 0 ? -1 : 1) * (1 + (i % 5) * 0.05),
    });
  }

  const dates = transactions
    .map((tx) => tx.date)
    .sort((a, b) => a.localeCompare(b));
  const uniqueDates = Array.from(new Set(dates));
  const pricesByDate = new Map();
  for (const date of uniqueDates) {
    const priceMap = new Map();
    for (const [idx, ticker] of tickers.entries()) {
      priceMap.set(ticker, 200 + uniqueDates.indexOf(date) * (1 + idx * 0.1));
    }
    pricesByDate.set(date, priceMap);
  }

  const states = computeDailyStates({ transactions, pricesByDate, dates: uniqueDates });
  for (const state of states) {
    const manualCash = d(state.cash);
    let manualHoldings = d(0);
    const priceMap = pricesByDate.get(state.date) ?? new Map();
    for (const [ticker, qty] of state.holdings.entries()) {
      const price = priceMap.get(ticker) ?? 0;
      manualHoldings = manualHoldings.plus(d(qty).times(price));
    }
    const expectedNav = manualCash.plus(manualHoldings);
    assert.ok(d(state.nav).minus(expectedNav).abs().lt(0.01));
    assert.ok(roundDecimal(d(state.riskValue), 2).minus(manualHoldings).abs().lt(0.01));
  }
});

test('computeDailyStates treats signed buy amounts as cash outflows', () => {
  const date = '2024-01-01';
  const deposit = { date, type: 'DEPOSIT', amount: 1000 };
  const signedBuy = { date, type: 'BUY', ticker: 'SPY', amount: -500, quantity: 5 };
  const positiveBuy = { date, type: 'BUY', ticker: 'SPY', amount: 500, quantity: 5 };
  const pricesByDate = new Map([[date, new Map([['SPY', 100]])]]);

  const [stateWithSignedAmount] = computeDailyStates({
    transactions: [deposit, signedBuy],
    pricesByDate,
    dates: [date],
  });

  const [stateWithPositiveAmount] = computeDailyStates({
    transactions: [deposit, positiveBuy],
    pricesByDate,
    dates: [date],
  });

  assert.equal(stateWithSignedAmount.cash, 500);
  assert.equal(stateWithSignedAmount.riskValue, 500);
  assert.equal(stateWithSignedAmount.nav, 1000);
  assert.equal(stateWithSignedAmount.holdings.get('SPY'), 5);

  assert.deepEqual(stateWithSignedAmount, stateWithPositiveAmount);
});

test('holdingsToObject and weightsFromState provide stable transforms', () => {
  const holdings = new Map([
    ['AAPL', 5.25],
    ['MSFT', 3],
  ]);
  const object = holdingsToObject(holdings);
  assert.deepEqual(object, { AAPL: 5.25, MSFT: 3 });

  const weights = weightsFromState({ nav: 200, cash: 80, riskValue: 120 });
  assert.ok(Math.abs(weights.cash - 0.4) < 1e-9);
  assert.ok(Math.abs(weights.risk - 0.6) < 1e-9);

  const zeroWeights = weightsFromState({ nav: 0, cash: 0, riskValue: 0 });
  assert.deepEqual(zeroWeights, { cash: 0, risk: 0 });
});
