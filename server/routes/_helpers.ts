import { computeTradingDayAge } from '../utils/calendar.js';

export interface DatedRow extends Record<string, unknown> {
  date?: unknown;
}

export interface ScopedRow extends Record<string, unknown> {
  portfolio_id?: unknown;
}

export interface HistoricalPricePoint {
  date: string;
  close?: number;
  adjClose?: number;
  adj_close?: number;
  price?: number;
}

export interface LatestPriceSnapshot {
  price: number | null;
  asOf: string | null;
}

export function paginateRows<T>(
  rows: T[],
  { page = 1, perPage = 100 }: { page?: number; perPage?: number } = {}
) {
  const total = rows.length;
  const normalizedPerPage = Number.isFinite(perPage) && perPage > 0 ? perPage : 100;
  const totalPages = total === 0 ? 0 : Math.ceil(total / normalizedPerPage);
  const safePage = totalPages === 0 ? Math.max(1, page) : Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * normalizedPerPage;
  return {
    items: rows.slice(start, start + normalizedPerPage),
    meta: {
      page: safePage,
      per_page: normalizedPerPage,
      total,
      total_pages: totalPages,
    },
  };
}

export function filterRowsByRange<T extends DatedRow>(
  rows: T[],
  from: string | null,
  to: string | null
) {
  return rows.filter((row) => {
    const date = typeof row.date === 'string' ? row.date : null;
    if (!date) return true;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });
}

export function normalizeScopedPortfolioId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function filterRowsByPortfolioScope<T extends ScopedRow>(rows: T[], portfolioId: unknown) {
  const normalizedPortfolioId = normalizeScopedPortfolioId(portfolioId);
  if (!normalizedPortfolioId) {
    const unscoped = rows.filter(
      (row) => typeof row.portfolio_id !== 'string' || row.portfolio_id.trim().length === 0
    );
    return unscoped.length > 0 ? unscoped : rows;
  }
  return rows.filter((row) => row.portfolio_id === normalizedPortfolioId);
}

export function normalizeTickerSymbol(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : '';
}

export function asHistoricalPricePoint(value: unknown): HistoricalPricePoint | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const date = typeof record.date === 'string' ? record.date.trim() : '';
  if (!date) {
    return null;
  }
  return {
    date,
    ...(Number.isFinite(record.close) ? { close: Number(record.close) } : {}),
    ...(Number.isFinite(record.adjClose) ? { adjClose: Number(record.adjClose) } : {}),
    ...(Number.isFinite(record.adj_close) ? { adj_close: Number(record.adj_close) } : {}),
    ...(Number.isFinite(record.price) ? { price: Number(record.price) } : {}),
  };
}

export function resolveHistoricalClose(point: HistoricalPricePoint | null): number | null {
  if (!point) {
    return null;
  }
  const candidates = [point.close, point.adjClose, point.adj_close, point.price];
  for (const candidate of candidates) {
    if (candidate != null && Number.isFinite(candidate) && candidate > 0) {
      return Number(candidate);
    }
  }
  return null;
}

export function buildAdjustedPriceMap(
  rows: Array<Record<string, unknown>>,
  ticker: string,
  { from, to }: { from?: string | null; to?: string | null } = {}
) {
  const normalizedTicker = normalizeTickerSymbol(ticker);
  const map = new Map<string, number>();
  for (const row of rows) {
    const rowTicker = normalizeTickerSymbol(row.ticker);
    const point = asHistoricalPricePoint(row);
    const price = resolveHistoricalClose(point);
    if (
      rowTicker !== normalizedTicker ||
      !point?.date ||
      (from && point.date < from) ||
      (to && point.date > to) ||
      price == null ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      continue;
    }
    map.set(point.date, price);
  }
  return new Map(Array.from(map.entries()).sort((left, right) => left[0].localeCompare(right[0])));
}

export function buildFreshPriceSnapshot(
  value: unknown,
  maxStaleTradingDays: number
): LatestPriceSnapshot {
  const point = asHistoricalPricePoint(value);
  const asOf = point?.date ?? null;
  const age = computeTradingDayAge(asOf);
  if (!asOf || (age !== null && age > maxStaleTradingDays)) {
    return { price: null, asOf };
  }
  return {
    price: resolveHistoricalClose(point),
    asOf,
  };
}

export function normalizePricingStatusSummary(
  symbolMeta: Record<string, unknown>,
  errors: Record<string, unknown>
): Record<string, unknown> {
  const summary = {
    status: 'unavailable',
    liveSymbols: [] as string[],
    eodSymbols: [] as string[],
    cacheSymbols: [] as string[],
    degradedSymbols: [] as string[],
    unavailableSymbols: [] as string[],
  };

  for (const [symbol, meta] of Object.entries(symbolMeta)) {
    const status =
      typeof (meta as Record<string, unknown>)?.['status'] === 'string'
        ? (meta as Record<string, string>)['status']
        : 'unavailable';
    if (status === 'live') {
      summary.liveSymbols.push(symbol);
      continue;
    }
    if (status === 'eod_fresh') {
      summary.eodSymbols.push(symbol);
      continue;
    }
    if (status === 'cache_fresh') {
      summary.cacheSymbols.push(symbol);
      continue;
    }
    if (status === 'degraded') {
      summary.degradedSymbols.push(symbol);
      continue;
    }
    summary.unavailableSymbols.push(symbol);
  }

  for (const symbol of Object.keys(errors)) {
    if (!summary.unavailableSymbols.includes(symbol)) {
      summary.unavailableSymbols.push(symbol);
    }
  }

  if (summary.unavailableSymbols.length > 0) {
    summary.status = 'unavailable';
  } else if (summary.degradedSymbols.length > 0) {
    summary.status = 'degraded';
  } else if (summary.liveSymbols.length > 0) {
    summary.status = 'live';
  } else if (summary.eodSymbols.length > 0) {
    summary.status = 'eod_fresh';
  } else if (summary.cacheSymbols.length > 0) {
    summary.status = 'cache_fresh';
  }

  return summary as unknown as Record<string, unknown>;
}
