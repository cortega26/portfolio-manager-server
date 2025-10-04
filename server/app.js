import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import path from 'path';

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

export function createApp({
  dataDir = DEFAULT_DATA_DIR,
  fetchImpl = fetch,
  logger = DEFAULT_LOGGER,
  fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
} = {}) {
  const log = createLogger(logger);

  fs.mkdir(dataDir, { recursive: true }).catch((error) => {
    log.error('failed_to_ensure_data_directory', {
      error: error.message,
      dataDir,
    });
  });

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
        const [, , , , close] = lines[i].split(',');
        const date = lines[i].split(',')[0];
        const closeValue = Number.parseFloat(close);
        if (Number.isFinite(closeValue) && date) {
          result.push({ date, close: closeValue });
        }
      }
      result.sort((a, b) => new Date(a.date) - new Date(b.date));
      if (range === '1y') {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        return result.filter(({ date }) => new Date(date) >= oneYearAgo);
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
      res.status(400).json({ error: 'Invalid portfolio id. Use letters, numbers, hyphen or underscore.' });
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

  return app;
}
