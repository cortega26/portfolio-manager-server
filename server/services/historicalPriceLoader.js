import { toDateKey } from "../finance/cash.js";
import {
  generateETag,
  getCachedPrice,
  setCachedPrice,
} from "../cache/priceCache.js";
import { getMarketClock } from "../../src/utils/marketHours.js";

function normalizeSymbol(symbol) {
  return typeof symbol === "string" ? symbol.trim().toUpperCase() : "";
}

function normalizeRange(range) {
  const normalized =
    typeof range === "string" && range.trim().length > 0
      ? range.trim().toLowerCase()
      : "1y";
  return normalized;
}

function resolveDateWindow(range, from, to) {
  const today = new Date();
  const resolvedTo = toDateKey(to ?? today);
  if (from) {
    return {
      fromDate: toDateKey(from),
      toDate: resolvedTo,
    };
  }
  if (normalizeRange(range) === "1y") {
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    return {
      fromDate: toDateKey(oneYearAgo),
      toDate: resolvedTo,
    };
  }
  return {
    fromDate: "1900-01-01",
    toDate: resolvedTo,
  };
}

function normalizeSeries(items) {
  return [...items]
    .filter((item) => item?.date && Number.isFinite(Number(item?.adjClose ?? item?.close)))
    .map((item) => ({
      date: item.date,
      close: Number(item.adjClose ?? item.close),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function buildCacheKey(range, fromDate, toDate) {
  return `${normalizeRange(range)}:${fromDate}:${toDate}`;
}

function buildLiveCacheKey(rangeKey, marketMode) {
  return `${rangeKey}:latest:${marketMode}`;
}

function sliceLatest(prices) {
  return prices.length > 0 ? [prices[prices.length - 1]] : [];
}

function normalizePersistedLatestClose(row) {
  if (!row || typeof row !== "object") {
    return null;
  }

  const date =
    typeof row.date === "string" && row.date.trim().length > 0
      ? row.date.trim()
      : null;
  const close = Number.parseFloat(
    row.close ?? row.adjClose ?? row.adj_close ?? row.price,
  );
  if (!date || !Number.isFinite(close) || close <= 0) {
    return null;
  }

  return { date, close };
}

function buildResolution({
  status,
  source,
  provider = null,
  warnings = [],
  asOf = null,
  cacheHit = false,
  latestQuoteAttempted = false,
} = {}) {
  return {
    status,
    source,
    provider,
    warnings: Array.isArray(warnings) ? warnings : [],
    asOf,
    cacheHit: Boolean(cacheHit),
    latestQuoteAttempted: Boolean(latestQuoteAttempted),
  };
}

export function createHistoricalPriceLoader({
  priceProvider,
  latestQuoteProvider = null,
  persistedLatestCloseLookup = null,
  logger = null,
  marketClock = getMarketClock,
  cachePolicy = {},
} = {}) {
  if (!priceProvider || typeof priceProvider.getDailyAdjustedClose !== "function") {
    throw new Error("createHistoricalPriceLoader requires a price provider");
  }

  return {
    async fetchSeries(symbol, { range = "1y", from, to, latestOnly = false } = {}) {
      const normalizedSymbol = normalizeSymbol(symbol);
      if (!normalizedSymbol) {
        return {
          prices: [],
          etag: generateETag([]),
          cacheHit: false,
          rangeKey: buildCacheKey(range, "1900-01-01", toDateKey(new Date())),
          resolution: buildResolution({
            status: "unavailable",
            source: "none",
          }),
        };
      }

      const { fromDate, toDate } = resolveDateWindow(range, from, to);
      const rangeKey = buildCacheKey(range, fromDate, toDate);
      const market =
        latestOnly && typeof marketClock === "function"
          ? marketClock()
          : null;
      const liveMarketOpen = market?.isOpen === true;
      const extendedHoursActive = market?.isExtendedHours === true;
      const latestQuoteEligible =
        latestOnly && (liveMarketOpen || extendedHoursActive) && Boolean(latestQuoteProvider?.getLatestQuote);
      const cacheMode = latestOnly ? ((liveMarketOpen || extendedHoursActive) ? "open" : "closed") : "historical";
      const sessionCacheKey = latestOnly ? buildLiveCacheKey(rangeKey, cacheMode) : rangeKey;
      const liveCacheMaxAgeMs = latestOnly
        ? (liveMarketOpen
          ? Math.max(1, Number(cachePolicy?.liveOpenTtlSeconds ?? 60)) * 1000
          : Math.max(1, Number(cachePolicy?.liveClosedTtlSeconds ?? 15 * 60)) * 1000)
        : null;
      const resolutionWarnings = [];
      const resolvePersistedLatestClose = async ({
        warnings = [],
        latestQuoteAttempted = false,
      } = {}) => {
        if (!latestOnly || typeof persistedLatestCloseLookup !== "function") {
          return null;
        }

        try {
          const persisted = normalizePersistedLatestClose(
            await persistedLatestCloseLookup(normalizedSymbol, {
              range: normalizeRange(range),
              fromDate,
              toDate,
              latestOnly,
              market,
            }),
          );
          if (!persisted) {
            return null;
          }

          const prices = [{ date: persisted.date, close: persisted.close }];
          const etag = setCachedPrice(normalizedSymbol, sessionCacheKey, prices, {
            ttlSeconds: liveMarketOpen
              ? cachePolicy?.liveOpenTtlSeconds
              : cachePolicy?.liveClosedTtlSeconds,
          });
          const warningSet = new Set(Array.isArray(warnings) ? warnings : []);
          warningSet.add("LAST_CLOSE_FALLBACK_USED");

          return {
            prices,
            etag: etag ?? generateETag(prices),
            cacheHit: false,
            rangeKey,
            resolution: buildResolution({
              status: liveMarketOpen ? "degraded" : "eod_fresh",
              source: "persisted",
              provider: "storage",
              warnings: Array.from(warningSet),
              asOf: persisted.date,
              latestQuoteAttempted,
            }),
          };
        } catch (error) {
          logger?.warn?.("persisted_latest_close_lookup_failed", {
            symbol: normalizedSymbol,
            error: error.message,
          });
          return null;
        }
      };
      const sessionCached = getCachedPrice(
        normalizedSymbol,
        sessionCacheKey,
        latestOnly ? { maxAgeMs: liveCacheMaxAgeMs } : {},
      );
      const historicalCached =
        latestOnly && sessionCacheKey !== rangeKey
          ? getCachedPrice(normalizedSymbol, rangeKey)
          : sessionCached;
      const cached = latestQuoteEligible ? sessionCached : sessionCached ?? historicalCached;
      if (cached && Array.isArray(cached.data)) {
        return {
          prices: latestOnly ? sliceLatest(cached.data) : cached.data,
          etag: cached.etag,
          cacheHit: true,
          rangeKey,
          resolution: buildResolution({
            status: "cache_fresh",
            source: "cache",
            asOf: cached.data[cached.data.length - 1]?.date ?? null,
            cacheHit: true,
            latestQuoteAttempted: latestQuoteEligible,
          }),
        };
      }

      if (latestQuoteEligible) {
        try {
          const latestQuote = await latestQuoteProvider.getLatestQuote(normalizedSymbol);
          const latestPrices = latestQuote
            ? [{ date: latestQuote.date, close: Number(latestQuote.adjClose) }]
            : [];
          const etag = setCachedPrice(normalizedSymbol, sessionCacheKey, latestPrices, {
            ttlSeconds: cachePolicy?.liveOpenTtlSeconds,
          });
          return {
            prices: latestPrices,
            etag: etag ?? generateETag(latestPrices),
            cacheHit: false,
            rangeKey,
            resolution: buildResolution({
              status: "live",
              source: "latest",
              provider: latestQuote?.providerMeta?.provider ?? latestQuoteProvider?.providerKey ?? null,
              asOf: latestQuote?.date ?? null,
              latestQuoteAttempted: true,
            }),
          };
        } catch (error) {
          resolutionWarnings.push("LATEST_QUOTE_UNAVAILABLE");
          logger?.warn?.("latest_quote_fetch_failed", {
            symbol: normalizedSymbol,
            error: error.message,
          });
          const persistedResolution = await resolvePersistedLatestClose({
            warnings: resolutionWarnings,
            latestQuoteAttempted: true,
          });
          if (persistedResolution) {
            return persistedResolution;
          }
        }
      }

      if (!latestQuoteEligible) {
        const persistedResolution = await resolvePersistedLatestClose({
          warnings: resolutionWarnings,
          latestQuoteAttempted: false,
        });
        if (persistedResolution) {
          return persistedResolution;
        }
      }

      try {
        const fetched = await priceProvider.getDailyAdjustedClose(
          normalizedSymbol,
          fromDate,
          toDate,
        );
        const prices = normalizeSeries(fetched);
        const etag = setCachedPrice(normalizedSymbol, rangeKey, prices);
        if (latestOnly) {
          setCachedPrice(normalizedSymbol, sessionCacheKey, prices, {
            ttlSeconds: liveMarketOpen
              ? cachePolicy?.liveOpenTtlSeconds
              : cachePolicy?.liveClosedTtlSeconds,
          });
        }
        const providerMeta = fetched?.providerMeta ?? null;
        const usedFallbackProvider = Boolean(providerMeta?.degraded);
        return {
          prices: latestOnly ? sliceLatest(prices) : prices,
          etag,
          cacheHit: false,
          rangeKey,
          resolution: buildResolution({
            status:
              usedFallbackProvider || resolutionWarnings.length > 0
                ? "degraded"
                : "eod_fresh",
            source: "historical",
            provider: providerMeta?.provider ?? null,
            warnings: resolutionWarnings,
            asOf: prices[prices.length - 1]?.date ?? null,
            latestQuoteAttempted: latestQuoteEligible,
          }),
        };
      } catch (error) {
        const fallbackCached = cached ?? historicalCached;
        if (fallbackCached?.data?.length) {
          resolutionWarnings.push("CACHE_FALLBACK_USED");
          logger?.warn?.("historical_price_fetch_serving_cached_fallback", {
            symbol: normalizedSymbol,
            from: fromDate,
            to: toDate,
            error: error.message,
          });
          return {
            prices: latestOnly ? sliceLatest(fallbackCached.data) : fallbackCached.data,
            etag: fallbackCached.etag,
            cacheHit: true,
            rangeKey,
            resolution: buildResolution({
              status: "cache_fresh",
              source: "cache",
              warnings: resolutionWarnings,
              asOf: fallbackCached.data[fallbackCached.data.length - 1]?.date ?? null,
              cacheHit: true,
              latestQuoteAttempted: latestQuoteEligible,
            }),
          };
        }
        throw error;
      }
    },
  };
}

export default createHistoricalPriceLoader;
