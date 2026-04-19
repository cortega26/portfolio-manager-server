import {
  CASH_POLICY_SCHEMA_VERSION,
  PORTFOLIO_SCHEMA_VERSION,
} from "../../shared/constants.js";
import { normalizeSettings } from "../../shared/settings.js";

const PORTFOLIO_STATE_TABLE = "portfolio_states";
const TRANSACTIONS_TABLE = "transactions";

function cloneValue(value) {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function normalizeCashPolicy(cash) {
  const currency =
    typeof cash?.currency === "string" && cash.currency.trim().length === 3
      ? cash.currency.trim().toUpperCase()
      : "USD";
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
    schemaVersion:
      Number.isFinite(record?.schemaVersion) && record.schemaVersion > 0
        ? record.schemaVersion
        : PORTFOLIO_SCHEMA_VERSION,
    signals:
      record?.signals && typeof record.signals === "object"
        ? cloneValue(record.signals)
        : {},
    settings: normalizeSettings(cloneValue(record?.settings)),
    cash: normalizeCashPolicy(record?.cash),
  };
}

function stripPortfolioId(row) {
  if (!row || typeof row !== "object") {
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

  // Build the full transactions table: keep rows belonging to OTHER portfolios,
  // then append the new rows for this portfolio — all written atomically.
  const existingTransactions = await storage.readTable(TRANSACTIONS_TABLE);
  const otherPortfolioTransactions = existingTransactions.filter(
    (row) => row?.portfolio_id !== portfolioId,
  );
  const nextTransactions = [...otherPortfolioTransactions, ...transactions];

  // Read existing portfolio_states so we can upsert without clobbering others.
  const existingStates = await storage.readTable(PORTFOLIO_STATE_TABLE);
  const nextRecord = { ...record, updated_at: new Date().toISOString() };
  const otherStates = existingStates.filter((row) => row?.id !== portfolioId);
  const nextStates = [...otherStates, nextRecord];

  // Single atomic write: one lock, one SQLite transaction, one persist.
  // If the process crashes after this call starts but before it completes,
  // SQLite rolls back — no partial state is ever written to disk.
  await storage.atomicBatchWrite([
    { table: TRANSACTIONS_TABLE, rows: nextTransactions },
    { table: PORTFOLIO_STATE_TABLE, rows: nextStates },
  ]);
}

export async function listPortfolioStates(storage) {
  const rows = await storage.readTable(PORTFOLIO_STATE_TABLE);
  return rows.map((row) => ({
    id: row?.id,
    cash: normalizeCashPolicy(row?.cash),
  }));
}

export const PORTFOLIO_STATE_TABLE_NAME = PORTFOLIO_STATE_TABLE;
