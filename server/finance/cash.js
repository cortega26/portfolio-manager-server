import { v4 as uuidv4 } from 'uuid';

import { ZERO, d, roundDecimal } from './decimal.js';

const MONTHLY_POSTING_NOTE = 'Automated monthly cash interest posting';
const DAILY_INTEREST_NOTE = 'Automated daily cash interest accrual';

const MS_PER_DAY = 86_400_000;
const DEFAULT_CURRENCY = 'USD';
const ISO_CURRENCY_PATTERN = /^[A-Z]{3}$/u;

function normalizeCurrency(value) {
  if (typeof value !== 'string') {
    return DEFAULT_CURRENCY;
  }
  const normalized = value.trim().toUpperCase();
  if (!ISO_CURRENCY_PATTERN.test(normalized)) {
    return DEFAULT_CURRENCY;
  }
  return normalized;
}

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

export function dailyRateFromApy(apy, { dayCount = DEFAULT_DAY_COUNT } = {}) {
  if (!Number.isFinite(apy)) {
    return ZERO;
  }
  if (!Number.isFinite(dayCount) || dayCount <= 0) {
    throw new Error('dayCount must be a positive finite number');
  }
  return d(apy).div(dayCount);
}

export function resolveApyForDate(timeline, date) {
  const dateKey = toDateKey(date);
  if (!Array.isArray(timeline) || timeline.length === 0) {
    return 0;
  }
  let result = 0;
  for (const entry of timeline) {
    if (!Number.isFinite(entry?.apy)) {
      continue;
    }
    const fromKey = toDateKey(entry.from ?? entry.effective_date ?? entry.date);
    const toKey = entry.to ? toDateKey(entry.to) : null;
    if (fromKey <= dateKey && (!toKey || dateKey <= toKey)) {
      result = Number(entry.apy);
    }
  }
  return result;
}

function computeCashBalanceUntil(transactions, date, currency = DEFAULT_CURRENCY) {
  const dateKey = toDateKey(date);
  let balanceMinorUnits = 0;
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
    if (!matchesPortfolio(tx, portfolioId)) {
      continue;
    }
    const amount = Number.parseFloat(tx.amount ?? 0);
    if (!Number.isFinite(amount)) {
      continue;
    }
    if (normalizeCurrency(tx.currency) !== currency) {
      continue;
    }
    const amountCents = toCents(amount);
    switch (tx.type) {
      case 'DEPOSIT':
      case 'DIVIDEND':
      case 'INTEREST':
      case 'SELL':
        balanceMinorUnits += amountMinorUnits;
        break;
      case 'WITHDRAWAL':
      case 'BUY':
      case 'FEE':
        balanceMinorUnits -= amountMinorUnits;
        break;
      default:
        break;
    }
  }
  return fromMinorUnits(balanceMinorUnits, currency);
}

export function postInterestForDate(
  portfolioId,
  date,
  {
    transactions = [],
    policy = {},
    dayCount = DEFAULT_DAY_COUNT,
  } = {},
) {
  const dateKey = toDateKey(date);
  const currency = normalizeCurrency(policy?.currency);
  const timeline = Array.isArray(policy?.apyTimeline) ? policy.apyTimeline : [];

  const alreadyPosted = transactions.some(
    (tx) =>
      matchesPortfolio(tx, portfolioId)
      && tx.type === 'INTEREST'
      && tx.date === dateKey
      && normalizeCurrency(tx.currency) === currency,
  );
  if (alreadyPosted) {
    return null;
  }

  const balance = computeCashBalanceUntil(transactions, dateKey, currency, {
    portfolioId,
    includeInterestOnDate: false,
  });
  const apy = resolveApyForDate(timeline, dateKey);
  const dailyRate = dailyRateFromApy(apy, { dayCount });
  if (dailyRate.isZero()) {
    return null;
  }

  const interestAmount = roundToCurrency(balance.times(dailyRate), currency);
  if (interestAmount.isZero()) {
    return null;
  }

  const transactionId = portfolioId
    ? `interest-${portfolioId}-${dateKey}`
    : `interest-${dateKey}`;

  return {
    id: transactionId,
    portfolio_id: portfolioId ?? undefined,
    type: 'INTEREST',
    ticker: 'CASH',
    date: dateKey,
    quantity: 0,
    amount: interestAmount.toNumber(),
    note: DAILY_INTEREST_NOTE,
    internal: true,
    currency,
  };
}

