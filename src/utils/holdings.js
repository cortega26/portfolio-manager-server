import { formatCurrency } from "./format.js";

/**
 * Build holdings from transaction history.
 *
 * AUDIT FIX (CRITICAL-3): Added validation to prevent negative shares
 * - Clips SELL transactions to available shares
 * - Logs warnings for oversell attempts
 * - Handles floating-point dust with tolerance
 */
const SHARE_EPSILON = 1e-8;

function normalizeTicker(rawTicker) {
  return rawTicker?.trim().toUpperCase() ?? "";
}

function cloneHoldingRecord(holding) {
  return {
    ticker: holding.ticker,
    shares: holding.shares,
    cost: holding.cost,
    realised: holding.realised,
  };
}

function holdingsMapToArrayInternal(map) {
  return Array.from(map.values(), (holding) => cloneHoldingRecord(holding));
}

function getOrCreateHolding(map, ticker) {
  if (!map.has(ticker)) {
    map.set(ticker, { ticker, shares: 0, cost: 0, realised: 0 });
  }
  return map.get(ticker);
}

function applyBuy(holding, transaction) {
  holding.shares += transaction.shares;
  holding.cost += Math.abs(transaction.amount);
}

function normaliseShareBook(holding) {
  if (Math.abs(holding.shares) < SHARE_EPSILON) {
    holding.shares = 0;
    holding.cost = 0;
    return;
  }
  holding.shares = Number(holding.shares.toFixed(8));
  holding.cost = Number(holding.cost.toFixed(6));
}

function buildOversellWarning({ ticker, transaction, holding, sharesToSell }) {
  return {
    ticker,
    date: transaction.date,
    issue: "oversell",
    attempted: transaction.shares,
    available: holding.shares,
    clipped: sharesToSell,
  };
}

function applySell(holding, transaction, { ticker, warnings }) {
  const avgCost = holding.shares > 0 ? holding.cost / holding.shares : 0;
  const sharesToSell = Math.min(transaction.shares, holding.shares);

  if (transaction.shares > holding.shares + 1e-6) {
    const warning = buildOversellWarning({ ticker, transaction, holding, sharesToSell });
    warnings.push(warning);
    console.warn(
      `[HOLDINGS WARNING] Cannot sell ${transaction.shares.toFixed(8)} shares of ${ticker} on ${transaction.date}. ` +
        `Only ${holding.shares.toFixed(8)} shares available. Clipping to available shares.`,
    );
  }

  holding.shares -= sharesToSell;
  holding.cost -= avgCost * sharesToSell;
  holding.realised += transaction.amount - avgCost * sharesToSell;
  normaliseShareBook(holding);
}

function applyTransactionToMap(map, transaction, warnings) {
  const ticker = normalizeTicker(transaction.ticker);
  if (!ticker) {
    return null;
  }

  if (transaction.type !== "BUY" && transaction.type !== "SELL") {
    return null;
  }

  const previous = map.has(ticker) ? cloneHoldingRecord(map.get(ticker)) : null;
  const holding = getOrCreateHolding(map, ticker);

  if (transaction.type === "BUY") {
    applyBuy(holding, transaction);
  } else {
    applySell(holding, transaction, { ticker, warnings });
  }

  return { ticker, previous };
}

function buildHoldingsStateInternal(transactions, { logSummary }) {
  const map = new Map();
  const warnings = [];
  const history = [];

  for (const transaction of transactions) {
    const change = applyTransactionToMap(map, transaction, warnings);
    history.push(change);
  }

  if (logSummary && warnings.length > 0) {
    console.warn(`[HOLDINGS] Generated ${warnings.length} warning(s) during processing.`);
  }

  return {
    holdingsMap: map,
    holdings: holdingsMapToArrayInternal(map),
    history,
    warnings,
  };
}

export function cloneHoldingsMap(holdingsMap) {
  const clone = new Map();
  for (const [ticker, holding] of holdingsMap.entries()) {
    clone.set(ticker, cloneHoldingRecord(holding));
  }
  return clone;
}

export function applyTransactionSnapshot(map, transaction, warnings = []) {
  return applyTransactionToMap(map, transaction, warnings);
}

export function revertTransactionSnapshot(map, snapshot) {
  if (!snapshot || !snapshot.ticker) {
    return;
  }
  if (snapshot.previous) {
    map.set(snapshot.ticker, cloneHoldingRecord(snapshot.previous));
    return;
  }
  map.delete(snapshot.ticker);
}

export function holdingsMapToArray(map) {
  return holdingsMapToArrayInternal(map);
}

export function buildHoldingsState(transactions, options = {}) {
  const settings = { logSummary: true, ...options };
  return buildHoldingsStateInternal(transactions, settings);
}

export function buildHoldings(transactions) {
  return buildHoldingsStateInternal(transactions, { logSummary: true }).holdings;
}

export function deriveHoldingStats(holding, currentPrice) {
  const avgCost = holding.shares > 0 ? holding.cost / holding.shares : 0;
  const value = holding.shares * (currentPrice ?? 0);
  const unrealised = value - holding.cost;

  return {
    ...holding,
    avgCost,
    value,
    unrealised,
    avgCostLabel: formatCurrency(avgCost),
    valueLabel: formatCurrency(value),
    unrealisedLabel: formatCurrency(unrealised),
    priceLabel: formatCurrency(currentPrice),
    realisedLabel: formatCurrency(holding.realised),
  };
}

export function deriveSignalRow(holding, currentPrice, pctWindow) {
  if (!currentPrice) {
    return {
      ticker: holding.ticker,
      pctWindow,
      price: "—",
      lower: "—",
      upper: "—",
      signal: "NO DATA",
    };
  }

  const lower = currentPrice * (1 - pctWindow / 100);
  const upper = currentPrice * (1 + pctWindow / 100);
  let signal = "HOLD";
  if (currentPrice < lower) {
    signal = "BUY zone";
  } else if (currentPrice > upper) {
    signal = "TRIM zone";
  }

  return {
    ticker: holding.ticker,
    pctWindow,
    price: formatCurrency(currentPrice),
    lower: formatCurrency(lower),
    upper: formatCurrency(upper),
    signal,
  };
}

export function computeDashboardMetrics(holdings, currentPrices) {
  return holdings.reduce(
    (acc, holding) => {
      const price = currentPrices[holding.ticker] ?? 0;
      const value = holding.shares * price;
      acc.totalValue += value;
      acc.totalCost += holding.cost;
      acc.totalRealised += holding.realised;
      acc.totalUnrealised += value - holding.cost;
      return acc;
    },
    {
      totalValue: 0,
      totalCost: 0,
      totalRealised: 0,
      totalUnrealised: 0,
      holdingsCount: holdings.length,
    },
  );
}
