import { v4 as uuidv4 } from 'uuid';

import {
  ZERO,
  d,
  fromCents,
  roundDecimal,
  toCents,
} from './decimal.js';

const MONTHLY_POSTING_NOTE = 'Automated monthly cash interest posting';

const MS_PER_DAY = 86_400_000;

function clampPostingDay({ year, monthIndex, postingDay }) {
  if (postingDay === 'last') {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  }
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const normalized = Number.isFinite(postingDay)
    ? Math.max(1, Math.round(postingDay))
    : lastDay;
  return Math.min(normalized, lastDay);
}

function resolveAccrualMonthKey(dateKey, postingDay) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const postingDayNumber = clampPostingDay({
    year: date.getUTCFullYear(),
    monthIndex: date.getUTCMonth(),
    postingDay,
  });
  if (date.getUTCDate() <= postingDayNumber) {
    return dateKey.slice(0, 7);
  }
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return next.toISOString().slice(0, 7);
}

function resolvePostingDateForMonth(monthKey, postingDay) {
  const [year, month] = monthKey.split('-').map((part) => Number.parseInt(part, 10));
  const postingDayNumber = clampPostingDay({
    year,
    monthIndex: month - 1,
    postingDay,
  });
  return `${monthKey}-${String(postingDayNumber).padStart(2, '0')}`;
}

export function toDateKey(date) {
  if (date instanceof Date) {
    return date.toISOString().slice(0, 10);
  }
  return String(date);
}

export function dailyRateFromApy(apy) {
  if (!Number.isFinite(apy)) {
    return ZERO;
  }
  const factor = d(1).plus(apy);
  return factor.pow(d(1).div(365)).minus(1);
}

export function resolveApyForDate(rates, date) {
  const dateKey = toDateKey(date);
  const sorted = [...rates].sort((a, b) => a.effective_date.localeCompare(b.effective_date));
  let result = 0;
  for (const entry of sorted) {
    if (entry.effective_date <= dateKey && Number.isFinite(entry.apy)) {
      result = entry.apy;
    }
  }
  return result;
}

function computeCashBalanceUntil(transactions, date) {
  const dateKey = toDateKey(date);
  let cashCents = 0;
  const sorted = [...transactions].sort((a, b) => {
    const dateDiff = a.date.localeCompare(b.date);
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return (a.id ?? '').localeCompare(b.id ?? '');
  });
  for (const tx of sorted) {
    if (tx.date > dateKey) {
      break;
    }
    const amount = Number.parseFloat(tx.amount ?? 0);
    if (!Number.isFinite(amount)) {
      continue;
    }
    const amountCents = toCents(amount);
    switch (tx.type) {
      case 'DEPOSIT':
      case 'DIVIDEND':
      case 'INTEREST':
      case 'SELL':
        cashCents += amountCents;
        break;
      case 'WITHDRAWAL':
      case 'BUY':
      case 'FEE':
        cashCents -= amountCents;
        break;
      default:
        break;
    }
  }
  return fromCents(cashCents);
}

async function recordMonthlyAccrual({
  storage,
  monthKey,
  dateKey,
  interestCents,
  logger,
}) {
  await storage.ensureTable('cash_interest_accruals', []);
  const rows = await storage.readTable('cash_interest_accruals');
  const existing = rows.find((row) => row.month === monthKey);
  const existingDaily =
    existing && typeof existing.daily_accruals === 'object' && existing.daily_accruals
      ? existing.daily_accruals
      : {};
  const dailyAccruals = { ...existingDaily, [dateKey]: interestCents };
  const accruedCents = Object.values(dailyAccruals).reduce(
    (sum, cents) => sum + (Number.isFinite(cents) ? cents : 0),
    0,
  );
  const lastAccrualDate = existing?.last_accrual_date
    && existing.last_accrual_date > dateKey
    ? existing.last_accrual_date
    : dateKey;
  const updated = {
    month: monthKey,
    accrued_cents: accruedCents,
    last_accrual_date: lastAccrualDate,
    posted_at: existing?.posted_at ?? null,
    daily_accruals: dailyAccruals,
  };
  await storage.upsertRow('cash_interest_accruals', updated, ['month']);
  logger?.info?.('interest_accrual_buffered', {
    month: monthKey,
    date: dateKey,
    accrued_cents: accruedCents,
  });
  return {
    ...updated,
    accrued_amount: fromCents(accruedCents).toNumber(),
  };
}

