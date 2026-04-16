import { sortTransactions, projectStateUntil } from "../finance/portfolio.js";
import { normalizeSettings } from "../../shared/settings.js";
import {
  deriveLastSignalReference,
  evaluateSignalRow,
  isOpenSignalHolding,
  isSignalStatusActionable,
  resolveSignalWindow,
} from "../../shared/signals.js";

export const SIGNAL_NOTIFICATION_STATE_TABLE = "signal_notification_states";
export const SIGNAL_NOTIFICATION_EVENT_TABLE = "signal_notifications";

const DEFAULT_NOTIFICATION_LIMIT = 50;
const MAX_NOTIFICATION_LIMIT = 200;

function normalizePortfolioId(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function portfolioScopeKey(portfolioId) {
  return normalizePortfolioId(portfolioId) ?? "__global__";
}

function matchesPortfolioScope(row, portfolioId) {
  return normalizePortfolioId(row?.portfolio_id) === normalizePortfolioId(portfolioId);
}

function normalizeLimit(limit) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_NOTIFICATION_LIMIT;
  }
  return Math.min(parsed, MAX_NOTIFICATION_LIMIT);
}

function resolvePriceSnapshot(priceSnapshots, ticker) {
  if (!(priceSnapshots instanceof Map) || typeof ticker !== "string") {
    return null;
  }
  const snapshot = priceSnapshots.get(ticker);
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }
  const price = Number(snapshot.price);
  return {
    price: Number.isFinite(price) ? price : null,
    asOf:
      typeof snapshot.asOf === "string" && snapshot.asOf.trim().length > 0
        ? snapshot.asOf
        : null,
  };
}

export function buildPortfolioSignalRows({
  transactions = [],
  signals = {},
  priceSnapshots = new Map(),
} = {}) {
  const sortedTransactions = sortTransactions(
    Array.isArray(transactions) ? transactions : [],
  );
  const lastTransactionDate =
    sortedTransactions.length > 0
      ? sortedTransactions[sortedTransactions.length - 1].date
      : null;
  const projectedState = lastTransactionDate
    ? projectStateUntil(sortedTransactions, lastTransactionDate)
    : { holdings: new Map() };
  const openTickers = Array.from(projectedState.holdings.entries())
    .filter(([, quantity]) => isOpenSignalHolding(quantity))
    .map(([ticker]) => ticker)
    .sort((left, right) => left.localeCompare(right));

  return openTickers.map((ticker) => {
    const priceSnapshot = resolvePriceSnapshot(priceSnapshots, ticker);
    return evaluateSignalRow({
      ticker,
      pctWindow: resolveSignalWindow(signals, ticker),
      currentPrice: priceSnapshot?.price ?? null,
      currentPriceAsOf: priceSnapshot?.asOf ?? null,
      reference: deriveLastSignalReference(sortedTransactions, ticker),
    });
  });
}

function buildSignalStateRow({
  portfolioId,
  row,
  source,
  evaluatedAt,
}) {
  return {
    portfolio_id: normalizePortfolioId(portfolioId),
    ticker: row.ticker,
    status: row.status,
    pct_window: row.pctWindow,
    current_price: row.currentPrice,
    current_price_as_of: row.currentPriceAsOf,
    lower_bound: row.lowerBound,
    upper_bound: row.upperBound,
    reference_price: row.referencePrice,
    reference_date: row.referenceDate,
    reference_type: row.referenceType,
    sanity_rejected: Boolean(row.sanityRejected),
    source,
    updated_at: evaluatedAt,
  };
}

function buildSignalNotificationRow({
  portfolioId,
  previousStatus,
  row,
  source,
  createdAt,
  settings,
}) {
  const normalizedPortfolioId = normalizePortfolioId(portfolioId);
  const emailEnabled = Boolean(settings?.notifications?.email);
  const scope = portfolioScopeKey(normalizedPortfolioId);
  const asOf = row.currentPriceAsOf ?? "na";
  const id = `${scope}:${row.ticker}:${row.status}:${asOf}:${source}`;
  return {
    id,
    portfolio_id: normalizedPortfolioId,
    ticker: row.ticker,
    status: row.status,
    previous_status: previousStatus ?? null,
    pct_window: row.pctWindow,
    current_price: row.currentPrice,
    current_price_as_of: row.currentPriceAsOf,
    lower_bound: row.lowerBound,
    upper_bound: row.upperBound,
    reference_price: row.referencePrice,
    reference_date: row.referenceDate,
    reference_type: row.referenceType,
    sanity_rejected: Boolean(row.sanityRejected),
    source,
    created_at: createdAt,
    acknowledged_at: null,
    channels: {
      email: emailEnabled,
    },
    delivery: {
      email: {
        status: emailEnabled ? "pending" : "disabled",
        attempts: 0,
        lastAttemptAt: null,
        deliveredAt: null,
        nextRetryAt: null,
        exhaustedAt: null,
        requeuedAt: null,
        failure: null,
        messageId: null,
      },
    },
  };
}

