import {
  applyTransactionSnapshot,
  buildHoldingsState,
  cloneHoldingsMap,
  holdingsMapToArray,
  revertTransactionSnapshot,
} from "./holdings.js";

function normalizeTransactions(transactions) {
  if (!Array.isArray(transactions)) {
    return [];
  }
  return transactions.map((transaction) => ({ ...transaction }));
}

export function buildLedgerFromTransactions(transactions, { logSummary = true } = {}) {
  const normalized = normalizeTransactions(transactions);
  const { holdingsMap, holdings, history } = buildHoldingsState(normalized, {
    logSummary,
  });

  return {
    transactions: normalized,
    holdingsMap,
    holdings,
    history,
  };
}

export function createInitialLedgerState() {
  return buildLedgerFromTransactions([], { logSummary: false });
}

function appendTransaction(state, transaction) {
  const nextTransactions = [...state.transactions, { ...transaction }];
  const nextMap = cloneHoldingsMap(state.holdingsMap);
  const snapshot = applyTransactionSnapshot(nextMap, transaction, []);
  const nextHistory = [...state.history, snapshot];

  return {
    transactions: nextTransactions,
    holdingsMap: nextMap,
    holdings: holdingsMapToArray(nextMap),
    history: nextHistory,
  };
}

function removeTransaction(state, index) {
  if (index < 0 || index >= state.transactions.length) {
    return state;
  }

  const nextTransactions = state.transactions.filter((_, idx) => idx !== index);

  if (index === state.transactions.length - 1) {
    const nextMap = cloneHoldingsMap(state.holdingsMap);
    const snapshot = state.history[state.history.length - 1];
    revertTransactionSnapshot(nextMap, snapshot);
    return {
      transactions: nextTransactions,
      holdingsMap: nextMap,
      holdings: holdingsMapToArray(nextMap),
      history: state.history.slice(0, -1),
    };
  }

  return buildLedgerFromTransactions(nextTransactions, { logSummary: false });
}

export function ledgerReducer(state, action) {
  switch (action.type) {
    case "append":
      return appendTransaction(state, action.transaction);
    case "remove":
      return removeTransaction(state, action.index);
    case "replace":
      return buildLedgerFromTransactions(action.transactions, {
        logSummary: action.logSummary !== false,
      });
    default:
      return state;
  }
}

