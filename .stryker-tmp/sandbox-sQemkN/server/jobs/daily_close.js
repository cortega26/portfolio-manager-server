// @ts-nocheck
import { promises as fs } from 'fs';
import path from 'path';

import { toDateKey, accrueInterest, postMonthlyInterest } from '../finance/cash.js';
import { isTradingDay } from '../utils/calendar.js';
import { computeDailyStates } from '../finance/portfolio.js';
import { computeDailyReturnRows } from '../finance/returns.js';
import { runMigrations } from '../migrations/index.js';
import {
  DualPriceProvider,
  YahooPriceProvider,
  StooqPriceProvider,
} from '../data/prices.js';

const MS_PER_DAY = 86_400_000;
const PORTFOLIO_FILE_PREFIX = 'portfolio_';
const PORTFOLIO_FILE_SUFFIX = '.json';

function normalizePortfolioId(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return String(value);
}

function sanitizePortfolioTimeline(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const from =
        typeof entry.from === 'string'
          ? entry.from
          : typeof entry.effective_date === 'string'
            ? entry.effective_date
            : null;
      if (!from) {
        return null;
      }
      const to =
        typeof entry.to === 'string'
          ? entry.to
          : typeof entry.through === 'string'
            ? entry.through
            : null;
      const apy = Number.isFinite(entry.apy) ? Number(entry.apy) : 0;
      return { from, to: to ?? null, apy };
    })
    .filter(Boolean)
    .sort((a, b) => a.from.localeCompare(b.from));
}

function sanitizePortfolioPolicy(raw, fallbackCurrency) {
  const currency = normalizeCurrencyCode(raw?.currency ?? fallbackCurrency);
  const apyTimeline = sanitizePortfolioTimeline(raw?.apyTimeline);
  return { currency, apyTimeline };
}

async function loadPortfolioPolicies({ dataDir, fallbackCurrency, logger }) {
  const policies = new Map();
  let entries = [];
  try {
    entries = await fs.readdir(dataDir);
  } catch (error) {
    logger?.warn?.('portfolio_policy_list_failed', { error: error.message });
    return policies;
  }
  for (const entry of entries) {
    if (!entry.startsWith(PORTFOLIO_FILE_PREFIX) || !entry.endsWith(PORTFOLIO_FILE_SUFFIX)) {
      continue;
    }
    const portfolioId = entry.slice(
      PORTFOLIO_FILE_PREFIX.length,
      entry.length - PORTFOLIO_FILE_SUFFIX.length,
    );
    const filePath = path.join(dataDir, entry);
    let parsed;
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      parsed = JSON.parse(raw);
    } catch (error) {
      logger?.warn?.('portfolio_policy_read_failed', {
        portfolio_id: portfolioId,
        error: error.message,
      });
      continue;
    }
    const policy = sanitizePortfolioPolicy(parsed?.cash ?? null, fallbackCurrency);
    policies.set(portfolioId, policy);
  }
  return policies;
}

function listDates(from, to) {
  const start = new Date(`${toDateKey(from)}T00:00:00Z`).getTime();
  const end = new Date(`${toDateKey(to)}T00:00:00Z`).getTime();
  const result = [];
  for (let ts = start; ts <= end; ts += MS_PER_DAY) {
    result.push(new Date(ts).toISOString().slice(0, 10));
  }
  return result;
}

function normalizeCurrencyCode(value) {
  if (typeof value !== 'string') {
    return 'USD';
  }
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/u.test(normalized)) {
    return 'USD';
  }
  return normalized;
}

function timelineFromRates(rates) {
  return [...rates]
    .filter((row) => typeof row?.effective_date === 'string')
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date))
    .map((row) => ({
      from: row.effective_date,
      to: null,
      apy: Number.isFinite(row.apy) ? Number(row.apy) : 0,
    }));
}

function buildPriceMaps(records, tickers, dates) {
  const byDate = new Map();
  const lastPrices = new Map();
  const sortedDates = [...dates].sort((a, b) => a.localeCompare(b));
  for (const date of sortedDates) {
    for (const record of records) {
      if (record.date === date) {
        lastPrices.set(record.ticker, Number.parseFloat(record.adj_close));
      }
    }
    const map = new Map();
    for (const ticker of tickers) {
      if (ticker === 'CASH') {
        map.set('CASH', 1);
        continue;
      }
      if (lastPrices.has(ticker)) {
        map.set(ticker, lastPrices.get(ticker));
      }
    }
    byDate.set(date, map);
  }
  return byDate;
}

async function ensurePrices({ storage, provider, tickers, from, to, logger }) {
  const dates = listDates(from, to);
  const prices = await storage.readTable('prices');
  const existing = new Set(prices.map((row) => `${row.ticker}_${row.date}`));
  for (const ticker of tickers) {
    if (ticker === 'CASH') {
      for (const date of dates) {
        await storage.upsertRow(
          'prices',
          { ticker: 'CASH', date, adj_close: 1 },
          ['ticker', 'date'],
        );
      }
      continue;
    }
    const missingDates = dates.filter(
      (date) => !existing.has(`${ticker}_${date}`),
    );
    if (missingDates.length === 0) {
      continue;
    }
    const rangeFrom = missingDates[0];
    const rangeTo = missingDates[missingDates.length - 1];
    const startedAt = Date.now();
    const fetched = await provider.getDailyAdjustedClose(
      ticker,
      rangeFrom,
      rangeTo,
    );
    const durationMs = Date.now() - startedAt;
    logger?.info?.('price_provider_latency', {
      ticker,
      from: rangeFrom,
      to: rangeTo,
      duration_ms: durationMs,
      provider: provider.constructor?.name ?? 'unknown',
    });
    if (!fetched.length) {
      logger?.warn?.('price_provider_empty_response', {
        ticker,
        from: rangeFrom,
        to: rangeTo,
      });
    }
    for (const item of fetched) {
      await storage.upsertRow(
        'prices',
        { ticker, date: item.date, adj_close: Number(item.adjClose) },
        ['ticker', 'date'],
      );
    }
  }
}