export async function accrueInterest({
  storage,
  date,
  rates,
  logger,
  featureFlags = {},
  postingDay = 'last',
}) {
  const dateKey = toDateKey(date);
  const previousDay = new Date(new Date(`${dateKey}T00:00:00Z`).getTime() - MS_PER_DAY);
  const prevKey = toDateKey(previousDay);
  const transactions = await storage.readTable('transactions');
  const cashBalance = computeCashBalanceUntil(transactions, prevKey);
  const apy = resolveApyForDate(rates, prevKey);
  const dailyRate = dailyRateFromApy(apy);
  const interestAmount = cashBalance.times(dailyRate);
  const interestCents = toCents(interestAmount);
  if (interestCents === 0) {
    return null;
  }

  if (featureFlags.monthlyCashPosting) {
    const monthKey = resolveAccrualMonthKey(dateKey, postingDay);
    return recordMonthlyAccrual({
      storage,
      monthKey,
      dateKey,
      interestCents,
      logger,
    });
  }

  const interestId = `interest-${dateKey}`;
  const existing = transactions.find(
    (tx) => tx.type === 'INTEREST' && tx.date === dateKey,
  );

  const record = {
    id: interestId,
    type: 'INTEREST',
    ticker: 'CASH',
    date: dateKey,
    quantity: 0,
    amount: fromCents(interestCents).toNumber(),
    note: 'Automated daily cash interest accrual',
    internal: true,
  };

  if (existing) {
    await storage.upsertRow('transactions', { ...existing, ...record }, ['id']);
    if (logger?.info) {
      logger.info('interest_exists', { date: dateKey, amount: record.amount });
    }
    return record;
  }
  await storage.upsertRow('transactions', record, ['id']);
  if (logger?.info) {
    logger.info('interest_posted', {
      date: dateKey,
      amount: record.amount,
      cash_balance: roundDecimal(cashBalance, 6).toNumber(),
      apy,
    });
  }
  return record;
}

export async function postMonthlyInterest({
  storage,
  date,
  postingDay = 'last',
  logger,
}) {
  const dateKey = toDateKey(date);
  const monthKey = dateKey.slice(0, 7);
  const postingDate = resolvePostingDateForMonth(monthKey, postingDay);
  if (postingDate !== dateKey) {
    return null;
  }

  await storage.ensureTable('cash_interest_accruals', []);
  const accruals = await storage.readTable('cash_interest_accruals');
  const target = accruals.find((row) => row.month === monthKey);
  const accruedCents = target?.accrued_cents ?? 0;
  if (accruedCents === 0) {
    return null;
  }

  const dailyAccrualDates = new Set(
    Object.keys(target?.daily_accruals ?? {}).filter((key) => typeof key === 'string'),
  );

  const amount = fromCents(accruedCents).toNumber();
  const record = {
    id: `interest-${postingDate}`,
    type: 'INTEREST',
    ticker: 'CASH',
    date: postingDate,
    quantity: 0,
    amount,
    note: MONTHLY_POSTING_NOTE,
    internal: false,
  };

  await storage.upsertRow('transactions', record, ['id']);
  await storage.upsertRow(
    'cash_interest_accruals',
    {
      month: monthKey,
      accrued_cents: 0,
      last_accrual_date: target?.last_accrual_date ?? postingDate,
      posted_at: postingDate,
      posted_amount_cents: accruedCents,
      daily_accruals: {},
    },
    ['month'],
  );
  await storage.deleteWhere(
    'transactions',
    (tx) =>
      tx.type === 'INTEREST'
      && tx.date.slice(0, 7) === monthKey
      && tx.note === 'Automated daily cash interest accrual'
      && dailyAccrualDates.has(tx.date),
  );

  logger?.info?.('interest_posted_monthly', {
    date: postingDate,
    month: monthKey,
    amount,
  });
  return record;
}

export function buildCashSeries({ rates, from, to }) {
  const start = new Date(`${toDateKey(from)}T00:00:00Z`);
  const end = new Date(`${toDateKey(to)}T00:00:00Z`);
  const result = [];
  for (let ts = start.getTime(); ts <= end.getTime(); ts += MS_PER_DAY) {
    const date = new Date(ts);
    const dateKey = toDateKey(date);
    const apy = resolveApyForDate(rates, dateKey);
    result.push({
      date: dateKey,
      rate: dailyRateFromApy(apy),
    });
  }
  return result;
}

export function transactionIsExternal(tx) {
  return tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL';
}

export function generateTransactionId() {
  return uuidv4();
}
