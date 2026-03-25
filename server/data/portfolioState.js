import {
  CASH_POLICY_SCHEMA_VERSION,
  PORTFOLIO_SCHEMA_VERSION,
} from "../../shared/constants.js";

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
    settings:
      record?.settings && typeof record.settings === "object"
        ? cloneValue(record.settings)
        : { autoClip: false },
    cash: normalizeCashPolicy(record?.cash),
  };
}

function stripPortfolioId(row) {
  if (!row || typeof row !== "object") {
    return row;
  }
  const { portfolio_id: _portfolioId, ...rest } = row;
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

  await storage.deleteWhere(
    TRANSACTIONS_TABLE,
    (row) => row?.portfolio_id === portfolioId,
  );
  for (const transaction of transactions) {
    await storage.upsertRow(
      TRANSACTIONS_TABLE,
      transaction,
      ["portfolio_id", "uid"],
    );
  }
  await storage.upsertRow(
    PORTFOLIO_STATE_TABLE,
    {
      ...record,
      updated_at: new Date().toISOString(),
    },
    ["id"],
  );
}

export async function listPortfolioStates(storage) {
  const rows = await storage.readTable(PORTFOLIO_STATE_TABLE);
  return rows.map((row) => ({
    id: row?.id,
    cash: normalizeCashPolicy(row?.cash),
  }));
}

export const PORTFOLIO_STATE_TABLE_NAME = PORTFOLIO_STATE_TABLE;

