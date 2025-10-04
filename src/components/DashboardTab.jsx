import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency, formatPercent } from "../utils/format.js";

function MetricCard({ label, value, description }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
        {value}
      </p>
      {description && (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {description}
        </p>
      )}
    </div>
  );
}

function QuickActions({ onRefresh }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
        Quick Actions
      </h3>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
          Refresh ROI
        </button>
        <a
          className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
          href="https://www.investopedia.com/terms/p/portfolio.asp"
          target="_blank"
          rel="noreferrer"
        >
          Portfolio Tips
        </a>
      </div>
    </div>
  );
}

function RoiChart({ data, loading }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          ROI vs SPY
        </h3>
        {loading && (
          <span className="text-xs font-medium text-indigo-500">Loading…</span>
        )}
      </div>
      <div className="mt-4 h-72 w-full">
        {data.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Add transactions to see comparative performance.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#cbd5f5"
                opacity={0.5}
              />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis
                tickFormatter={(value) => formatPercent(value, 1)}
                stroke="#94a3b8"
              />
              <Tooltip formatter={(value) => formatPercent(Number(value))} />
              <Legend />
              <Line
                type="monotone"
                dataKey="portfolio"
                name="Portfolio ROI"
                stroke="#10b981"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="spy"
                name="SPY %"
                stroke="#6366f1"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default function DashboardTab({
  metrics,
  roiData,
  loadingRoi,
  onRefreshRoi,
}) {
  const returnPct =
    metrics.totalCost === 0
      ? 0
      : (metrics.totalValue - metrics.totalCost) / metrics.totalCost;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Portfolio Value"
          value={formatCurrency(metrics.totalValue)}
        />
        <MetricCard
          label="Invested Capital"
          value={formatCurrency(metrics.totalCost)}
        />
        <MetricCard
          label="Unrealised PnL"
          value={formatCurrency(metrics.totalUnrealised)}
          description={`Realised: ${formatCurrency(metrics.totalRealised)}`}
        />
        <MetricCard
          label="Holdings"
          value={metrics.holdingsCount}
          description={`Return ${formatPercent(returnPct * 100, 1)}`}
        />
      </div>
      <QuickActions onRefresh={onRefreshRoi} />
      <RoiChart data={roiData} loading={loadingRoi} />
    </div>
  );
}