async function recordMonthlyAccrual({
  storage,
  monthKey,
  dateKey,
  interestCents,
  currency,
  logger,
}) {
  await storage.ensureTable('cash_interest_accruals', []);
  const rows = await storage.readTable('cash_interest_accruals');
  const existing = rows.find((row) => row.month === monthKey);
  const accruedMinorUnits = (existing?.accrued_cents ?? 0) + interestMinorUnits;
  const updated = {
    month: monthKey,
    accrued_cents: accruedMinorUnits,
    last_accrual_date: dateKey,
    posted_at: existing?.posted_at ?? null,
    currency,
  };
  await storage.upsertRow('cash_interest_accruals', updated, ['month']);
  logger?.info?.('interest_accrual_buffered', {
    month: monthKey,
    date: dateKey,
    accrued_cents: accruedCents,
    currency,
  });
  return {
    ...updated,
    accrued_amount: fromMinorUnits(accruedMinorUnits, currency).toNumber(),
  };
}

export async function accrueInterest({
  storage,
  date,
  policy,
  logger,
  featureFlags = {},
  postingDay = 'last',
}) {
  const dateKey = toDateKey(date);
  const transactions = await storage.readTable('transactions');
  const currency = normalizeCurrency(policy?.currency);
  const timeline = Array.isArray(policy?.apyTimeline) ? policy.apyTimeline : [];
  const cashBalance = computeCashBalanceUntil(transactions, prevKey, currency);
  const apy = resolveApyForDate(timeline, prevKey);
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
      currency,
      logger,
    });
  }

  const existing = transactions.find(
    (tx) =>
      matchesPortfolio(tx, interestRecord.portfolio_id ?? null)
      && tx.type === 'INTEREST'
      && tx.date === dateKey
      && normalizeCurrency(tx.currency) === interestRecord.currency,
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
    currency,
  };

  await storage.upsertRow('transactions', record, ['id']);
  if (logger?.info) {
    logger.info('interest_posted', {
      date: dateKey,
      amount: record.amount,
      cash_balance: roundDecimal(cashBalance, 6).toNumber(),
      apy,
      currency,
    });
  }
  return record;
}

export async function postMonthlyInterest({
  storage,
  date,
  postingDay = 'last',
  logger,
  currency = DEFAULT_CURRENCY,
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
  const targetCurrency = normalizeCurrency(target?.currency);
  if (target && targetCurrency !== currency) {
    return null;
  }
  const accruedCents = target?.accrued_cents ?? 0;
  if (accruedCents === 0) {
    return null;
  }

  const amount = fromMinorUnits(accruedMinorUnits, currency).toNumber();
  const record = {
    id: `interest-${postingDate}`,
    type: 'INTEREST',
    ticker: 'CASH',
    date: postingDate,
    quantity: 0,
    amount,
    note: MONTHLY_POSTING_NOTE,
    internal: false,
    currency,
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
      currency,
    },
    ['month'],
  );
  await storage.deleteWhere(
    'transactions',
    (tx) =>
      tx.type === 'INTEREST'
      && tx.date.slice(0, 7) === monthKey
      && tx.note === 'Automated daily cash interest accrual'
      && normalizeCurrency(tx.currency) === currency,
  );

  logger?.info?.('interest_posted_monthly', {
    date: postingDate,
    month: monthKey,
    amount,
    currency,
  });
  return record;
}

export function buildCashSeries({ policy, from, to }) {
  const start = new Date(`${toDateKey(from)}T00:00:00Z`);
  const end = new Date(`${toDateKey(to)}T00:00:00Z`);
  const result = [];
  const timeline = Array.isArray(policy?.apyTimeline) ? policy.apyTimeline : [];
  for (let ts = start.getTime(); ts <= end.getTime(); ts += MS_PER_DAY) {
    const date = new Date(ts);
    const dateKey = toDateKey(date);
    const apy = resolveApyForDate(timeline, dateKey);
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
