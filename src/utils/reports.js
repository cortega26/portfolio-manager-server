import { formatCurrency, formatPercent } from "./format.js";
import { deriveHoldingStats } from "./holdings.js";

function toCsvValue(value) {
  if (value == null) {
    return "";
  }
  const stringValue = String(value);
  if (stringValue.includes(",") || stringValue.includes("\n") || stringValue.includes('"')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function toCsv(rows) {
  return rows.map((row) => row.map(toCsvValue).join(",")).join("\n");
}

export function buildReportSummary(transactions, holdings, metrics) {
  const totalValue = metrics ? formatCurrency(metrics.totalValue ?? 0) : "$0.00";
  const unrealised = metrics ? formatCurrency(metrics.totalUnrealised ?? 0) : "$0.00";
  const transactionCount = Array.isArray(transactions) ? transactions.length : 0;
  const tickers = Array.isArray(holdings)
    ? new Set(holdings.map((holding) => holding.ticker)).size
    : 0;
  const lastActivity = Array.isArray(transactions) && transactions.length > 0
    ? [...transactions]
        .filter((tx) => Boolean(tx.date))
        .sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.date ?? "—"
    : "—";

  return [
    {
      label: "Transactions",
      value: transactionCount.toString(),
      detail: `Last activity ${lastActivity}`,
    },
    {
      label: "Active tickers",
      value: tickers.toString(),
      detail: `${Array.isArray(holdings) ? holdings.length : 0} holdings entries`,
    },
    {
      label: "Portfolio value",
      value: totalValue,
      detail: unrealised,
    },
    {
      label: "ROI coverage",
      value: Array.isArray(transactions) && transactions.length > 0 ? "Ready" : "Pending",
      detail: "Requires pricing for CSV exports",
    },
  ];
}

export function buildTransactionsCsv(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return "";
  }

  const header = [
    "date",
    "ticker",
    "type",
    "amount",
    "price",
    "shares",
  ];
  const rows = transactions.map((tx) => [
    tx.date,
    tx.ticker,
    tx.type,
    tx.amount,
    tx.price,
    tx.shares,
  ]);
  return toCsv([header, ...rows]);
}

export function buildHoldingsCsv(holdings, currentPrices) {
  if (!Array.isArray(holdings) || holdings.length === 0) {
    return "";
  }

  const header = [
    "ticker",
    "shares",
    "avg_cost",
    "current_price",
    "value",
    "unrealised_pnl",
    "realised_pnl",
  ];
  const rows = holdings.map((holding) => {
    const enriched = deriveHoldingStats(holding, currentPrices?.[holding.ticker]);
    return [
      holding.ticker,
      holding.shares,
      enriched.avgCost,
      currentPrices?.[holding.ticker] ?? 0,
      enriched.value,
      enriched.unrealised,
      holding.realised,
    ];
  });
  return toCsv([header, ...rows]);
}

export function buildPerformanceCsv(roiSeries) {
  if (!Array.isArray(roiSeries) || roiSeries.length === 0) {
    return "";
  }

  const header = ["date", "portfolio_roi", "spy_roi", "spread"];
  const rows = roiSeries.map((point) => [
    point.date,
    formatPercent(point.portfolio, 3),
    formatPercent(point.spy ?? 0, 3),
    formatPercent((point.portfolio ?? 0) - (point.spy ?? 0), 3),
  ]);
  return toCsv([header, ...rows]);
}

export function triggerCsvDownload(filename, csvContent, globalScope = globalThis) {
  if (!csvContent || typeof csvContent !== "string") {
    return false;
  }

  const hasWindow = typeof globalScope?.window !== "undefined";
  const hasDocument = typeof globalScope?.document !== "undefined";
  if (!hasWindow || !hasDocument) {
    return false;
  }

  const { document } = globalScope;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = globalScope.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  globalScope.URL.revokeObjectURL(url);
  return true;
}
