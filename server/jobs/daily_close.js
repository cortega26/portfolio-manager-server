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

function listDates(from, to) {
  const start = new Date(`${toDateKey(from)}T00:00:00Z`).getTime();
  const end = new Date(`${toDateKey(to)}T00:00:00Z`).getTime();
  const result = [];
  for (let ts = start; ts <= end; ts += MS_PER_DAY) {
    result.push(new Date(ts).toISOString().slice(0, 10));
  }
  return result;
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
  await accrueInterest({
    storage,
    date: targetDateKey,
    rates,
    logger,
    featureFlags: config?.featureFlags ?? {},
    postingDay: config?.cash?.postingDay ?? 'last',
  });
  if (config?.featureFlags?.monthlyCashPosting) {
    await postMonthlyInterest({
      storage,
      date: targetDateKey,
      postingDay: config?.cash?.postingDay ?? 'last',
      logger,
    });
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
