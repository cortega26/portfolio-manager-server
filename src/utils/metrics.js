import { formatCurrency, formatNumber, formatPercent } from "./format.js";

function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

const identityTranslate = (key) => key;

function resolveFormatter(provided, fallback) {
  if (typeof provided === "function") {
    return provided;
  }
  return fallback;
}

export function buildMetricCards(
  metrics,
  { translate, formatCurrency: formatCurrencyOption, formatPercent: formatPercentOption, formatNumber: formatNumberOption } = {},
) {
  if (!metrics) {
    return [];
  }

  const t = typeof translate === "function" ? translate : identityTranslate;
  const formatCurrencyFn = resolveFormatter(formatCurrencyOption, (value, options) => formatCurrency(value, options));
  const formatPercentFn = resolveFormatter(
    formatPercentOption,
    (value, fractionDigits = 2, options) => formatPercent(value, fractionDigits, options),
  );
  const formatNumberFn = resolveFormatter(
    formatNumberOption,
    (value, options) => formatNumber(value, options),
  );

  const totalValue = safeNumber(metrics.totalValue);
  const totalCost = safeNumber(metrics.totalCost);
  const totalRealised = safeNumber(metrics.totalRealised);
  const totalUnrealised = safeNumber(metrics.totalUnrealised);
  const totalReturn = totalRealised + totalUnrealised;
  const returnPct = totalCost === 0 ? 0 : (totalReturn / totalCost) * 100;
  const costCoverage = totalCost === 0 ? 0 : totalValue / totalCost;
  const coverageDisplay = formatNumberFn(costCoverage, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return [
    {
      label: t("metrics.cards.nav.label"),
      value: formatCurrencyFn(totalValue),
      detail: t("metrics.cards.nav.detail", { count: metrics.holdingsCount ?? 0 }),
    },
    {
      label: t("metrics.cards.cost.label"),
      value: formatCurrencyFn(totalCost),
      detail: t("metrics.cards.cost.detail", { realised: formatCurrencyFn(totalRealised) }),
    },
    {
      label: t("metrics.cards.return.label"),
      value: formatCurrencyFn(totalReturn),
      detail: t("metrics.cards.return.detail", { percent: formatPercentFn(returnPct, 1) }),
    },
    {
      label: t("metrics.cards.coverage.label"),
      value: coverageDisplay,
      detail: t("metrics.cards.coverage.detail"),
    },
  ];
}

export function calculateAllocationBreakdown(holdings, currentPrices) {
  if (!Array.isArray(holdings) || holdings.length === 0) {
    return [];
  }

  const rows = holdings.map((holding) => {
    const price = safeNumber(currentPrices?.[holding.ticker]);
    const value = safeNumber(holding.shares) * price;
    return { ticker: holding.ticker, value };
  });
  const totalValue = rows.reduce((total, row) => total + row.value, 0);
  if (totalValue === 0) {
    return [];
  }

  return rows
    .map((row) => ({ ...row, weight: row.value / totalValue }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10);
}

export function derivePerformanceHighlights(
  roiSeries,
  { translate, formatPercent: formatPercentOption, formatDate } = {},
) {
  if (!Array.isArray(roiSeries) || roiSeries.length === 0) {
    return [];
  }

  const t = typeof translate === "function" ? translate : identityTranslate;
  const formatPercentFn = resolveFormatter(
    formatPercentOption,
    (value, fractionDigits = 2, options) => formatPercent(value, fractionDigits, options),
  );
  const formatDateFn = typeof formatDate === "function" ? formatDate : (value) => value;

  let best = roiSeries[0];
  let worst = roiSeries[0];
  let sum = 0;
  let trackingSum = 0;

  roiSeries.forEach((point) => {
    if (point.portfolio > best.portfolio) {
      best = point;
    }
    if (point.portfolio < worst.portfolio) {
      worst = point;
    }
    sum += point.portfolio;
    trackingSum += Math.abs(safeNumber(point.portfolio) - safeNumber(point.spy ?? 0));
  });

  const avg = sum / roiSeries.length;
  const trackingError = trackingSum / roiSeries.length;

  const formatDateValue = (value) => {
    const formatted = formatDateFn(value);
    if (formatted === undefined || formatted === null) {
      return "—";
    }
    return String(formatted);
  };

  return [
    {
      label: t("metrics.performance.best.label"),
      value: formatPercentFn(best.portfolio, 2),
      description: t("metrics.performance.best.description", { date: formatDateValue(best.date) }),
    },
    {
      label: t("metrics.performance.worst.label"),
      value: formatPercentFn(worst.portfolio, 2),
      description: t("metrics.performance.worst.description", { date: formatDateValue(worst.date) }),
    },
    {
      label: t("metrics.performance.average.label"),
      value: formatPercentFn(avg, 2),
      description: t("metrics.performance.average.description", { count: roiSeries.length }),
    },
    {
      label: t("metrics.performance.trackingGap.label"),
      value: formatPercentFn(trackingError, 2),
      description: t("metrics.performance.trackingGap.description"),
    },
  ];
}
