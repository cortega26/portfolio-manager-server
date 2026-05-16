// server/finance/tradeStats.ts
// Trade statistics computed from ClosedLot arrays produced by lotMatcher.
// All arithmetic via decimal.js — no native JS math on monetary values.

import { d, ZERO } from './decimal.js';
import type { Decimal } from 'decimal.js';

// ── Public types ────────────────────────────────────────────────────────

export interface ClosedLot {
  ticker: string;
  buyDate: string;
  sellDate: string;
  buyPrice: string;
  sellPrice: string;
  shares: string;
  costBasis: string;
  proceeds: string;
  gainLoss: string;
  holdingDays: number;
}

export interface TickerStats {
  ticker: string;
  lots: number;
  wins: number;
  losses: number;
  winRate: string;
  totalGain: string;
  avgWin: string;
  avgLoss: string;
  profitFactor: string;
}

export interface YearStats {
  year: string;
  lots: number;
  wins: number;
  losses: number;
  winRate: string;
  totalGain: string;
  bestTicker: string;
  worstTicker: string;
}

export interface TradeStats {
  totalLots: number;
  winCount: number;
  lossCount: number;
  winRate: string;
  avgWinDollars: string;
  avgLossDollars: string;
  avgWinPct: string;
  avgLossPct: string;
  profitFactor: string;
  expectancy: string;
  largestWin: string;
  largestLoss: string;
  bestTicker: string;
  worstTicker: string;
  avgHoldingDaysWinners: number;
  avgHoldingDaysLosers: number;
  byYear: YearStats[];
  byTicker: TickerStats[];
}

// ── Helpers ─────────────────────────────────────────────────────────────

function serializeDec(value: Decimal): string {
  if (value.isZero()) return '0';
  return value.toFixed(10).replace(/\.?0+$/, '');
}

/** gainLoss as percentage of costBasis: (gainLoss / costBasis) * 100 */
function gainLossPercent(gainLoss: Decimal, costBasis: Decimal): Decimal {
  if (costBasis.isZero()) return ZERO;
  return gainLoss.div(costBasis).times(100);
}

function yearFromDate(date: string): string {
  if (date.length >= 4) return date.slice(0, 4);
  return 'Unknown';
}

// ── Core computation ────────────────────────────────────────────────────

