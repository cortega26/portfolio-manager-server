import { useCallback, useMemo } from "react";
import clsx from "clsx";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

import AllocationChart from "./AllocationChart.jsx";
import ContributionTable from "./ContributionTable.jsx";

import {
  ROI_DETAIL_PERCENT_DIGITS,
  ROI_PRIMARY_PERCENT_DIGITS,
} from "../../shared/precision.js";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { usePersistentBenchmarkSelection } from "../hooks/usePersistentBenchmarkSelection.js";
import { usePortfolioMetrics } from "../hooks/usePortfolioMetrics.js";
import { buildBenchmarkSeriesMeta } from "../utils/roi.js";
const PORTFOLIO_COLOR = "#16a34a";
const NAV_CONTRIBUTIONS_COLOR = "#6366f1";
const NAV_MARKET_GAIN_COLOR = "#22c55e";

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function formatShortDate(isoDate) {
  if (typeof isoDate !== "string" || isoDate.length < 7) {
    return isoDate ?? "";
  }
  const month = Number(isoDate.slice(5, 7));
  const year = isoDate.slice(2, 4);
  if (month < 1 || month > 12) {
    return isoDate;
  }
  return `${SHORT_MONTHS[month - 1]} '${year}`;
}

function formatFullDate(isoDate) {
  if (typeof isoDate !== "string" || isoDate.length < 10) {
    return isoDate ?? "";
  }
  const month = Number(isoDate.slice(5, 7));
  const day = Number(isoDate.slice(8, 10));
  const year = isoDate.slice(0, 4);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return isoDate;
  }
  return `${FULL_MONTHS[month - 1]} ${day}, ${year}`;
}

function formatDrawdownPeriod(peakDate, troughDate) {
  if (!peakDate || !troughDate) {
    return "";
  }
  const pMonth = Number(peakDate.slice(5, 7));
  const pYear = peakDate.slice(0, 4);
  const tMonth = Number(troughDate.slice(5, 7));
  const tYear = troughDate.slice(0, 4);
  if (pMonth < 1 || pMonth > 12 || tMonth < 1 || tMonth > 12) {
    return `${peakDate} – ${troughDate}`;
  }
  return `${SHORT_MONTHS[pMonth - 1]} ${pYear} – ${SHORT_MONTHS[tMonth - 1]} ${tYear}`;
}

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
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : NaN;
  return Number.isFinite(numeric) ? formatCurrency(numeric) : "—";
}

