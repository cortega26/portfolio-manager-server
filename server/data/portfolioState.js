import { CASH_POLICY_SCHEMA_VERSION, PORTFOLIO_SCHEMA_VERSION } from '../../shared/constants.js';
import { normalizeSettings } from '../../shared/settings.js';

const PORTFOLIO_STATE_TABLE = 'portfolio_states';
const TRANSACTIONS_TABLE = 'transactions';

function cloneValue(value) {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function normalizeCashPolicy(cash) {
  const currency =
    typeof cash?.currency === 'string' && cash.currency.trim().length === 3
      ? cash.currency.trim().toUpperCase()
      : 'USD';
  const apyTimeline = Array.isArray(cash?.apyTimeline)
    ? cash.apyTimeline.map((entry) => ({
        from: entry?.from,
        to: entry?.to ?? null,
        apy: Number(entry?.apy ?? 0),
      }))
    : [];
  return {
    currency,
    apyTimeline,
    version: CASH_POLICY_SCHEMA_VERSION,
  };
}

function normalizePortfolioRecord(record, portfolioId) {
  return {
    id: portfolioId,
    displayName:
      typeof record?.displayName === 'string' && record.displayName.trim().length > 0
        ? record.displayName.trim()
        : portfolioId,
    schemaVersion:
      Number.isFinite(record?.schemaVersion) && record.schemaVersion > 0
        ? record.schemaVersion
        : PORTFOLIO_SCHEMA_VERSION,
    signals:
      record?.signals && typeof record.signals === 'object' ? cloneValue(record.signals) : {},
    settings: normalizeSettings(cloneValue(record?.settings)),
    cash: normalizeCashPolicy(record?.cash),
  };
}

function stripPortfolioId(row) {
  if (!row || typeof row !== 'object') {
    return row;
  }
  const { portfolio_id: portfolioId, ...rest } = row;
  void portfolioId;
  return rest;
}

export async function readPortfolioState(storage, portfolioId) {
  const [portfolioStates, transactions] = await Promise.all([
    storage.readTable(PORTFOLIO_STATE_TABLE),
    storage.readTable(TRANSACTIONS_TABLE),
  ]);
  const record = portfolioStates.find((row) => row?.id === portfolioId) ?? null;
  const portfolioTransactions = transactions
    .filter((row) => row?.portfolio_id === portfolioId)
    .map((row) => stripPortfolioId(row));

  if (!record && portfolioTransactions.length === 0) {
    return null;
  }

  return {
    ...normalizePortfolioRecord(record, portfolioId),
    transactions: portfolioTransactions,
  };
}

export async function writePortfolioState(storage, portfolioId, state) {
  const record = normalizePortfolioRecord(state, portfolioId);
  const transactions = Array.isArray(state?.transactions)
    ? state.transactions.map((transaction) => ({
        ...cloneValue(transaction),
        portfolio_id: portfolioId,
      }))
    : [];

  // Both reads and writes now happen inside a single lock — no race window.
  await storage.withAtomicLock(async ({ readTable, writeTable }) => {
    const existingTransactions = await readTable(TRANSACTIONS_TABLE);
    const otherPortfolioTransactions = existingTransactions.filter(
      (row) => row?.portfolio_id !== portfolioId
    );
    const nextTransactions = [...otherPortfolioTransactions, ...transactions];

    const existingStates = await readTable(PORTFOLIO_STATE_TABLE);
    const nextRecord = { ...record, updated_at: new Date().toISOString() };
    const otherStates = existingStates.filter((row) => row?.id !== portfolioId);
    const nextStates = [...otherStates, nextRecord];

    writeTable(TRANSACTIONS_TABLE, nextTransactions);
    writeTable(PORTFOLIO_STATE_TABLE, nextStates);
  });
}

export async function listPortfolioStates(storage) {
  const rows = await storage.readTable(PORTFOLIO_STATE_TABLE);
  return rows.map((row) => ({
    id: row?.id,
    cash: normalizeCashPolicy(row?.cash),
  }));
}

export async function listPortfolioSummaries(storage) {
  const [states, transactions] = await Promise.all([
    storage.readTable(PORTFOLIO_STATE_TABLE),
    storage.readTable(TRANSACTIONS_TABLE),
  ]);
  const txnCounts = new Map();
  let latestTxnDate = null;
  for (const t of transactions) {
    const pid = t?.portfolio_id;
    if (pid) txnCounts.set(pid, (txnCounts.get(pid) ?? 0) + 1);
    if (t?.date && (!latestTxnDate || t.date > latestTxnDate)) latestTxnDate = t.date;
  }
  return states.map((row) => {
    const id = row?.id ?? '';
    return {
      id,
      displayName:
        typeof row?.displayName === 'string' && row.displayName.trim().length > 0
          ? row.displayName.trim()
          : id,
      currency: row?.cash?.currency ?? 'USD',
      transactionCount: txnCounts.get(id) ?? 0,
      updatedAt: row?.updated_at ?? null,
    };
  });
}

export async function deletePortfolioState(storage, portfolioId) {
  const [existingStates, existingTransactions] = await Promise.all([
    storage.readTable(PORTFOLIO_STATE_TABLE),
    storage.readTable(TRANSACTIONS_TABLE),
  ]);

  const nextStates = existingStates.filter((row) => row?.id !== portfolioId);
  const nextTransactions = existingTransactions.filter((row) => row?.portfolio_id !== portfolioId);

  await storage.atomicBatchWrite([
    { table: PORTFOLIO_STATE_TABLE, rows: nextStates },
    { table: TRANSACTIONS_TABLE, rows: nextTransactions },
  ]);
}

export const PORTFOLIO_STATE_TABLE_NAME = PORTFOLIO_STATE_TABLE;