export function computeTradeStats(closedLots: ClosedLot[]): TradeStats {
  if (!Array.isArray(closedLots) || closedLots.length === 0) {
    return {
      totalLots: 0,
      winCount: 0,
      lossCount: 0,
      winRate: '0',
      avgWinDollars: '0',
      avgLossDollars: '0',
      avgWinPct: '0',
      avgLossPct: '0',
      profitFactor: '0',
      expectancy: '0',
      largestWin: '0',
      largestLoss: '0',
      bestTicker: '',
      worstTicker: '',
      avgHoldingDaysWinners: 0,
      avgHoldingDaysLosers: 0,
      byYear: [],
      byTicker: [],
    };
  }

  let totalLots = 0;
  let winCount = 0;
  let lossCount = 0;
  let totalGain = ZERO;
  let winGainsTotal = ZERO;
  let lossTotal = ZERO;
  let largestWin = ZERO;
  let largestLoss = ZERO;
  let winPercentTotal = ZERO;
  let lossPercentTotal = ZERO;
  let winHoldingDaysTotal = 0;
  let lossHoldingDaysTotal = 0;

  // Best / worst by absolute gain amount
  let bestAmount = ZERO;
  let worstAmount = ZERO;
  let bestTicker = '';
  let worstTicker = '';

  // Per-ticker aggregation
  const tickerMap = new Map<
    string,
    {
      lots: number;
      wins: number;
      losses: number;
      totalGain: Decimal;
      winGains: Decimal;
      lossAmounts: Decimal;
    }
  >();

  // Per-year aggregation
  const yearMap = new Map<
    string,
    {
      lots: number;
      wins: number;
      losses: number;
      totalGain: Decimal;
      bestAmount: Decimal;
      bestTicker: string;
      worstAmount: Decimal;
      worstTicker: string;
    }
  >();

  for (const lot of closedLots) {
    const gl = d(lot.gainLoss);
    const basis = d(lot.costBasis);
    const pct = gainLossPercent(gl, basis);

    totalLots += 1;
    totalGain = totalGain.plus(gl);

    if (gl.gt(0)) {
      winCount += 1;
      winGainsTotal = winGainsTotal.plus(gl);
      winPercentTotal = winPercentTotal.plus(pct);
      winHoldingDaysTotal += lot.holdingDays;

      if (gl.gt(largestWin)) largestWin = gl;
      if (gl.gt(bestAmount)) {
        bestAmount = gl;
        bestTicker = lot.ticker;
      }
    } else if (gl.lt(0)) {
      lossCount += 1;
      lossTotal = lossTotal.plus(gl); // negative
      lossPercentTotal = lossPercentTotal.plus(pct);
      lossHoldingDaysTotal += lot.holdingDays;

      if (gl.lt(largestLoss)) largestLoss = gl;
      if (gl.lt(worstAmount)) {
        worstAmount = gl;
        worstTicker = lot.ticker;
      }
    }
    // gl === 0 is a scratch (neither win nor loss)

    // Per-ticker
    const tickerEntry = tickerMap.get(lot.ticker) ?? {
      lots: 0,
      wins: 0,
      losses: 0,
      totalGain: ZERO,
      winGains: ZERO,
      lossAmounts: ZERO,
    };
    tickerEntry.lots += 1;
    tickerEntry.totalGain = tickerEntry.totalGain.plus(gl);
    if (gl.gt(0)) {
      tickerEntry.wins += 1;
      tickerEntry.winGains = tickerEntry.winGains.plus(gl);
    } else if (gl.lt(0)) {
      tickerEntry.losses += 1;
      tickerEntry.lossAmounts = tickerEntry.lossAmounts.plus(gl);
    }
    tickerMap.set(lot.ticker, tickerEntry);

    // Per-year
    const yearKey = yearFromDate(lot.sellDate);
    const yearEntry = yearMap.get(yearKey) ?? {
      lots: 0,
      wins: 0,
      losses: 0,
      totalGain: ZERO,
      bestAmount: ZERO,
      bestTicker: '',
      worstAmount: ZERO,
      worstTicker: '',
    };
    yearEntry.lots += 1;
    yearEntry.totalGain = yearEntry.totalGain.plus(gl);
    if (gl.gt(0)) {
      yearEntry.wins += 1;
      if (gl.gt(yearEntry.bestAmount)) {
        yearEntry.bestAmount = gl;
        yearEntry.bestTicker = lot.ticker;
      }
    } else if (gl.lt(0)) {
      yearEntry.losses += 1;
      if (gl.lt(yearEntry.worstAmount)) {
        yearEntry.worstAmount = gl;
        yearEntry.worstTicker = lot.ticker;
      }
    }
    yearMap.set(yearKey, yearEntry);
  }

  const actualTotal = winCount + lossCount;
  const winRate = actualTotal > 0 ? d(winCount).div(d(actualTotal)).times(100) : ZERO;

  const avgWinDollars = winCount > 0 ? winGainsTotal.div(d(winCount)) : ZERO;
  const avgLossDollars = lossCount > 0 ? lossTotal.div(d(lossCount)) : ZERO;
  const avgWinPct = winCount > 0 ? winPercentTotal.div(d(winCount)) : ZERO;
  const avgLossPct = lossCount > 0 ? lossPercentTotal.div(d(lossCount)) : ZERO;

  // Profit factor: gross gains / |gross losses|.  If no losses or no gains, special case.
  const profitFactor = lossTotal.isZero()
    ? winGainsTotal.gt(0)
      ? d(Infinity)
      : ZERO
    : winGainsTotal.div(lossTotal.abs());

  // Expectancy (average P&L per trade): total gain / total lots
  const expectancy = totalLots > 0 ? totalGain.div(d(totalLots)) : ZERO;

  // Per-ticker stats sorted by total gain descending
  const byTicker: TickerStats[] = Array.from(tickerMap.entries())
    .map(([ticker, data]) => {
      const tActual = data.wins + data.losses;
      const tWinRate = tActual > 0 ? d(data.wins).div(d(tActual)).times(100) : ZERO;
      const tAvgWin = data.wins > 0 ? data.winGains.div(d(data.wins)) : ZERO;
      const tAvgLoss = data.losses > 0 ? data.lossAmounts.div(d(data.losses)) : ZERO;
      const tProfitFactor = data.lossAmounts.isZero()
        ? data.winGains.gt(0)
          ? d(Infinity)
          : ZERO
        : data.winGains.div(data.lossAmounts.abs());

      return {
        ticker,
        lots: data.lots,
        wins: data.wins,
        losses: data.losses,
        winRate: serializeDec(tWinRate),
        totalGain: serializeDec(data.totalGain),
        avgWin: serializeDec(tAvgWin),
        avgLoss: serializeDec(tAvgLoss),
        profitFactor: tProfitFactor.isFinite() ? serializeDec(tProfitFactor) : '∞',
      };
    })
    .sort((a, b) => d(b.totalGain).minus(d(a.totalGain)).toNumber());

  // Per-year stats sorted newest first
  const byYear: YearStats[] = Array.from(yearMap.entries())
    .map(([year, data]) => {
      const yActual = data.wins + data.losses;
      const yWinRate = yActual > 0 ? d(data.wins).div(d(yActual)).times(100) : ZERO;
      return {
        year,
        lots: data.lots,
        wins: data.wins,
        losses: data.losses,
        winRate: serializeDec(yWinRate),
        totalGain: serializeDec(data.totalGain),
        bestTicker: data.bestTicker,
        worstTicker: data.worstTicker,
      };
    })
    .sort((a, b) => b.year.localeCompare(a.year));

  return {
    totalLots,
    winCount,
    lossCount,
    winRate: serializeDec(winRate),
    avgWinDollars: serializeDec(avgWinDollars),
    avgLossDollars: serializeDec(avgLossDollars),
    avgWinPct: serializeDec(avgWinPct),
    avgLossPct: serializeDec(avgLossPct),
    profitFactor: profitFactor.isFinite() ? serializeDec(profitFactor) : '∞',
    expectancy: serializeDec(expectancy),
    largestWin: serializeDec(largestWin),
    largestLoss: serializeDec(largestLoss),
    bestTicker,
    worstTicker,
    avgHoldingDaysWinners: winCount > 0 ? Math.round(winHoldingDaysTotal / winCount) : 0,
    avgHoldingDaysLosers: lossCount > 0 ? Math.round(lossHoldingDaysTotal / lossCount) : 0,
    byYear,
    byTicker,
  };
}
