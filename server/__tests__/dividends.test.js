import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeDividendMetrics } from '../finance/dividends.js';

describe('computeDividendMetrics', () => {
  it('returns empty metrics for no transactions', () => {
    const result = computeDividendMetrics([]);
    assert.equal(result.totalCount, 0);
    assert.equal(result.ytdGross, '0');
    assert.equal(result.ytdNet, '0');
    assert.deepEqual(result.byTicker, []);
    assert.deepEqual(result.byYear, []);
    assert.deepEqual(result.byMonth, []);
  });

  it('returns empty metrics for non-array input', () => {
    const result = computeDividendMetrics(null);
    assert.equal(result.totalCount, 0);
  });

  it('sums dividend amounts', () => {
    const txs = [
      { type: 'DIVIDEND', ticker: 'AAPL', amount: '5.00', date: '2026-01-15' },
      { type: 'DIVIDEND', ticker: 'AAPL', amount: '3.50', date: '2026-04-15' },
    ];
    const result = computeDividendMetrics(txs, new Date('2026-05-16'));
    assert.equal(result.totalCount, 2);
    assert.equal(result.ytdGross, '8.5');
    assert.equal(result.ytdNet, '8.5');
    assert.equal(result.ytdTax, '0');
  });

  it('computes YTD for current year only', () => {
    const txs = [
      { type: 'DIVIDEND', ticker: 'AAPL', amount: '10', date: '2025-12-01' },
      { type: 'DIVIDEND', ticker: 'AAPL', amount: '25', date: '2026-03-01' },
    ];
    const result = computeDividendMetrics(txs, new Date('2026-05-16'));
    assert.equal(result.ytdGross, '25');
  });

  it('deducts withholding tax from net', () => {
    const txs = [
      { type: 'DIVIDEND', ticker: 'AAPL', amount: '10', date: '2026-03-15' },
      { type: 'FEE', ticker: 'AAPL', amount: '2', date: '2026-03-15', notes: 'withholding_tax' },
    ];
    const result = computeDividendMetrics(txs, new Date('2026-05-16'));
    assert.equal(result.ytdGross, '10');
    assert.equal(result.ytdNet, '8');
    assert.equal(result.ytdTax, '2');
  });

  it('groups by ticker', () => {
    const txs = [
      { type: 'DIVIDEND', ticker: 'AAPL', amount: '5', date: '2026-01-15' },
      { type: 'DIVIDEND', ticker: 'MSFT', amount: '3', date: '2026-01-15' },
    ];
    const result = computeDividendMetrics(txs, new Date('2026-05-16'));
    assert.equal(result.byTicker.length, 2);
    const tickers = result.byTicker.map((t) => t.ticker).sort();
    assert.deepEqual(tickers, ['AAPL', 'MSFT']);
  });

  it('sorts tickers by gross descending', () => {
    const txs = [
      { type: 'DIVIDEND', ticker: 'MSFT', amount: '3', date: '2026-01-15' },
      { type: 'DIVIDEND', ticker: 'AAPL', amount: '10', date: '2026-01-15' },
    ];
    const result = computeDividendMetrics(txs, new Date('2026-05-16'));
    assert.equal(result.byTicker[0].ticker, 'AAPL');
    assert.equal(result.byTicker[1].ticker, 'MSFT');
  });

  it('trailing 12 months excludes older dividends', () => {
    const txs = [
      { type: 'DIVIDEND', ticker: 'AAPL', amount: '100', date: '2024-01-01' },
      { type: 'DIVIDEND', ticker: 'AAPL', amount: '5', date: '2026-05-01' },
    ];
    const result = computeDividendMetrics(txs, new Date('2026-05-16'));
    assert.equal(result.trailing12mGross, '5');
  });

  it('groups by year', () => {
    const txs = [
      { type: 'DIVIDEND', ticker: 'AAPL', amount: '5', date: '2025-06-15' },
      { type: 'DIVIDEND', ticker: 'AAPL', amount: '7', date: '2026-02-15' },
    ];
    const result = computeDividendMetrics(txs, new Date('2026-05-16'));
    assert.equal(result.byYear.length, 2);
    assert.equal(result.byYear[0].period, '2026');
    assert.equal(result.byYear[1].period, '2025');
  });

  it('groups by month', () => {
    const txs = [
      { type: 'DIVIDEND', ticker: 'AAPL', amount: '5', date: '2026-03-15' },
      { type: 'DIVIDEND', ticker: 'AAPL', amount: '3', date: '2026-03-20' },
      { type: 'DIVIDEND', ticker: 'MSFT', amount: '2', date: '2026-04-10' },
    ];
    const result = computeDividendMetrics(txs, new Date('2026-05-16'));
    const march = result.byMonth.find((m) => m.period === '2026-03');
    assert.ok(march);
    assert.equal(march.gross, '8');
    assert.equal(march.count, 2);
  });

  it('ignores non-dividend transactions', () => {
    const txs = [
      { type: 'BUY', ticker: 'AAPL', amount: '1000', date: '2026-01-15' },
      { type: 'SELL', ticker: 'MSFT', amount: '500', date: '2026-02-15' },
      { type: 'DEPOSIT', amount: '200', date: '2026-01-01' },
    ];
    const result = computeDividendMetrics(txs, new Date('2026-05-16'));
    assert.equal(result.totalCount, 0);
  });
});
