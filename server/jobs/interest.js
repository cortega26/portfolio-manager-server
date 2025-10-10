import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

import { accrueInterest, postMonthlyInterest, toDateKey } from '../finance/cash.js';
import { isTradingDay } from '../utils/calendar.js';
import { runMigrations } from '../migrations/index.js';
import { withLock } from '../utils/locks.js';

const PORTFOLIO_FILE_PREFIX = 'portfolio_';
const PORTFOLIO_FILE_SUFFIX = '.json';
const MS_PER_DAY = 86_400_000;

function normalizeCurrencyCode(value) {
  if (typeof value !== 'string') {
    return 'USD';
  }
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/u.test(normalized) ? normalized : 'USD';
}

function toIsoDate(value) {
  if (!value) {
    return null;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function normalizeTimeline(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry) => {
      const from = toIsoDate(entry?.from ?? entry?.effective_date ?? entry?.date);
      if (!from) {
        return null;
      }
      const to = toIsoDate(entry?.to ?? entry?.through ?? null);
      const apy = Number.isFinite(entry?.apy) ? Number(entry.apy) : 0;
      return { from, to: to ?? null, apy };
    })
    .filter(Boolean)
    .sort((a, b) => a.from.localeCompare(b.from));
}

async function listPortfolioPolicies({ dataDir, storage, logger }) {
  let entries;
  try {
    entries = await fs.readdir(dataDir);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const rates = await storage.readTable('cash_rates');
  const defaultTimeline = normalizeTimeline(
    rates.map((row) => ({ from: row?.effective_date, apy: row?.apy })),
  );

  const policies = [];
  for (const entry of entries) {
    if (
      !entry.startsWith(PORTFOLIO_FILE_PREFIX)
      || !entry.endsWith(PORTFOLIO_FILE_SUFFIX)
    ) {
      continue;
    }
    if (entry === 'portfolio_keys.json') {
      continue;
    }
    const portfolioId = entry
      .slice(PORTFOLIO_FILE_PREFIX.length, -PORTFOLIO_FILE_SUFFIX.length)
      .trim();
    if (!portfolioId) {
      continue;
    }
    const filePath = path.join(dataDir, entry);
    let contents;
    try {
      contents = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      logger?.warn?.('interest_policy_read_failed', {
        portfolio_id: portfolioId,
        error: error.message,
      });
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(contents);
    } catch (error) {
      logger?.warn?.('interest_policy_parse_failed', {
        portfolio_id: portfolioId,
        error: error.message,
      });
      continue;
    }
    const currency = normalizeCurrencyCode(parsed?.cash?.currency);
    const timeline = normalizeTimeline(parsed?.cash?.apyTimeline);
    policies.push({
      id: portfolioId,
      policy: {
        currency,
        apyTimeline: timeline.length > 0 ? timeline : defaultTimeline,
      },
    });
  }

  if (policies.length === 0) {
    policies.push({
      id: null,
      policy: {
        currency: normalizeCurrencyCode(),
        apyTimeline: defaultTimeline,
      },
    });
  }

  return policies;
}

export function previousTradingDay(reference = new Date()) {
  let cursor = new Date(reference);
  cursor.setUTCHours(0, 0, 0, 0);
  cursor = new Date(cursor.getTime() - MS_PER_DAY);
  while (!isTradingDay(cursor)) {
    cursor = new Date(cursor.getTime() - MS_PER_DAY);
  }
  return cursor;
}

export async function runInterestAccrual({
  dataDir,
  storage,
  logger,
  date,
  config,
  requestId = randomUUID(),
} = {}) {
  const log = logger?.child
    ? logger.child({ job: 'daily_interest', requestId })
    : logger;
  const effectiveDate = toDateKey(date ?? new Date());
  const workingStorage =
    storage ?? (await runMigrations({ dataDir, logger: log ?? logger }));

  if (!isTradingDay(effectiveDate)) {
    log?.info?.('interest_skipped_non_trading_day', {
      date: effectiveDate,
      requestId,
    });
    return {
      requestId,
      date: effectiveDate,
      skipped: true,
      portfolios: [],
    };
  }

  const featureFlags = config?.featureFlags ?? {};
  const postingDay = config?.cash?.postingDay ?? 'last';
  const policies = await listPortfolioPolicies({ dataDir, storage: workingStorage, logger });
  const summary = [];

  await withLock(`interest-job:${effectiveDate}`, async () => {
    for (const { id: portfolioId, policy } of policies) {
      const lockKey = `interest-portfolio:${portfolioId ?? 'default'}`;
      await withLock(lockKey, async () => {
        const record = await accrueInterest({
          storage: workingStorage,
          date: effectiveDate,
          policy: { ...policy, portfolioId: portfolioId ?? null },
          logger,
          featureFlags,
          postingDay,
        });
        summary.push({
          portfolioId: portfolioId ?? null,
          posted: Boolean(record),
        });
      });
    }

    if (featureFlags.monthlyCashPosting) {
      const postingCurrency = normalizeCurrencyCode(
        config?.cash?.currency ?? policies[0]?.policy?.currency ?? 'USD',
      );
      await postMonthlyInterest({
        storage: workingStorage,
        date: effectiveDate,
        postingDay,
        logger,
        currency: postingCurrency,
      });
    }
  });

  await workingStorage.upsertRow(
    'jobs_state',
    {
      job: 'daily_interest',
      last_run_date: effectiveDate,
      updated_at: new Date().toISOString(),
      request_id: requestId,
    },
    ['job'],
  );

  log?.info?.('interest_accrual_completed', {
    date: effectiveDate,
    portfolios: summary.length,
    requestId,
  });

  return {
    requestId,
    date: effectiveDate,
    skipped: false,
    portfolios: summary,
  };
}

export async function runInterestBackfill({
  dataDir,
  from,
  to,
  logger,
  config,
  requestId = randomUUID(),
} = {}) {
  const startKey = toDateKey(from);
  const endKey = toDateKey(to);
  const startDate = new Date(`${startKey}T00:00:00Z`);
  const endDate = new Date(`${endKey}T00:00:00Z`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error('Invalid from/to dates for interest backfill');
  }
  if (startDate.getTime() > endDate.getTime()) {
    throw new Error('Backfill `from` date must be on or before `to` date');
  }

  const workingStorage = await runMigrations({ dataDir, logger });
  const runs = [];
  for (
    let ts = startDate.getTime();
    ts <= endDate.getTime();
    ts += MS_PER_DAY
  ) {
    const current = new Date(ts);
    if (!isTradingDay(current)) {
      logger?.info?.('interest_backfill_skip_non_trading', {
        date: toDateKey(current),
        requestId,
      });
      continue;
    }
    const result = await runInterestAccrual({
      dataDir,
      storage: workingStorage,
      logger,
      date: current,
      config,
      requestId,
    });
    runs.push(result);
  }

  return { requestId, runs };
}

export default runInterestAccrual;
