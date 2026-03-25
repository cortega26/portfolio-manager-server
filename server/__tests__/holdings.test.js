import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  buildHoldings,
  computeDashboardMetrics,
  deriveLastOperationReference,
  deriveHoldingStats,
  deriveSignalRow,
  filterOpenHoldings,
  resolveSignalWindow,
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
    assert.equal(apple.shares, '7.000000000');
    assert.ok(apple.realised > 0);
  });

  it('derives holding stats and signal rows from the last operation reference price', () => {
    const holdings = buildHoldings(transactions);
    const apple = holdings.find((item) => item.ticker === 'AAPL');
    const stats = deriveHoldingStats(apple, 130);
    const reference = deriveLastOperationReference(
      [
        ...transactions,
        { ticker: 'AAPL', type: 'BUY', shares: 1, amount: -120, price: 120, date: '2024-01-04' },
      ],
      'AAPL',
    );

    assert.equal(stats.value, 910);
    assert.equal(stats.avgCostLabel, '$110.00');

    const signal = deriveSignalRow(apple, 130, 5, reference);
    assert.equal(signal.lower, '$114.00');
    assert.equal(signal.upper, '$126.00');
    assert.equal(signal.signal, 'TRIM zone');
    assert.equal(signal.referencePrice, 120);
  });

  it('computes dashboard metrics', () => {
    const holdings = buildHoldings(transactions);
    const metrics = computeDashboardMetrics(holdings, { AAPL: 130, MSFT: 210 });

    assert.equal(Math.round(metrics.totalValue), 1330);
    assert.equal(metrics.holdingsCount, 2);
    assert.equal(metrics.pricedHoldingsCount, 2);
    assert.equal(metrics.unpricedHoldingsCount, 0);
  });

  it('does not fall back to cost basis when market prices are unavailable', () => {
    const holdings = buildHoldings(transactions);
    const metrics = computeDashboardMetrics(holdings, {});

    assert.equal(Math.round(metrics.totalValue), 0);
    assert.equal(Math.round(metrics.totalCost), 1170);
    assert.equal(metrics.pricedHoldingsCount, 0);
    assert.equal(metrics.unpricedHoldingsCount, 2);
  });

  it('handles missing tickers and unavailable prices gracefully', () => {
    const holdings = buildHoldings([
      { ticker: '', type: 'BUY', shares: 1, amount: -10 },
      { ticker: 'NFLX', type: 'BUY', shares: 2, amount: -200 },
    ]);

    assert.equal(holdings.length, 1);
    const stats = deriveHoldingStats(holdings[0], undefined);
    assert.equal(stats.priceLabel, '—');
    assert.equal(stats.valueLabel, '—');
    const signal = deriveSignalRow(holdings[0], undefined, 4);
    assert.equal(signal.signal, 'NO DATA');
    assert.equal(signal.price, '—');
  });

  it('filters closed positions out of the open-holdings view', () => {
    const holdings = buildHoldings([
      { ticker: 'AAPL', type: 'BUY', shares: 1, amount: -100 },
      { ticker: 'AAPL', type: 'SELL', shares: 1, amount: 120 },
      { ticker: 'MSFT', type: 'BUY', shares: 2, amount: -400 },
    ]);

    const openHoldings = filterOpenHoldings(holdings);

    assert.equal(holdings.length, 2);
    assert.equal(openHoldings.length, 1);
    assert.equal(openHoldings[0].ticker, 'MSFT');
  });

  it('rejects suspicious price jumps outside the sanity band', () => {
    const holdings = buildHoldings([
      { ticker: 'NVDA', type: 'BUY', shares: 1, amount: -100, price: 100, date: '2024-01-01' },
    ]);

    const row = deriveSignalRow(
      holdings[0],
      140,
      5,
      { price: 100, date: '2024-01-01', type: 'BUY' },
    );

    assert.equal(row.signal, 'NO DATA');
    assert.equal(row.sanityRejected, true);
    assert.equal(row.lower, '—');
    assert.equal(row.upper, '—');
  });

  it('normalizes signal windows from different config shapes', () => {
    const signals = {
      aapl: { percent: '5.5' },
      MSFT: 2,
    };

    assert.equal(resolveSignalWindow(signals, 'AAPL'), 5.5);
    assert.equal(resolveSignalWindow(signals, 'msft'), 2);
    assert.equal(resolveSignalWindow(signals, 'nvda'), 3);
  });

  it('prevents negative shares when selling more than owned', () => {
    const oversellTransactions = [
      { ticker: 'TSLA', type: 'BUY', shares: 10, amount: -2000, date: '2024-01-01' },
      { ticker: 'TSLA', type: 'SELL', shares: 15, amount: 3500, date: '2024-01-02' },
    ];

    const holdings = buildHoldings(oversellTransactions);
    const tsla = holdings.find((h) => h.ticker === 'TSLA');

    assert.equal(tsla.shares, '0');
    assert.ok(Number(tsla.shares) >= 0);
  });

  it('handles floating-point precision in multiple sells', () => {
    const precisionTransactions = [
      { ticker: 'GOOG', type: 'BUY', shares: 100.123456, amount: -10000, date: '2024-01-01' },
      { ticker: 'GOOG', type: 'SELL', shares: 50.061728, amount: 5100, date: '2024-01-02' },
      { ticker: 'GOOG', type: 'SELL', shares: 50.061728, amount: 5200, date: '2024-01-03' },
    ];

    const holdings = buildHoldings(precisionTransactions);
    const goog = holdings.find((h) => h.ticker === 'GOOG');

    assert.ok(Math.abs(Number(goog.shares)) < 1e-6);
  });
});
