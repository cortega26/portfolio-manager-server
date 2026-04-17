import express from "express";
import cors from "cors";
import helmet from "helmet";
import fetch from "node-fetch";
import NodeCache from "node-cache";
import { promises as fs } from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import pino from "pino";
import compression from "compression";
import {
  DEFAULT_API_CACHE_TTL_SECONDS,
  MIN_API_CACHE_TTL_SECONDS,
  MAX_API_CACHE_TTL_SECONDS,
  DEFAULT_PRICE_CACHE_TTL_SECONDS,
  DEFAULT_PRICE_CACHE_CHECK_PERIOD_SECONDS,
  DEFAULT_MAX_STALE_TRADING_DAYS,
} from "../shared/constants.js";
import { getPerformanceMetrics } from "./metrics/performanceMetrics.js";
import { runMigrations } from "./migrations/index.js";
import {
  computeMatchedBenchmarkMoneyWeightedReturn,
  computeMaxDrawdown,
  computeMoneyWeightedReturn,
  summarizeReturns,
} from "./finance/returns.js";
import {
  normalizeMicroShareBalance,
  projectStateUntil,
  setNormalizedHoldingMicro,
  sortTransactions,
  sortTransactionsForCashAudit,
  weightsFromState,
} from "./finance/portfolio.js";
import { toDateKey } from "./finance/cash.js";
import {
  d,
  fromCents,
  fromMicroShares,
  roundDecimal,
  toCents,
  toMicroShares,
} from "./finance/decimal.js";
import {
  DualPriceProvider,
  YahooPriceProvider,
  StooqPriceProvider,
} from "./data/prices.js";
import { createConfiguredPriceProvider } from "./data/priceProviderFactory.js";
import { createConfiguredLatestQuoteProvider } from "./data/priceProviderFactory.js";
import { readPortfolioState, writePortfolioState } from "./data/portfolioState.js";
import {
  validateCashRateBody,
  validatePortfolioBody,
  validatePortfolioIdParam,
  validateRangeQuery,
  validateReturnsQuery,
} from "./middleware/validation.js";
import { createSessionAuth, DEFAULT_SESSION_AUTH_HEADER } from "./middleware/sessionAuth.js";
import { computeTradingDayAge } from "./utils/calendar.js";
import { withLock } from "./utils/locks.js";
import {
  configurePriceCache,
  getCacheStats,
} from "./cache/priceCache.js";
import { createProviderHealthMonitor } from "./data/providerHealth.js";
import {
  createHttpLogger,
  buildHttpLoggerOptions,
} from "./logging/httpLogger.js";
import {
  attachRequestId,
  ensureApiVersionHeader,
  rewriteLegacyApiPrefix,
} from "./middleware/requestContext.js";
import { normalizeBenchmarkConfig } from "../shared/benchmarks.js";
import {
  isOpenSignalHolding,
} from "../shared/signals.js";
import { getMarketClock } from "../src/utils/marketHours.js";
import { createHistoricalPriceLoader } from "./services/historicalPriceLoader.js";
import { createPerformanceHistoryService } from "./services/performanceHistory.js";
import {
  buildPortfolioSignalRows,
  listPortfolioSignalNotifications,
} from "./services/signalNotifications.js";
import {
  requeueSignalNotificationEmailDelivery,
} from "./services/signalNotificationEmail.js";
const DEFAULT_DATA_DIR = path.resolve(process.env.DATA_DIR ?? "./data");
const DEFAULT_FETCH_TIMEOUT_MS = Number.parseInt(
  process.env.PRICE_FETCH_TIMEOUT_MS ?? "5000",
  10,
);
const DEFAULT_LOGGER = pino({ level: process.env.LOG_LEVEL ?? "info" });
const DEFAULT_CACHE_TTL_SECONDS = (() => {
  const raw = Number.parseInt(
    process.env.API_CACHE_TTL_SECONDS ?? String(DEFAULT_API_CACHE_TTL_SECONDS),
    10,
  );
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_API_CACHE_TTL_SECONDS;
  }
  return Math.max(
    MIN_API_CACHE_TTL_SECONDS,
    Math.min(MAX_API_CACHE_TTL_SECONDS, Math.round(raw)),
  );
})();
const PORTFOLIO_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SYMBOL_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;
const MAX_BULK_PRICE_SYMBOLS = 64;
const MATCHED_MWR_BENCHMARKS = [
  { key: "spy", ticker: "SPY" },
  { key: "qqq", ticker: "QQQ" },
];
function normalizeBulkPriceSymbols(input) {
  if (Array.isArray(input)) {
    return input;
  }
  if (typeof input === "string") {
    return input.split(",");
  }
  return [];
}
function createHttpError({
  status = 500,
  code = "INTERNAL_ERROR",
  message,
  details,
  expose,
  requirements,
}) {
  const error = new Error(
    message ??
      (status >= 500
        ? "Unexpected server error"
        : "Request could not be processed"),
  );
  error.status = status;
  error.statusCode = status;
  error.code = code;
  if (details !== undefined) {
    error.details = details;
  }
  if (Array.isArray(requirements)) {
    error.requirements = requirements;
  }
  if (expose !== undefined) {
    error.expose = expose;
  } else {
    error.expose = status < 500;
  }
  return error;
}
function adaptLogger(logger) {
  if (!logger) {
    return null;
  }
  if (typeof logger.child === "function") {
    return logger;
  }
  const safe = {
    info(message, meta = {}) {
      if (typeof logger.info === "function") {
        logger.info({ message, ...meta });
      } else if (typeof logger.log === "function") {
        logger.log({ level: "info", message, ...meta });
      }
    },
    warn(message, meta = {}) {
      if (typeof logger.warn === "function") {
        logger.warn({ message, ...meta });
      } else if (typeof logger.log === "function") {
        logger.log({ level: "warn", message, ...meta });
      }
    },
    error(message, meta = {}) {
      if (typeof logger.error === "function") {
        logger.error({ message, ...meta });
      } else if (typeof logger.log === "function") {
        logger.log({ level: "error", message, ...meta });
      }
    },
    child() {
      return safe;
    },
  };
  return safe;
}
export function isValidPortfolioId(id) {
  return PORTFOLIO_ID_PATTERN.test(id);
}
function filterRowsByRange(rows, from, to) {
  return rows.filter((row) => {
    if (from && row.date < from) {
      return false;
    }
    if (to && row.date > to) {
      return false;
    }
    return true;
  });
}
function paginateRows(rows, { page = 1, perPage = 100 } = {}) {
  const total = rows.length;
  const normalizedPerPage =
    Number.isFinite(perPage) && perPage > 0 ? perPage : 100;
  const totalPages = total === 0 ? 0 : Math.ceil(total / normalizedPerPage);
  const safePage =
    totalPages === 0
      ? Math.max(1, page)
      : Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * normalizedPerPage;
  const end = start + normalizedPerPage;
  const items = rows.slice(start, end);
  return {
    items,
    meta: {
      page: safePage,
      per_page: normalizedPerPage,
      total,
      total_pages: totalPages,
    },
  };
}

function buildAdjustedPriceMap(rows, ticker, { from, to } = {}) {
  const normalizedTicker =
    typeof ticker === "string" ? ticker.trim().toUpperCase() : "";
  const map = new Map();
  for (const row of rows) {
    const rowTicker =
      typeof row?.ticker === "string" ? row.ticker.trim().toUpperCase() : "";
    const date = typeof row?.date === "string" ? row.date.trim() : "";
    const price = Number.parseFloat(
      row?.adj_close ?? row?.adjClose ?? row?.close ?? row?.price,
    );
    if (
      rowTicker !== normalizedTicker
      || !date
      || (from && date < from)
      || (to && date > to)
      || !Number.isFinite(price)
      || price <= 0
    ) {
      continue;
    }
    map.set(date, price);
  }
  return new Map(Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])));
}

