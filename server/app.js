import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

import pino from 'pino';
import pinoHttp from 'pino-http';
import { z } from 'zod';

import { runMigrations } from './migrations/index.js';
import { summarizeReturns } from './finance/returns.js';
import { weightsFromState } from './finance/portfolio.js';

const DEFAULT_DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');
const DEFAULT_FETCH_TIMEOUT_MS = Number.parseInt(
  process.env.PRICE_FETCH_TIMEOUT_MS ?? '5000',
  10,
);

const DEFAULT_LOGGER = pino({ level: process.env.LOG_LEVEL ?? 'info' });

const PORTFOLIO_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SYMBOL_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;

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

function isPlainObject(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value.constructor === Object || Object.getPrototypeOf(value) === null)
  );
}

export function isValidPortfolioId(id) {
  return PORTFOLIO_ID_PATTERN.test(id);
}

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Must be ISO date (YYYY-MM-DD)');

const returnsQuerySchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    views: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) {
          return ['port', 'excash', 'spy', 'bench'];
        }
        return value
          .split(',')
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean);
      }),
  })
  .transform((query) => ({
    ...query,
    views: Array.from(new Set(query.views)),
  }));

const rangeQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

const cashRateSchema = z.object({
  effective_date: dateSchema,
  apy: z.number({ invalid_type_error: 'apy must be numeric' }),
});

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

