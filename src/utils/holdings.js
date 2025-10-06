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

export function buildHoldings(transactions) {
  const map = new Map();
  const warnings = [];

  for (const transaction of transactions) {
    const ticker = normalizeTicker(transaction.ticker);
    if (!ticker) {
      continue;
    }

    const holding = getOrCreateHolding(map, ticker);

    if (transaction.type === "BUY") {
      applyBuy(holding, transaction);
      continue;
    }

    if (transaction.type === "SELL") {
      applySell(holding, transaction, { ticker, warnings });
    }
  }

  if (warnings.length > 0) {
    console.warn(`[HOLDINGS] Generated ${warnings.length} warning(s) during processing.`);
  }

  return Array.from(map.values());
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
