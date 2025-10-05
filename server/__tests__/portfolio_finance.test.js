import assert from 'node:assert/strict';
import { test } from 'node:test';

import { externalFlowsByDate, computeDailyStates } from '../finance/portfolio.js';
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
