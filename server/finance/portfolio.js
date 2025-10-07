import { toDateKey, transactionIsExternal } from './cash.js';
import {
  d,
  fromCents,
  fromMicroShares,
  roundDecimal,
  toCents,
  toMicroShares,
} from './decimal.js';

function cloneHoldings(holdings) {
  const result = new Map();
  for (const [ticker, value] of holdings.entries()) {
    result.set(ticker, value);
  }
  return result;
}

function createLedgerState() {
  return { cashCents: 0, holdings: new Map() };
}

function applyTransactionsThroughDate({
  state,
  transactions,
  startIndex,
  dateKey,
}) {
  let index = startIndex;
  while (index < transactions.length && transactions[index].date <= dateKey) {
    applyTransaction(state, transactions[index]);
    index += 1;
  }
  return index;
}

function holdingsToShareMap(holdingsSnapshot) {
  const holdingsForOutput = new Map();
  for (const [ticker, qtyMicro] of holdingsSnapshot.entries()) {
    holdingsForOutput.set(ticker, fromMicroShares(qtyMicro).toNumber());
  }
  return holdingsForOutput;
}

function computeRiskValueCents(holdingsSnapshot, priceMap) {
  let riskValueCents = 0;
  for (const [ticker, qtyMicro] of holdingsSnapshot.entries()) {
    if (ticker === 'CASH') {
      continue;
    }
    const price = Number.parseFloat(priceMap.get(ticker) ?? 0);
    if (!Number.isFinite(price)) {
      continue;
    }
    const qty = fromMicroShares(qtyMicro);
    const value = qty.times(price);
    riskValueCents += toCents(value);
  }
  return riskValueCents;
}

function buildDailyState({ dateKey, ledgerState, priceMap }) {
  const holdingsSnapshot = cloneHoldings(ledgerState.holdings);
  const riskValueCents = computeRiskValueCents(holdingsSnapshot, priceMap);
  const navCents = ledgerState.cashCents + riskValueCents;

  return {
    date: dateKey,
    cash: fromCents(ledgerState.cashCents).toNumber(),
    holdings: holdingsToShareMap(holdingsSnapshot),
    riskValue: fromCents(riskValueCents).toNumber(),
    nav: fromCents(navCents).toNumber(),
  };
}

/**
 * Sort transactions deterministically.
 *
 * AUDIT FIX (CRITICAL-8): Use type-based ordering for same-day transactions
 * Order: DEPOSIT → BUY → SELL → DIVIDEND → INTEREST → WITHDRAWAL → FEE
 * This ensures cash is deposited before being spent on buys.
 */
export function sortTransactions(transactions) {
  const typeOrder = {
    DEPOSIT: 1,
    BUY: 2,
    SELL: 3,
    DIVIDEND: 4,
    INTEREST: 5,
    WITHDRAWAL: 6,
    FEE: 7,
  };

  const toComparableTimestamp = (value) => {
    if (typeof value === 'number') {
      if (Number.isFinite(value) && value >= 0) {
        return Math.trunc(value);
      }
      return 0;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') {
        return 0;
      }
      const parsed = Number.parseInt(trimmed, 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  const toComparableSeq = (value) => {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') {
        return 0;
      }
      const parsed = Number.parseInt(trimmed, 10);
      return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
    }
    return 0;
  };

  return [...transactions].sort((a, b) => {
    const dateDiff = a.date.localeCompare(b.date);
    if (dateDiff !== 0) {
      return dateDiff;
    }

    const typeA = typeOrder[a.type] ?? 99;
    const typeB = typeOrder[b.type] ?? 99;
    if (typeA !== typeB) {
      return typeA - typeB;
    }

    const createdAtDiff = toComparableTimestamp(a.createdAt) - toComparableTimestamp(b.createdAt);
    if (createdAtDiff !== 0) {
      return createdAtDiff;
    }

    const seqDiff = toComparableSeq(a.seq) - toComparableSeq(b.seq);
    if (seqDiff !== 0) {
      return seqDiff;
    }

    const idDiff = (a.id ?? '').localeCompare(b.id ?? '');
    if (idDiff !== 0) {
      return idDiff;
    }

    return (a.uid ?? '').localeCompare(b.uid ?? '');
  });
}

function applyTransaction(state, tx) {
  const amount = Number.parseFloat(tx.amount ?? 0);
  const quantity = Number.parseFloat(tx.quantity ?? 0);
  const ticker = tx.ticker ?? null;

  if (Number.isFinite(amount)) {
    const amountCents = toCents(amount);
    switch (tx.type) {
      case 'DEPOSIT':
      case 'DIVIDEND':
      case 'INTEREST':
      case 'SELL':
        state.cashCents += amountCents;
        break;
      case 'WITHDRAWAL':
      case 'BUY':
      case 'FEE':
        state.cashCents -= amountCents;
        break;
      default:
        break;
    }
  }

  if (ticker && ticker !== 'CASH' && Number.isFinite(quantity) && quantity !== 0) {
    const next = (state.holdings.get(ticker) ?? 0) + toMicroShares(quantity);
    state.holdings.set(ticker, next);
  }
}

export function projectStateUntil(transactions, date) {
  const dateKey = toDateKey(date);
  const state = { cashCents: 0, holdings: new Map() };
  for (const tx of sortTransactions(transactions)) {
    if (tx.date > dateKey) {
      break;
    }
    applyTransaction(state, tx);
  }
  const holdings = new Map();
  for (const [ticker, micro] of state.holdings.entries()) {
    holdings.set(ticker, fromMicroShares(micro).toNumber());
  }
  return {
    cash: fromCents(state.cashCents).toNumber(),
    holdings,
  };
}

export function externalFlowsByDate(transactions) {
  const flows = new Map();
  for (const tx of transactions) {
    if (!transactionIsExternal(tx)) {
      continue;
    }
    const amount = Number.parseFloat(tx.amount ?? 0);
    if (!Number.isFinite(amount)) {
      continue;
    }
    const signedCents = (tx.type === 'WITHDRAWAL' ? -1 : 1) * toCents(amount);
    const current = flows.get(tx.date) ?? 0;
    flows.set(tx.date, current + signedCents);
  }
  const normalized = new Map();
  for (const [dateKey, cents] of flows.entries()) {
    normalized.set(dateKey, fromCents(cents));
  }
  return normalized;
}

export function computeDailyStates({ transactions, pricesByDate, dates }) {
  const sortedTransactions = sortTransactions(transactions);
  const states = [];
  const ledgerState = createLedgerState();
  let txIndex = 0;

  for (const dateKey of dates) {
    txIndex = applyTransactionsThroughDate({
      state: ledgerState,
      transactions: sortedTransactions,
      startIndex: txIndex,
      dateKey,
    });
    const priceMap = pricesByDate.get(dateKey) ?? new Map();
    states.push(
      buildDailyState({
        dateKey,
        ledgerState,
        priceMap,
      }),
    );
  }
  return states;
}

export function holdingsToObject(holdings) {
  const result = {};
  for (const [ticker, qty] of holdings.entries()) {
    result[ticker] = qty;
  }
  return result;
}

export function weightsFromState(state) {
  if (!state || state.nav === 0) {
    return { cash: 0, risk: 0 };
  }
  return {
    cash: roundDecimal(d(state.cash).div(state.nav), 8).toNumber(),
    risk: roundDecimal(d(state.riskValue).div(state.nav), 8).toNumber(),
  };
}
