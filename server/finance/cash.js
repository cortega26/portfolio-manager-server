import { v4 as uuidv4 } from 'uuid';

import {
  ZERO,
  d,
  fromCents,
  roundDecimal,
  toCents,
} from './decimal.js';

const MS_PER_DAY = 86_400_000;

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

export async function accrueInterest({ storage, date, rates, logger }) {
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
