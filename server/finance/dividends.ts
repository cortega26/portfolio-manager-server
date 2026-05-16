// server/finance/dividends.ts
// Pure dividend metrics from transaction arrays.
// All arithmetic via decimal.js — no native JS math on monetary values.

import { d, ZERO } from './decimal.js';
import type { Decimal } from 'decimal.js';

// ── Public types ──────────────────────────────────────────────────────────

export interface DividendTransaction {
  type: string;
  ticker?: string;
  amount?: number | string | null;
  date?: string;
  notes?: string;
  uid?: string;
}

export interface DividendTickerMetrics {
  ticker: string;
  gross: string;
  tax: string;
  net: string;
  count: number;
}

export interface DividendPeriodMetrics {
  period: string; // "YYYY", "YYYY-MM"
  gross: string;
  net: string;
  count: number;
  topTicker: string;
}

export interface DividendMetrics {
  ytdGross: string;
  ytdNet: string;
  ytdTax: string;
  trailing12mGross: string;
  trailing12mNet: string;
  trailing12mTax: string;
  byTicker: DividendTickerMetrics[];
  byYear: DividendPeriodMetrics[];
  byMonth: DividendPeriodMetrics[];
  totalCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function isDividend(tx: DividendTransaction): boolean {
  return tx?.type === 'DIVIDEND';
}

function isWithholdingFee(tx: DividendTransaction): boolean {
  return tx?.type === 'FEE' && tx?.notes === 'withholding_tax';
}

function getYear(date: string | undefined): string {
  if (!date || date.length < 4) return '';
  return date.slice(0, 4);
}

function getYearMonth(date: string | undefined): string {
  if (!date || date.length < 7) return '';
  return date.slice(0, 7);
}

function getTicker(tx: DividendTransaction): string {
  if (typeof tx?.ticker === 'string') {
    const trimmed = tx.ticker.trim().toUpperCase();
    if (trimmed) return trimmed;
  }
  return 'UNKNOWN';
}

function serializeDec(value: Decimal): string {
  if (value.isZero()) return '0';
  return value.toFixed(8).replace(/\.?0+$/, '');
}

function yearFromDate(d: string): number {
  return Number.parseInt(d.slice(0, 4), 10) || 0;
}

// ── Core computation ─────────────────────────────────────────────────────

export function computeDividendMetrics(
  transactions: DividendTransaction[],
  referenceDate = new Date()
): DividendMetrics {
  const dividends = (Array.isArray(transactions) ? transactions : []).filter(isDividend);
  const fees = (Array.isArray(transactions) ? transactions : []).filter(isWithholdingFee);

  // Build tax map keyed by ticker + date to match FEE pairs
  const taxMap = new Map<string, Decimal>();
  for (const fee of fees) {
    const ticker = getTicker(fee);
    const date = fee.date ?? '';
    const key = `${ticker}:${date}`;
    const current = taxMap.get(key) ?? ZERO;
    taxMap.set(key, current.plus(d(fee.amount ?? 0)));
  }

  // Per-ticker aggregation
  const tickerMap = new Map<string, { gross: Decimal; tax: Decimal; count: number }>();
  const currentYear = referenceDate.getFullYear();
  const twelveMonthsAgo = new Date(referenceDate);
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  let ytdGross = ZERO;
  let ytdTax = ZERO;
  let trailing12mGross = ZERO;
  let trailing12mTax = ZERO;

  // By month / by year mappers
  const yearMap = new Map<
    string,
    { gross: Decimal; tax: Decimal; count: number; topTicker: string; topAmount: Decimal }
  >();
  const monthMap = new Map<
    string,
    { gross: Decimal; tax: Decimal; count: number; topTicker: string; topAmount: Decimal }
  >();

  for (const div of dividends) {
    const ticker = getTicker(div);
    const date = div.date ?? '';
    const gross = d(div.amount ?? 0);
    const taxKey = `${ticker}:${date}`;
    const tax = taxMap.get(taxKey) ?? ZERO;

    // Ticker-level aggregation
    const tickerEntry = tickerMap.get(ticker) ?? { gross: ZERO, tax: ZERO, count: 0 };
    tickerEntry.gross = tickerEntry.gross.plus(gross);
    tickerEntry.tax = tickerEntry.tax.plus(tax);
    tickerEntry.count += 1;
    tickerMap.set(ticker, tickerEntry);

    // YTD
    const txYear = yearFromDate(date);
    if (txYear === currentYear) {
      ytdGross = ytdGross.plus(gross);
      ytdTax = ytdTax.plus(tax);
    }

    // Trailing 12 months
    if (date && date >= twelveMonthsAgo.toISOString().slice(0, 10)) {
      trailing12mGross = trailing12mGross.plus(gross);
      trailing12mTax = trailing12mTax.plus(tax);
    }

    // Year-level
    const yearKey = getYear(date);
    if (yearKey) {
      const yEntry = yearMap.get(yearKey) ?? {
        gross: ZERO,
        tax: ZERO,
        count: 0,
        topTicker: '',
        topAmount: ZERO,
      };
      yEntry.gross = yEntry.gross.plus(gross);
      yEntry.tax = yEntry.tax.plus(tax);
      yEntry.count += 1;
      if (gross.gt(yEntry.topAmount)) {
        yEntry.topAmount = gross;
        yEntry.topTicker = ticker;
      }
      yearMap.set(yearKey, yEntry);
    }

    // Month-level
    const monthKey = getYearMonth(date);
    if (monthKey) {
      const mEntry = monthMap.get(monthKey) ?? {
        gross: ZERO,
        tax: ZERO,
        count: 0,
        topTicker: '',
        topAmount: ZERO,
      };
      mEntry.gross = mEntry.gross.plus(gross);
      mEntry.tax = mEntry.tax.plus(tax);
      mEntry.count += 1;
      if (gross.gt(mEntry.topAmount)) {
        mEntry.topAmount = gross;
        mEntry.topTicker = ticker;
      }
      monthMap.set(monthKey, mEntry);
    }
  }

  // Serialize ticker metrics sorted by gross descending
  const byTicker: DividendTickerMetrics[] = Array.from(tickerMap.entries())
    .map(([ticker, data]) => ({
      ticker,
      gross: serializeDec(data.gross),
      tax: serializeDec(data.tax),
      net: serializeDec(data.gross.minus(data.tax)),
      count: data.count,
    }))
    .sort((a, b) => d(b.gross).minus(d(a.gross)).toNumber());

  // Serialize period metrics sorted by key descending (newest first)
  const byYear: DividendPeriodMetrics[] = Array.from(yearMap.entries())
    .map(([period, data]) => ({
      period,
      gross: serializeDec(data.gross),
      net: serializeDec(data.gross.minus(data.tax)),
      count: data.count,
      topTicker: data.topTicker,
    }))
    .sort((a, b) => b.period.localeCompare(a.period));

  const byMonth: DividendPeriodMetrics[] = Array.from(monthMap.entries())
    .map(([period, data]) => ({
      period,
      gross: serializeDec(data.gross),
      net: serializeDec(data.gross.minus(data.tax)),
      count: data.count,
      topTicker: data.topTicker,
    }))
    .sort((a, b) => b.period.localeCompare(a.period));

  return {
    ytdGross: serializeDec(ytdGross),
    ytdNet: serializeDec(ytdGross.minus(ytdTax)),
    ytdTax: serializeDec(ytdTax),
    trailing12mGross: serializeDec(trailing12mGross),
    trailing12mNet: serializeDec(trailing12mGross.minus(trailing12mTax)),
    trailing12mTax: serializeDec(trailing12mTax),
    byTicker,
    byYear,
    byMonth,
    totalCount: dividends.length,
  };
}