export async function syncPortfolioSignalNotifications({
  storage,
  portfolioId,
  portfolioState,
  priceSnapshots,
  source = "daily_close",
  now = new Date().toISOString(),
} = {}) {
  if (!storage) {
    throw new Error("syncPortfolioSignalNotifications requires a storage instance.");
  }

  const normalizedPortfolioId = normalizePortfolioId(portfolioId);
  const normalizedState =
    portfolioState && typeof portfolioState === "object" ? portfolioState : {};
  const settings = normalizeSettings(normalizedState.settings);
  const rows = buildPortfolioSignalRows({
    transactions: normalizedState.transactions ?? [],
    signals: normalizedState.signals ?? {},
    priceSnapshots,
  });

  const existingStates = await storage.readTable(SIGNAL_NOTIFICATION_STATE_TABLE);
  const previousStatesByTicker = new Map(
    existingStates
      .filter((row) => matchesPortfolioScope(row, normalizedPortfolioId))
      .map((row) => [row.ticker, row]),
  );
  const nextTickers = new Set(rows.map((row) => row.ticker));

  await storage.deleteWhere(
    SIGNAL_NOTIFICATION_STATE_TABLE,
    (row) =>
      matchesPortfolioScope(row, normalizedPortfolioId)
      && !nextTickers.has(row?.ticker),
  );

  const notifications = [];
  for (const row of rows) {
    const previousState = previousStatesByTicker.get(row.ticker) ?? null;
    if (
      isSignalStatusActionable(row.status)
      && previousState?.status !== row.status
    ) {
      const notification = buildSignalNotificationRow({
        portfolioId: normalizedPortfolioId,
        previousStatus: previousState?.status ?? null,
        row,
        source,
        createdAt: now,
        settings,
      });
      notifications.push(notification);
      await storage.upsertRow(SIGNAL_NOTIFICATION_EVENT_TABLE, notification, ["id"]);
    }

    await storage.upsertRow(
      SIGNAL_NOTIFICATION_STATE_TABLE,
      buildSignalStateRow({
        portfolioId: normalizedPortfolioId,
        row,
        source,
        evaluatedAt: now,
      }),
      ["portfolio_id", "ticker"],
    );
  }

  return {
    rows,
    notifications,
  };
}

export async function listPortfolioSignalNotifications(
  storage,
  portfolioId,
  { limit = DEFAULT_NOTIFICATION_LIMIT } = {},
) {
  if (!storage) {
    throw new Error("listPortfolioSignalNotifications requires a storage instance.");
  }
  const rows = await storage.readTable(SIGNAL_NOTIFICATION_EVENT_TABLE);
  const normalizedPortfolioId = normalizePortfolioId(portfolioId);
  return rows
    .filter((row) => matchesPortfolioScope(row, normalizedPortfolioId))
    .sort((left, right) => {
      const leftCreatedAt =
        typeof left?.created_at === "string" ? left.created_at : "";
      const rightCreatedAt =
        typeof right?.created_at === "string" ? right.created_at : "";
      return rightCreatedAt.localeCompare(leftCreatedAt);
    })
    .slice(0, normalizeLimit(limit));
}

export function buildPriceSnapshotsFromPriceRows(priceRows, asOfDate) {
  const snapshots = new Map();
  const targetDate =
    typeof asOfDate === "string" && asOfDate.trim().length > 0 ? asOfDate : null;
  if (!Array.isArray(priceRows) || !targetDate) {
    return snapshots;
  }

  const sortedRows = [...priceRows]
    .filter(
      (row) =>
        typeof row?.ticker === "string"
        && typeof row?.date === "string"
        && row.date <= targetDate,
    )
    .sort((left, right) => {
      const tickerCompare = left.ticker.localeCompare(right.ticker);
      if (tickerCompare !== 0) {
        return tickerCompare;
      }
      return left.date.localeCompare(right.date);
    });

  for (const row of sortedRows) {
    const price = Number(row?.adj_close ?? row?.price ?? row?.close);
    if (!Number.isFinite(price)) {
      continue;
    }
    snapshots.set(row.ticker, {
      price,
      asOf: row.date,
    });
  }

  return snapshots;
}
