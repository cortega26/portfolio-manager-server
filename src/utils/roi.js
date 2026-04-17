import Decimal from 'decimal.js';
import { getDefaultBenchmarkConfig } from '../../shared/benchmarks.js';

const SERIES_META_FALLBACK = Object.freeze([
  {
    id: 'spy',
    dataKey: 'spy',
    label: 'S&P 500',
    description: 'Cumulative benchmark return for the S&P 500 over the loaded timeline',
    color: '#2563eb',
  },
  {
    id: 'qqq',
    dataKey: 'qqq',
    label: 'Nasdaq-100',
    description: 'Cumulative benchmark return for the Nasdaq-100 over the loaded timeline',
    color: '#f97316',
  },
  {
    id: 'blended',
    dataKey: 'blended',
    label: 'Cash-Matched S&P 500',
    description: "S&P 500 return adjusted for your portfolio's cash allocation on each day.",
    color: '#8b5cf6',
  },
  {
    id: 'exCash',
    dataKey: 'exCash',
    label: 'Risk sleeve (ex-cash)',
    description: 'Portfolio performance excluding the cash sleeve',
    color: '#ec4899',
  },
  {
    id: 'cash',
    dataKey: 'cash',
    label: 'Cash yield',
    description: 'Isolated cash performance with accrued interest',
    color: '#0ea5e9',
  },
]);

const SERIES_META_BY_ID = new Map(SERIES_META_FALLBACK.map((entry) => [entry.id, entry]));
const FALLBACK_CHART_PALETTE = Object.freeze([
  '#6366f1',
  '#0f766e',
  '#f97316',
  '#ec4899',
  '#0ea5e9',
  '#f59e0b',
  '#14b8a6',
  '#8b5cf6',
]);

function createFallbackSeriesMeta(entry, index) {
  const id = typeof entry?.id === 'string' ? entry.id : `benchmark-${index + 1}`;
  return {
    id,
    dataKey: id,
    label: typeof entry?.label === 'string' && entry.label.trim().length > 0 ? entry.label : id,
    description:
      typeof entry?.ticker === 'string' && entry.ticker.trim().length > 0
        ? `Historical benchmark overlay for ${entry.ticker.trim().toUpperCase()}`
        : typeof entry?.label === 'string' && entry.label.trim().length > 0
          ? entry.label
          : id,
    color: FALLBACK_CHART_PALETTE[index % FALLBACK_CHART_PALETTE.length],
    kind: entry?.kind ?? 'market',
    ticker:
      typeof entry?.ticker === 'string' && entry.ticker.trim().length > 0
        ? entry.ticker.trim().toUpperCase()
        : undefined,
  };
}

export const BENCHMARK_SERIES_META = SERIES_META_FALLBACK;

export function getFallbackBenchmarkCatalog() {
  const fallback = getDefaultBenchmarkConfig();
  return {
    available: fallback.available.map((entry) => ({ ...entry })),
    derived: fallback.derived.map((entry) => ({ ...entry })),
    defaults: [...fallback.defaultSelection],
    priceSymbols: [...fallback.priceSymbols],
  };
}

export function normalizeBenchmarkCatalogResponse(payload) {
  const fallback = getFallbackBenchmarkCatalog();
  const available = Array.isArray(payload?.available)
    ? payload.available
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
          id: String(entry.id ?? '').trim(),
          ticker: String(entry.ticker ?? '')
            .trim()
            .toUpperCase(),
          label: String(entry.label ?? '').trim(),
          kind: 'market',
        }))
        .filter((entry) => entry.id && entry.ticker && entry.label)
    : fallback.available;
  const availableIds = new Set(available.map((entry) => entry.id));
  const derived = Array.isArray(payload?.derived)
    ? payload.derived
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
          id: String(entry.id ?? '').trim(),
          label: String(entry.label ?? '').trim(),
          kind: 'derived',
        }))
        .filter((entry) => entry.id && entry.label)
    : fallback.derived;
  const defaults = Array.isArray(payload?.defaults)
    ? payload.defaults
        .map((entry) => String(entry ?? '').trim())
        .filter((entry) => availableIds.has(entry))
    : [];
  const fallbackDefaults = fallback.defaults.filter((entry) => availableIds.has(entry));
  return {
    available,
    derived,
    defaults:
      defaults.length > 0
        ? Array.from(new Set(defaults))
        : fallbackDefaults.length > 0
          ? fallbackDefaults
          : available[0]
            ? [available[0].id]
            : [],
    priceSymbols: available.map((entry) => entry.ticker),
  };
}