function normalizePricingStatusSummary(symbolMeta = {}, errors = {}) {
  const summary = {
    status: "unavailable",
    liveSymbols: [],
    eodSymbols: [],
    cacheSymbols: [],
    degradedSymbols: [],
    unavailableSymbols: [],
  };

  for (const [symbol, meta] of Object.entries(symbolMeta)) {
    const status = typeof meta?.status === "string" ? meta.status : "unavailable";
    if (status === "live") {
      summary.liveSymbols.push(symbol);
      continue;
    }
    if (status === "eod_fresh") {
      summary.eodSymbols.push(symbol);
      continue;
    }
    if (status === "cache_fresh") {
      summary.cacheSymbols.push(symbol);
      continue;
    }
    if (status === "degraded") {
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
    summary.status = "unavailable";
  } else if (summary.degradedSymbols.length > 0) {
    summary.status = "degraded";
  } else if (summary.liveSymbols.length > 0) {
    summary.status = "live";
  } else if (summary.eodSymbols.length > 0) {
    summary.status = "eod_fresh";
  } else if (summary.cacheSymbols.length > 0) {
    summary.status = "cache_fresh";
  }

  return summary;
}

function appendPricingWarning(meta, warning) {
  if (!meta || typeof meta !== "object" || typeof warning !== "string" || warning.length === 0) {
    return meta;
  }
  const warnings = Array.isArray(meta.warnings)
    ? Array.from(new Set([...meta.warnings, warning]))
    : [warning];
  return {
    ...meta,
    warnings,
  };
}

function logLatestPriceResolution(logger, symbol, meta, {
  tradingDayAge = null,
  staleRejected = false,
} = {}) {
  if (!logger?.info || !meta || typeof meta !== "object") {
    return;
  }

  const warnings = Array.isArray(meta.warnings) ? meta.warnings : [];
  logger.info(
    {
      symbol,
      status: meta.status ?? "unavailable",
      source: meta.source ?? "none",
      provider: meta.provider ?? null,
      warnings,
      latest_quote_attempted: Boolean(meta.latestQuoteAttempted),
      attempted_live: Boolean(meta.latestQuoteAttempted),
      attempted_historical_close:
        meta.source === "historical"
        || meta.source === "persisted"
        || warnings.includes("HISTORICAL_CLOSE_FETCH_FAILED"),
      used_persisted_close: meta.source === "persisted",
      used_cache: meta.source === "cache",
      stale_rejected: Boolean(staleRejected),
      trading_days_age: Number.isFinite(tradingDayAge) ? tradingDayAge : null,
    },
    "latest_price_resolution",
  );
}

function computeEtag(serializedBody) {
  return createHash("sha256").update(serializedBody).digest("base64url");
}

function isSameOriginRequest(req, origin) {
  if (!origin) {
    return true;
  }
  const host = req.get("host");
  if (!host) {
    return false;
  }
  return origin === `${req.protocol}://${host}`;
}

function sendJsonWithEtag(req, res, payload, { cacheControl } = {}) {
  const serialized = JSON.stringify(payload);
  const etag = computeEtag(serialized);
  if (cacheControl) {
    res.set("Cache-Control", cacheControl);
  }
  if (req.headers["if-none-match"] === etag) {
    res.set("ETag", etag);
    res.status(304).end();
    return;
  }
  res.set("ETag", etag);
  res.type("application/json").send(serialized);
}
export function createApp({
  dataDir = DEFAULT_DATA_DIR,
  fetchImpl = fetch,
  logger = DEFAULT_LOGGER,
  fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  config = null,
  priceProvider = null,
  auditSink: _auditSink = null,
  httpLoggerFactory = null,
  staticDir = null,
  spaFallback = false,
  marketClock = getMarketClock,
} = {}) {
  const baseLogger = adaptLogger(logger) ?? DEFAULT_LOGGER;
  const log =
    typeof baseLogger.child === "function"
      ? baseLogger.child({ module: "app" })
      : baseLogger;
  const featureFlags = config?.featureFlags ?? { cashBenchmarks: true };
  const benchmarkConfig = normalizeBenchmarkConfig(config?.benchmarks ?? {});
  const sessionAuthHeaderName =
    typeof config?.security?.auth?.headerName === "string" &&
    config.security.auth.headerName.trim().length > 0
      ? config.security.auth.headerName
      : DEFAULT_SESSION_AUTH_HEADER;
  const sessionAuthToken =
    typeof config?.security?.auth?.sessionToken === "string"
      ? config.security.auth.sessionToken
      : process.env.PORTFOLIO_SESSION_TOKEN ?? "";
  const allowedOrigins = config?.cors?.allowedOrigins ?? [];
  const cacheTtlSeconds = (() => {
    const override = config?.cache?.ttlSeconds;
    if (Number.isFinite(override) && override > 0) {
      return Math.round(override);
    }
    return DEFAULT_CACHE_TTL_SECONDS;
  })();
  const cacheControlHeader = `private, max-age=${cacheTtlSeconds}`;
  const priceCacheConfig = config?.cache?.price ?? {};
  const priceCacheTtlSeconds =
    Number.isFinite(priceCacheConfig.ttlSeconds) &&
    priceCacheConfig.ttlSeconds > 0
      ? Math.round(priceCacheConfig.ttlSeconds)
      : DEFAULT_PRICE_CACHE_TTL_SECONDS;
  const priceCacheCheckPeriodSeconds =
    Number.isFinite(priceCacheConfig.checkPeriodSeconds) &&
    priceCacheConfig.checkPeriodSeconds > 0
      ? Math.round(priceCacheConfig.checkPeriodSeconds)
      : DEFAULT_PRICE_CACHE_CHECK_PERIOD_SECONDS;
  const priceCacheLiveOpenTtlSeconds =
    Number.isFinite(priceCacheConfig.liveOpenTtlSeconds) &&
    priceCacheConfig.liveOpenTtlSeconds > 0
      ? Math.round(priceCacheConfig.liveOpenTtlSeconds)
      : 60;
  const priceCacheLiveClosedTtlSeconds =
    Number.isFinite(priceCacheConfig.liveClosedTtlSeconds) &&
    priceCacheConfig.liveClosedTtlSeconds > 0
      ? Math.round(priceCacheConfig.liveClosedTtlSeconds)
      : 15 * 60;
  configurePriceCache({
    ttlSeconds: priceCacheTtlSeconds,
    checkPeriodSeconds: priceCacheCheckPeriodSeconds,
  });
  const priceCacheControlHeader = `private, max-age=${priceCacheTtlSeconds}`;
  const maxStaleTradingDays = (() => {
    const override = config?.freshness?.maxStaleTradingDays;
    if (Number.isFinite(override) && override >= 0) {
      return Math.round(override);
    }
    return DEFAULT_MAX_STALE_TRADING_DAYS;
  })();
  const dataDirectory = path.resolve(dataDir);
  const resolvedStaticDir =
    typeof staticDir === "string" && staticDir.trim().length > 0
      ? path.resolve(staticDir)
      : null;
  const spaIndexFile = resolvedStaticDir
    ? path.join(resolvedStaticDir, "index.html")
    : null;
  fs.mkdir(dataDirectory, { recursive: true }).catch((error) => {
    log.error("failed_to_ensure_data_directory", {
      error: error.message,
      dataDir: dataDirectory,
    });
  });
  const responseCache = new NodeCache({
    stdTTL: cacheTtlSeconds,
    checkperiod: Math.max(30, Math.floor(cacheTtlSeconds / 2)),
    useClones: false,
  });

  function invalidateResponseCache(reason) {
    const stats =
      typeof responseCache.getStats === "function"
        ? responseCache.getStats()
        : null;
    const flushedKeys =
      stats && typeof stats.keys === "number" ? stats.keys : null;
    responseCache.flushAll();
    const meta = {
      reason,
      flushed_keys: flushedKeys ?? 0,
    };
    if (flushedKeys > 0 && typeof log.info === "function") {
      log.info(meta, "response_cache_invalidated");
    } else if (typeof log.debug === "function") {
      log.debug(meta, "response_cache_invalidated");
    } else if (typeof log.info === "function") {
      log.info(meta, "response_cache_invalidated");
    }
  }
  const priceLogger =
    typeof log.child === "function"
      ? log.child({ module: "price_provider" })
      : log;
  const providerHealth = createProviderHealthMonitor({ logger: priceLogger });
  const yahooProvider = new YahooPriceProvider({
    fetchImpl,
    timeoutMs: fetchTimeoutMs,
    logger: priceLogger,
  });
  const stooqProvider = new StooqPriceProvider({
    fetchImpl,
    timeoutMs: fetchTimeoutMs,
    logger: priceLogger,
  });
  const compositePriceProvider = new DualPriceProvider({
    primary: yahooProvider,
    fallback: stooqProvider,
    logger: priceLogger,
    healthMonitor: providerHealth,
  });
  const priceProviderInstance =
    priceProvider
    ?? createConfiguredPriceProvider({
      config,
      fetchImpl,
      timeoutMs: fetchTimeoutMs,
      logger: priceLogger,
      healthMonitor: providerHealth,
    })
    ?? compositePriceProvider;
  const latestQuoteProviderInstance = createConfiguredLatestQuoteProvider({
    config,
    fetchImpl,
    timeoutMs: fetchTimeoutMs,
    logger: priceLogger,
    healthMonitor: providerHealth,
  });
  let storagePromise;
  const getStorage = async () => {
    if (!storagePromise) {
      storagePromise = runMigrations({ dataDir, logger: log });
    }
    return storagePromise;
  };
  let persistedLatestCloseSnapshot = {
    loadedAt: 0,
    bySymbol: null,
  };
  const persistedLatestCloseSnapshotTtlMs = 30_000;
  async function loadPersistedLatestCloseSnapshot() {
    const now = Date.now();
    if (
      persistedLatestCloseSnapshot.bySymbol instanceof Map &&
      now - persistedLatestCloseSnapshot.loadedAt < persistedLatestCloseSnapshotTtlMs
    ) {
      return persistedLatestCloseSnapshot.bySymbol;
    }

    const storage = await getStorage();
    const records = await storage.readTable("prices");
    const bySymbol = new Map();
    for (const row of records) {
      const symbol =
        typeof row?.ticker === "string" ? row.ticker.trim().toUpperCase() : "";
      const date = typeof row?.date === "string" ? row.date.trim() : "";
      const close = Number.parseFloat(
        row?.adj_close ?? row?.adjClose ?? row?.close ?? row?.price,
      );
      if (!symbol || !date || !Number.isFinite(close) || close <= 0) {
        continue;
      }

      const current = bySymbol.get(symbol);
      if (!current || date > current.date) {
        bySymbol.set(symbol, {
          ticker: symbol,
          date,
          adj_close: close,
        });
      }
    }

    persistedLatestCloseSnapshot = {
      loadedAt: now,
      bySymbol,
    };
    return bySymbol;
  }
  async function getPersistedLatestClose(symbol) {
    const normalizedSymbol =
      typeof symbol === "string" ? symbol.trim().toUpperCase() : "";
    if (!normalizedSymbol) {
      return null;
    }
    const snapshot = await loadPersistedLatestCloseSnapshot();
    const record = snapshot.get(normalizedSymbol);
    return record ? { ...record } : null;
  }
  async function persistHistoricalLatestClose(symbol, result) {
    if (!result?.resolution || result.resolution.source !== "historical") {
      return;
    }

    const latest = Array.isArray(result.prices)
      ? result.prices[result.prices.length - 1]
      : null;
    const date = typeof latest?.date === "string" ? latest.date.trim() : "";
    const close = Number.parseFloat(latest?.close ?? latest?.adjClose);
    if (!date || !Number.isFinite(close) || close <= 0) {
      return;
    }

    try {
      const storage = await getStorage();
      await storage.ensureTable("prices", []);
      await storage.upsertRow(
        "prices",
        {
          ticker: symbol,
          date,
          adj_close: close,
          updated_at: new Date().toISOString(),
        },
        ["ticker", "date"],
      );
      if (persistedLatestCloseSnapshot.bySymbol instanceof Map) {
        const current = persistedLatestCloseSnapshot.bySymbol.get(symbol);
        if (!current || date >= current.date) {
          persistedLatestCloseSnapshot.bySymbol.set(symbol, {
            ticker: symbol,
            date,
            adj_close: close,
          });
        }
        persistedLatestCloseSnapshot.loadedAt = Date.now();
      }
    } catch (error) {
      log.warn("persist_historical_latest_close_failed", {
        symbol,
        error: error.message,
      });
    }
  }
  if (latestQuoteProviderInstance?.providerKey) {
    const providerMeta = {
      provider: latestQuoteProviderInstance.providerKey,
    };
    if (latestQuoteProviderInstance.providerKey === "twelvedata") {
      providerMeta.prepost = config?.prices?.latest?.prepost !== false;
    }
    priceLogger.info?.("latest_quote_provider_configured", providerMeta);
  }
  const historicalPriceLoader = createHistoricalPriceLoader({
    priceProvider: priceProviderInstance,
    latestQuoteProvider: latestQuoteProviderInstance,
    persistedLatestCloseLookup: getPersistedLatestClose,
    logger: log,
    marketClock,
    maxStaleTradingDays,
    cachePolicy: {
      liveOpenTtlSeconds: priceCacheLiveOpenTtlSeconds,
      liveClosedTtlSeconds: priceCacheLiveClosedTtlSeconds,
    },
  });
  const benchmarkCatalogPayload = {
    available: benchmarkConfig.available,
    derived: benchmarkConfig.derived,
    defaults: benchmarkConfig.defaultSelection,
    priceSymbols: benchmarkConfig.priceSymbols,
  };
  function ensureTransactionUids(transactions, portfolioId) {
    const seen = new Set();
    const deduplicated = [];
    const duplicates = new Set();
    let timestampCursor = 0;
    let seqCursor = -1;
    for (const transaction of transactions) {
      const base =
        transaction && typeof transaction === "object" ? transaction : {};
      const rawUid = typeof base.uid === "string" ? base.uid.trim() : "";
      const uid = rawUid ? rawUid : randomUUID();
      if (seen.has(uid)) {
        duplicates.add(uid);
        continue;
      }
      seen.add(uid);
      let numericCreatedAt = Number.NaN;
      if (typeof base.createdAt === "number") {
        numericCreatedAt = Number.isFinite(base.createdAt)
          ? Math.trunc(base.createdAt)
          : Number.NaN;
      } else if (typeof base.createdAt === "string") {
        const trimmed = base.createdAt.trim();
        if (trimmed !== "") {
          const parsed = Number.parseInt(trimmed, 10);
          numericCreatedAt = Number.isNaN(parsed) ? Number.NaN : parsed;
        }
      }
      let createdAt =
        Number.isFinite(numericCreatedAt) && numericCreatedAt >= 0
          ? numericCreatedAt
          : Date.now();
      if (createdAt <= timestampCursor) {
        createdAt = timestampCursor + 1;
      }
      timestampCursor = createdAt;
      let numericSeq = Number.NaN;
      if (typeof base.seq === "number") {
        numericSeq = Number.isFinite(base.seq)
          ? Math.trunc(base.seq)
          : Number.NaN;
      } else if (typeof base.seq === "string") {
        const trimmedSeq = base.seq.trim();
        if (trimmedSeq !== "") {
          const parsedSeq = Number.parseInt(trimmedSeq, 10);
          numericSeq = Number.isNaN(parsedSeq) ? Number.NaN : parsedSeq;
        }
      }
      let seq =
        Number.isInteger(numericSeq) && numericSeq >= 0
          ? numericSeq
          : seqCursor + 1;
      if (seq <= seqCursor) {
        seq = seqCursor + 1;
      }
      seqCursor = seq;
      deduplicated.push({ ...base, uid, createdAt, seq });
    }
    if (duplicates.size > 0) {
      const duplicateList = Array.from(duplicates);
      log.warn("duplicate_transaction_uids_filtered", {
        id: portfolioId,
        duplicates: duplicateList,
      });
      throw createHttpError({
        status: 409,
        code: "DUPLICATE_TRANSACTION_UID",
        message: "Duplicate transaction identifiers detected.",
        details: { portfolioId, duplicates: duplicateList },
        expose: true,
      });
    }
    return deduplicated;
  }
  function enforceNonNegativeCash(transactions, { portfolioId, logger }) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return;
    }
    const normalizeCurrencyCode = (value) => {
      if (typeof value !== "string") {
        return "USD";
      }
      const normalized = value.trim().toUpperCase();
      return /^[A-Z]{3}$/u.test(normalized) ? normalized : "USD";
    };
    const sorted = sortTransactionsForCashAudit(transactions);
    const cashByCurrency = new Map();
    for (const tx of sorted) {
      if (!tx || typeof tx !== "object") {
        continue;
      }
      const amount = Number.parseFloat(tx.amount ?? 0);
      if (!Number.isFinite(amount)) {
        continue;
      }
      const cents = Math.abs(toCents(amount));
      const currency = normalizeCurrencyCode(tx.currency);
      const previousCents = cashByCurrency.get(currency) ?? 0;
      let nextCents = previousCents;
      switch (tx.type) {
        case "DEPOSIT":
        case "DIVIDEND":
        case "INTEREST":
        case "SELL":
          nextCents += cents;
          break;
        case "WITHDRAWAL":
        case "BUY":
        case "FEE":
          nextCents -= cents;
          break;
        default:
          continue;
      }
      cashByCurrency.set(currency, nextCents);
      if (nextCents < 0) {
        const deficitDecimal = roundDecimal(fromCents(-nextCents), 2);
        const balanceDecimal = roundDecimal(fromCents(previousCents), 2);
        const deficit = deficitDecimal.toNumber();
        const balance = balanceDecimal.toNumber();
        logger?.warn?.("cash_overdraw_rejected", {
          id: portfolioId,
          date: tx.date,
          type: tx.type,
          amount,
          deficit,
          balance,
          currency,
        });
        throw createHttpError({
          status: 400,
          code: "E_CASH_OVERDRAW",
          message: `Cash balance cannot go negative. Deficit of ${deficitDecimal.toFixed(2)} detected.`,
          details: {
            date: tx.date,
            type: tx.type,
            amount,
            deficit,
            balance,
            currency,
          },
          expose: true,
        });
      }
    }
  }
  function enforceOversellPolicy(transactions, { portfolioId, autoClip }) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return;
    }
    const holdingsMicro = new Map();
    const ordered = sortTransactions(transactions);
    for (const tx of ordered) {
      if (!tx || typeof tx !== "object") {
        continue;
      }
      const ticker = tx.ticker;
      if (!ticker || ticker === "CASH") {
        continue;
      }
      if (tx.type === "BUY") {
        const rawQuantity = Number.isFinite(tx.quantity)
          ? tx.quantity
          : Number.isFinite(tx.shares)
            ? Math.abs(tx.shares)
            : 0;
        const micro = Math.max(0, toMicroShares(rawQuantity));
        if (micro === 0) {
          continue;
        }
        const current = holdingsMicro.get(ticker) ?? 0;
        setNormalizedHoldingMicro(holdingsMicro, ticker, current + micro);
        continue;
      }
      if (tx.type !== "SELL") {
        continue;
      }
      const requestedMicro = Math.abs(
        toMicroShares(
          Number.isFinite(tx.quantity)
            ? tx.quantity
            : Number.isFinite(tx.shares)
              ? -Math.abs(tx.shares)
              : 0,
        ),
      );
      if (requestedMicro === 0) {
        continue;
      }
      const availableMicro = holdingsMicro.get(ticker) ?? 0;
      const remainingMicro = normalizeMicroShareBalance(
        availableMicro - requestedMicro,
      );
      if (remainingMicro >= 0) {
        if (requestedMicro > availableMicro) {
          log.info("oversell_dust_absorbed", {
            id: portfolioId,
            ticker,
            date: tx.date,
            requested_micro: requestedMicro,
            available_micro: availableMicro,
          });
        }
        setNormalizedHoldingMicro(holdingsMicro, ticker, remainingMicro);
        continue;
      }
      const requestedShares = roundDecimal(
        fromMicroShares(requestedMicro),
        6,
      ).toNumber();
      const availableShares = roundDecimal(
        fromMicroShares(availableMicro),
        6,
      ).toNumber();
      if (!autoClip) {
        log.warn("oversell_rejected", {
          id: portfolioId,
          ticker,
          date: tx.date,
          requested_shares: requestedShares,
          available_shares: availableShares,
        });
        throw createHttpError({
          status: 400,
          code: "E_OVERSELL",
          message: `Cannot sell ${requestedShares} shares of ${ticker}. Only ${availableShares} available.`,
          details: {
            ticker,
            requested: requestedShares,
            available: availableShares,
            date: tx.date,
          },
          expose: true,
        });
      }
      const clippedMicro = availableMicro;
      const clippedSharesDecimal = roundDecimal(
        fromMicroShares(clippedMicro),
        6,
      );
      const clippedShares = clippedSharesDecimal.toNumber();
      const originalShares = Number.isFinite(tx.shares)
        ? Math.abs(tx.shares)
        : requestedShares;
      let adjustedAmount = 0;
      if (originalShares > 0 && Number.isFinite(tx.amount) && tx.amount !== 0) {
        const perShare = d(Math.abs(tx.amount)).div(originalShares);
        const newAmountDecimal = perShare.times(clippedSharesDecimal);
        const signedAmount =
          tx.amount >= 0 ? newAmountDecimal : newAmountDecimal.neg();
        adjustedAmount = roundDecimal(signedAmount, 6).toNumber();
      }
      if (clippedShares === 0) {
        adjustedAmount = 0;
      }
      tx.quantity = clippedShares === 0 ? 0 : -clippedShares;
      tx.shares = clippedShares;
      tx.amount = adjustedAmount;
      const metadata =
        tx.metadata && typeof tx.metadata === "object"
          ? { ...tx.metadata }
          : {};
      const systemMeta =
        metadata.system && typeof metadata.system === "object"
          ? { ...metadata.system }
          : {};
      systemMeta.oversell_clipped = {
        requested_shares: requestedShares,
        available_shares: availableShares,
        delivered_shares: clippedShares,
      };
      metadata.system = systemMeta;
      tx.metadata = metadata;
      setNormalizedHoldingMicro(holdingsMicro, ticker, 0);
      log.warn("oversell_clipped", {
        id: portfolioId,
        ticker,
        date: tx.date,
        requested_shares: requestedShares,
        delivered_shares: clippedShares,
      });
    }
  }
  const performanceHistory = createPerformanceHistoryService({
    getStorage,
    priceLoader: historicalPriceLoader,
    logger: log,
    config,
    r2DbPath: config?.roi?.r2DbPath,
  });
  async function ensureHistoricalPerformanceRange({ from, to, portfolioId = null }) {
    const result = await performanceHistory.getLegacyRows({ from, to, portfolioId });
    invalidateResponseCache("historical_performance_repair");
    return result;
  }
  const app = express();
  app.disable("x-powered-by");
  const compressionMiddleware = compression({
    threshold: 1024,
    level: 6,
    filter(req, res) {
      if (req.headers["x-no-compression"]) {
        return false;
      }
      return compression.filter(req, res);
    },
  });
  app.use(compressionMiddleware);
  const httpLogger =
    typeof httpLoggerFactory === "function"
      ? httpLoggerFactory(buildHttpLoggerOptions(DEFAULT_LOGGER))
      : createHttpLogger({ logger: DEFAULT_LOGGER });
  app.use(httpLogger);
  app.use(attachRequestId);
  app.use(rewriteLegacyApiPrefix);
  app.use("/api", ensureApiVersionHeader);
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "base-uri": ["'self'"],
          "script-src": ["'self'"],
          "frame-ancestors": ["'none'"],
          "connect-src": ["'self'"],
        },
      },
      frameguard: { action: "deny" },
      hsts: { maxAge: 15552000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  const allowedOriginSet = new Set(allowedOrigins);
  app.use(
    cors((req, callback) => {
      const origin = req.get("origin");
      if (
        !origin ||
        allowedOriginSet.has(origin) ||
        isSameOriginRequest(req, origin)
      ) {
        callback(null, {
          origin: true,
          methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
          credentials: false,
        });
        return;
      }
      callback(
        createHttpError({
          status: 403,
          code: "CORS_NOT_ALLOWED",
          message: "Origin not allowed by CORS policy",
        }),
      );
    }),
  );
  app.use(express.json({ limit: "10mb" }));
  async function fetchHistoricalPrices(symbol, range = "1y", { latestOnly = false } = {}) {
    if (!SYMBOL_PATTERN.test(symbol)) {
      throw createHttpError({
        status: 400,
        code: "INVALID_SYMBOL",
        message: "Invalid symbol.",
      });
    }
    const normalizedSymbol = symbol.trim().toUpperCase();
    try {
      const result = await historicalPriceLoader.fetchSeries(normalizedSymbol, {
        range,
        latestOnly,
      });
      if (latestOnly) {
        await persistHistoricalLatestClose(normalizedSymbol, result);
      }
      return result;
    } catch (error) {
      if (error.name === "AbortError") {
        const timeoutError = createHttpError({
          status: 504,
          code: "UPSTREAM_TIMEOUT",
          message: "Price fetch timed out.",
        });
        log.error("price_fetch_timeout", { error: error.message, symbol });
        throw timeoutError;
      }
      log.error("price_fetch_failed", { error: error.message, symbol });
      if (error.statusCode) {
        throw error;
      }
      throw createHttpError({
        status: 502,
        code: "PRICE_FETCH_FAILED",
        message: "Failed to fetch historical prices.",
        expose: true,
      });
    }
  }
  async function fetchLatestSignalPrices(symbols) {
    const prices = {};
    const asOf = {};
    const errors = {};
    const metadata = {};

    const results = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const result = await fetchHistoricalPrices(symbol, "1y", { latestOnly: true });
          return { symbol, status: "fulfilled", result };
        } catch (error) {
          return { symbol, status: "rejected", error };
        }
      }),
    );

    for (const entry of results) {
      if (entry.status === "rejected") {
        const { symbol, error } = entry;
        metadata[symbol] = {
          status: "unavailable",
          source: "none",
          provider: null,
          warnings: [],
          asOf: null,
        };
        errors[symbol] = {
          code: error?.code ?? "PRICE_FETCH_FAILED",
          status: error?.status ?? error?.statusCode ?? 502,
          message: error?.message ?? "Failed to fetch historical prices.",
        };
        logLatestPriceResolution(log, symbol, metadata[symbol], {
          staleRejected: error?.code === "STALE_DATA",
        });
        continue;
      }

      const { symbol, result } = entry;
      metadata[symbol] = result?.resolution ?? {
        status: "unavailable",
        source: "none",
        provider: null,
        warnings: [],
        asOf: null,
      };
      const latest = Array.isArray(result.prices) ? result.prices[result.prices.length - 1] : null;
      const latestDate = latest?.date ?? null;
      const tradingDayAge = computeTradingDayAge(latestDate);
      if (!latestDate || tradingDayAge > maxStaleTradingDays) {
        metadata[symbol] = appendPricingWarning(
          {
            ...(metadata[symbol] ?? {}),
            status: "unavailable",
            asOf: latestDate,
          },
          metadata[symbol]?.source === "persisted"
            ? "PERSISTED_CLOSE_STALE_REJECTED"
            : "",
        );
        errors[symbol] = {
          code: "STALE_DATA",
          status: 503,
          message: "Historical prices are stale for this symbol.",
        };
        logLatestPriceResolution(log, symbol, metadata[symbol], {
          tradingDayAge,
          staleRejected: true,
        });
        continue;
      }

      const rawClose =
        Number.isFinite(latest?.close)
          ? latest.close
          : Number.isFinite(latest?.adjClose)
            ? latest.adjClose
            : null;
      if (!Number.isFinite(rawClose)) {
        metadata[symbol] = {
          ...(metadata[symbol] ?? {}),
          status: "unavailable",
          asOf: latestDate,
        };
        errors[symbol] = {
          code: "PRICE_FETCH_FAILED",
          status: 502,
          message: "Failed to fetch historical prices.",
        };
        logLatestPriceResolution(log, symbol, metadata[symbol]);
        continue;
      }

      prices[symbol] = rawClose;
      asOf[symbol] = latestDate;
      logLatestPriceResolution(log, symbol, metadata[symbol], {
        tradingDayAge,
      });
    }

    return {
      prices,
      asOf,
      errors,
      metadata,
      summary: normalizePricingStatusSummary(metadata, errors),
    };
  }

  async function evaluateSignalPreview({ transactions = [], signals = {} } = {}) {
    const sortedTransactions = sortTransactions(transactions);
    const lastTransactionDate =
      sortedTransactions.length > 0 ? sortedTransactions[sortedTransactions.length - 1].date : null;
    const projectedState = lastTransactionDate
      ? projectStateUntil(sortedTransactions, lastTransactionDate)
      : { holdings: new Map() };
    const openTickers = Array.from(projectedState.holdings.entries())
      .filter(([, quantity]) => isOpenSignalHolding(quantity))
      .map(([ticker]) => ticker)
      .sort((left, right) => left.localeCompare(right));
    const latestSignalPrices =
      openTickers.length > 0
        ? await fetchLatestSignalPrices(openTickers)
        : { prices: {}, asOf: {}, errors: {} };
    const priceSnapshots = new Map(
      openTickers.map((ticker) => [
        ticker,
        {
          price: latestSignalPrices.prices[ticker] ?? null,
          asOf: latestSignalPrices.asOf[ticker] ?? null,
        },
      ]),
    );
    const rows = buildPortfolioSignalRows({
      transactions,
      signals,
      priceSnapshots,
    });

    const market = marketClock();
    return {
      rows,
      prices: latestSignalPrices.prices,
      errors: latestSignalPrices.errors,
      pricing: {
        symbols: latestSignalPrices.metadata,
        summary: latestSignalPrices.summary,
      },
      market: {
        isOpen: market.isOpen,
        isBeforeOpen: market.isBeforeOpen,
        lastTradingDate: market.lastTradingDate,
        nextTradingDate: market.nextTradingDate,
      },
    };
  }
  const sessionAuth = createSessionAuth({
    sessionToken: sessionAuthToken,
    headerName: sessionAuthHeaderName,
    logger: log,
  });
  const requirePortfolioAccess = sessionAuth;
  const validatePortfolioId = (req, res, next) => {
    validatePortfolioIdParam(req, res, (error) => {
      if (error) {
        log.warn("invalid_portfolio_id", { id: req.params?.id });
        next(error);
        return;
      }
      next();
    });
  };
  const normalizeScopedPortfolioId = (value) =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  const filterRowsByPortfolioScope = (rows, portfolioId) => {
    const normalizedPortfolioId = normalizeScopedPortfolioId(portfolioId);
    if (!normalizedPortfolioId) {
      const unscoped = rows.filter(
        (row) =>
          typeof row?.portfolio_id !== "string"
          || row.portfolio_id.trim().length === 0,
      );
      return unscoped.length > 0 ? unscoped : rows;
    }
    return rows.filter((row) => row?.portfolio_id === normalizedPortfolioId);
  };
  app.get("/api/prices/:symbol", async (req, res, next) => {
    const { symbol } = req.params;
    const { range } = req.query;
    if (typeof symbol === "string" && symbol.toLowerCase() === "bulk") {
      next();
      return;
    }
    try {
      const { prices, etag, cacheHit } = await fetchHistoricalPrices(
        symbol,
        range ?? "1y",
        { latestOnly: req.query?.latest === "1" || req.query?.latest === "true" },
      );
      const latestDate =
        prices.length > 0 ? prices[prices.length - 1].date : null;
      const tradingDayAge = computeTradingDayAge(latestDate);
      if (!latestDate || tradingDayAge > maxStaleTradingDays) {
        log.warn("stale_price_data", {
          symbol,
          latest_date: latestDate,
          trading_days_age: tradingDayAge,
          threshold_trading_days: maxStaleTradingDays,
        });
        res.status(503).json({ error: "STALE_DATA" });
        return;
      }
      const clientETag = req.get("if-none-match");
      if (cacheHit && clientETag && clientETag === etag) {
        res
          .status(304)
          .set("ETag", etag)
          .set("Cache-Control", priceCacheControlHeader)
          .set("X-Cache", "HIT")
          .end();
        return;
      }
      res
        .set("ETag", etag)
        .set("Cache-Control", priceCacheControlHeader)
        .set("X-Cache", cacheHit ? "HIT" : "MISS")
        .json(prices);
    } catch (error) {
      if (error.statusCode) {
        next(error);
        return;
      }
      next(
        createHttpError({
          status: 502,
          code: "PRICE_FETCH_FAILED",
          message: "Failed to fetch historical prices.",
        }),
      );
    }
  });
  app.get("/api/prices/bulk", async (req, res, next) => {
    const { symbols: rawSymbols, range, latest } = req.query;
    try {
      const latestOnly = latest === "1" || latest === "true";
      const normalizedSymbols = Array.from(
        new Set(
          normalizeBulkPriceSymbols(rawSymbols)
            .map((value) =>
              typeof value === "string" ? value.trim().toUpperCase() : "",
            )
            .filter((value) => value && SYMBOL_PATTERN.test(value)),
        ),
      ).slice(0, MAX_BULK_PRICE_SYMBOLS);
      if (normalizedSymbols.length === 0) {
        throw createHttpError({
          status: 400,
          code: "INVALID_SYMBOLS",
          message: "At least one valid symbol is required.",
          expose: true,
        });
      }
      const results = await Promise.all(
        normalizedSymbols.map(async (symbol) => {
          try {
            const result = await fetchHistoricalPrices(symbol, range ?? "1y", {
              latestOnly,
            });
            return { symbol, status: "fulfilled", result };
          } catch (error) {
            return { symbol, status: "rejected", error };
          }
        }),
      );
      const series = {};
      const errors = {};
      const cacheMeta = {};
      const etagMeta = {};
      const symbolMeta = {};
      let allHits = true;
      for (const entry of results) {
        if (entry.status === "fulfilled") {
          const { symbol, result } = entry;
          const { prices, etag, cacheHit } = result;
          symbolMeta[symbol] = result?.resolution ?? {
            status: cacheHit ? "cache_fresh" : "eod_fresh",
            source: cacheHit ? "cache" : "historical",
            provider: null,
            warnings: [],
            asOf: prices.length > 0 ? prices[prices.length - 1]?.date ?? null : null,
            cacheHit,
          };
          const latestDate =
            prices.length > 0 ? prices[prices.length - 1].date : null;
          const tradingDayAge = computeTradingDayAge(latestDate);
          if (!latestDate || tradingDayAge > maxStaleTradingDays) {
            symbolMeta[symbol] = appendPricingWarning(
              {
                ...(symbolMeta[symbol] ?? {}),
                status: "unavailable",
                asOf: latestDate,
              },
              symbolMeta[symbol]?.source === "persisted"
                ? "PERSISTED_CLOSE_STALE_REJECTED"
                : "",
            );
            errors[symbol] = {
              code: "STALE_DATA",
              status: 503,
              message: "Historical prices are stale for this symbol.",
            };
            series[symbol] = [];
            cacheMeta[symbol] = cacheHit ? "HIT" : "MISS";
            if (etag) {
              etagMeta[symbol] = etag;
            }
            if (!cacheHit) {
              allHits = false;
            }
            logLatestPriceResolution(log, symbol, symbolMeta[symbol], {
              tradingDayAge,
              staleRejected: true,
            });
            continue;
          }
          series[symbol] = prices;
          cacheMeta[symbol] = cacheHit ? "HIT" : "MISS";
          etagMeta[symbol] = etag;
          if (!cacheHit) {
            allHits = false;
          }
          logLatestPriceResolution(log, symbol, symbolMeta[symbol], {
            tradingDayAge,
          });
        } else {
          const { symbol, error } = entry;
          symbolMeta[symbol] = {
            status: "unavailable",
            source: "none",
            provider: null,
            warnings: [],
            asOf: null,
          };
          errors[symbol] = {
            code: error?.code ?? "PRICE_FETCH_FAILED",
            status: error?.status ?? error?.statusCode ?? 502,
            message: error?.message ?? "Failed to fetch historical prices.",
          };
          logLatestPriceResolution(log, symbol, symbolMeta[symbol], {
            staleRejected: error?.code === "STALE_DATA",
          });
        }
      }
      for (const symbol of normalizedSymbols) {
        if (!series[symbol]) {
          series[symbol] = [];
        }
        if (!symbolMeta[symbol]) {
          symbolMeta[symbol] = {
            status: "unavailable",
            source: "none",
            provider: null,
            warnings: [],
            asOf: null,
          };
        }
        if (!cacheMeta[symbol]) {
          cacheMeta[symbol] = "MISS";
          allHits = false;
        }
      }
      const effectivePriceCacheControlHeader = latestOnly
        ? `private, max-age=${marketClock().isOpen ? priceCacheLiveOpenTtlSeconds : priceCacheLiveClosedTtlSeconds}`
        : priceCacheControlHeader;
      res
        .set("Cache-Control", effectivePriceCacheControlHeader)
        .set("X-Cache", allHits ? "HIT" : "MISS")
        .json({
          series,
          errors,
          metadata: {
            cache: cacheMeta,
            etags: etagMeta,
            symbols: symbolMeta,
            summary: normalizePricingStatusSummary(symbolMeta, errors),
          },
        });
    } catch (error) {
      if (error?.status) {
        next(error);
        return;
      }
      next(
        createHttpError({
          status: 502,
          code: "PRICE_FETCH_FAILED",
          message: "Failed to fetch bulk historical prices.",
          expose: false,
        }),
      );
    }
  });
  app.get("/api/benchmarks", ensureCashFeature, (req, res) => {
    sendJsonWithEtag(req, res, benchmarkCatalogPayload, {
      cacheControl: cacheControlHeader,
    });
  });
  app.get("/api/cache/stats", (_req, res) => {
    res.json(getCacheStats());
  });
  app.get("/api/monitoring", (_req, res) => {
    res.json(getPerformanceMetrics());
  });
  app.post(
    "/api/signals",
    sessionAuth,
    validatePortfolioBody,
    async (req, res, next) => {
      const payload = req.body;
      let normalizedTransactions;
      try {
        normalizedTransactions = ensureTransactionUids(
          payload.transactions ?? [],
          "signals-preview",
        );
      } catch (error) {
        next(error);
        return;
      }

      try {
        enforceOversellPolicy(normalizedTransactions, {
          portfolioId: "signals-preview",
          autoClip: Boolean(payload.settings?.autoClip),
        });
      } catch (error) {
        next(error);
        return;
      }

      try {
        const response = await evaluateSignalPreview({
          transactions: normalizedTransactions,
          signals: payload.signals ?? {},
        });
        res.json(response);
      } catch (error) {
        log.error("signals_preview_failed", { error: error.message });
        next(
          createHttpError({
            status: 500,
            code: "SIGNALS_PREVIEW_FAILED",
            message: "Failed to evaluate signals.",
            expose: false,
          }),
        );
      }
    },
  );
  app.get(
    "/api/portfolio/:id/signal-notifications",
    validatePortfolioId,
    requirePortfolioAccess,
    async (req, res, next) => {
      const { id } = req.params;
      try {
        const storage = await getStorage();
        const data = await listPortfolioSignalNotifications(storage, id, {
          limit: req.query?.limit,
        });
        res.json({ data });
      } catch (error) {
        log.error("portfolio_signal_notifications_failed", {
          id,
          error: error.message,
        });
        next(
          createHttpError({
            status: 500,
            code: "PORTFOLIO_SIGNAL_NOTIFICATIONS_FAILED",
            message: "Failed to load signal notifications.",
            expose: false,
          }),
        );
      }
    },
  );
  app.post(
    "/api/portfolio/:id/signal-notifications/:notificationId/requeue-email",
    validatePortfolioId,
    requirePortfolioAccess,
    async (req, res, next) => {
      const { id, notificationId } = req.params;
      const normalizedNotificationId =
        typeof notificationId === "string" ? notificationId.trim() : "";
      if (!normalizedNotificationId) {
        next(
          createHttpError({
            status: 400,
            code: "INVALID_SIGNAL_NOTIFICATION_ID",
            message: "Signal notification id is required.",
          }),
        );
        return;
      }
      try {
        const storage = await getStorage();
        const result = await requeueSignalNotificationEmailDelivery({
          storage,
          portfolioId: id,
          notificationId: normalizedNotificationId,
        });
        if (!result) {
          next(
            createHttpError({
              status: 404,
              code: "SIGNAL_NOTIFICATION_NOT_FOUND",
              message: "Signal notification not found.",
            }),
          );
          return;
        }
        res.json({
          status: "ok",
          changed: result.changed,
          reason: result.reason,
          data: result.notification,
        });
      } catch (error) {
        log.error("portfolio_signal_notification_requeue_failed", {
          id,
          notificationId: normalizedNotificationId,
          error: error.message,
        });
        next(
          createHttpError({
            status: 500,
            code: "PORTFOLIO_SIGNAL_NOTIFICATION_REQUEUE_FAILED",
            message: "Failed to requeue signal notification email delivery.",
            expose: false,
          }),
        );
      }
    },
  );
  app.get(
    "/api/portfolio/:id",
    validatePortfolioId,
    requirePortfolioAccess,
    async (req, res, next) => {
      const { id } = req.params;
      try {
        const storage = await getStorage();
        const portfolio = await readPortfolioState(storage, id);
        if (!portfolio) {
          res.json({});
          return;
        }
        res.json(portfolio);
      } catch (error) {
        log.error("portfolio_read_failed", { id, error: error.message });
        next(
          createHttpError({
            status: 500,
            code: "PORTFOLIO_READ_FAILED",
            message: "Failed to load portfolio.",
            expose: false,
          }),
        );
      }
    },
  );
  app.post(
    "/api/portfolio/:id",
    validatePortfolioId,
    requirePortfolioAccess,
    validatePortfolioBody,
    async (req, res, next) => {
      const { id } = req.params;
      const payload = req.body;
      const autoClip = Boolean(payload.settings?.autoClip);
      let normalizedTransactions;
      try {
        normalizedTransactions = ensureTransactionUids(
          payload.transactions ?? [],
          id,
        );
      } catch (error) {
        next(error);
        return;
      }
      const cashCurrency =
        typeof payload.cash?.currency === "string"
          ? payload.cash.currency
          : "USD";
      const cashTimeline = Array.isArray(payload.cash?.apyTimeline)
        ? payload.cash.apyTimeline.map((entry) => ({
            from: entry.from,
            to: entry.to ?? null,
            apy: Number(entry.apy),
          }))
        : [];
      try {
        enforceOversellPolicy(normalizedTransactions, {
          portfolioId: id,
          autoClip,
        });
        enforceNonNegativeCash(normalizedTransactions, {
          portfolioId: id,
          logger: log,
        });
      } catch (error) {
        next(error);
        return;
      }
      const normalizedPayload = {
        transactions: normalizedTransactions,
        signals: payload.signals ?? {},
        settings: payload.settings,
        cash: { currency: cashCurrency, apyTimeline: cashTimeline },
      };
      try {
        await withLock(`portfolio:${id}`, async () => {
          const storage = await getStorage();
          await writePortfolioState(storage, id, normalizedPayload);
        });
        invalidateResponseCache("portfolio_save");
        res.json({ status: "ok" });
      } catch (error) {
        log.error("portfolio_write_failed", { id, error: error.message });
        next(
          createHttpError({
            status: 500,
            code: "PORTFOLIO_WRITE_FAILED",
            message: "Failed to save portfolio.",
            expose: false,
          }),
        );
      }
    },
  );
  function ensureCashFeature(req, res, next) {
    if (!featureFlags.cashBenchmarks) {
      next(
        createHttpError({
          status: 404,
          code: "CASH_BENCHMARKS_DISABLED",
          message: "Cash benchmarks feature is disabled.",
        }),
      );
      return;
    }
    next();
  }
  app.get(
    "/api/roi/daily",
    ensureCashFeature,
    validateRangeQuery,
    async (req, res, next) => {
      try {
        const { from, to, portfolioId } = req.query;
        const cacheKey = [
          "roi",
          portfolioId ?? "",
          from ?? "",
          to ?? "",
        ].join(":");
        const cached = responseCache.get(cacheKey);
        if (cached) {
          sendJsonWithEtag(req, res, cached, {
            cacheControl: cacheControlHeader,
          });
          return;
        }
        const payload = await performanceHistory.getRoiPayload({
          from,
          to,
          portfolioId,
        });
        responseCache.set(cacheKey, payload);
        sendJsonWithEtag(req, res, payload, {
          cacheControl: cacheControlHeader,
        });
      } catch (error) {
        if (error?.statusCode) {
          next(error);
          return;
        }
        next(
          createHttpError({
            status: 503,
            code: error?.code ?? "ROI_FETCH_FAILED",
            message: error?.message ?? "Failed to fetch ROI history.",
            details: error?.details,
            expose: true,
          }),
        );
      }
    },
  );
  app.get(
    "/api/returns/daily",
    ensureCashFeature,
    validateReturnsQuery,
    async (req, res, next) => {
      try {
        const { from, to, views, page, perPage, portfolioId } = req.query;
        let storage = await getStorage();
        let rows = filterRowsByRange(
          filterRowsByPortfolioScope(await storage.readTable("returns_daily"), portfolioId),
          from,
          to,
        );
        const needsRepair =
          rows.length === 0 ||
          (typeof from === "string" && from.trim().length > 0 && (!rows[0]?.date || rows[0].date > from)) ||
          (typeof to === "string" && to.trim().length > 0 && (!rows[rows.length - 1]?.date || rows[rows.length - 1].date < to));
        if (needsRepair) {
          try {
            const repair = await ensureHistoricalPerformanceRange({ from, to, portfolioId });
            storage = await getStorage();
            rows = filterRowsByRange(
              filterRowsByPortfolioScope(await storage.readTable("returns_daily"), portfolioId),
              from,
              to,
            );
            if (rows.length === 0 && repair?.repaired) {
              throw new Error("repair_produced_no_rows");
            }
          } catch (repairError) {
            log.error("historical_performance_repair_failed", {
              error: repairError.message,
              from,
              to,
            });
            throw createHttpError({
              status: 503,
              code: "RETURNS_REPAIR_FAILED",
              message: "Historical returns could not be rebuilt from local transactions and prices.",
              expose: true,
            });
          }
        }
        const { items, meta } = paginateRows(rows, { page, perPage });
        const mapping = {
          port: "r_port",
          excash: "r_ex_cash",
          spy: "r_spy_100",
          bench: "r_bench_blended",
        };
        const series = {};
        for (const view of views) {
          const key = mapping[view];
          if (!key) {
            continue;
          }
          series[key] = items.map((row) => ({
            date: row.date,
            value: row[key],
          }));
        }
        series.r_cash = items.map((row) => ({
          date: row.date,
          value: row.r_cash,
        }));
        if (!Object.keys(series).length) {
          series.r_port = items.map((row) => ({
            date: row.date,
            value: row.r_port,
          }));
        }
        const payload = { series, meta };
        const cacheKey = [
          "returns",
          portfolioId ?? "",
          from ?? "",
          to ?? "",
          views.slice().sort().join(","),
          page,
          perPage,
        ].join(":");
        const cached = responseCache.get(cacheKey);
        if (cached) {
          sendJsonWithEtag(req, res, cached, {
            cacheControl: cacheControlHeader,
          });
          return;
        }
        responseCache.set(cacheKey, payload);
        sendJsonWithEtag(req, res, payload, {
          cacheControl: cacheControlHeader,
        });
      } catch (error) {
        if (error?.statusCode) {
          next(error);
          return;
        }
        next(
          createHttpError({
            status: 500,
            code: "RETURNS_FETCH_FAILED",
            message: "Failed to fetch returns.",
            expose: false,
          }),
        );
      }
    },
  );
  app.get(
    "/api/nav/daily",
    ensureCashFeature,
    validateRangeQuery,
    async (req, res, next) => {
      try {
        const { from, to, page, perPage, portfolioId } = req.query;
        let storage = await getStorage();
        let rows = filterRowsByRange(
          filterRowsByPortfolioScope(await storage.readTable("nav_snapshots"), portfolioId),
          from,
          to,
        );
        if (rows.length === 0) {
          await performanceHistory.getLegacyRows({ from, to, portfolioId });
          storage = await getStorage();
          rows = filterRowsByRange(
            filterRowsByPortfolioScope(await storage.readTable("nav_snapshots"), portfolioId),
            from,
            to,
          );
        }
        const { items, meta } = paginateRows(rows, { page, perPage });
        const data = items.map((row) => {
          const weights = weightsFromState({
            nav: row.portfolio_nav,
            cash: row.cash_balance,
            riskValue: row.risk_assets_value,
          });
          return {
            date: row.date,
            portfolio_nav: row.portfolio_nav,
            ex_cash_nav: row.ex_cash_nav,
            cash_balance: row.cash_balance,
            risk_assets_value: row.risk_assets_value,
            stale_price: Boolean(row.stale_price),
            weights,
          };
        });
        const payload = { data, meta };
        const cacheKey = ["nav", portfolioId ?? "", from ?? "", to ?? "", page, perPage].join(":");
        const cached = responseCache.get(cacheKey);
        if (cached) {
          sendJsonWithEtag(req, res, cached, {
            cacheControl: cacheControlHeader,
          });
          return;
        }
        responseCache.set(cacheKey, payload);
        sendJsonWithEtag(req, res, payload, {
          cacheControl: cacheControlHeader,
        });
      } catch (error) {
        next(
          createHttpError({
            status: error.statusCode ?? 500,
            code: "NAV_FETCH_FAILED",
            message: "Failed to fetch NAV data.",
            expose: false,
          }),
        );
      }
    },
  );
  app.get(
    "/api/benchmarks/summary",
    ensureCashFeature,
    validateRangeQuery,
    async (req, res, next) => {
      try {
        const { from, to, portfolioId } = req.query;
        let storage = await getStorage();
        const cacheKey = ["benchmarks", portfolioId ?? "", from ?? "", to ?? ""].join(":");
        let [returnsTable, navRows, transactions, priceRows] = await Promise.all([
          storage.readTable("returns_daily"),
          storage.readTable("nav_snapshots"),
          storage.readTable("transactions"),
          storage.readTable("prices"),
        ]);
        let filteredRows = filterRowsByRange(
          filterRowsByPortfolioScope(returnsTable, portfolioId),
          from,
          to,
        );
        if (filteredRows.length === 0) {
          await performanceHistory.getLegacyRows({ from, to, portfolioId });
          storage = await getStorage();
          [returnsTable, navRows, transactions, priceRows] = await Promise.all([
            storage.readTable("returns_daily"),
            storage.readTable("nav_snapshots"),
            storage.readTable("transactions"),
            storage.readTable("prices"),
          ]);
          filteredRows = filterRowsByRange(
            filterRowsByPortfolioScope(returnsTable, portfolioId),
            from,
            to,
          );
        }
        const rows = filteredRows
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date));
        const todayKey = toDateKey(new Date());
        let referenceKey = to ? toDateKey(to) : todayKey;
        if (referenceKey > todayKey) {
          referenceKey = todayKey;
        }
        const latestDate = rows.length > 0 ? rows[rows.length - 1].date : null;
        const referenceDate = new Date(`${referenceKey}T00:00:00Z`);
        const tradingDayAge = computeTradingDayAge(latestDate, referenceDate);
        if (!latestDate || tradingDayAge > maxStaleTradingDays) {
          log.warn("stale_benchmark_data", {
            latest_date: latestDate,
            reference_date: referenceKey,
            trading_days_age: tradingDayAge,
            threshold_trading_days: maxStaleTradingDays,
          });
          res.status(503).json({ error: "STALE_DATA" });
          return;
        }
        const cached = responseCache.get(cacheKey);
        if (cached) {
          sendJsonWithEtag(req, res, cached, {
            cacheControl: cacheControlHeader,
          });
          return;
        }
        const summary = summarizeReturns(rows);
        let moneyWeighted = 0;
        let moneyWeightedPeriod = { start_date: null, end_date: null };
        let moneyWeightedBenchmarks = { spy: null, qqq: null };
        let moneyWeightedPartial = false;
        if (rows.length > 0) {
          const startKey = rows[0].date;
          const endKey = rows[rows.length - 1].date;
          const scopedTransactions = filterRowsByPortfolioScope(transactions, portfolioId);
          const scopedNavRows = filterRowsByPortfolioScope(navRows, portfolioId);
          const xirr = computeMoneyWeightedReturn({
            transactions: scopedTransactions,
            navRows: scopedNavRows,
            startDate: startKey,
            endDate: endKey,
          });
          moneyWeighted = roundDecimal(xirr, 8).toNumber();
          moneyWeightedPeriod = { start_date: startKey, end_date: endKey };
          const elapsedDays = Math.round(
            (
              new Date(`${endKey}T00:00:00Z`).getTime()
              - new Date(`${startKey}T00:00:00Z`).getTime()
            ) / 86_400_000,
          );
          moneyWeightedPartial = elapsedDays < 365;
          moneyWeightedBenchmarks = MATCHED_MWR_BENCHMARKS.reduce((acc, benchmark) => {
            const benchmarkPriceMap = buildAdjustedPriceMap(priceRows, benchmark.ticker, {
              from: startKey,
              to: endKey,
            });
            const benchmarkMwr = computeMatchedBenchmarkMoneyWeightedReturn({
              benchmarkPrices: benchmarkPriceMap,
              transactions: scopedTransactions,
              navRows: scopedNavRows,
              startDate: startKey,
              endDate: endKey,
            });
            acc[benchmark.key] = benchmarkMwr
              ? roundDecimal(benchmarkMwr, 8).toNumber()
              : null;
            return acc;
          }, { spy: null, qqq: null });
        }
        const drawdownResult = computeMaxDrawdown(rows);
        const maxDrawdown = drawdownResult
          ? { value: drawdownResult.maxDrawdown, peak_date: drawdownResult.peakDate, trough_date: drawdownResult.troughDate }
          : null;
        const dragVsSelf = Number(
          (summary.r_ex_cash - summary.r_port).toFixed(6),
        );
        const allocationDrag = Number(
          (summary.r_spy_100 - summary.r_bench_blended).toFixed(6),
        );
        const payload = {
          summary,
          max_drawdown: maxDrawdown,
          drag: { vs_self: dragVsSelf, allocation: allocationDrag },
          money_weighted: {
            portfolio: moneyWeighted,
            benchmarks: moneyWeightedBenchmarks,
            ...moneyWeightedPeriod,
            method: "xirr",
            basis: "matched_external_flows",
            partial: moneyWeightedPartial,
          },
        };
        responseCache.set(cacheKey, payload);
        sendJsonWithEtag(req, res, payload, {
          cacheControl: cacheControlHeader,
        });
      } catch (error) {
        next(
          createHttpError({
            status: error.statusCode ?? 500,
            code: "BENCHMARKS_FETCH_FAILED",
            message: "Failed to fetch benchmark summary.",
            expose: false,
          }),
        );
      }
    },
  );
  app.post(
    "/api/admin/cash-rate",
    ensureCashFeature,
    validateCashRateBody,
    async (req, res, next) => {
      try {
        const { effective_date: effectiveDate, apy } = req.body;
        const storage = await getStorage();
        await storage.upsertRow(
          "cash_rates",
          { effective_date: effectiveDate, apy },
          ["effective_date"],
        );
        invalidateResponseCache("cash_rate_upsert");
        res.json({ status: "ok" });
      } catch (error) {
        next(
          createHttpError({
            status: error.statusCode ?? 500,
            code: "CASH_RATE_UPSERT_FAILED",
            message: "Failed to update cash rate.",
            expose: false,
          }),
        );
      }
    },
  );
  if (resolvedStaticDir) {
    app.use(express.static(resolvedStaticDir));
    if (spaFallback && spaIndexFile) {
      app.get(/^(?!\/api(?:\/|$)).*/u, (req, res, next) => {
        if (path.extname(req.path ?? "")) {
          next();
          return;
        }
        const accept = typeof req.headers.accept === "string"
          ? req.headers.accept
          : "";
        if (
          accept &&
          !accept.includes("text/html") &&
          !accept.includes("*/*")
        ) {
          next();
          return;
        }
        res.sendFile(spaIndexFile, (error) => {
          if (error) {
            next(error);
          }
        });
      });
    }
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error && typeof error === "object") {
      if (error.type === "entity.too.large") {
        error = createHttpError({
          status: 413,
          code: "PAYLOAD_TOO_LARGE",
          message: "Request payload too large.",
        });
      } else if (error.type === "entity.parse.failed") {
        error = createHttpError({
          status: 400,
          code: "INVALID_JSON",
          message: "Invalid JSON payload.",
          expose: true,
        });
      }
    }
    const status = error?.statusCode ?? error?.status ?? 500;
    const code =
      error?.code ?? (status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST");
    let message;
    if (status >= 500) {
      message = error?.expose
        ? (error?.message ?? "Unexpected server error")
        : "Unexpected server error";
    } else if (error?.expose === false) {
      message = "Request could not be processed";
    } else {
      message = error?.message ?? "Request could not be processed";
    }
    const details = status < 500 ? error?.details : undefined;
    const logMethod = status >= 500 ? "error" : "warn";
    const reqLogger = req.log ?? baseLogger;
    if (typeof reqLogger?.[logMethod] === "function") {
      reqLogger[logMethod](
        {
          error: error?.message,
          code,
          status,
          stack: status >= 500 ? error?.stack : undefined,
        },
        "request_error",
      );
    }
    const responseBody = { error: code, message };
    if (details !== undefined) {
      responseBody.details = details;
    }
    if (Array.isArray(error?.requirements) && error.requirements.length > 0) {
      responseBody.requirements = error.requirements;
    }
    res.status(status).json(responseBody);
  });
  return app;
}
