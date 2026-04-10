import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

import { useI18n } from "../i18n/I18nProvider.jsx";

const SLICE_COLORS = [
  "#6366f1", // indigo
  "#22c55e", // green
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#8b5cf6", // violet
  "#ef4444", // red
  "#06b6d4", // cyan
];

const CASH_COLOR = "#94a3b8"; // slate-400

/**
 * Computes allocation slices from open holdings + cash.
 *
 * @param {Array} openHoldings - array of holding objects with .ticker, .shares, .cost
 * @param {Object} currentPrices - map of ticker → price (number)
 * @param {number} cashBalance - current cash balance
 * @returns {{ slices: Array, totalNav: number }}
 */
export function computeAllocationSlices(openHoldings, currentPrices, cashBalance) {
  if (!Array.isArray(openHoldings)) {
    return { slices: [], totalNav: 0 };
  }

  const cash = Number.isFinite(Number(cashBalance)) ? Number(cashBalance) : 0;

  const equitySlices = openHoldings
    .map((holding) => {
      const ticker = holding?.ticker;
      if (!ticker) return null;

      const shares = Number(holding?.shares ?? 0);
      const price = Number(currentPrices?.[ticker] ?? 0);
      if (!Number.isFinite(shares) || !Number.isFinite(price) || price <= 0) {
        return null;
      }
      const value = shares * price;
      if (value <= 0) return null;

      return { ticker, value };
    })
    .filter(Boolean);

  const totalEquity = equitySlices.reduce((sum, s) => sum + s.value, 0);
  const totalNav = totalEquity + Math.max(0, cash);

  if (totalNav <= 0) {
    return { slices: [], totalNav: 0 };
  }

  const slices = equitySlices.map((s) => ({
    ticker: s.ticker,
    value: s.value,
    percentage: (s.value / totalNav) * 100,
  }));

  if (cash > 0) {
    slices.push({
      ticker: "Cash",
      value: cash,
      percentage: (cash / totalNav) * 100,
    });
  }

  return { slices, totalNav };
}

function AllocationTooltip({ active, payload, formatCurrency }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) {
    return null;
  }
  const entry = payload[0]?.payload;
  if (!entry) return null;

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        {entry.ticker}
      </p>
      <p className="text-xs text-slate-600 dark:text-slate-300">
        {formatCurrency(entry.value)} · {entry.percentage.toFixed(1)}%
      </p>
    </div>
  );
}

export default function AllocationChart({
  openHoldings = [],
  currentPrices = {},
  cashBalance = 0,
}) {
  const { t, formatCurrency } = useI18n();
  const { slices } = useMemo(
    () => computeAllocationSlices(openHoldings, currentPrices, cashBalance),
    [openHoldings, currentPrices, cashBalance],
  );

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="allocation-chart"
    >
      <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
        {t("dashboard.allocation.title")}
      </h3>

      {slices.length === 0 ? (
        <p
          className="mt-4 text-sm text-slate-500 dark:text-slate-400"
          data-testid="allocation-chart-empty"
        >
          {t("dashboard.allocation.empty")}
        </p>
      ) : (
        <div className="mt-4 h-64 w-full" data-testid="allocation-chart-content">
          <ResponsiveContainer
            width="100%"
            height="100%"
            role="img"
            aria-label={t("dashboard.allocation.aria")}
          >
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="ticker"
                cx="50%"
                cy="50%"
                innerRadius="40%"
                outerRadius="70%"
              >
                {slices.map((entry, index) => (
                  <Cell
                    key={entry.ticker}
                    fill={
                      entry.ticker === "Cash"
                        ? CASH_COLOR
                        : SLICE_COLORS[index % SLICE_COLORS.length]
                    }
                  />
                ))}
              </Pie>
              <Tooltip
                content={
                  <AllocationTooltip formatCurrency={formatCurrency} />
                }
              />
              <Legend
                formatter={(value) => value}
                payload={slices.map((s, index) => ({
                  id: s.ticker,
                  value: `${s.ticker} ${s.percentage.toFixed(1)}%`,
                  color:
                    s.ticker === "Cash"
                      ? CASH_COLOR
                      : SLICE_COLORS[index % SLICE_COLORS.length],
                }))}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
