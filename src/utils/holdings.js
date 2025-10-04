import { formatCurrency } from "./format.js";

export function buildHoldings(transactions) {
  const map = new Map();

  transactions.forEach((tx) => {
    const ticker = tx.ticker?.trim().toUpperCase();
    if (!ticker) {
      return;
    }

    if (!map.has(ticker)) {
      map.set(ticker, { ticker, shares: 0, cost: 0, realised: 0 });
    }

    const holding = map.get(ticker);
    if (tx.type === "BUY") {
      holding.shares += tx.shares;
      holding.cost += Math.abs(tx.amount);
    } else if (tx.type === "SELL") {
      const avgCost = holding.shares ? holding.cost / holding.shares : 0;
      holding.shares -= tx.shares;
      holding.cost -= avgCost * tx.shares;
      holding.realised += tx.amount - avgCost * tx.shares;
    }
  });

  return Array.from(map.values());
}

export function deriveHoldingStats(holding, currentPrice) {
  const avgCost = holding.shares ? holding.cost / holding.shares : 0;
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
