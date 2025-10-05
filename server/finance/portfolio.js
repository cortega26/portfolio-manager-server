import { toDateKey, transactionIsExternal } from './cash.js';

function cloneHoldings(holdings) {
  const result = new Map();
  for (const [ticker, value] of holdings.entries()) {
    result.set(ticker, value);
  }
  return result;
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

    return (a.id ?? '').localeCompare(b.id ?? '');
  });
}

function applyTransaction(state, tx) {
  const amount = Number.parseFloat(tx.amount ?? 0) || 0;
  const quantity = Number.parseFloat(tx.quantity ?? 0) || 0;
  const ticker = tx.ticker ?? null;

  switch (tx.type) {
    case 'DEPOSIT':
    case 'DIVIDEND':
    case 'INTEREST':
    case 'SELL':
      state.cash += amount;
      break;
    case 'WITHDRAWAL':
    case 'BUY':
    case 'FEE':
      state.cash -= amount;
      break;
    default:
      break;
  }

  if (ticker && ticker !== 'CASH' && quantity !== 0) {
    const next = (state.holdings.get(ticker) ?? 0) + quantity;
    state.holdings.set(ticker, Number(next.toFixed(6)));
  }
}

export function projectStateUntil(transactions, date) {
  const dateKey = toDateKey(date);
  const state = { cash: 0, holdings: new Map() };
  for (const tx of sortTransactions(transactions)) {
    if (tx.date > dateKey) {
      break;
    }
    applyTransaction(state, tx);
    state.cash = Number(state.cash.toFixed(6));
  }
  return state;
}

export function externalFlowsByDate(transactions) {
  const flows = new Map();
  for (const tx of transactions) {
    if (!transactionIsExternal(tx)) {
      continue;
    }
    const amount = Number.parseFloat(tx.amount ?? 0) || 0;
    const signed = tx.type === 'WITHDRAWAL' ? -amount : amount;
    const current = flows.get(tx.date) ?? 0;
    flows.set(tx.date, Number((current + signed).toFixed(6)));
  }
  return flows;
}

export function computeDailyStates({ transactions, pricesByDate, dates }) {
  const sortedTransactions = sortTransactions(transactions);
  const states = [];
  const state = { cash: 0, holdings: new Map() };
  let txIndex = 0;

  for (const dateKey of dates) {
    while (
      txIndex < sortedTransactions.length &&
      sortedTransactions[txIndex].date <= dateKey
    ) {
      applyTransaction(state, sortedTransactions[txIndex]);
      state.cash = Number(state.cash.toFixed(6));
      txIndex += 1;
    }
    const holdingsSnapshot = cloneHoldings(state.holdings);
    const priceMap = pricesByDate.get(dateKey) ?? new Map();
    let riskValue = 0;
    for (const [ticker, qty] of holdingsSnapshot.entries()) {
      const price = priceMap.get(ticker) ?? 0;
      riskValue += qty * price;
    }
    const nav = state.cash + riskValue;
    states.push({
      date: dateKey,
      cash: state.cash,
      holdings: holdingsSnapshot,
      riskValue: Number(riskValue.toFixed(6)),
      nav: Number(nav.toFixed(6)),
    });
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
    cash: state.cash / state.nav,
    risk: state.riskValue / state.nav,
  };
}
