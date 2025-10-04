import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import path from 'path';

import { runMigrations } from './migrations/index.js';
import { summarizeReturns } from './finance/returns.js';
import { weightsFromState } from './finance/portfolio.js';

const DEFAULT_DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');
const DEFAULT_FETCH_TIMEOUT_MS = Number.parseInt(
  process.env.PRICE_FETCH_TIMEOUT_MS ?? '5000',
  10,
);

const DEFAULT_LOGGER = console;

const PORTFOLIO_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SYMBOL_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;

function createLogger(logger = DEFAULT_LOGGER) {
  return {
    info(message, meta = {}) {
      if (typeof logger.info === 'function') {
        logger.info(JSON.stringify({ level: 'info', message, ...meta }));
      } else if (typeof logger.log === 'function') {
        logger.log(JSON.stringify({ level: 'info', message, ...meta }));
      }
    },
    warn(message, meta = {}) {
      if (typeof logger.warn === 'function') {
        logger.warn(JSON.stringify({ level: 'warn', message, ...meta }));
      } else if (typeof logger.log === 'function') {
        logger.log(JSON.stringify({ level: 'warn', message, ...meta }));
      }
    },
    error(message, meta = {}) {
      if (typeof logger.error === 'function') {
        logger.error(JSON.stringify({ level: 'error', message, ...meta }));
      } else if (typeof logger.log === 'function') {
        logger.log(JSON.stringify({ level: 'error', message, ...meta }));
      }
    },
  };
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

function parseDateInput(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const error = new Error(`${name} must be YYYY-MM-DD`);
    error.statusCode = 400;
    throw error;
  }
  return value;
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

export function createApp({
  dataDir = DEFAULT_DATA_DIR,
  fetchImpl = fetch,
  logger = DEFAULT_LOGGER,
  fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  config = null,
} = {}) {
  const log = createLogger(logger);
  const featureFlags = config?.featureFlags ?? { cashBenchmarks: true };

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

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

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

  app.get('/returns/daily', ensureCashFeature, async (req, res) => {
    try {
      const from = req.query.from ? parseDateInput(req.query.from, 'from') : null;
      const to = req.query.to ? parseDateInput(req.query.to, 'to') : null;
      const storage = await getStorage();
      const rows = filterRowsByRange(await storage.readTable('returns_daily'), from, to);
      const series = {
        r_port: [],
        r_ex_cash: [],
        r_spy_100: [],
        r_bench_blended: [],
        r_cash: [],
      };
      for (const row of rows) {
        series.r_port.push({ date: row.date, value: row.r_port });
        series.r_ex_cash.push({ date: row.date, value: row.r_ex_cash });
        series.r_spy_100.push({ date: row.date, value: row.r_spy_100 });
        series.r_bench_blended.push({ date: row.date, value: row.r_bench_blended });
        series.r_cash.push({ date: row.date, value: row.r_cash });
      }
      res.json({ series });
    } catch (error) {
      log.error('returns_fetch_failed', { error: error.message });
      res.status(error.statusCode ?? 500).json({ error: error.message });
    }
  });

  app.get('/nav/daily', ensureCashFeature, async (req, res) => {
    try {
      const from = req.query.from ? parseDateInput(req.query.from, 'from') : null;
      const to = req.query.to ? parseDateInput(req.query.to, 'to') : null;
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
          weights,
        };
      });
      res.json({ data });
    } catch (error) {
      log.error('nav_fetch_failed', { error: error.message });
      res.status(error.statusCode ?? 500).json({ error: error.message });
    }
  });

  app.get('/benchmarks/summary', ensureCashFeature, async (req, res) => {
    try {
      const from = req.query.from ? parseDateInput(req.query.from, 'from') : null;
      const to = req.query.to ? parseDateInput(req.query.to, 'to') : null;
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
      log.error('benchmarks_fetch_failed', { error: error.message });
      res.status(error.statusCode ?? 500).json({ error: error.message });
    }
  });

  app.post('/admin/cash-rate', ensureCashFeature, async (req, res) => {
    try {
      const payload = req.body;
      if (!isPlainObject(payload)) {
        throw new Error('Payload must be an object');
      }
      const effectiveDate = parseDateInput(payload.effective_date, 'effective_date');
      const apy = Number.parseFloat(payload.apy);
      if (!Number.isFinite(apy)) {
        const error = new Error('apy must be numeric');
        error.statusCode = 400;
        throw error;
      }
      const storage = await getStorage();
      await storage.upsertRow(
        'cash_rates',
        { effective_date: effectiveDate, apy },
        ['effective_date'],
      );
      res.json({ status: 'ok' });
    } catch (error) {
      log.error('cash_rate_upsert_failed', { error: error.message });
      res.status(error.statusCode ?? 500).json({ error: error.message });
    }
  });

  return app;
}
