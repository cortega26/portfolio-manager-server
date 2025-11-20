// @ts-nocheck
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

import { useI18n } from "../i18n/I18nProvider.jsx";
import { usePersistentBenchmarkSelection } from "../hooks/usePersistentBenchmarkSelection.js";
import { usePortfolioMetrics } from "../hooks/usePortfolioMetrics.js";
import { BENCHMARK_SERIES_META } from "../utils/roi.js";

const DEFAULT_BENCHMARK_SELECTION = ["spy", "blended"];
const PORTFOLIO_COLOR = "#10b981";

function MetricCard({ label, value, description, title }) {
  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      title={title}
    >
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

function QuickActions({ onRefresh, roiSource, t }) {
  const status = (() => {
    if (roiSource === "fallback") {
      return {
        label: t("dashboard.quickActions.status.fallback"),
        className:
          "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500/60 dark:bg-amber-500/10 dark:text-amber-200",
      };
    }
    if (roiSource === "error") {
      return {
        label: t("dashboard.quickActions.status.unavailable"),
        className:
          "border-rose-400 bg-rose-50 text-rose-700 dark:border-rose-500/60 dark:bg-rose-500/10 dark:text-rose-200",
      };
    }
    return {
      label: t("dashboard.quickActions.status.live"),
      className:
        "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-500/60 dark:bg-emerald-500/10 dark:text-emerald-200",
    };
  })();

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
        {t("dashboard.quickActions.title")}
      </h3>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
          {t("dashboard.quickActions.refresh")}
        </button>
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${status.className}`}
          role="status"
          aria-live="polite"
        >
          {status.label}
        </span>
        <a
          className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
          href="https://www.investopedia.com/terms/p/portfolio.asp"
          target="_blank"
          rel="noreferrer"
        >
          {t("dashboard.quickActions.tips")}
        </a>
      </div>
    </div>
  );
}

function BenchmarkControls({ options, selected, onToggle, onReset, resetDisabled, t }) {
  if (options.length === 0) {
    return null;
  }

  return (
    <fieldset className="flex flex-col gap-2" aria-label={t("dashboard.benchmarks.controls")}>
      <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {t("dashboard.benchmarks.legend")}
      </legend>
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t("dashboard.benchmarks.toggle")}
      >
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
        <button
          type="button"
          onClick={onReset}
          className={clsx(
            "rounded-md border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
            resetDisabled
              ? "cursor-not-allowed border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-600"
              : "border-slate-200 text-slate-600 hover:border-indigo-400 hover:text-indigo-600 focus-visible:outline-indigo-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-200",
          )}
          aria-disabled={resetDisabled}
          disabled={resetDisabled}
          aria-label={t("dashboard.benchmarks.reset.aria")}
          title={t("dashboard.benchmarks.reset.title")}
        >
          {t("dashboard.benchmarks.reset")}
        </button>
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
  onBenchmarkReset,
  isDefaultSelection,
  t,
  formatPercent,
}) {
  const legendPayload = useMemo(() => {
    const base = [
      { value: t("dashboard.series.portfolio"), type: "line", color: PORTFOLIO_COLOR, id: "portfolio" },
    ];
    selectedBenchmarks.forEach((id) => {
      const meta = benchmarkOptions.find((option) => option.id === id);
      if (meta) {
        base.push({ value: meta.label, type: "line", color: meta.color, id: meta.id });
      }
    });
    return base;
  }, [benchmarkOptions, selectedBenchmarks, t]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            {t("dashboard.roi.title")}
          </h3>
          {loading && (
            <span className="text-xs font-medium text-indigo-500">{t("common.loading")}</span>
          )}
        </div>
        <BenchmarkControls
          options={benchmarkOptions}
          selected={selectedBenchmarks}
          onToggle={onBenchmarkToggle}
          onReset={onBenchmarkReset}
          resetDisabled={isDefaultSelection}
          t={t}
        />
      </div>
      <div className="mt-4 h-72 w-full">
        {data.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("dashboard.roi.chartEmpty")}
          </p>
        ) : (
          <ResponsiveContainer
            width="100%"
            height="100%"
            role="img"
            aria-label={t("dashboard.roi.chartAria")}
          >
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
                name={t("dashboard.series.portfolio")}
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
  transactions = [],
  loadingRoi,
  onRefreshRoi,
  roiSource = "api",
}) {
  const { t, formatCurrency, formatPercent, formatSignedPercent } = useI18n();
  const portfolioMetrics = usePortfolioMetrics({ metrics, transactions, roiData });
  const {
    totals: {
      totalValue,
      totalCost,
      totalRealised,
      totalUnrealised,
      totalReturn,
      totalNav,
      cashBalance,
      holdingsCount,
    },
    percentages: {
      returnPct,
      cashAllocationPct,
      cashDragPct,
      spyDeltaPct,
      blendedDeltaPct,
    },
  } = portfolioMetrics;

  const benchmarkOptions = useMemo(() => {
    if (!Array.isArray(roiData) || roiData.length === 0) {
      return [];
    }
    return BENCHMARK_SERIES_META.filter((option) =>
      roiData.some((point) => Number.isFinite(Number(point?.[option.dataKey]))),
    ).map((option) => ({
      ...option,
      label: t(`dashboard.benchmarks.series.${option.id}.label`),
      description: t(`dashboard.benchmarks.series.${option.id}.description`),
    }));
  }, [roiData, t]);
  const benchmarkOptionIds = useMemo(
    () => benchmarkOptions.map((option) => option.id),
    [benchmarkOptions],
  );
  const [selectedBenchmarks, setSelectedBenchmarks] =
    usePersistentBenchmarkSelection(benchmarkOptionIds, DEFAULT_BENCHMARK_SELECTION);
  const normalizedDefaultSelection = useMemo(() => {
    if (benchmarkOptionIds.length === 0) {
      return [];
    }
    const availableSet = new Set(benchmarkOptionIds);
    const preferred = DEFAULT_BENCHMARK_SELECTION.filter((value) => availableSet.has(value));
    if (preferred.length > 0) {
      return preferred;
    }
    return [benchmarkOptionIds[0]];
  }, [benchmarkOptionIds]);
  const handleBenchmarkToggle = useCallback(
    (id) => {
      setSelectedBenchmarks((prev) =>
        prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
      );
    },
    [setSelectedBenchmarks],
  );
  const handleBenchmarkReset = useCallback(() => {
    setSelectedBenchmarks(normalizedDefaultSelection);
  }, [normalizedDefaultSelection, setSelectedBenchmarks]);
  const isDefaultSelection = useMemo(() => {
    if (normalizedDefaultSelection.length !== selectedBenchmarks.length) {
      return false;
    }
    const selectedSet = new Set(selectedBenchmarks);
    return normalizedDefaultSelection.every((value) => selectedSet.has(value));
  }, [normalizedDefaultSelection, selectedBenchmarks]);

  const metricCards = [
    {
      label: t("dashboard.metrics.nav"),
      value: formatCurrency(totalNav),
      description: t("dashboard.metrics.nav.description", {
        value: formatCurrency(cashBalance),
      }),
      title: t("dashboard.metrics.nav.title"),
    },
    {
      label: t("dashboard.metrics.return"),
      value: formatCurrency(totalReturn),
      description: t("dashboard.metrics.return.description", {
        realised: formatCurrency(totalRealised),
        unrealised: formatCurrency(totalUnrealised),
        roi: formatSignedPercent(returnPct, 1),
      }),
    },
    {
      label: t("dashboard.metrics.cost"),
      value: formatCurrency(totalCost),
      description: t("dashboard.metrics.cost.description", {
        count: holdingsCount,
        value: formatCurrency(totalValue),
      }),
    },
    {
      label: t("dashboard.metrics.cashAllocation"),
      value: formatPercent(cashAllocationPct, 1),
      description: t("dashboard.metrics.cashAllocation.description"),
      title: t("dashboard.metrics.cashAllocation.title"),
    },
    {
      label: t("dashboard.metrics.cashDrag"),
      value: formatSignedPercent(cashDragPct, 2),
      description: t("dashboard.metrics.cashDrag.description"),
      title: t("dashboard.metrics.cashDrag.title"),
    },
    {
      label: t("dashboard.metrics.delta"),
      value: t("dashboard.metrics.delta.value", {
        value: formatSignedPercent(spyDeltaPct, 2),
      }),
      description: t("dashboard.metrics.delta.description", {
        value: formatSignedPercent(blendedDeltaPct, 2),
      }),
      title: t("dashboard.metrics.delta.title"),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {metricCards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            description={card.description}
            title={card.title}
          />
        ))}
      </div>
      <QuickActions onRefresh={onRefreshRoi} roiSource={roiSource} t={t} />
      <RoiChart
        data={roiData}
        loading={loadingRoi}
        benchmarkOptions={benchmarkOptions}
        selectedBenchmarks={selectedBenchmarks}
        onBenchmarkToggle={handleBenchmarkToggle}
        onBenchmarkReset={handleBenchmarkReset}
        isDefaultSelection={isDefaultSelection}
        t={t}
        formatPercent={formatPercent}
      />
    </div>
  );
}
