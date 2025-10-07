import { useCallback, useMemo } from "react";
import clsx from "clsx";
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
import { BENCHMARK_SERIES_META } from "../utils/roi.js";
import { usePersistentBenchmarkSelection } from "../hooks/usePersistentBenchmarkSelection.js";

const DEFAULT_BENCHMARK_SELECTION = ["spy", "blended"];
const PORTFOLIO_COLOR = "#10b981";

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

function BenchmarkControls({ options, selected, onToggle }) {
  if (options.length === 0) {
    return null;
  }

  return (
    <fieldset className="flex flex-col gap-2" aria-label="Benchmark comparison controls">
      <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Benchmarks
      </legend>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Toggle benchmark series">
        {options.map((option) => {
          const active = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onToggle(option.id)}
              aria-pressed={active}
              className={clsx(
                "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                active
                  ? "border-indigo-500 bg-indigo-50 text-indigo-600 focus-visible:outline-indigo-500 dark:border-indigo-400/80 dark:bg-indigo-500/20 dark:text-indigo-200"
                  : "border-slate-200 text-slate-600 hover:border-indigo-400 hover:text-indigo-600 focus-visible:outline-indigo-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-200",
              )}
              title={option.description}
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: option.color }}
              />
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function RoiChart({
  data,
  loading,
  benchmarkOptions,
  selectedBenchmarks,
  onBenchmarkToggle,
}) {
  const legendPayload = useMemo(() => {
    const base = [
      { value: "Portfolio ROI", type: "line", color: PORTFOLIO_COLOR, id: "portfolio" },
    ];
    selectedBenchmarks.forEach((id) => {
      const meta = benchmarkOptions.find((option) => option.id === id);
      if (meta) {
        base.push({ value: meta.label, type: "line", color: meta.color, id: meta.id });
      }
    });
    return base;
  }, [benchmarkOptions, selectedBenchmarks]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            ROI vs Benchmarks
          </h3>
          {loading && (
            <span className="text-xs font-medium text-indigo-500">Loading…</span>
          )}
        </div>
        <BenchmarkControls
          options={benchmarkOptions}
          selected={selectedBenchmarks}
          onToggle={onBenchmarkToggle}
        />
      </div>
      <div className="mt-4 h-72 w-full">
        {data.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Add transactions to see comparative performance.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%" role="img" aria-label="Portfolio performance chart">
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
              <Legend payload={legendPayload} />
              <Line
                type="monotone"
                dataKey="portfolio"
                name="Portfolio ROI"
                stroke={PORTFOLIO_COLOR}
                dot={false}
                strokeWidth={2}
              />
              {benchmarkOptions.map((option) => (
                <Line
                  key={option.id}
                  type="monotone"
                  dataKey={option.dataKey}
                  name={option.label}
                  stroke={option.color}
                  strokeWidth={2}
                  dot={false}
                  hide={!selectedBenchmarks.includes(option.id)}
                />
              ))}
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

  const benchmarkOptions = useMemo(() => {
    if (!Array.isArray(roiData) || roiData.length === 0) {
      return [];
    }
    return BENCHMARK_SERIES_META.filter((option) =>
      roiData.some((point) => Number.isFinite(Number(point?.[option.dataKey]))),
    );
  }, [roiData]);
  const benchmarkOptionIds = useMemo(
    () => benchmarkOptions.map((option) => option.id),
    [benchmarkOptions],
  );
  const [selectedBenchmarks, setSelectedBenchmarks] =
    usePersistentBenchmarkSelection(benchmarkOptionIds, DEFAULT_BENCHMARK_SELECTION);
  const handleBenchmarkToggle = useCallback(
    (id) => {
      setSelectedBenchmarks((prev) =>
        prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
      );
    },
    [setSelectedBenchmarks],
  );

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
      <RoiChart
        data={roiData}
        loading={loadingRoi}
        benchmarkOptions={benchmarkOptions}
        selectedBenchmarks={selectedBenchmarks}
        onBenchmarkToggle={handleBenchmarkToggle}
      />
    </div>
  );
}