export async function runDailyClose({
  dataDir,
  logger,
  date = new Date(Date.now() - MS_PER_DAY),
  priceProvider,
  config,
} = {}) {
  const targetDate = new Date(`${toDateKey(date)}T00:00:00Z`);
  if (!isTradingDay(targetDate)) {
    logger?.info?.('daily_close_skipped_non_trading_day', {
      target_date: toDateKey(targetDate),
    });
    return { skipped: true };
  }
  const storage = await runMigrations({ dataDir, logger });
  const targetDateKey = toDateKey(targetDate);
  const previousDate = toDateKey(
    new Date(new Date(`${targetDateKey}T00:00:00Z`).getTime() - MS_PER_DAY),
  );

  const rates = await storage.readTable('cash_rates');
  const defaultCurrency = normalizeCurrencyCode(config?.cash?.currency ?? 'USD');
  const defaultPolicy = {
    currency: defaultCurrency,
    apyTimeline: timelineFromRates(rates),
  };
  const featureFlags = config?.featureFlags ?? {};
  const postingDay = config?.cash?.postingDay ?? 'last';

  const transactionsSnapshot = await storage.readTable('transactions');
  const portfolioIds = new Set();
  let hasGlobalTransactions = false;
  for (const tx of transactionsSnapshot) {
    const normalizedId = normalizePortfolioId(tx?.portfolio_id);
    if (normalizedId) {
      portfolioIds.add(normalizedId);
    } else {
      hasGlobalTransactions = true;
    }
  }

  const portfolioPolicies = await loadPortfolioPolicies({
    dataDir,
    fallbackCurrency: defaultCurrency,
    logger,
  });

  const processInterest = async (portfolioId, policyOverride) => {
    const chosenPolicy = policyOverride ?? { currency: defaultCurrency, apyTimeline: [] };
    await accrueInterest({
      storage,
      date: targetDateKey,
      policy: chosenPolicy,
      logger,
      featureFlags,
      postingDay,
      portfolioId,
    });
    if (featureFlags.monthlyCashPosting) {
      await postMonthlyInterest({
        storage,
        date: targetDateKey,
        postingDay,
        logger,
        currency: chosenPolicy.currency,
        portfolioId,
      });
    }
  };

  if (hasGlobalTransactions || portfolioIds.size === 0) {
    await processInterest(null, defaultPolicy);
  }

  for (const portfolioId of portfolioIds) {
    const policyOverride = portfolioPolicies.get(portfolioId) ?? {
      currency: defaultCurrency,
      apyTimeline: [],
    };
    await processInterest(portfolioId, policyOverride);
  }

  const transactions = await storage.readTable('transactions');
  const tickers = new Set(['SPY', 'CASH']);
  for (const tx of transactions) {
    if (tx.ticker && tx.ticker !== 'CASH') {
      tickers.add(tx.ticker);
    }
  }

  const provider =
    priceProvider
    ?? new DualPriceProvider({
      primary: new YahooPriceProvider({ logger }),
      fallback: new StooqPriceProvider({ logger }),
      logger,
    });
  await ensurePrices({
    storage,
    provider,
    tickers: Array.from(tickers),
    from: previousDate,
    to: targetDateKey,
    logger,
  });

  const priceRecords = await storage.readTable('prices');
  const pricesByDate = buildPriceMaps(
    priceRecords,
    Array.from(tickers),
    [previousDate, targetDateKey],
  );
  const states = computeDailyStates({
    transactions,
    pricesByDate,
    dates: [previousDate, targetDateKey],
  });

  let priceStale = false;
  for (const ticker of tickers) {
    if (ticker === 'CASH') {
      continue;
    }
    const hasFresh = priceRecords.some(
      (record) => record.ticker === ticker && record.date === targetDateKey,
    );
    if (!hasFresh) {
      priceStale = true;
      logger?.warn?.('price_carry_forward', { ticker, date: targetDateKey });
    }
  }

  const targetState = states.find((state) => state.date === targetDateKey);
  if (targetState) {
    await storage.upsertRow(
      'nav_snapshots',
      {
        date: targetState.date,
        portfolio_nav: targetState.nav,
        ex_cash_nav: Number((targetState.nav - targetState.cash).toFixed(6)),
        cash_balance: targetState.cash,
        risk_assets_value: targetState.riskValue,
        stale_price: priceStale,
      },
      ['date'],
    );
  }

  const priceMapForSpy = new Map();
  for (const record of priceRecords) {
    if (record.ticker === 'SPY') {
      priceMapForSpy.set(record.date, Number(record.adj_close));
    }
  }
  const returnRows = computeDailyReturnRows({
    states,
    rates,
    spyPrices: priceMapForSpy,
    transactions,
  });
  const targetRow = returnRows.find((row) => row.date === targetDateKey);
  if (targetRow) {
    await storage.upsertRow('returns_daily', targetRow, ['date']);
  }

  await storage.upsertRow(
    'jobs_state',
    {
      job: 'daily_close',
      last_run_date: targetDateKey,
      updated_at: new Date().toISOString(),
    },
    ['job'],
  );

  return { state: targetState, returns: targetRow };
}

export default runDailyClose;
