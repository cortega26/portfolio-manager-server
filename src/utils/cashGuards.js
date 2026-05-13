import {
  TYPE_ORDER,
  toComparableTimestamp,
  toComparableSeq,
} from '../../shared/transactionSort.js';

const CASH_IN_TYPES = new Set(['DEPOSIT', 'DIVIDEND', 'INTEREST', 'SELL']);
const CASH_OUT_TYPES = new Set(['WITHDRAWAL', 'BUY', 'FEE']);

function sortTransactionsForCashCheck(transactions) {
  return [...transactions].sort((a, b) => {
    const dateA = typeof a.date === 'string' ? a.date : '';
    const dateB = typeof b.date === 'string' ? b.date : '';
    const dateDiff = dateA.localeCompare(dateB);
    if (dateDiff !== 0) {
      return dateDiff;
    }

    const orderA = TYPE_ORDER[a.type] ?? 99;
    const orderB = TYPE_ORDER[b.type] ?? 99;
    if (orderA !== orderB) {
      return orderA - orderB;
    }

    const createdDiff = toComparableTimestamp(a.createdAt) - toComparableTimestamp(b.createdAt);
    if (createdDiff !== 0) {
      return createdDiff;
    }

    const seqDiff = toComparableSeq(a.seq) - toComparableSeq(b.seq);
    if (seqDiff !== 0) {
      return seqDiff;
    }

    const idDiff = String(a.id ?? '').localeCompare(String(b.id ?? ''));
    if (idDiff !== 0) {
      return idDiff;
    }

    return String(a.uid ?? '').localeCompare(String(b.uid ?? ''));
  });
}

function toCents(amount) {
  const parsed = Number.parseFloat(amount ?? 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round(Math.abs(parsed) * 100);
}

export function validateNonNegativeCash(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return { ok: true };
  }

  const sorted = sortTransactionsForCashCheck(transactions);
  let cashCents = 0;
  for (const tx of sorted) {
    const cents = toCents(tx.amount);
    if (cents === 0) {
      continue;
    }

    const type = String(tx.type ?? '').toUpperCase();
    if (CASH_IN_TYPES.has(type)) {
      cashCents += cents;
    } else if (CASH_OUT_TYPES.has(type)) {
      cashCents -= cents;
    } else {
      cashCents += (tx.amount ?? 0) >= 0 ? cents : -cents;
    }

    if (cashCents < 0 && type === 'WITHDRAWAL') {
      return {
        ok: false,
        deficit: Math.abs(cashCents) / 100,
        failingTransaction: tx,
      };
    }
  }

  return { ok: true };
}
