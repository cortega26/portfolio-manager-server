import { deriveHoldingStats } from './holdings.js';
import { normalizeBenchmarkCatalogResponse } from './roi.js';

export function normalizeTickerSymbol(symbol) {
  if (typeof symbol !== 'string') {
    return '';
  }
  const trimmed = symbol.trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : '';
}

export function normalizePricingResolutionStatus(status) {
  if (typeof status !== 'string') {
    return '';
  }
  return status.trim().toLowerCase();
}

export function isUsablePricingResolution(status) {
  return ['live', 'eod_fresh', 'cache_fresh', 'degraded'].includes(
    normalizePricingResolutionStatus(status)
  );
}

export function mergePricingSymbolMetadata(...sources) {
  const merged = {};
  for (const source of sources) {
    if (!source || typeof source !== 'object') {
      continue;
    }
    for (const [ticker, meta] of Object.entries(source)) {
      const normalizedTicker = normalizeTickerSymbol(ticker);
      if (!normalizedTicker || !meta || typeof meta !== 'object') {
        continue;
      }
      merged[normalizedTicker] = {
        ...(merged[normalizedTicker] ?? {}),
        ...meta,
      };
    }
  }
  return merged;
}

function shiftDateKey(dateKey, deltaDays) {
  if (typeof dateKey !== 'string' || dateKey.trim().length === 0) {
    return null;
  }
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

export function deriveBenchmarkSummaryWindow(roiData = []) {
  const dates = Array.from(
    new Set(
      (Array.isArray(roiData) ? roiData : [])
        .map((entry) => (typeof entry?.date === 'string' ? entry.date.trim() : ''))
        .filter((date) => date.length > 0)
    )
  ).sort((left, right) => left.localeCompare(right));
  if (dates.length === 0) {
    return null;
  }
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const trailingFrom = shiftDateKey(lastDate, -365);
  if (!trailingFrom) {
    return null;
  }
  return {
    from: trailingFrom > firstDate ? trailingFrom : firstDate,
    to: lastDate,
  };
}

function extractLatestQuote(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }
  const lastEntry = entries.at(-1);
  const price = Number(lastEntry?.close ?? lastEntry?.price ?? lastEntry?.value);
  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }
  return {
    price,
    asOf:
      typeof lastEntry?.date === 'string' && lastEntry.date.trim().length > 0
        ? lastEntry.date.trim()
        : null,
  };
}

export function extractQuotesState(series, trackedSymbols = []) {
  const nextQuotes = {};
  for (const symbol of trackedSymbols) {
    const normalizedSymbol = normalizeTickerSymbol(symbol);
    if (!normalizedSymbol) {
      continue;
    }
    const latestQuote = extractLatestQuote(series.get(normalizedSymbol));
    if (latestQuote) {
      nextQuotes[normalizedSymbol] = latestQuote;
    }
  }
  return nextQuotes;
}

function getPreviousTradingDay() {
  const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const previous = new Date(etNow.getFullYear(), etNow.getMonth(), etNow.getDate());
  previous.setDate(previous.getDate() - 1);
  while (previous.getDay() === 0 || previous.getDay() === 6) {
    previous.setDate(previous.getDate() - 1);
  }
  const month = String(previous.getMonth() + 1).padStart(2, '0');
  const day = String(previous.getDate()).padStart(2, '0');
  return `${previous.getFullYear()}-${month}-${day}`;
}

