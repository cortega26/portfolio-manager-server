import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fetch from 'node-fetch';
import NodeCache from 'node-cache';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';

import pino from 'pino';
import pinoHttp from 'pino-http';

import { runMigrations } from './migrations/index.js';
import { summarizeReturns } from './finance/returns.js';
import { sortTransactions, weightsFromState } from './finance/portfolio.js';
import { toDateKey } from './finance/cash.js';
import {
  d,
  fromMicroShares,
  roundDecimal,
  toMicroShares,
} from './finance/decimal.js';
import {
  DualPriceProvider,
  YahooPriceProvider,
  StooqPriceProvider,
} from './data/prices.js';
import {
  validateCashRateBody,
  validatePortfolioBody,
  validatePortfolioIdParam,
  validateRangeQuery,
  validateReturnsQuery,
} from './middleware/validation.js';
import { atomicWriteFile } from './utils/atomicStore.js';
import { withLock } from './utils/locks.js';
import { computeTradingDayAge } from './utils/calendar.js';

const DEFAULT_DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');
const DEFAULT_FETCH_TIMEOUT_MS = Number.parseInt(
  process.env.PRICE_FETCH_TIMEOUT_MS ?? '5000',
  10,
);

const DEFAULT_LOGGER = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const DEFAULT_CACHE_TTL_SECONDS = (() => {
  const raw = Number.parseInt(process.env.API_CACHE_TTL_SECONDS ?? '600', 10);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 600;
  }
  return Math.max(300, Math.min(900, Math.round(raw)));
})();

const PORTFOLIO_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SYMBOL_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;

