import { formatCurrency, formatPercent } from "./format.js";
import { deriveHoldingStats } from "./holdings.js";
import { sanitizeCsvCell } from "./csv.js";

const REPORT_SUMMARY_FALLBACKS = Object.freeze({
  "reports.summary.cards.transactions.label": "Transactions",
  "reports.summary.cards.transactions.detail": "Last activity {lastActivity}",
  "reports.summary.cards.tickers.label": "Active tickers",
  "reports.summary.cards.tickers.detail": "{count} holdings entries",
  "reports.summary.cards.portfolioValue.label": "Portfolio value",
  "reports.summary.cards.portfolioValue.detail": "{unrealised}",
  "reports.summary.cards.roiCoverage.label": "ROI coverage",
  "reports.summary.cards.roiCoverage.value.ready": "Ready",
  "reports.summary.cards.roiCoverage.value.pending": "Pending",
  "reports.summary.cards.roiCoverage.detail": "Requires pricing for CSV exports",
});

function interpolate(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (_, token) =>
    Object.prototype.hasOwnProperty.call(values, token) ? String(values[token]) : `{${token}}`,
  );
}

function createReportTranslator(translate) {
  if (typeof translate === "function") {
    return (key, values) => {
      const result = translate(key, values);
      if (result === key && REPORT_SUMMARY_FALLBACKS[key]) {
        return interpolate(REPORT_SUMMARY_FALLBACKS[key], values);
      }
      return result;
    };
  }
  return (key, values) => interpolate(REPORT_SUMMARY_FALLBACKS[key] ?? key, values);
}

function toCsvValue(value) {
  const sanitized = sanitizeCsvCell(value);
  if (sanitized === "") {
    return "";
  }
  if (sanitized.includes(",") || sanitized.includes("\n") || sanitized.includes('"')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

function toCsv(rows) {
  return rows.map((row) => row.map(toCsvValue).join(",")).join("\n");
}

export function buildReportSummary(
  transactions,
  holdings,
  metrics,
  { translate, formatDate } = {},
) {
  const t = createReportTranslator(translate);
  const formatDateValue =
    typeof formatDate === "function"
      ? (value) => formatDate(value, { dateStyle: "medium" })
      : (value) => value;

  const totalValue = metrics ? formatCurrency(metrics.totalValue ?? 0) : "$0.00";
  const unrealised = metrics ? formatCurrency(metrics.totalUnrealised ?? 0) : "$0.00";
  const transactionCount = Array.isArray(transactions) ? transactions.length : 0;
  const holdingsCount = Array.isArray(holdings) ? holdings.length : 0;
  const tickers = Array.isArray(holdings)
    ? new Set(holdings.map((holding) => holding.ticker)).size
    : 0;
  const lastActivityRaw = Array.isArray(transactions) && transactions.length > 0
    ? [...transactions]
        .filter((tx) => Boolean(tx.date))
        .sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.date ?? "—"
    : "—";
  const lastActivity =
    lastActivityRaw === "—"
      ? "—"
      : formatDateValue(lastActivityRaw) ?? "—";
  const roiStatusKey =
    transactionCount > 0
      ? "reports.summary.cards.roiCoverage.value.ready"
      : "reports.summary.cards.roiCoverage.value.pending";

  return [
    {
      label: t("reports.summary.cards.transactions.label"),
      value: transactionCount.toString(),
      detail: t("reports.summary.cards.transactions.detail", { lastActivity }),
    },
    {
      label: t("reports.summary.cards.tickers.label"),
      value: tickers.toString(),
      detail: t("reports.summary.cards.tickers.detail", { count: holdingsCount }),
    },
    {
      label: t("reports.summary.cards.portfolioValue.label"),
      value: totalValue,
      detail: t("reports.summary.cards.portfolioValue.detail", { unrealised }),
    },
    {
      label: t("reports.summary.cards.roiCoverage.label"),
      value: t(roiStatusKey),
      detail: t("reports.summary.cards.roiCoverage.detail"),
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

  const header = [
    "date",
    "portfolio_roi",
    "spy_roi",
    "blended_roi",
    "ex_cash_roi",
    "cash_roi",
    "spy_spread",
  ];
  const rows = roiSeries.map((point) => [
    point.date,
    formatPercent(point.portfolio, 3),
    formatPercent(point.spy ?? 0, 3),
    formatPercent(point.blended ?? 0, 3),
    formatPercent(point.exCash ?? 0, 3),
    formatPercent(point.cash ?? 0, 3),
    formatPercent((point.portfolio ?? 0) - (point.spy ?? 0), 3),
  ]);
  return toCsv([header, ...rows]);
}

export function buildSecurityEventsCsv(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return "";
  }

  const header = [
    "timestamp",
    "event",
    "portfolio_id",
    "ip",
    "user_agent",
    "request_id",
    "metadata",
  ];

  const rows = events.map((event) => {
    const {
      timestamp,
      event: eventName,
      portfolio_id: portfolioId,
      ip,
      user_agent: userAgent,
      request_id: requestId,
      ...rest
    } = event ?? {};
    const metadata = Object.keys(rest).length > 0 ? JSON.stringify(rest) : "";
    return [timestamp, eventName, portfolioId, ip, userAgent, requestId, metadata];
  });

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
