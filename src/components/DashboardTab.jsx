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
import { buildBenchmarkSeriesMeta } from "../utils/roi.js";
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

function formatNullableCurrency(formatCurrency, value) {
  return Number.isFinite(Number(value)) ? formatCurrency(Number(value)) : "—";
}

function formatNullablePercent(formatSignedPercent, value, fractionDigits = 1) {
  return Number.isFinite(Number(value)) ? formatSignedPercent(Number(value), fractionDigits) : "—";
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

function ContextCard({ label, value, detail, tone = "default" }) {
  return (
    <div
      className={clsx(
        "rounded-lg border p-4",
        tone === "positive" && "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20",
        tone === "negative" && "border-rose-200 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/20",
        tone === "default" && "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
      )}
    >
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">{value}</p>
      {detail ? (
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{detail}</p>
      ) : null}
    </div>
  );
}

function PerformanceContext({
  latest,
  cashAllocationPct,
  cashDragPct,
  spyDeltaPct,
  qqqDeltaPct,
  t,
  formatPercent,
  formatSignedPercent,
}) {
  const cards = [
    {
      label: t("dashboard.context.portfolio.label"),
      value: formatNullablePercent(formatSignedPercent, latest?.portfolio, 2),
      detail: t("dashboard.context.portfolio.detail"),
      tone: "default",
    },
    {
      label: t("dashboard.context.spyGap.label"),
      value: formatNullablePercent(formatSignedPercent, spyDeltaPct, 2),
      detail: t("dashboard.context.spyGap.detail", {
        benchmark: formatNullablePercent(formatSignedPercent, latest?.spy, 2),
      }),
      tone:
        Number.isFinite(Number(spyDeltaPct)) && Number(spyDeltaPct) >= 0
          ? "positive"
          : "negative",
    },
    {
      label: t("dashboard.context.qqqGap.label"),
      value: formatNullablePercent(formatSignedPercent, qqqDeltaPct, 2),
      detail: t("dashboard.context.qqqGap.detail", {
        benchmark: formatNullablePercent(formatSignedPercent, latest?.qqq, 2),
      }),
      tone:
        Number.isFinite(Number(qqqDeltaPct)) && Number(qqqDeltaPct) >= 0
          ? "positive"
          : "negative",
    },
    {
      label: t("dashboard.context.cashDrag.label"),
      value: formatNullablePercent(formatSignedPercent, cashDragPct, 2),
      detail: t("dashboard.context.cashDrag.detail"),
      tone:
        Number.isFinite(Number(cashDragPct)) && Number(cashDragPct) <= 0
          ? "positive"
          : "default",
    },
    {
      label: t("dashboard.context.cashAllocation.label"),
      value: formatNullablePercent(formatPercent, cashAllocationPct, 1),
      detail: t("dashboard.context.cashAllocation.detail"),
      tone: "default",
    },
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t("dashboard.context.title")}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("dashboard.context.subtitle")}
        </p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <ContextCard
            key={card.label}
            label={card.label}
            value={card.value}
            detail={card.detail}
            tone={card.tone}
          />
        ))}
      </div>
    </section>
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
  benchmarkCatalog,
}) {
  const { t, formatCurrency, formatPercent, formatSignedPercent } = useI18n();
  const portfolioMetrics = usePortfolioMetrics({ metrics, transactions, roiData });
  const {
    totals: {
      totalValue,
      netContributions,
      netStockPurchases,
      netIncome,
      grossBuys,
      grossSells,
      totalRealised,
      totalUnrealised,
      historicalChange,
      totalReturn,
      totalNav,
      totalRoiPct,
      cashBalance,
      holdingsCount,
      unpricedHoldingsCount,
      pricingComplete,
    },
    percentages: {
      cashAllocationPct,
      cashDragPct,
      spyDeltaPct,
      qqqDeltaPct,
    },
    latest,
  } = portfolioMetrics;

  const benchmarkOptions = useMemo(() => {
    const safeRoiData = Array.isArray(roiData) ? roiData : [];
    const catalogMeta = buildBenchmarkSeriesMeta(benchmarkCatalog);
    return catalogMeta.filter((option) =>
      safeRoiData.some((point) => Number.isFinite(Number(point?.[option.dataKey]))),
    ).map((option) => ({
      ...option,
      label: (() => {
        const key = `dashboard.benchmarks.series.${option.id}.label`;
        const translated = t(key);
        return translated === key ? option.label : translated;
      })(),
      description: (() => {
        const key = `dashboard.benchmarks.series.${option.id}.description`;
        const translated = t(key);
        return translated === key ? option.description : translated;
      })(),
    }));
  }, [benchmarkCatalog, roiData, t]);
  const benchmarkOptionIds = useMemo(
    () => benchmarkOptions.map((option) => option.id),
    [benchmarkOptions],
  );
  const defaultBenchmarkSelection = useMemo(() => {
    const configuredDefaults = Array.isArray(benchmarkCatalog?.defaults)
      ? benchmarkCatalog.defaults.map((entry) => String(entry))
      : [];
    return configuredDefaults.length > 0 ? configuredDefaults : ["spy", "qqq"];
  }, [benchmarkCatalog]);
  const [selectedBenchmarks, setSelectedBenchmarks] =
    usePersistentBenchmarkSelection(benchmarkOptionIds, defaultBenchmarkSelection);
  const normalizedDefaultSelection = useMemo(() => {
    if (benchmarkOptionIds.length === 0) {
      return [];
    }
    const availableSet = new Set(benchmarkOptionIds);
    const preferred = defaultBenchmarkSelection.filter((value) => availableSet.has(value));
    if (preferred.length > 0) {
      return preferred;
    }
    return [benchmarkOptionIds[0]];
  }, [benchmarkOptionIds, defaultBenchmarkSelection]);
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
      label: t("dashboard.metrics.equityBalance"),
      value: formatNullableCurrency(formatCurrency, totalValue),
      description: pricingComplete
        ? t("dashboard.metrics.equityBalance.description", {
            count: holdingsCount,
          })
        : t("dashboard.metrics.equityBalance.unavailable", {
            count: unpricedHoldingsCount,
          }),
      title: t("dashboard.metrics.equityBalance.title"),
    },
    {
      label: t("dashboard.metrics.netStockPurchases"),
      value: formatCurrency(netStockPurchases),
      description: t("dashboard.metrics.netStockPurchases.description", {
        buys: formatCurrency(grossBuys),
        sells: formatCurrency(grossSells),
      }),
    },
    {
      label: t("dashboard.metrics.historicalChange"),
      value: formatNullableCurrency(formatCurrency, historicalChange),
      description: pricingComplete
        ? t("dashboard.metrics.historicalChange.description")
        : t("dashboard.metrics.historicalChange.unavailable"),
    },
    {
      label: t("dashboard.metrics.nav"),
      value: formatNullableCurrency(formatCurrency, totalNav),
      description: pricingComplete
        ? t("dashboard.metrics.nav.description", {
            value: formatCurrency(cashBalance),
          })
        : t("dashboard.metrics.nav.unavailable", {
            value: formatCurrency(cashBalance),
          }),
      title: t("dashboard.metrics.nav.title"),
    },
    {
      label: t("dashboard.metrics.externalContributions"),
      value: formatCurrency(netContributions),
      description: t("dashboard.metrics.externalContributions.description", {
        value: formatCurrency(netIncome),
      }),
    },
    {
      label: t("dashboard.metrics.return"),
      value: formatNullableCurrency(formatCurrency, totalReturn),
      description: pricingComplete
        ? t("dashboard.metrics.return.description", {
            realised: formatCurrency(totalRealised),
            unrealised: formatCurrency(totalUnrealised),
            income: formatCurrency(netIncome),
            roi: formatNullablePercent(formatSignedPercent, totalRoiPct, 2),
          })
        : t("dashboard.metrics.return.unavailable"),
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
      <PerformanceContext
        latest={latest}
        cashAllocationPct={cashAllocationPct}
        cashDragPct={cashDragPct}
        spyDeltaPct={spyDeltaPct}
        qqqDeltaPct={qqqDeltaPct}
        t={t}
        formatPercent={formatPercent}
        formatSignedPercent={formatSignedPercent}
      />
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