export function createApp({
  dataDir = DEFAULT_DATA_DIR,
  fetchImpl = fetch,
  logger = DEFAULT_LOGGER,
  fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  config = null,
} = {}) {
  const baseLogger = adaptLogger(logger) ?? DEFAULT_LOGGER;
  const log = typeof baseLogger.child === 'function'
    ? baseLogger.child({ module: 'app' })
    : baseLogger;
  const featureFlags = config?.featureFlags ?? { cashBenchmarks: true };
  const allowedOrigins = config?.cors?.allowedOrigins ?? [];

  fs.mkdir(dataDir, { recursive: true }).catch((error) => {
    log.error('failed_to_ensure_data_directory', {
      error: error.message,
      dataDir,
    });
  });

  let storagePromise;
  const getStorage = async () => {
    if (!storagePromise) {
      storagePromise = runMigrations({ dataDir, logger: log });
    }
    return storagePromise;
  };

  const app = express();

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
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '10mb' }));

  const priceLimiter = rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/prices', priceLimiter);

  async function fetchHistoricalPrices(symbol, range = '1y') {
    if (!SYMBOL_PATTERN.test(symbol)) {
      const error = new Error('Invalid symbol');
      error.code = 'ERR_INVALID_SYMBOL';
      throw error;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
    try {
      const urlSymbol = symbol.toLowerCase().replace('.', '').replace('/', '');
      const url = `https://stooq.com/q/d/l/?s=${urlSymbol}&i=d`;
      const res = await fetchImpl(url, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`Failed to fetch price for ${symbol}`);
      }
      const csv = await res.text();
      const lines = csv.trim().split('\n');
      const result = [];
      for (let i = 1; i < lines.length; i += 1) {
        const parts = lines[i].split(',');
        if (parts.length < 5) {
          continue;
        }
        const date = parts[0];
        const closeValue = Number.parseFloat(parts[4]);
        if (Number.isFinite(closeValue) && date) {
          result.push({ date, close: closeValue });
        }
      }
      result.sort((a, b) => a.date.localeCompare(b.date));
      if (range === '1y') {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        return result.filter(({ date }) => new Date(`${date}T00:00:00Z`) >= oneYearAgo);
      }
      return result;
    } catch (error) {
      const message = error.name === 'AbortError' ? 'price_fetch_timeout' : 'price_fetch_failed';
      log.error(message, {
        error: error.message,
        symbol,
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  app.use('/api/portfolio/:id', (req, res, next) => {
    const { id } = req.params;
    if (!isValidPortfolioId(id)) {
      log.warn('invalid_portfolio_id', { id });
      res.status(400).json({
        error: 'Invalid portfolio id. Use letters, numbers, hyphen or underscore.',
      });
      return;
    }
    next();
  });

  app.get('/api/prices/:symbol', async (req, res) => {
    const { symbol } = req.params;
    const { range } = req.query;
    try {
      const prices = await fetchHistoricalPrices(symbol, range ?? '1y');
      res.json(prices);
    } catch (error) {
      const status = error.code === 'ERR_INVALID_SYMBOL' ? 400 : 502;
      res.status(status).json({ error: 'Failed to fetch historical prices' });
    }
  });

  app.get('/api/portfolio/:id', async (req, res) => {
    const { id } = req.params;
    const filePath = path.join(dataDir, `portfolio_${id}.json`);
    try {
      const data = await fs.readFile(filePath, 'utf8');
      res.json(JSON.parse(data));
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.json({});
        return;
      }
      log.error('portfolio_read_failed', { id, error: error.message });
      res.status(500).json({ error: 'Failed to load portfolio' });
    }
  });

  app.post('/api/portfolio/:id', async (req, res) => {
    const { id } = req.params;
    const filePath = path.join(dataDir, `portfolio_${id}.json`);
    const payload = req.body;
    if (!isPlainObject(payload)) {
      log.warn('invalid_portfolio_payload', { id, payloadType: typeof payload });
      res.status(400).json({ error: 'Portfolio payload must be a JSON object.' });
      return;
    }
    try {
      await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      res.json({ status: 'ok' });
    } catch (error) {
      log.error('portfolio_write_failed', { id, error: error.message });
      res.status(500).json({ error: 'Failed to save portfolio' });
    }
  });

  function ensureCashFeature(req, res, next) {
    if (!featureFlags.cashBenchmarks) {
      res.status(404).json({ error: 'cash_benchmarks_disabled' });
      return;
    }
    next();
  }

  app.get('/api/returns/daily', ensureCashFeature, async (req, res) => {
    try {
      const parsed = returnsQuerySchema.parse(req.query ?? {});
      const { from = null, to = null, views } = parsed;
      const storage = await getStorage();
      const rows = filterRowsByRange(await storage.readTable('returns_daily'), from, to);
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
        series[key] = rows.map((row) => ({ date: row.date, value: row[key] }));
      }
      series.r_cash = rows.map((row) => ({ date: row.date, value: row.r_cash }));
      if (!Object.keys(series).length) {
        series.r_port = rows.map((row) => ({ date: row.date, value: row.r_port }));
      }
      res.json({ series });
    } catch (error) {
      const message = error instanceof z.ZodError ? 'validation_failed' : 'returns_fetch_failed';
      log.error(message, { error: error.message });
      res.status(error instanceof z.ZodError ? 400 : error.statusCode ?? 500).json({
        error: error instanceof z.ZodError ? error.errors : error.message,
      });
    }
  });

  app.get('/api/nav/daily', ensureCashFeature, async (req, res) => {
    try {
      const { from = null, to = null } = rangeQuerySchema.parse(req.query ?? {});
      const storage = await getStorage();
      const rows = filterRowsByRange(await storage.readTable('nav_snapshots'), from, to);
      const data = rows.map((row) => {
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
      res.json({ data });
    } catch (error) {
      const message = error instanceof z.ZodError ? 'validation_failed' : 'nav_fetch_failed';
      log.error(message, { error: error.message });
      res.status(error instanceof z.ZodError ? 400 : error.statusCode ?? 500).json({
        error: error instanceof z.ZodError ? error.errors : error.message,
      });
    }
  });

  app.get('/api/benchmarks/summary', ensureCashFeature, async (req, res) => {
    try {
      const { from = null, to = null } = rangeQuerySchema.parse(req.query ?? {});
      const storage = await getStorage();
      const rows = filterRowsByRange(await storage.readTable('returns_daily'), from, to);
      const summary = summarizeReturns(rows);
      const dragVsSelf = Number((summary.r_ex_cash - summary.r_port).toFixed(6));
      const allocationDrag = Number(
        (summary.r_spy_100 - summary.r_bench_blended).toFixed(6),
      );
      res.json({
        summary,
        drag: {
          vs_self: dragVsSelf,
          allocation: allocationDrag,
        },
      });
    } catch (error) {
      const message = error instanceof z.ZodError
        ? 'validation_failed'
        : 'benchmarks_fetch_failed';
      log.error(message, { error: error.message });
      res.status(error instanceof z.ZodError ? 400 : error.statusCode ?? 500).json({
        error: error instanceof z.ZodError ? error.errors : error.message,
      });
    }
  });

  app.post('/api/admin/cash-rate', ensureCashFeature, async (req, res) => {
    try {
      const payload = isPlainObject(req.body) ? req.body : {};
      const { effective_date: effectiveDate, apy } = cashRateSchema.parse(payload);
      const storage = await getStorage();
      await storage.upsertRow(
        'cash_rates',
        { effective_date: effectiveDate, apy },
        ['effective_date'],
      );
      res.json({ status: 'ok' });
    } catch (error) {
      const message = error instanceof z.ZodError
        ? 'validation_failed'
        : 'cash_rate_upsert_failed';
      log.error(message, { error: error.message });
      res.status(error instanceof z.ZodError ? 400 : error.statusCode ?? 500).json({
        error: error instanceof z.ZodError ? error.errors : error.message,
      });
    }
  });

  app.use((error, req, res, next) => {
    if (error?.message === 'Not allowed by CORS') {
      res.status(403).json({ error: 'cors_not_allowed' });
      return;
    }
    next(error);
  });

  return app;
}