export function buildPriceBoardRows({
  holdings,
  benchmarkCatalog,
  latestQuotes,
  latestErrors,
  latestMeta,
  fallbackPrices,
  fallbackAsOf,
  translate,
}) {
  const holdingTickers = new Set();
  const rows = [];

  for (const holding of holdings) {
    const symbol = normalizeTickerSymbol(holding?.ticker);
    if (!symbol) {
      continue;
    }
    holdingTickers.add(symbol);
    const latestQuote = latestQuotes[symbol] ?? null;
    const latestError = latestErrors[symbol] ?? null;
    const latestResolution = latestMeta?.[symbol] ?? null;
    const fallbackPrice = Number(fallbackPrices?.[symbol]);
    const hasFallbackPrice = Number.isFinite(fallbackPrice) && fallbackPrice > 0;
    const shares = Number(holding?.shares);
    const price = latestQuote?.price ?? (hasFallbackPrice ? fallbackPrice : null);
    const marketValue = Number.isFinite(price) && Number.isFinite(shares) ? shares * price : null;
    const holdingStats = deriveHoldingStats(holding, price);
    const totalReturn =
      Number.isFinite(holdingStats?.realised) && Number.isFinite(holdingStats?.unrealised)
        ? holdingStats.realised + holdingStats.unrealised
        : null;
    const totalReturnPct =
      Number.isFinite(totalReturn) && Number.isFinite(holdingStats?.cost) && holdingStats.cost > 0
        ? (totalReturn / holdingStats.cost) * 100
        : null;
    const status =
      typeof latestResolution?.status === 'string' && latestResolution.status.length > 0
        ? latestResolution.status
        : latestQuote
          ? 'live'
          : hasFallbackPrice
            ? 'cache_fresh'
            : latestError
              ? 'error'
              : 'unavailable';

    const asOf = latestQuote?.asOf ?? fallbackAsOf?.[symbol] ?? null;
    const prevTradingDay = getPreviousTradingDay();
    const effectiveStatus =
      status !== 'error' &&
      status !== 'unavailable' &&
      typeof asOf === 'string' &&
      asOf.length > 0 &&
      asOf < prevTradingDay
        ? 'stale'
        : status;
    const staleTooltip =
      effectiveStatus === 'stale'
        ? `Prices may be out of date. Last successful fetch: ${asOf}. Click Refresh to retry.`
        : null;

    rows.push({
      symbol,
      scope: 'holding',
      scopeLabel: translate('prices.scope.holding'),
      description: translate('prices.scope.holdingDetail'),
      price,
      asOf,
      shares: Number.isFinite(shares) ? shares : null,
      marketValue,
      avgCost: Number.isFinite(holdingStats?.avgCost) ? holdingStats.avgCost : null,
      totalCost: Number.isFinite(holdingStats?.cost) ? holdingStats.cost : null,
      unrealised: Number.isFinite(holdingStats?.unrealised) ? holdingStats.unrealised : null,
      realised: Number.isFinite(holdingStats?.realised) ? holdingStats.realised : null,
      totalReturnPct,
      status: effectiveStatus,
      statusLabel: translate(`prices.status.${effectiveStatus}`),
      staleTooltip,
      errorMessage:
        typeof latestError?.message === 'string' && latestError.message.trim().length > 0
          ? latestError.message.trim()
          : null,
    });
  }

  const normalizedCatalog = normalizeBenchmarkCatalogResponse(benchmarkCatalog);
  for (const entry of normalizedCatalog.available) {
    const symbol = normalizeTickerSymbol(entry?.ticker);
    if (!symbol || holdingTickers.has(symbol)) {
      continue;
    }
    const latestQuote = latestQuotes[symbol] ?? null;
    const latestError = latestErrors[symbol] ?? null;
    const latestResolution = latestMeta?.[symbol] ?? null;
    const status =
      typeof latestResolution?.status === 'string' && latestResolution.status.length > 0
        ? latestResolution.status
        : latestQuote
          ? 'live'
          : latestError
            ? 'error'
            : 'unavailable';

    const benchmarkAsOf = latestQuote?.asOf ?? null;
    const prevTradingDay = getPreviousTradingDay();
    const effectiveStatus =
      status !== 'error' &&
      status !== 'unavailable' &&
      typeof benchmarkAsOf === 'string' &&
      benchmarkAsOf.length > 0 &&
      benchmarkAsOf < prevTradingDay
        ? 'stale'
        : status;
    const staleTooltip =
      effectiveStatus === 'stale'
        ? `Prices may be out of date. Last successful fetch: ${benchmarkAsOf}. Click Refresh to retry.`
        : null;

    rows.push({
      symbol,
      scope: 'benchmark',
      scopeLabel: translate('prices.scope.benchmark'),
      description: entry?.label ?? '',
      price: latestQuote?.price ?? null,
      asOf: benchmarkAsOf,
      shares: null,
      marketValue: null,
      status: effectiveStatus,
      statusLabel: translate(`prices.status.${effectiveStatus}`),
      staleTooltip,
      errorMessage:
        typeof latestError?.message === 'string' && latestError.message.trim().length > 0
          ? latestError.message.trim()
          : null,
    });
  }

  return rows.sort((left, right) => {
    if (left.scope !== right.scope) {
      return left.scope === 'holding' ? -1 : 1;
    }
    return left.symbol.localeCompare(right.symbol);
  });
}