function formatNullablePercent(formatSignedPercent, value, fractionDigits = 1) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : NaN;
  return Number.isFinite(numeric) ? formatSignedPercent(numeric, fractionDigits) : "—";
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
    if (roiSource === "stale") {
      return {
        label: t("dashboard.quickActions.status.stale"),
        className:
          "border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-500/60 dark:bg-sky-500/10 dark:text-sky-200",
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

function ContextCard({ label, value, detail, tone = "default", title }) {
  return (
    <div
      title={title}
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

function toPercentPoints(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric * 100 : null;
}

function formatInvestorMwrValue({ benchmarkSummary, t, formatSignedPercent }) {
  const portfolioMwrPct = toPercentPoints(benchmarkSummary?.portfolio);
  const formattedValue = formatNullablePercent(
    formatSignedPercent,
    portfolioMwrPct,
    ROI_PRIMARY_PERCENT_DIGITS,
  );
  if (formattedValue === "—") {
    return formattedValue;
  }
  if (benchmarkSummary?.partial) {
    return formattedValue;
  }
  return t("dashboard.context.investorMwr.valueFull", {
    value: formattedValue,
  });
}

function formatInvestorMwrDetail({
  benchmarkSummary,
  t,
  formatSignedPercent,
  formatDate,
}) {
  const spyValue = formatNullablePercent(
    formatSignedPercent,
    toPercentPoints(benchmarkSummary?.benchmarks?.spy),
    ROI_PRIMARY_PERCENT_DIGITS,
  );
  const qqqValue = formatNullablePercent(
    formatSignedPercent,
    toPercentPoints(benchmarkSummary?.benchmarks?.qqq),
    ROI_PRIMARY_PERCENT_DIGITS,
  );

  if (benchmarkSummary?.partial && benchmarkSummary?.start_date) {
    return t("dashboard.context.investorMwr.detailPartial", {
      spy: spyValue,
      qqq: qqqValue,
      startDate: formatDate(`${benchmarkSummary.start_date}T00:00:00Z`),
    });
  }

  return t("dashboard.context.investorMwr.detail", {
    spy: spyValue,
    qqq: qqqValue,
  });
}

function resolveInvestorMwrTone(benchmarkSummary) {
  const portfolio = Number(benchmarkSummary?.portfolio);
  const spy = Number(benchmarkSummary?.benchmarks?.spy);
  const qqq = Number(benchmarkSummary?.benchmarks?.qqq);
  if (!Number.isFinite(portfolio) || !Number.isFinite(spy) || !Number.isFinite(qqq)) {
    return "default";
  }
  if (portfolio > spy && portfolio > qqq) {
    return "positive";
  }
  if (portfolio < spy && portfolio < qqq) {
    return "negative";
  }
  return "default";
}

function PerformanceContext({
  latest,
  cashAllocationPct,
  spyDeltaPct,
  qqqDeltaPct,
  benchmarkSummary,
  returnsSummary,
  t,
  formatPercent,
  formatSignedPercent,
  formatDate,
}) {
  const annualizedTwrPct = toPercentPoints(returnsSummary?.annualized_r_port);
  const annualizedSuffix = Number.isFinite(annualizedTwrPct)
    ? ` (${formatSignedPercent(annualizedTwrPct, ROI_PRIMARY_PERCENT_DIGITS)} ${t("dashboard.context.portfolioTwr.annSuffix")})`
    : "";
  const twrDetail = Number.isFinite(annualizedTwrPct)
    ? t("dashboard.context.portfolioTwr.detailAnnualized")
    : t("dashboard.context.portfolioTwr.detail");
  const cards = [
    {
      label: t("dashboard.context.portfolio.label"),
      value: formatNullablePercent(
        formatSignedPercent,
        latest?.portfolio,
        ROI_PRIMARY_PERCENT_DIGITS,
      ),
      detail: t("dashboard.context.portfolio.detail"),
      tone: "default",
    },
    {
      label: t("dashboard.context.portfolioTwr.label"),
      value: `${formatNullablePercent(
        formatSignedPercent,
        latest?.portfolioTwr,
        ROI_PRIMARY_PERCENT_DIGITS,
      )}${annualizedSuffix}`,
      detail: twrDetail,
      tone: "default",
      title: Number.isFinite(annualizedTwrPct)
        ? t("dashboard.context.portfolioTwr.annTooltip")
        : undefined,
    },
    {
      label: t("dashboard.context.spyGap.label"),
      value: formatNullablePercent(
        formatSignedPercent,
        spyDeltaPct,
        ROI_PRIMARY_PERCENT_DIGITS,
      ),
      detail: t("dashboard.context.spyGap.detail", {
        benchmark: formatNullablePercent(
          formatSignedPercent,
          latest?.spy,
          ROI_PRIMARY_PERCENT_DIGITS,
        ),
      }),
      tone:
        Number.isFinite(Number(spyDeltaPct)) && Number(spyDeltaPct) >= 0
          ? "positive"
          : "negative",
    },
    {
      label: t("dashboard.context.qqqGap.label"),
      value: formatNullablePercent(
        formatSignedPercent,
        qqqDeltaPct,
        ROI_PRIMARY_PERCENT_DIGITS,
      ),
      detail: t("dashboard.context.qqqGap.detail", {
        benchmark: formatNullablePercent(
          formatSignedPercent,
          latest?.qqq,
          ROI_PRIMARY_PERCENT_DIGITS,
        ),
      }),
      tone:
        Number.isFinite(Number(qqqDeltaPct)) && Number(qqqDeltaPct) >= 0
          ? "positive"
          : "negative",
    },
    {
      label: t("dashboard.context.investorMwr.label"),
      value: formatInvestorMwrValue({
        benchmarkSummary,
        t,
        formatSignedPercent,
      }),
      detail: formatInvestorMwrDetail({
        benchmarkSummary,
        t,
        formatSignedPercent,
        formatDate,
      }),
      tone: resolveInvestorMwrTone(benchmarkSummary),
      title: t("dashboard.context.investorMwr.title"),
    },
    (() => {
      const dd = returnsSummary?.max_drawdown;
      const ddValue = dd?.value;
      const ddPct = Number.isFinite(ddValue) ? ddValue * 100 : null;
      return {
        label: t("dashboard.context.maxDrawdown.label"),
        value: Number.isFinite(ddPct)
          ? formatNullablePercent(formatSignedPercent, ddPct, ROI_PRIMARY_PERCENT_DIGITS)
          : "—",
        detail: Number.isFinite(ddPct) && dd?.peak_date && dd?.trough_date
          ? formatDrawdownPeriod(dd.peak_date, dd.trough_date)
          : t("dashboard.context.maxDrawdown.insufficient"),
        tone: Number.isFinite(ddPct) && ddPct < -10 ? "negative" : "default",
        title: t("dashboard.context.maxDrawdown.title"),
      };
    })(),
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
            title={card.title}
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
  benchmarkHealth,
  benchmarkOptions,
  selectedBenchmarks,
  onBenchmarkToggle,
  onBenchmarkReset,
  isDefaultSelection,
  roiSource = "api",
  t,
  formatPercent,
}) {
  const formatBenchmarkLabel = (label) => `${label} TWR`;
  const legendPayload = useMemo(() => {
    const base = [
      {
        value: t("dashboard.series.portfolioTwr"),
        type: "line",
        color: PORTFOLIO_COLOR,
        id: "portfolioTwr",
      },
    ];
    selectedBenchmarks.forEach((id) => {
      const meta = benchmarkOptions.find((option) => option.id === id);
      if (meta) {
        base.push({
          value: formatBenchmarkLabel(meta.label),
          type: "line",
          color: meta.color,
          id: meta.id,
        });
      }
    });
    return base;
  }, [benchmarkOptions, selectedBenchmarks, t]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {t("dashboard.roi.title")}
            </h3>
            {roiSource === "fallback" && (
              <span
                className="inline-flex items-center rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-500/60 dark:bg-amber-500/10 dark:text-amber-200"
                title={t("dashboard.roi.approximate.tooltip")}
                data-testid="approximate-badge"
              >
                {t("dashboard.roi.approximate")}
              </span>
            )}
          </div>
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
      {Array.isArray(benchmarkHealth?.unavailable) && benchmarkHealth.unavailable.length > 0 ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {t("dashboard.roi.benchmarkNotice", {
            benchmarks: benchmarkHealth.unavailable.join(", "),
          })}
        </div>
      ) : null}
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
              <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={formatShortDate} />
              <YAxis
                tickFormatter={(value) => formatPercent(value, 1)}
                stroke="#94a3b8"
              />
              <Tooltip
                formatter={(value) => formatPercent(Number(value), ROI_DETAIL_PERCENT_DIGITS)}
                labelFormatter={formatFullDate}
              />
              <Legend payload={legendPayload} />
              <Line
                type="monotone"
                dataKey="portfolioTwr"
                name={t("dashboard.series.portfolioTwr")}
                stroke={PORTFOLIO_COLOR}
                dot={false}
                strokeWidth={2}
              />
              {benchmarkOptions.map((option) => (
                <Line
                  key={option.id}
                  type="monotone"
                  dataKey={option.dataKey}
                  name={formatBenchmarkLabel(option.label)}
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

function NavGrowthChart({ data, t, formatCurrency }) {
  const chartData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }
    let cumulativeContributions = 0;
    const firstNav = Number(data[0]?.portfolio_nav ?? 0);
    if (firstNav > 0) {
      cumulativeContributions = firstNav;
    }
    return data.map((row, index) => {
      const nav = Number(row.portfolio_nav ?? 0);
      if (index === 0) {
        const gain = nav - cumulativeContributions;
        return {
          date: row.date,
          contributions: cumulativeContributions,
          marketGain: gain > 0 ? gain : 0,
        };
      }
      const cashBalance = Number(row.cash_balance ?? 0);
      const riskAssets = Number(row.risk_assets_value ?? 0);
      void cashBalance;
      void riskAssets;
      const gain = nav - cumulativeContributions;
      return {
        date: row.date,
        contributions: cumulativeContributions,
        marketGain: gain > 0 ? gain : 0,
      };
    });
  }, [data]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
        {t("dashboard.navChart.title")}
      </h3>
      <div className="mt-4 h-72 w-full">
        {chartData.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("dashboard.navChart.empty")}
          </p>
        ) : (
          <ResponsiveContainer
            width="100%"
            height="100%"
            role="img"
            aria-label={t("dashboard.navChart.aria")}
          >
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#cbd5f5"
                opacity={0.5}
              />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={formatShortDate} />
              <YAxis
                tickFormatter={(value) => formatCurrency(value)}
                stroke="#94a3b8"
              />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                labelFormatter={formatFullDate}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="contributions"
                name={t("dashboard.navChart.contributions")}
                stackId="nav"
                stroke={NAV_CONTRIBUTIONS_COLOR}
                fill={NAV_CONTRIBUTIONS_COLOR}
                fillOpacity={0.6}
              />
              <Area
                type="monotone"
                dataKey="marketGain"
                name={t("dashboard.navChart.marketGain")}
                stackId="nav"
                stroke={NAV_MARKET_GAIN_COLOR}
                fill={NAV_MARKET_GAIN_COLOR}
                fillOpacity={0.4}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default function DashboardTab({
  metrics,
  roiData,
  roiMeta = null,
  benchmarkSummary = null,
  returnsSummary = null,
  navDaily = [],
  transactions = [],
  loadingRoi,
  onRefreshRoi,
  roiSource = "api",
  benchmarkCatalog,
  openHoldings = [],
  currentPrices = {},
}) {
  const { t, formatCurrency, formatPercent, formatSignedPercent, formatDate } = useI18n();
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
      spyDeltaPct,
      qqqDeltaPct,
    },
      latest,
  } = portfolioMetrics;

  const benchmarkOptions = useMemo(() => {
    const safeRoiData = Array.isArray(roiData) ? roiData : [];
    const catalogMeta = buildBenchmarkSeriesMeta(benchmarkCatalog);
    return catalogMeta.filter((option) =>
      safeRoiData.some(
        (point) =>
          typeof point?.[option.dataKey] === "number"
          && Number.isFinite(point[option.dataKey]),
      ),
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

  const cashPct = pricingComplete && totalNav !== 0
    ? formatPercent((cashBalance / totalNav) * 100, 1)
    : "—";
  const metricCards = [
    {
      label: t("dashboard.metrics.nav"),
      value: formatNullableCurrency(formatCurrency, totalNav),
      description: pricingComplete
        ? t("dashboard.metrics.nav.description", {
            equity: formatCurrency(totalValue ?? 0),
            cash: formatCurrency(cashBalance),
            cashPct,
          })
        : t("dashboard.metrics.nav.unavailable", {
            cash: formatCurrency(cashBalance),
          }),
      title: t("dashboard.metrics.nav.title"),
    },
    {
      label: t("dashboard.metrics.return"),
      value: formatNullableCurrency(formatCurrency, totalReturn),
      description: pricingComplete
        ? t("dashboard.metrics.return.description", {
            realised: formatCurrency(totalRealised),
            unrealised: formatCurrency(totalUnrealised),
            income: formatCurrency(netIncome),
            roi: formatNullablePercent(
              formatSignedPercent,
              totalRoiPct,
              ROI_PRIMARY_PERCENT_DIGITS,
            ),
          })
        : t("dashboard.metrics.return.unavailable"),
      title: t("dashboard.metrics.return.title"),
    },
    {
      label: t("dashboard.metrics.externalContributions"),
      value: formatCurrency(netContributions),
      description: t("dashboard.metrics.externalContributions.description", {
        buys: formatCurrency(grossBuys),
        sells: formatCurrency(grossSells),
        income: formatCurrency(netIncome),
      }),
    },
    {
      label: t("dashboard.metrics.historicalChange"),
      value: formatNullableCurrency(formatCurrency, historicalChange),
      description: pricingComplete
        ? t("dashboard.metrics.historicalChange.description")
        : t("dashboard.metrics.historicalChange.unavailable"),
      title: t("dashboard.metrics.historicalChange.title"),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        spyDeltaPct={spyDeltaPct}
        qqqDeltaPct={qqqDeltaPct}
        benchmarkSummary={benchmarkSummary}
        returnsSummary={returnsSummary}
        t={t}
        formatPercent={formatPercent}
        formatSignedPercent={formatSignedPercent}
        formatDate={formatDate}
      />
      <RoiChart
        data={roiData}
        loading={loadingRoi}
        benchmarkHealth={roiMeta?.benchmarkHealth ?? null}
        benchmarkOptions={benchmarkOptions}
        selectedBenchmarks={selectedBenchmarks}
        onBenchmarkToggle={handleBenchmarkToggle}
        onBenchmarkReset={handleBenchmarkReset}
        isDefaultSelection={isDefaultSelection}
        roiSource={roiSource}
        t={t}
        formatPercent={formatPercent}
      />
      <NavGrowthChart
        data={navDaily}
        t={t}
        formatCurrency={formatCurrency}
      />
      <AllocationChart
        openHoldings={openHoldings}
        currentPrices={currentPrices}
        cashBalance={cashBalance ?? 0}
      />
      <ContributionTable
        openHoldings={openHoldings}
        currentPrices={currentPrices}
        cashBalance={cashBalance ?? 0}
      />
    </div>
  );
}