export function buildBenchmarkSeriesMeta(catalog) {
  const normalizedCatalog = normalizeBenchmarkCatalogResponse(catalog);
  const marketMeta = normalizedCatalog.available.map((entry, index) => {
    const known = SERIES_META_BY_ID.get(entry.id);
    if (known) {
      return {
        ...known,
        label: entry.label || known.label,
        ticker: entry.ticker,
        kind: 'market',
      };
    }
    return createFallbackSeriesMeta(entry, index);
  });
  return marketMeta;
}

const SERIES_SOURCE_KEYS = {
  portfolio: 'r_port',
  spy: 'r_spy_100',
  qqq: 'r_qqq_100',
  blended: 'r_bench_blended',
  exCash: 'r_ex_cash',
  cash: 'r_cash',
};

const ROI_SERIES_SOURCE_KEYS = {
  portfolio: 'portfolio',
  portfolioTwr: 'portfolioTwr',
  spy: 'spy',
  qqq: 'qqq',
  blended: 'bench',
  exCash: 'exCash',
  cash: 'cash',
};

const TYPE_ORDER = {
  DEPOSIT: 1,
  BUY: 2,
  SELL: 3,
  DIVIDEND: 4,
  INTEREST: 5,
  WITHDRAWAL: 6,
  FEE: 7,
};

const CASH_IN_TYPES = new Set(['DEPOSIT']);
const CASH_OUT_TYPES = new Set(['WITHDRAWAL', 'FEE']);
const INCOME_TYPES = new Set(['DIVIDEND', 'INTEREST']);
const SHARE_TYPES = new Set(['BUY', 'SELL']);
const SHARE_EPSILON = 1e-8;
const EXTERNAL_FLOW_TYPES = new Set(['DEPOSIT', 'WITHDRAWAL']);

function toFiniteNumber(value) {
  if (value === null || value === undefined) {
    return 0;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toComparableTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return 0;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function toComparableSeq(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return 0;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
  }
  return 0;
}

function normalizeTransaction(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const date = typeof raw.date === 'string' ? raw.date.trim() : '';
  if (!date) {
    return null;
  }
  const type = String(raw.type ?? '').toUpperCase();
  const ticker = typeof raw.ticker === 'string' ? raw.ticker.trim().toUpperCase() : '';
  const shares = Math.abs(toFiniteNumber(raw.shares));
  const amount = toFiniteNumber(raw.amount);
  return {
    date,
    type,
    ticker,
    shares,
    amount,
    createdAt: raw.createdAt,
    seq: raw.seq,
    id: raw.id,
    uid: raw.uid,
  };
}

function sortTransactions(transactions) {
  return [...transactions].sort((a, b) => {
    const dateDiff = a.date.localeCompare(b.date);
    if (dateDiff !== 0) {
      return dateDiff;
    }

    const orderA = TYPE_ORDER[a.type] ?? 99;
    const orderB = TYPE_ORDER[b.type] ?? 99;
    if (orderA !== orderB) {
      return orderA - orderB;
    }

    const createdDiff = toComparableTimestamp(a.createdAt) - toComparableTimestamp(b.createdAt);
    if (createdDiff !== 0) {
      return createdDiff;
    }

    const seqDiff = toComparableSeq(a.seq) - toComparableSeq(b.seq);
    if (seqDiff !== 0) {
      return seqDiff;
    }

    const idDiff = String(a.id ?? '').localeCompare(String(b.id ?? ''));
    if (idDiff !== 0) {
      return idDiff;
    }

    return String(a.uid ?? '').localeCompare(String(b.uid ?? ''));
  });
}

function normalizePriceSeries(rawSeries) {
  if (!Array.isArray(rawSeries)) {
    return [];
  }
  const entries = [];
  for (const point of rawSeries) {
    const date = typeof point?.date === 'string' ? point.date.trim() : '';
    if (!date) {
      continue;
    }
    const close = Number(point?.close ?? point?.price ?? 0);
    const safeClose = Number.isFinite(close) ? close : 0;
    entries.push({ date, close: safeClose });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));
  const deduped = [];
  for (const entry of entries) {
    const last = deduped[deduped.length - 1];
    if (last && last.date === entry.date) {
      deduped[deduped.length - 1] = entry;
    } else {
      deduped.push(entry);
    }
  }
  return deduped;
}

