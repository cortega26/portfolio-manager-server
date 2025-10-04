import { formatCurrency, formatPercent } from "./format.js";

function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function buildMetricCards(metrics) {
  if (!metrics) {
    return [];
  }

  const totalValue = safeNumber(metrics.totalValue);
  const totalCost = safeNumber(metrics.totalCost);
  const totalRealised = safeNumber(metrics.totalRealised);
  const totalUnrealised = safeNumber(metrics.totalUnrealised);
  const totalReturn = totalRealised + totalUnrealised;
  const returnPct = totalCost === 0 ? 0 : (totalReturn / totalCost) * 100;
  const costCoverage = totalCost === 0 ? 0 : totalValue / totalCost;

  return [
    {
      label: "Net Asset Value",
      value: formatCurrency(totalValue),
      detail: `Across ${metrics.holdingsCount ?? 0} positions`,
    },
    {
      label: "Invested Capital",
      value: formatCurrency(totalCost),
      detail: `${formatCurrency(totalRealised)} realised gains`,
    },
    {
      label: "Total Return",
      value: formatCurrency(totalReturn),
      detail: formatPercent(returnPct, 1),
    },
    {
      label: "Coverage Ratio",
      value: costCoverage.toFixed(2),
      detail: "Value / Cost",
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

export function derivePerformanceHighlights(roiSeries) {
  if (!Array.isArray(roiSeries) || roiSeries.length === 0) {
    return [];
  }

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

  return [
    {
      label: "Best session",
      value: formatPercent(best.portfolio, 2),
      description: `Recorded on ${best.date}`,
    },
    {
      label: "Worst session",
      value: formatPercent(worst.portfolio, 2),
      description: `Recorded on ${worst.date}`,
    },
    {
      label: "Average daily return",
      value: formatPercent(avg, 2),
      description: `${roiSeries.length} total observations`,
    },
    {
      label: "Tracking gap",
      value: formatPercent(trackingError, 2),
      description: "Avg |Portfolio ROI − SPY|",
    },
  ];
}
