import { v4 as uuidv4 } from 'uuid';

import {
  ZERO,
  d,
  fromCents,
  roundDecimal,
  toCents,
} from './decimal.js';

const MONTHLY_POSTING_NOTE = 'Automated monthly cash interest posting';
const DAILY_INTEREST_NOTE = 'Automated daily cash interest accrual';

const MS_PER_DAY = 86_400_000;
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_DAY_COUNT = 365;
const ISO_CURRENCY_PATTERN = /^[A-Z]{3}$/u;

const CURRENCY_DECIMAL_PLACES = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
};

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

function currencyDecimalPlaces(currency) {
  const normalized = normalizeCurrency(currency);
  return CURRENCY_DECIMAL_PLACES[normalized] ?? 2;
}

function roundToCurrency(value, currency) {
  const decimals = currencyDecimalPlaces(currency);
  return roundDecimal(d(value), decimals);
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

function matchesPortfolio(tx, portfolioId) {
  const normalizedTarget =
    portfolioId === undefined || portfolioId === null || portfolioId === ''
      ? null
      : String(portfolioId);
  if (!normalizedTarget) {
    return true;
  }
  const txPortfolio =
    tx?.portfolio_id === undefined || tx?.portfolio_id === null || tx?.portfolio_id === ''
      ? null
      : String(tx.portfolio_id);
  return txPortfolio === normalizedTarget;
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

function computeCashBalanceUntil(
  transactions,
  date,
  currency = DEFAULT_CURRENCY,
  { portfolioId, includeInterestOnDate = true } = {},
) {
  const dateKey = toDateKey(date);
  const normalizedCurrency = normalizeCurrency(currency);
  let balanceCents = 0;
  const sorted = [...transactions].sort((a, b) => {
    const dateDiff = toDateKey(a.date).localeCompare(toDateKey(b.date));
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return (a.id ?? '').localeCompare(b.id ?? '');
  });
  for (const tx of sorted) {
    const txDateKey = toDateKey(tx.date);
    if (txDateKey > dateKey) {
      break;
    }
    if (!matchesPortfolio(tx, portfolioId)) {
      continue;
    }
    if (!includeInterestOnDate && txDateKey === dateKey && tx.type === 'INTEREST') {
      continue;
    }
    const amount = Number.parseFloat(tx.amount ?? 0);
    if (!Number.isFinite(amount)) {
      continue;
    }
    if (normalizeCurrency(tx.currency) !== normalizedCurrency) {
      continue;
    }
    const amountCents = toCents(amount);
    switch (tx.type) {
      case 'DEPOSIT':
      case 'DIVIDEND':
      case 'INTEREST':
      case 'SELL':
        balanceCents += amountCents;
        break;
      case 'WITHDRAWAL':
      case 'BUY':
      case 'FEE':
        balanceCents -= amountCents;
        break;
      default:
        break;
    }
  }
  return fromCents(balanceCents);
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
      && toDateKey(tx.date) === dateKey
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
  const accruedCents = (existing?.accrued_cents ?? 0) + interestCents;
  const normalizedCurrency = normalizeCurrency(existing?.currency ?? currency);
  const updated = {
    month: monthKey,
    accrued_cents: accruedCents,
    last_accrual_date: dateKey,
    posted_at: existing?.posted_at ?? null,
    posted_amount_cents: existing?.posted_amount_cents ?? 0,
    currency: normalizedCurrency,
  };
  await storage.upsertRow('cash_interest_accruals', updated, ['month']);
  logger?.info?.('interest_accrual_buffered', {
    month: monthKey,
    date: dateKey,
    accrued_cents: accruedCents,
    currency: normalizedCurrency,
  });
  return {
    ...updated,
    accrued_amount: fromCents(accruedCents).toNumber(),
  };
}

export async function accrueInterest({
  storage,
  date,
  policy,
  logger,
  featureFlags = {},
  postingDay = 'last',
  portfolioId,
}) {
  const dateKey = toDateKey(date);
  await storage.ensureTable('transactions', []);
  const transactions = await storage.readTable('transactions');
  const currency = normalizeCurrency(policy?.currency);
  const timeline = Array.isArray(policy?.apyTimeline) ? policy.apyTimeline : [];

  const existingInterest = transactions.find(
    (tx) =>
      matchesPortfolio(tx, portfolioId)
      && tx.type === 'INTEREST'
      && toDateKey(tx.date) === dateKey
      && normalizeCurrency(tx.currency) === currency,
  );
  if (existingInterest) {
    return existingInterest;
  }

  const cashBalance = computeCashBalanceUntil(transactions, dateKey, currency, {
    portfolioId,
    includeInterestOnDate: false,
  });
  const apy = resolveApyForDate(timeline, dateKey);
  const dailyRate = dailyRateFromApy(apy);
  if (dailyRate.isZero()) {
    return null;
  }

  const interestAmount = roundToCurrency(cashBalance.times(dailyRate), currency);
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

  const interestId = portfolioId
    ? `interest-${portfolioId}-${dateKey}`
    : `interest-${dateKey}`;
  const record = {
    id: interestId,
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

  await storage.upsertRow('transactions', record, ['id']);
  logger?.info?.('interest_posted', {
    date: dateKey,
    amount: record.amount,
    cash_balance: roundDecimal(cashBalance, 6).toNumber(),
    apy,
    currency,
    portfolio_id: portfolioId ?? null,
  });
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
  if (!target) {
    return null;
  }

  const normalizedCurrency = normalizeCurrency(target?.currency ?? currency);
  if (target?.currency && normalizeCurrency(target.currency) !== normalizeCurrency(currency)) {
    return null;
  }

  const accruedCents = target.accrued_cents ?? 0;
  if (accruedCents === 0) {
    return null;
  }

  const amountDecimal = roundToCurrency(fromCents(accruedCents), normalizedCurrency);
  const record = {
    id: `interest-${postingDate}`,
    type: 'INTEREST',
    ticker: 'CASH',
    date: postingDate,
    quantity: 0,
    amount: amountDecimal.toNumber(),
    note: MONTHLY_POSTING_NOTE,
    internal: false,
    currency: normalizedCurrency,
  };

  await storage.upsertRow('transactions', record, ['id']);
  await storage.upsertRow(
    'cash_interest_accruals',
    {
      month: monthKey,
      accrued_cents: 0,
      last_accrual_date: target.last_accrual_date ?? postingDate,
      posted_at: postingDate,
      posted_amount_cents: accruedCents,
      currency: normalizedCurrency,
    },
    ['month'],
  );
  await storage.deleteWhere(
    'transactions',
    (tx) =>
      tx.type === 'INTEREST'
      && tx.note === DAILY_INTEREST_NOTE
      && toDateKey(tx.date).startsWith(monthKey)
      && normalizeCurrency(tx.currency) === normalizedCurrency,
  );

  logger?.info?.('interest_posted_monthly', {
    date: postingDate,
    month: monthKey,
    amount: record.amount,
    currency: normalizedCurrency,
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