function createPriceCursor(rawSeries) {
  const series = normalizePriceSeries(rawSeries);
  let index = 0;
  let lastPrice = 0;
  return {
    advanceTo(date) {
      while (index < series.length && series[index].date <= date) {
        const candidate = Number(series[index].close);
        if (Number.isFinite(candidate)) {
          lastPrice = candidate;
        }
        index += 1;
      }
      return lastPrice;
    },
    peek() {
      return lastPrice;
    },
  };
}

function roundPercentage(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(3));
}

function toNumeric(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.round((number + Number.EPSILON) * 10_000) / 10_000;
}

function toCanonicalNullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toDecimal(value) {
  try {
    const decimal = new Decimal(value ?? 0);
    return decimal.isFinite() ? decimal : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

function roundCanonicalPercent(value) {
  try {
    const decimal = value instanceof Decimal ? value : new Decimal(value ?? 0);
    return decimal.isFinite() ? decimal.toDecimalPlaces(6).toNumber() : null;
  } catch {
    return null;
  }
}

function buildExternalFlowMap(transactions = []) {
  const flows = new Map();
  const normalizedTransactions = Array.isArray(transactions)
    ? transactions.map((transaction) => normalizeTransaction(transaction)).filter(Boolean)
    : [];
  const sortedTransactions = sortTransactions(normalizedTransactions);

  for (const transaction of sortedTransactions) {
    if (!EXTERNAL_FLOW_TYPES.has(transaction.type)) {
      continue;
    }

    const amount = toDecimal(transaction.amount);
    const signedAmount = transaction.type === 'WITHDRAWAL' ? amount.abs().negated() : amount;
    const currentAmount = flows.get(transaction.date) ?? new Decimal(0);
    flows.set(transaction.date, currentAmount.plus(signedAmount));
  }

  return flows;
}

function buildCumulativeExternalFlowMap(dates = [], transactions = []) {
  const rawFlows = Array.from(buildExternalFlowMap(transactions).entries()).sort((left, right) =>
    left[0].localeCompare(right[0])
  );
  const running = new Map();
  let total = new Decimal(0);
  let flowIndex = 0;
  const sortedDates = [...dates].sort((left, right) => String(left).localeCompare(String(right)));

  for (const date of sortedDates) {
    while (flowIndex < rawFlows.length && rawFlows[flowIndex][0] <= date) {
      total = total.plus(rawFlows[flowIndex][1] ?? 0);
      flowIndex += 1;
    }
    running.set(date, total);
  }

  return running;
}

function buildDailyReturnLookupFromCumulativeSeries(roiData = [], dataKey) {
  const sortedRows = Array.isArray(roiData)
    ? [...roiData]
        .filter((row) => typeof row?.date === 'string' && row.date.trim().length > 0)
        .sort((left, right) => left.date.localeCompare(right.date))
    : [];
  const dailyReturns = new Map();
  let previousGrowth = null;

  for (const row of sortedRows) {
    const cumulativePct = toCanonicalNullableNumber(row?.[dataKey]);
    if (cumulativePct === null) {
      continue;
    }

    const currentGrowth = new Decimal(cumulativePct).div(100).plus(1);
    if (!currentGrowth.isFinite() || currentGrowth.lte(0)) {
      previousGrowth = null;
      continue;
    }

    if (previousGrowth === null || previousGrowth.lte(0)) {
      dailyReturns.set(row.date, new Decimal(0));
      previousGrowth = currentGrowth;
      continue;
    }

    dailyReturns.set(row.date, currentGrowth.div(previousGrowth).minus(1));
    previousGrowth = currentGrowth;
  }

  return dailyReturns;
}

export function buildFlowMatchedBenchmarkSeries(roiData = [], transactions = [], dataKey) {
  if (!dataKey || !Array.isArray(roiData) || roiData.length === 0) {
    return [];
  }

  const sortedRows = [...roiData]
    .filter((row) => typeof row?.date === 'string' && row.date.trim().length > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
  if (sortedRows.length === 0) {
    return [];
  }

  const dates = sortedRows.map((row) => row.date);
  const cumulativeFlows = buildCumulativeExternalFlowMap(dates, transactions);
  const dailyReturnLookup = buildDailyReturnLookupFromCumulativeSeries(sortedRows, dataKey);

  let syntheticNav = null;
  let previousContributions = new Decimal(0);
  const series = [];

  for (const row of sortedRows) {
    const date = row.date;
    const netContributions = cumulativeFlows.get(date) ?? new Decimal(0);

    if (syntheticNav === null) {
      previousContributions = netContributions;
      if (netContributions.lte(0)) {
        series.push({ date, value: null });
        continue;
      }
      syntheticNav = netContributions;
      series.push({ date, value: 0 });
      continue;
    }

    const flow = netContributions.minus(previousContributions);
    const dailyReturn = dailyReturnLookup.get(date) ?? new Decimal(0);
    syntheticNav = syntheticNav.times(new Decimal(1).plus(dailyReturn)).plus(flow);
    previousContributions = netContributions;

    if (netContributions.lte(0)) {
      series.push({ date, value: null });
      continue;
    }

    series.push({
      date,
      value: roundCanonicalPercent(
        syntheticNav.minus(netContributions).div(netContributions).times(100)
      ),
    });
  }

  return series;
}

export function mergeReturnSeries(series = {}) {
  const entriesByDate = new Map();

  for (const [targetKey, sourceKey] of Object.entries(SERIES_SOURCE_KEYS)) {
    const sourceSeries = Array.isArray(series?.[sourceKey]) ? series[sourceKey] : [];
    for (const point of sourceSeries) {
      const date = point?.date;
      if (!date) {
        continue;
      }
      const normalized = entriesByDate.get(date) ?? { date };
      normalized[targetKey] = toNumeric(point?.value);
      entriesByDate.set(date, normalized);
    }
  }

  const sortedDates = Array.from(entriesByDate.keys()).sort((a, b) =>
    String(a).localeCompare(String(b))
  );

  return sortedDates.map((date) => {
    const entry = entriesByDate.get(date) ?? { date };
    const row = {
      date,
      portfolio: toNumeric(entry.portfolio),
      spy: toNumeric(entry.spy),
      blended: toNumeric(entry.blended),
      exCash: toNumeric(entry.exCash),
      cash: toNumeric(entry.cash),
    };
    if (Object.prototype.hasOwnProperty.call(entry, 'qqq')) {
      row.qqq = toNumeric(entry.qqq);
    }
    return row;
  });
}

export function mergeDailyRoiSeries(series = {}) {
  const entriesByDate = new Map();

  for (const [targetKey, sourceKey] of Object.entries(ROI_SERIES_SOURCE_KEYS)) {
    const sourceSeries = Array.isArray(series?.[sourceKey]) ? series[sourceKey] : [];
    for (const point of sourceSeries) {
      const date = point?.date;
      if (!date) {
        continue;
      }
      const normalized = entriesByDate.get(date) ?? { date };
      normalized[targetKey] = toCanonicalNullableNumber(point?.value);
      entriesByDate.set(date, normalized);
    }
  }

  // Keep the backend ROI payload as the canonical source of truth here.
  // Presentation layers decide whether to show 2 or 4 decimals.
  return Array.from(entriesByDate.values())
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .map((entry) => ({
      date: entry.date,
      portfolio: toCanonicalNullableNumber(entry.portfolio),
      portfolioTwr: toCanonicalNullableNumber(entry.portfolioTwr),
      spy: toCanonicalNullableNumber(entry.spy),
      qqq: toCanonicalNullableNumber(entry.qqq),
      blended: toCanonicalNullableNumber(entry.blended),
      exCash: toCanonicalNullableNumber(entry.exCash),
      cash: toCanonicalNullableNumber(entry.cash),
    }));
}

export function buildBenchmarkOverlaySeries(roiData = [], rawSeries = []) {
  if (!Array.isArray(roiData) || roiData.length === 0) {
    return [];
  }

  const normalizedSeries = normalizePriceSeries(rawSeries);
  if (normalizedSeries.length === 0) {
    return [];
  }

  const cursor = createPriceCursor(normalizedSeries);
  let baseline = null;

  return roiData.map((point) => {
    const date = typeof point?.date === 'string' ? point.date : '';
    const price = date ? cursor.advanceTo(date) : 0;
    if (baseline === null && price > 0) {
      baseline = price;
    }
    if (!date || baseline === null || baseline === 0 || price <= 0) {
      return { date, value: null };
    }
    return {
      date,
      value: roundPercentage(((price - baseline) / baseline) * 100),
    };
  });
}

export function mergeBenchmarkOverlaySeries(roiData = [], overlaySeries = [], dataKey) {
  if (!Array.isArray(roiData) || roiData.length === 0) {
    return [];
  }
  if (!dataKey || !Array.isArray(overlaySeries) || overlaySeries.length === 0) {
    return roiData.map((point) => ({ ...point }));
  }

  const overlayMap = new Map(
    overlaySeries
      .filter((point) => typeof point?.date === 'string')
      .map((point) => [point.date, point.value])
  );

  return roiData.map((point) => ({
    ...point,
    [dataKey]: overlayMap.has(point.date) ? overlayMap.get(point.date) : null,
  }));
}

export const ROI_FALLBACK_INCOMPLETE_HISTORY = 'ROI_FALLBACK_INCOMPLETE_HISTORY';

/**
 * Builds a daily ROI series from transactions and a price fetcher.
 *
 * **Precision limitation:** This function uses native JavaScript floating-point
 * arithmetic (IEEE 754 doubles). For portfolios with long histories (500+ days),
 * cumulative return values may diverge from the canonical server-side calculation
 * (which uses Decimal.js) by up to ~10 basis points. This is acceptable for the
 * client-side fallback display, but the server result should always be preferred
 * when available. When this fallback is active, the UI displays an
 * "≈ Approximate" badge to inform the user.
 */
export async function buildRoiSeries(
  transactions,
  priceFetcher,
  { requireCompleteHistory = false } = {}
) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return [];
  }

  const normalizedTransactions = transactions.map((tx) => normalizeTransaction(tx)).filter(Boolean);

  if (normalizedTransactions.length === 0) {
    return [];
  }

  const firstTransactionDate = normalizedTransactions
    .map((tx) => tx.date)
    .filter((date) => typeof date === 'string' && date.length > 0)
    .sort((left, right) => left.localeCompare(right))[0];
  if (!firstTransactionDate) {
    return [];
  }

  const tickers = [
    ...new Set(
      normalizedTransactions
        .filter((tx) => tx.ticker && SHARE_TYPES.has(tx.type))
        .map((tx) => tx.ticker)
    ),
  ];

  const symbols = [...tickers, 'spy'];
  if (priceFetcher && typeof priceFetcher.prefetch === 'function') {
    try {
      await priceFetcher.prefetch(symbols);
    } catch (error) {
      console.error('Failed to prefetch price series', error);
    }
  }

  const priceMapEntries = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const result = await priceFetcher(symbol);
        if (Array.isArray(result)) {
          return [symbol.toUpperCase(), result];
        }
        if (result && Array.isArray(result.data)) {
          return [symbol.toUpperCase(), result.data];
        }
        return [symbol.toUpperCase(), []];
      } catch (error) {
        console.error(error);
        return [symbol.toUpperCase(), []];
      }
    })
  );

  const priceMap = new Map(
    priceMapEntries.map(([symbol, series]) => [symbol, normalizePriceSeries(series)])
  );
  const missingSymbols = tickers
    .filter((ticker) => (priceMap.get(ticker) ?? []).length === 0)
    .sort((left, right) => left.localeCompare(right));
  if (requireCompleteHistory && missingSymbols.length > 0) {
    const error = new Error(
      `Fallback ROI is missing historical prices for: ${missingSymbols.join(', ')}`
    );
    error.code = ROI_FALLBACK_INCOMPLETE_HISTORY;
    error.missingSymbols = missingSymbols;
    throw error;
  }

  const spySeries = (priceMap.get('SPY') ?? priceMap.get('spy') ?? []).filter(
    (point) => typeof point?.date === 'string' && point.date >= firstTransactionDate
  );
  if (spySeries.length === 0) {
    return [];
  }

  const sortedTransactions = sortTransactions(normalizedTransactions);
  const priceCursors = new Map();
  for (const ticker of tickers) {
    const series = priceMap.get(ticker) ?? [];
    if (series.length === 0) {
      continue;
    }
    priceCursors.set(ticker, createPriceCursor(series));
  }

  const holdings = new Map();
  for (const ticker of tickers) {
    holdings.set(ticker, 0);
  }
  const activeTickers = new Set();

  let cashBalance = 0;
  let transactionIndex = 0;
  let previousNav = null;
  let cumulativeFactor = 1;
  let initialSpyPrice = null;

  const results = [];

  for (const point of spySeries) {
    const date = point.date;
    let flowForDate = 0;

    while (
      transactionIndex < sortedTransactions.length &&
      sortedTransactions[transactionIndex].date <= date
    ) {
      const tx = sortedTransactions[transactionIndex];
      transactionIndex += 1;
      const amount = Number.isFinite(tx.amount) ? tx.amount : 0;

      if (SHARE_TYPES.has(tx.type) && tx.ticker) {
        if (!priceCursors.has(tx.ticker)) {
          continue;
        }
        const previousShares = holdings.get(tx.ticker) ?? 0;
        const sharesDelta = tx.type === 'BUY' ? tx.shares : -tx.shares;
        if (tx.type === 'BUY') {
          const tradeCash = Math.abs(amount);
          if (tradeCash > cashBalance + SHARE_EPSILON) {
            continue;
          }
          cashBalance -= tradeCash;
        }
        if (tx.type === 'SELL' && previousShares + SHARE_EPSILON < tx.shares) {
          continue;
        }
        const rawNextShares = previousShares + sharesDelta;
        const nextShares = Math.abs(rawNextShares) < SHARE_EPSILON ? 0 : rawNextShares;
        holdings.set(tx.ticker, nextShares);
        if (Math.abs(nextShares) < SHARE_EPSILON) {
          activeTickers.delete(tx.ticker);
        } else {
          activeTickers.add(tx.ticker);
        }
        if (tx.type === 'SELL') {
          const tradeCash = Math.abs(amount);
          if (tradeCash > 0) {
            cashBalance += tradeCash;
          }
        }
        continue;
      }

      if (CASH_IN_TYPES.has(tx.type)) {
        const contribution = Math.abs(amount);
        if (contribution > 0) {
          cashBalance += contribution;
          flowForDate += contribution;
        }
        continue;
      }

      if (CASH_OUT_TYPES.has(tx.type)) {
        const withdrawal = Math.abs(amount);
        if (withdrawal > 0) {
          cashBalance -= withdrawal;
          flowForDate -= withdrawal;
        }
        if (cashBalance < 0) {
          cashBalance = 0;
        }
        continue;
      }

      if (INCOME_TYPES.has(tx.type)) {
        if (amount !== 0) {
          cashBalance += amount;
        }
        continue;
      }

      if (amount !== 0) {
        cashBalance += amount;
      }
    }

    let portfolioValue = cashBalance;
    for (const ticker of activeTickers) {
      const shares = holdings.get(ticker);
      if (!Number.isFinite(shares) || Math.abs(shares) < SHARE_EPSILON) {
        continue;
      }
      const cursor = priceCursors.get(ticker);
      const price = cursor ? cursor.advanceTo(date) : 0;
      portfolioValue += shares * price;
    }

    if (Math.abs(portfolioValue) < SHARE_EPSILON) {
      portfolioValue = 0;
    }

    let periodReturn = 0;
    if (previousNav !== null && previousNav > 0) {
      periodReturn = (portfolioValue - flowForDate - previousNav) / previousNav;
    }

    if (!Number.isFinite(periodReturn)) {
      periodReturn = 0;
    }

    cumulativeFactor *= 1 + periodReturn;
    if (!Number.isFinite(cumulativeFactor) || cumulativeFactor <= 0) {
      cumulativeFactor = 1;
    }

    if (previousNav === null && portfolioValue > 0) {
      cumulativeFactor = 1;
    }

    const spyClose = Number.isFinite(point.close) ? Number(point.close) : 0;
    if (initialSpyPrice === null && spyClose > 0) {
      initialSpyPrice = spyClose;
    }
    const spyBaseline = initialSpyPrice ?? spyClose;
    const spyReturn =
      spyBaseline && spyBaseline !== 0 ? ((spyClose - spyBaseline) / spyBaseline) * 100 : 0;

    results.push({
      date,
      portfolio: roundPercentage((cumulativeFactor - 1) * 100),
      spy: roundPercentage(spyReturn),
    });

    previousNav = portfolioValue;
  }

  return results;
}