function createHttpError({ status = 500, code = 'INTERNAL_ERROR', message, details, expose }) {
  const error = new Error(
    message ?? (status >= 500 ? 'Unexpected server error' : 'Request could not be processed'),
  );
  error.status = status;
  error.statusCode = status;
  error.code = code;
  if (details !== undefined) {
    error.details = details;
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
  if (typeof logger.child === 'function') {
    return logger;
  }
  const safe = {
    info(message, meta = {}) {
      if (typeof logger.info === 'function') {
        logger.info({ message, ...meta });
      } else if (typeof logger.log === 'function') {
        logger.log({ level: 'info', message, ...meta });
      }
    },
    warn(message, meta = {}) {
      if (typeof logger.warn === 'function') {
        logger.warn({ message, ...meta });
      } else if (typeof logger.log === 'function') {
        logger.log({ level: 'warn', message, ...meta });
      }
    },
    error(message, meta = {}) {
      if (typeof logger.error === 'function') {
        logger.error({ message, ...meta });
      } else if (typeof logger.log === 'function') {
        logger.log({ level: 'error', message, ...meta });
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
  const normalizedPerPage = Number.isFinite(perPage) && perPage > 0 ? perPage : 100;
  const totalPages = total === 0 ? 0 : Math.ceil(total / normalizedPerPage);
  const safePage = totalPages === 0 ? Math.max(1, page) : Math.min(Math.max(1, page), totalPages);
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

function computeEtag(serializedBody) {
  return createHash('sha256').update(serializedBody).digest('base64url');
}

function sendJsonWithEtag(req, res, payload, { cacheControl } = {}) {
  const serialized = JSON.stringify(payload);
  const etag = computeEtag(serialized);
  if (cacheControl) {
    res.set('Cache-Control', cacheControl);
  }
  if (req.headers['if-none-match'] === etag) {
    res.set('ETag', etag);
    res.status(304).end();
    return;
  }
  res.set('ETag', etag);
  res.type('application/json').send(serialized);
}

export function createApp({
  dataDir = DEFAULT_DATA_DIR,
  fetchImpl = fetch,
  logger = DEFAULT_LOGGER,
  fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  config = null,
  priceProvider = null,
} = {}) {
  const baseLogger = adaptLogger(logger) ?? DEFAULT_LOGGER;
  const log = typeof baseLogger.child === 'function'
    ? baseLogger.child({ module: 'app' })
    : baseLogger;
  const featureFlags = config?.featureFlags ?? { cashBenchmarks: true };
  const allowedOrigins = config?.cors?.allowedOrigins ?? [];
  const cacheTtlSeconds = (() => {
    const override = config?.cache?.ttlSeconds;
    if (Number.isFinite(override) && override > 0) {
      return Math.round(override);
    }
    return DEFAULT_CACHE_TTL_SECONDS;
  })();
  const cacheControlHeader = `private, max-age=${cacheTtlSeconds}`;
  const maxStaleTradingDays = (() => {
    const override = config?.freshness?.maxStaleTradingDays;
    if (Number.isFinite(override) && override >= 0) {
      return Math.round(override);
    }
    return 3;
  })();
  const dataDirectory = path.resolve(dataDir);

  fs.mkdir(dataDirectory, { recursive: true }).catch((error) => {
    log.error('failed_to_ensure_data_directory', {
      error: error.message,
      dataDir: dataDirectory,
    });
  });

  const responseCache = new NodeCache({
    stdTTL: cacheTtlSeconds,
    checkperiod: Math.max(30, Math.floor(cacheTtlSeconds / 2)),
    useClones: false,
  });

  const priceLogger = typeof log.child === 'function'
    ? log.child({ module: 'price_provider' })
    : log;
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
  });
  const priceProviderInstance = priceProvider ?? compositePriceProvider;

  const portfolioKeyCache = new Map();

  function digestPortfolioKey(rawKey) {
    return createHash('sha256').update(rawKey).digest();
  }

  function hashPortfolioKey(rawKey) {
    return digestPortfolioKey(rawKey).toString('hex');
  }

  function normalizeKey(value) {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : '';
  }

  async function readPortfolioKeyHash(portfolioId) {
    if (portfolioKeyCache.has(portfolioId)) {
      return portfolioKeyCache.get(portfolioId);
    }
    const storage = await getStorage();
    const rows = await storage.readTable('portfolio_keys');
    const record = rows.find((row) => row.id === portfolioId);
    const hash = typeof record?.hash === 'string' ? record.hash : null;
    portfolioKeyCache.set(portfolioId, hash);
    return hash;
  }

  async function writePortfolioKeyHash(portfolioId, hash) {
    await withLock(`portfolio-key:${portfolioId}`, async () => {
      const storage = await getStorage();
      if (hash) {
        await storage.upsertRow(
          'portfolio_keys',
          {
            id: portfolioId,
            hash,
            updated_at: new Date().toISOString(),
          },
          ['id'],
        );
      } else {
        await storage.deleteWhere('portfolio_keys', (row) => row.id === portfolioId);
      }
    });
    portfolioKeyCache.set(portfolioId, hash ?? null);
  }

  function createPortfolioKeyVerifier({ allowBootstrap = false, allowRotation = false } = {}) {
    return async (req, _res, next) => {
      const { id: portfolioId } = req.params ?? {};
      const providedKey = normalizeKey(req.get('x-portfolio-key'));
      const rotationKey = normalizeKey(req.get('x-portfolio-key-new'));

      try {
        const storedHash = await readPortfolioKeyHash(portfolioId);

        if (!storedHash) {
          if (!providedKey) {
            next(
              createHttpError({
                status: 401,
                code: 'NO_KEY',
                message: 'Portfolio key required.',
                expose: true,
              }),
            );
            return;
          }
          if (!allowBootstrap) {
            next(
              createHttpError({
                status: 404,
                code: 'PORTFOLIO_NOT_FOUND',
                message: 'Portfolio not provisioned.',
              }),
            );
            return;
          }

          const hashed = hashPortfolioKey(providedKey);
          await writePortfolioKeyHash(portfolioId, hashed);
          if (!req.portfolioAuth) {
            req.portfolioAuth = {};
          }
          req.portfolioAuth.bootstrapped = true;
          log.info('portfolio_key_bootstrapped', { id: portfolioId });
          next();
          return;
        }

        if (!providedKey) {
          next(
            createHttpError({
              status: 401,
              code: 'NO_KEY',
              message: 'Portfolio key required.',
              expose: true,
            }),
          );
          return;
        }

        const storedBuffer = Buffer.from(storedHash, 'hex');
        const providedDigest = digestPortfolioKey(providedKey);
        if (
          storedBuffer.length !== providedDigest.length
          || !timingSafeEqual(storedBuffer, providedDigest)
        ) {
          log.warn('portfolio_key_invalid', { id: portfolioId });
          next(
            createHttpError({
              status: 403,
              code: 'INVALID_KEY',
              message: 'Invalid portfolio key.',
              expose: true,
            }),
          );
          return;
        }

        if (allowRotation && rotationKey) {
          const newHash = hashPortfolioKey(rotationKey);
          if (newHash !== storedHash) {
            await writePortfolioKeyHash(portfolioId, newHash);
            if (!req.portfolioAuth) {
              req.portfolioAuth = {};
            }
            req.portfolioAuth.rotated = true;
            log.info('portfolio_key_rotated', { id: portfolioId });
          }
        }

        next();
      } catch (error) {
        log.error('portfolio_key_verification_failed', {
          id: portfolioId,
          error: error.message,
        });
        next(
          createHttpError({
            status: 500,
            code: 'KEY_VERIFICATION_FAILED',
            message: 'Failed to verify portfolio key.',
            expose: false,
          }),
        );
      }
    };
  }

  function resolvePortfolioFilePath(portfolioId) {
    const candidate = path.resolve(dataDirectory, `portfolio_${portfolioId}.json`);
    const relative = path.relative(dataDirectory, candidate);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw createHttpError({
        status: 400,
        code: 'INVALID_PORTFOLIO_ID',
        message: 'Invalid portfolio identifier.',
        expose: true,
      });
    }
    return candidate;
  }

  function ensureTransactionUids(transactions, portfolioId) {
    const seen = new Set();
    const deduplicated = [];
    const duplicates = new Set();
    for (const transaction of transactions) {
      const rawUid = typeof transaction.uid === 'string' ? transaction.uid.trim() : '';
      const uid = rawUid ? rawUid : randomUUID();
      if (seen.has(uid)) {
        duplicates.add(uid);
        continue;
      }
      seen.add(uid);
      deduplicated.push({ ...transaction, uid });
    }
    if (duplicates.size > 0) {
      log.warn('duplicate_transaction_uids_filtered', {
        id: portfolioId,
        duplicates: Array.from(duplicates),
      });
    }
    return deduplicated;
  }

  function enforceOversellPolicy(transactions, { portfolioId, autoClip }) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return;
    }

    const holdingsMicro = new Map();
    const ordered = sortTransactions(transactions);

    for (const tx of ordered) {
      if (!tx || typeof tx !== 'object') {
        continue;
      }
      const ticker = tx.ticker;
      if (!ticker || ticker === 'CASH') {
        continue;
      }
      if (tx.type === 'BUY') {
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
        holdingsMicro.set(ticker, current + micro);
        continue;
      }

      if (tx.type !== 'SELL') {
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
      if (requestedMicro <= availableMicro) {
        holdingsMicro.set(ticker, availableMicro - requestedMicro);
        continue;
      }

      const requestedShares = roundDecimal(fromMicroShares(requestedMicro), 6).toNumber();
      const availableShares = roundDecimal(fromMicroShares(availableMicro), 6).toNumber();

      if (!autoClip) {
        log.warn('oversell_rejected', {
          id: portfolioId,
          ticker,
          date: tx.date,
          requested_shares: requestedShares,
          available_shares: availableShares,
        });
        throw createHttpError({
          status: 400,
          code: 'E_OVERSELL',
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
      const clippedSharesDecimal = roundDecimal(fromMicroShares(clippedMicro), 6);
      const clippedShares = clippedSharesDecimal.toNumber();
      const originalShares = Number.isFinite(tx.shares)
        ? Math.abs(tx.shares)
        : requestedShares;

      let adjustedAmount = 0;
      if (originalShares > 0 && Number.isFinite(tx.amount) && tx.amount !== 0) {
        const perShare = d(Math.abs(tx.amount)).div(originalShares);
        const newAmountDecimal = perShare.times(clippedSharesDecimal);
        const signedAmount = tx.amount >= 0 ? newAmountDecimal : newAmountDecimal.neg();
        adjustedAmount = roundDecimal(signedAmount, 6).toNumber();
      }
      if (clippedShares === 0) {
        adjustedAmount = 0;
      }

      tx.quantity = clippedShares === 0 ? 0 : -clippedShares;
      tx.shares = clippedShares;
      tx.amount = adjustedAmount;

      const metadata = tx.metadata && typeof tx.metadata === 'object' ? { ...tx.metadata } : {};
      const systemMeta = metadata.system && typeof metadata.system === 'object'
        ? { ...metadata.system }
        : {};
      systemMeta.oversell_clipped = {
        requested_shares: requestedShares,
        available_shares: availableShares,
        delivered_shares: clippedShares,
      };
      metadata.system = systemMeta;
      tx.metadata = metadata;

      holdingsMicro.set(ticker, 0);

      log.warn('oversell_clipped', {
        id: portfolioId,
        ticker,
        date: tx.date,
        requested_shares: requestedShares,
        delivered_shares: clippedShares,
      });
    }
  }

  let storagePromise;
  const getStorage = async () => {
    if (!storagePromise) {
      storagePromise = runMigrations({ dataDir, logger: log });
    }
    return storagePromise;
  };

  const app = express();

  app.disable('x-powered-by');

  const httpLogger = pinoHttp({
    logger: DEFAULT_LOGGER,
    genReqId(req) {
      return req.headers['x-request-id'] ?? randomUUID();
    },
    customSuccessMessage() {
      return 'request_complete';
    },
    customErrorMessage() {
      return 'request_error';
    },
  });

  app.use(httpLogger);
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'base-uri': ["'self'"],
          'script-src': ["'self'"],
          'frame-ancestors': ["'none'"],
          'connect-src': ["'self'"],
        },
      },
      frameguard: { action: 'deny' },
      hsts: { maxAge: 15552000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  const allowedOriginSet = new Set(allowedOrigins);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (allowedOriginSet.has(origin)) {
          callback(null, true);
          return;
        }
        callback(
          createHttpError({
            status: 403,
            code: 'CORS_NOT_ALLOWED',
            message: 'Origin not allowed by CORS policy',
          }),
        );
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: false,
    }),
  );
  app.use(express.json({ limit: '10mb' }));

  const generalLimiter = rateLimit({
    windowMs: 60_000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const portfolioLimiter = rateLimit({
    windowMs: 60_000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api', generalLimiter);
  app.use(['/api/portfolio', '/api/returns', '/api/nav'], portfolioLimiter);

  const priceLimiter = rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/prices', priceLimiter);

  async function fetchHistoricalPrices(symbol, range = '1y') {
    if (!SYMBOL_PATTERN.test(symbol)) {
      throw createHttpError({
        status: 400,
        code: 'INVALID_SYMBOL',
        message: 'Invalid symbol.',
      });
    }

    const normalizedRange = typeof range === 'string' && range.trim() ? range : '1y';
    const normalizedSymbol = symbol.trim().toUpperCase();
    const cacheKey = `prices:${normalizedSymbol}:${normalizedRange}`;
    const cached = responseCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const today = new Date();
    const toDate = toDateKey(today);
    let fromDate = '1900-01-01';
    if (normalizedRange === '1y') {
      const oneYearAgo = new Date(today);
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      fromDate = toDateKey(oneYearAgo);
    }

    try {
      const fetched = await priceProviderInstance.getDailyAdjustedClose(
        normalizedSymbol,
        fromDate,
        toDate,
      );
      const sorted = [...fetched]
        .filter((item) => item.date && Number.isFinite(Number(item.adjClose)))
        .map((item) => ({ date: item.date, close: Number(item.adjClose) }))
        .sort((a, b) => a.date.localeCompare(b.date));
      responseCache.set(cacheKey, sorted);
      return sorted;
    } catch (error) {
      if (error.name === 'AbortError') {
        const timeoutError = createHttpError({
          status: 504,
          code: 'UPSTREAM_TIMEOUT',
          message: 'Price fetch timed out.',
        });
        log.error('price_fetch_timeout', {
          error: error.message,
          symbol,
        });
        throw timeoutError;
      }
      log.error('price_fetch_failed', {
        error: error.message,
        symbol,
      });
      if (error.statusCode) {
        throw error;
      }
      throw createHttpError({
        status: 502,
        code: 'PRICE_FETCH_FAILED',
        message: 'Failed to fetch historical prices.',
        expose: true,
      });
    }
  }

  const requirePortfolioKeyRead = createPortfolioKeyVerifier();
  const requirePortfolioKeyWrite = createPortfolioKeyVerifier({
    allowBootstrap: true,
    allowRotation: true,
  });

  const validatePortfolioId = (req, res, next) => {
    validatePortfolioIdParam(req, res, (error) => {
      if (error) {
        log.warn('invalid_portfolio_id', { id: req.params?.id });
        next(error);
        return;
      }
      next();
    });
  };

  app.get('/api/prices/:symbol', async (req, res, next) => {
    const { symbol } = req.params;
    const { range } = req.query;
    try {
      const prices = await fetchHistoricalPrices(symbol, range ?? '1y');
      const latestDate = prices.length > 0 ? prices[prices.length - 1].date : null;
      const tradingDayAge = computeTradingDayAge(latestDate);
      if (!latestDate || tradingDayAge > maxStaleTradingDays) {
        log.warn('stale_price_data', {
          symbol,
          latest_date: latestDate,
          trading_days_age: tradingDayAge,
          threshold_trading_days: maxStaleTradingDays,
        });
        res.status(503).json({ error: 'STALE_DATA' });
        return;
      }
      sendJsonWithEtag(req, res, prices, { cacheControl: cacheControlHeader });
    } catch (error) {
      if (error.statusCode) {
        next(error);
        return;
      }
      next(
        createHttpError({
          status: 502,
          code: 'PRICE_FETCH_FAILED',
          message: 'Failed to fetch historical prices.',
        }),
      );
    }
  });

  app.get(
    '/api/portfolio/:id',
    validatePortfolioId,
    requirePortfolioKeyRead,
    async (req, res, next) => {
      const { id } = req.params;
      let filePath;
      try {
        filePath = resolvePortfolioFilePath(id);
      } catch (error) {
        next(error);
        return;
      }
      try {
        const data = await fs.readFile(filePath, 'utf8');
        res.json(JSON.parse(data));
      } catch (error) {
        if (error.code === 'ENOENT') {
          res.json({});
          return;
        }
        log.error('portfolio_read_failed', { id, error: error.message });
        next(
          createHttpError({
            status: 500,
            code: 'PORTFOLIO_READ_FAILED',
            message: 'Failed to load portfolio.',
            expose: false,
          }),
        );
      }
    },
  );

  app.post(
    '/api/portfolio/:id',
    validatePortfolioId,
    requirePortfolioKeyWrite,
    validatePortfolioBody,
    async (req, res, next) => {
      const { id } = req.params;
      let filePath;
      try {
        filePath = resolvePortfolioFilePath(id);
      } catch (error) {
        next(error);
        return;
      }
      const payload = req.body;
      const autoClip = Boolean(payload.settings?.autoClip);
      const normalizedTransactions = ensureTransactionUids(payload.transactions ?? [], id);
      try {
        enforceOversellPolicy(normalizedTransactions, { portfolioId: id, autoClip });
      } catch (error) {
        next(error);
        return;
      }
      const normalizedPayload = {
        ...payload,
        transactions: normalizedTransactions,
        settings: { autoClip },
      };
      const serialized = `${JSON.stringify(normalizedPayload, null, 2)}\n`;
      try {
        await withLock(`portfolio:${id}`, async () => {
          await atomicWriteFile(filePath, serialized);
        });
        res.json({ status: 'ok' });
      } catch (error) {
        log.error('portfolio_write_failed', { id, error: error.message });
        next(
          createHttpError({
            status: 500,
            code: 'PORTFOLIO_WRITE_FAILED',
            message: 'Failed to save portfolio.',
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
          code: 'CASH_BENCHMARKS_DISABLED',
          message: 'Cash benchmarks feature is disabled.',
        }),
      );
      return;
    }
    next();
  }

  app.get(
    '/api/returns/daily',
    ensureCashFeature,
    validateReturnsQuery,
    async (req, res, next) => {
      try {
        const { from, to, views, page, perPage } = req.query;
        const storage = await getStorage();
        const rows = filterRowsByRange(await storage.readTable('returns_daily'), from, to);
        const { items, meta } = paginateRows(rows, { page, perPage });
        const mapping = {
          port: 'r_port',
          excash: 'r_ex_cash',
          spy: 'r_spy_100',
          bench: 'r_bench_blended',
        };
        const series = {};
        for (const view of views) {
          const key = mapping[view];
          if (!key) {
            continue;
          }
          series[key] = items.map((row) => ({ date: row.date, value: row[key] }));
        }
        series.r_cash = items.map((row) => ({ date: row.date, value: row.r_cash }));
        if (!Object.keys(series).length) {
          series.r_port = items.map((row) => ({ date: row.date, value: row.r_port }));
        }
        const payload = { series, meta };
        const cacheKey = [
          'returns',
          from ?? '',
          to ?? '',
          views.slice().sort().join(','),
          page,
          perPage,
        ].join(':');
        const cached = responseCache.get(cacheKey);
        if (cached) {
          sendJsonWithEtag(req, res, cached, { cacheControl: cacheControlHeader });
          return;
        }
        responseCache.set(cacheKey, payload);
        sendJsonWithEtag(req, res, payload, { cacheControl: cacheControlHeader });
      } catch (error) {
        next(
          createHttpError({
            status: error.statusCode ?? 500,
            code: 'RETURNS_FETCH_FAILED',
            message: 'Failed to fetch returns.',
            expose: false,
          }),
        );
      }
    },
  );

  app.get('/api/nav/daily', ensureCashFeature, validateRangeQuery, async (req, res, next) => {
    try {
      const { from, to, page, perPage } = req.query;
      const storage = await getStorage();
      const rows = filterRowsByRange(await storage.readTable('nav_snapshots'), from, to);
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
      const cacheKey = ['nav', from ?? '', to ?? '', page, perPage].join(':');
      const cached = responseCache.get(cacheKey);
      if (cached) {
        sendJsonWithEtag(req, res, cached, { cacheControl: cacheControlHeader });
        return;
      }
      responseCache.set(cacheKey, payload);
      sendJsonWithEtag(req, res, payload, { cacheControl: cacheControlHeader });
    } catch (error) {
      next(
        createHttpError({
          status: error.statusCode ?? 500,
          code: 'NAV_FETCH_FAILED',
          message: 'Failed to fetch NAV data.',
          expose: false,
        }),
      );
    }
  });

  app.get('/api/benchmarks/summary', ensureCashFeature, validateRangeQuery, async (req, res, next) => {
    try {
      const { from, to } = req.query;
      const storage = await getStorage();
      const cacheKey = ['benchmarks', from ?? '', to ?? ''].join(':');
      const rows = filterRowsByRange(await storage.readTable('returns_daily'), from, to);
      const todayKey = toDateKey(new Date());
      let referenceKey = to ? toDateKey(to) : todayKey;
      if (referenceKey > todayKey) {
        referenceKey = todayKey;
      }
      const latestDate = rows.reduce(
        (acc, row) => (acc && acc > row.date ? acc : row.date),
        null,
      );
      const referenceDate = new Date(`${referenceKey}T00:00:00Z`);
      const tradingDayAge = computeTradingDayAge(latestDate, referenceDate);
      if (!latestDate || tradingDayAge > maxStaleTradingDays) {
        log.warn('stale_benchmark_data', {
          latest_date: latestDate,
          reference_date: referenceKey,
          trading_days_age: tradingDayAge,
          threshold_trading_days: maxStaleTradingDays,
        });
        res.status(503).json({ error: 'STALE_DATA' });
        return;
      }
      const cached = responseCache.get(cacheKey);
      if (cached) {
        sendJsonWithEtag(req, res, cached, { cacheControl: cacheControlHeader });
        return;
      }
      const summary = summarizeReturns(rows);
      const dragVsSelf = Number((summary.r_ex_cash - summary.r_port).toFixed(6));
      const allocationDrag = Number(
        (summary.r_spy_100 - summary.r_bench_blended).toFixed(6),
      );
      const payload = {
        summary,
        drag: {
          vs_self: dragVsSelf,
          allocation: allocationDrag,
        },
      };
      responseCache.set(cacheKey, payload);
      sendJsonWithEtag(req, res, payload, { cacheControl: cacheControlHeader });
    } catch (error) {
      next(
        createHttpError({
          status: error.statusCode ?? 500,
          code: 'BENCHMARKS_FETCH_FAILED',
          message: 'Failed to fetch benchmark summary.',
          expose: false,
        }),
      );
    }
  });

  app.post(
    '/api/admin/cash-rate',
    ensureCashFeature,
    validateCashRateBody,
    async (req, res, next) => {
      try {
        const { effective_date: effectiveDate, apy } = req.body;
        const storage = await getStorage();
        await storage.upsertRow(
          'cash_rates',
          { effective_date: effectiveDate, apy },
          ['effective_date'],
        );
        res.json({ status: 'ok' });
      } catch (error) {
        next(
          createHttpError({
            status: error.statusCode ?? 500,
            code: 'CASH_RATE_UPSERT_FAILED',
            message: 'Failed to update cash rate.',
            expose: false,
          }),
        );
      }
    },
  );

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    if (error && typeof error === 'object' && !error.statusCode) {
      if (error.type === 'entity.too.large') {
        error = createHttpError({
          status: 413,
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request payload too large.',
        });
      } else if (error.type === 'entity.parse.failed') {
        error = createHttpError({
          status: 400,
          code: 'INVALID_JSON',
          message: 'Invalid JSON payload.',
          expose: true,
        });
      }
    }

    const status = error?.statusCode ?? error?.status ?? 500;
    const code = error?.code ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
    let message;
    if (status >= 500) {
      message = error?.expose ? error?.message ?? 'Unexpected server error' : 'Unexpected server error';
    } else if (error?.expose === false) {
      message = 'Request could not be processed';
    } else {
      message = error?.message ?? 'Request could not be processed';
    }
    const details = status < 500 ? error?.details : undefined;

    const logMethod = status >= 500 ? 'error' : 'warn';
    const reqLogger = req.log ?? baseLogger;
    if (typeof reqLogger?.[logMethod] === 'function') {
      reqLogger[logMethod](
        {
          error: error?.message,
          code,
          status,
          stack: status >= 500 ? error?.stack : undefined,
        },
        'request_error',
      );
    }

    const responseBody = { error: code, message };
    if (details !== undefined) {
      responseBody.details = details;
    }

    res.status(status).json(responseBody);
  });

  return app;
}
