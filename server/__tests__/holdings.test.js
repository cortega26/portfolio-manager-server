import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  buildHoldings,
  computeDashboardMetrics,
  deriveHoldingStats,
  deriveSignalRow,
} from '../../src/utils/holdings.js';

const transactions = [
  { ticker: 'AAPL', type: 'BUY', shares: 5, amount: -500 },
  { ticker: 'AAPL', type: 'BUY', shares: 5, amount: -600 },
  { ticker: 'AAPL', type: 'SELL', shares: 3, amount: 450 },
  { ticker: 'MSFT', type: 'BUY', shares: 2, amount: -400 },
];

describe('holdings utilities', () => {
  it('builds aggregate holdings with realised gains', () => {
    const holdings = buildHoldings(transactions);
    assert.equal(holdings.length, 2);

    const apple = holdings.find((item) => item.ticker === 'AAPL');
    assert.ok(apple);
    assert.equal(Number(apple.shares.toFixed(2)), 7);
    assert.ok(apple.realised > 0);
  });

  it('derives holding stats and signal rows', () => {
    const holdings = buildHoldings(transactions);
    const apple = holdings.find((item) => item.ticker === 'AAPL');
    const stats = deriveHoldingStats(apple, 130);

    assert.equal(stats.value, 910);
    assert.equal(stats.avgCostLabel, '$110.00');

    const signal = deriveSignalRow(apple, 130, 5);
    assert.equal(signal.lower, '$123.50');
    assert.equal(signal.signal, 'HOLD');
  });

  it('computes dashboard metrics', () => {
    const holdings = buildHoldings(transactions);
    const metrics = computeDashboardMetrics(holdings, { AAPL: 130, MSFT: 210 });

    assert.equal(Math.round(metrics.totalValue), 1330);
    assert.equal(metrics.holdingsCount, 2);
  });

  it('handles missing tickers and unavailable prices gracefully', () => {
    const holdings = buildHoldings([
      { ticker: '', type: 'BUY', shares: 1, amount: -10 },
      { ticker: 'NFLX', type: 'BUY', shares: 2, amount: -200 },
    ]);

    assert.equal(holdings.length, 1);
    const signal = deriveSignalRow(holdings[0], undefined, 4);
    assert.equal(signal.signal, 'NO DATA');
    assert.equal(signal.price, '—');
  });

  it('prevents negative shares when selling more than owned', () => {
    const oversellTransactions = [
      { ticker: 'TSLA', type: 'BUY', shares: 10, amount: -2000, date: '2024-01-01' },
      { ticker: 'TSLA', type: 'SELL', shares: 15, amount: 3500, date: '2024-01-02' },
    ];

    const holdings = buildHoldings(oversellTransactions);
    const tsla = holdings.find((h) => h.ticker === 'TSLA');

    assert.equal(tsla.shares, 0);
    assert.ok(tsla.shares >= 0);
  });

  it('handles floating-point precision in multiple sells', () => {
    const precisionTransactions = [
      { ticker: 'GOOG', type: 'BUY', shares: 100.123456, amount: -10000, date: '2024-01-01' },
      { ticker: 'GOOG', type: 'SELL', shares: 50.061728, amount: 5100, date: '2024-01-02' },
      { ticker: 'GOOG', type: 'SELL', shares: 50.061728, amount: 5200, date: '2024-01-03' },
    ];

    const holdings = buildHoldings(precisionTransactions);
    const goog = holdings.find((h) => h.ticker === 'GOOG');

    assert.ok(Math.abs(goog.shares) < 1e-6);
  });
});
