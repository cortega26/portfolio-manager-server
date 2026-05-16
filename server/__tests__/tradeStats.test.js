import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeTradeStats } from '../finance/tradeStats.js';

describe('computeTradeStats', () => {
  it('returns empty stats for no lots', () => {
    const result = computeTradeStats([]);
    assert.equal(result.totalLots, 0);
    assert.equal(result.winCount, 0);
    assert.equal(result.lossCount, 0);
    assert.deepEqual(result.byTicker, []);
    assert.deepEqual(result.byYear, []);
  });

  it('returns empty stats for null input', () => {
    const result = computeTradeStats(null);
    assert.equal(result.totalLots, 0);
  });

  it('computes single winning lot', () => {
    const lots = [
      {
        ticker: 'AAPL',
        buyDate: '2024-01-15',
        sellDate: '2024-06-15',
        buyPrice: '150',
        sellPrice: '200',
        shares: '10',
        costBasis: '1500',
        proceeds: '2000',
        gainLoss: '500',
        holdingDays: 152,
      },
    ];
    const result = computeTradeStats(lots);
    assert.equal(result.totalLots, 1);
    assert.equal(result.winCount, 1);
    assert.equal(result.lossCount, 0);
    assert.equal(result.winRate, '100');
    assert.equal(result.avgWinDollars, '500');
    assert.equal(result.profitFactor, '∞'); // no losses
    assert.ok(Number(result.expectancy) > 0);
  });

  it('computes single losing lot', () => {
    const lots = [
      {
        ticker: 'TSLA',
        buyDate: '2024-01-15',
        sellDate: '2024-06-15',
        buyPrice: '250',
        sellPrice: '200',
        shares: '10',
        costBasis: '2500',
        proceeds: '2000',
        gainLoss: '-500',
        holdingDays: 152,
      },
    ];
    const result = computeTradeStats(lots);
    assert.equal(result.totalLots, 1);
    assert.equal(result.winCount, 0);
    assert.equal(result.lossCount, 1);
    assert.equal(result.winRate, '0');
    assert.equal(result.largestLoss, '-500');
  });

  it('computes win rate correctly', () => {
    const lots = [
      {
        ticker: 'AAPL',
        buyDate: '2024-01-01',
        sellDate: '2024-02-01',
        buyPrice: '100',
        sellPrice: '150',
        shares: '10',
        costBasis: '1000',
        proceeds: '1500',
        gainLoss: '500',
        holdingDays: 31,
      },
      {
        ticker: 'MSFT',
        buyDate: '2024-01-01',
        sellDate: '2024-02-01',
        buyPrice: '200',
        sellPrice: '150',
        shares: '5',
        costBasis: '1000',
        proceeds: '750',
        gainLoss: '-250',
        holdingDays: 31,
      },
      {
        ticker: 'GOOGL',
        buyDate: '2024-01-01',
        sellDate: '2024-02-01',
        buyPrice: '100',
        sellPrice: '180',
        shares: '10',
        costBasis: '1000',
        proceeds: '1800',
        gainLoss: '800',
        holdingDays: 31,
      },
    ];
    const result = computeTradeStats(lots);
    assert.equal(result.totalLots, 3);
    assert.equal(result.winCount, 2);
    assert.equal(result.lossCount, 1);
    // win rate ~66.666...%
    assert.ok(Number(result.winRate) > 66);
    assert.ok(Number(result.winRate) < 67);
  });

  it('computes profit factor', () => {
    const lots = [
      {
        ticker: 'A',
        buyDate: '2024-01-01',
        sellDate: '2024-01-15',
        buyPrice: '100',
        sellPrice: '120',
        shares: '10',
        costBasis: '1000',
        proceeds: '1200',
        gainLoss: '200',
        holdingDays: 14,
      },
      {
        ticker: 'B',
        buyDate: '2024-01-01',
        sellDate: '2024-01-15',
        buyPrice: '100',
        sellPrice: '80',
        shares: '10',
        costBasis: '1000',
        proceeds: '800',
        gainLoss: '-200',
        holdingDays: 14,
      },
    ];
    const result = computeTradeStats(lots);
    // profit factor = gross gains / |gross losses| = 200 / 200 = 1
    assert.equal(result.profitFactor, '1');
  });

  it('computes profit factor > 1 for winning strategy', () => {
    const lots = [
      {
        ticker: 'A',
        buyDate: '2024-01-01',
        sellDate: '2024-01-15',
        buyPrice: '100',
        sellPrice: '130',
        shares: '10',
        costBasis: '1000',
        proceeds: '1300',
        gainLoss: '300',
        holdingDays: 14,
      },
      {
        ticker: 'B',
        buyDate: '2024-01-01',
        sellDate: '2024-01-15',
        buyPrice: '100',
        sellPrice: '80',
        shares: '10',
        costBasis: '1000',
        proceeds: '800',
        gainLoss: '-200',
        holdingDays: 14,
      },
    ];
    const result = computeTradeStats(lots);
    // profit factor = 300 / 200 = 1.5
    assert.ok(Number(result.profitFactor) > 1.4 && Number(result.profitFactor) < 1.6);
  });

  it('tracks best and worst tickers', () => {
    const lots = [
      {
        ticker: 'AAPL',
        buyDate: '2024-01-01',
        sellDate: '2024-01-15',
        buyPrice: '100',
        sellPrice: '180',
        shares: '10',
        costBasis: '1000',
        proceeds: '1800',
        gainLoss: '800',
        holdingDays: 14,
      },
      {
        ticker: 'TSLA',
        buyDate: '2024-01-01',
        sellDate: '2024-01-15',
        buyPrice: '100',
        sellPrice: '60',
        shares: '10',
        costBasis: '1000',
        proceeds: '600',
        gainLoss: '-400',
        holdingDays: 14,
      },
    ];
    const result = computeTradeStats(lots);
    assert.equal(result.bestTicker, 'AAPL');
    assert.equal(result.worstTicker, 'TSLA');
  });

  it('groups stats by ticker', () => {
    const lots = [
      {
        ticker: 'AAPL',
        buyDate: '2024-01-01',
        sellDate: '2024-01-15',
        buyPrice: '100',
        sellPrice: '150',
        shares: '10',
        costBasis: '1000',
        proceeds: '1500',
        gainLoss: '500',
        holdingDays: 14,
      },
      {
        ticker: 'AAPL',
        buyDate: '2024-01-01',
        sellDate: '2024-02-15',
        buyPrice: '100',
        sellPrice: '140',
        shares: '5',
        costBasis: '500',
        proceeds: '700',
        gainLoss: '200',
        holdingDays: 45,
      },
      {
        ticker: 'MSFT',
        buyDate: '2024-01-01',
        sellDate: '2024-01-15',
        buyPrice: '200',
        sellPrice: '180',
        shares: '3',
        costBasis: '600',
        proceeds: '540',
        gainLoss: '-60',
        holdingDays: 14,
      },
    ];
    const result = computeTradeStats(lots);
    assert.equal(result.byTicker.length, 2);
    const aapl = result.byTicker.find((t) => t.ticker === 'AAPL');
    assert.equal(aapl.lots, 2);
    assert.equal(aapl.wins, 2);
    assert.equal(aapl.losses, 0);
    assert.equal(aapl.totalGain, '700');
  });

  it('groups stats by year', () => {
    const lots = [
      {
        ticker: 'AAPL',
        buyDate: '2023-01-01',
        sellDate: '2023-06-01',
        buyPrice: '100',
        sellPrice: '150',
        shares: '10',
        costBasis: '1000',
        proceeds: '1500',
        gainLoss: '500',
        holdingDays: 151,
      },
      {
        ticker: 'MSFT',
        buyDate: '2024-01-01',
        sellDate: '2024-06-01',
        buyPrice: '100',
        sellPrice: '80',
        shares: '5',
        costBasis: '500',
        proceeds: '400',
        gainLoss: '-100',
        holdingDays: 152,
      },
    ];
    const result = computeTradeStats(lots);
    assert.equal(result.byYear.length, 2);
    assert.equal(result.byYear[0].year, '2024');
    assert.equal(result.byYear[1].year, '2023');
  });

  it('expectancy is average P&L per trade', () => {
    const lots = [
      {
        ticker: 'A',
        buyDate: '2024-01-01',
        sellDate: '2024-01-15',
        buyPrice: '100',
        sellPrice: '120',
        shares: '10',
        costBasis: '1000',
        proceeds: '1200',
        gainLoss: '200',
        holdingDays: 14,
      },
      {
        ticker: 'B',
        buyDate: '2024-01-01',
        sellDate: '2024-01-15',
        buyPrice: '100',
        sellPrice: '95',
        shares: '10',
        costBasis: '1000',
        proceeds: '950',
        gainLoss: '-50',
        holdingDays: 14,
      },
    ];
    const result = computeTradeStats(lots);
    // expectancy = (200 + (-50)) / 2 = 75
    assert.equal(result.expectancy, '75');
  });
});
