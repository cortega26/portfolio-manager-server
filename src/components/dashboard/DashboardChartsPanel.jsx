import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Area,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { ROI_DETAIL_PERCENT_DIGITS } from '../../../shared/precision.js';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { usePersistentBenchmarkSelection } from '../../hooks/usePersistentBenchmarkSelection.js';
import {
  buildBenchmarkSeriesMeta,
  buildFlowMatchedBenchmarkSeries,
  mergeBenchmarkOverlaySeries,
} from '../../utils/roi.js';
import {
  PORTFOLIO_COLOR,
  NAV_CONTRIBUTIONS_COLOR,
  NAV_MARKET_GAIN_COLOR,
  formatShortDate,
  formatFullDate,
} from './dashboardFormatters.js';

// ---------------------------------------------------------------------------
// Collapse state persistence
// ---------------------------------------------------------------------------

const CHARTS_OPEN_KEY = 'dashboard.chartsPanel.open.v1';

function readChartsOpen() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return true;
  }
  try {
    const raw = window.localStorage.getItem(CHARTS_OPEN_KEY);
    if (raw === null) {
      return true; // default: expanded
    }
    return JSON.parse(raw) !== false;
  } catch {
    return true;
  }
}

function writeChartsOpen(value) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(CHARTS_OPEN_KEY, JSON.stringify(value));
    }
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Inner components
// ---------------------------------------------------------------------------

function BenchmarkControls({ options, selected, onToggle, onReset, resetDisabled, t }) {
  if (options.length === 0) {
    return null;
  }

  return (
    <fieldset className="flex flex-col gap-2" aria-label={t('dashboard.benchmarks.controls')}>
      <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {t('dashboard.benchmarks.legend')}
      </legend>
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t('dashboard.benchmarks.toggle')}
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
                'flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                active
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-600 focus-visible:outline-indigo-500 dark:border-indigo-400/80 dark:bg-indigo-500/20 dark:text-indigo-200'
                  : 'border-slate-200 text-slate-600 hover:border-indigo-400 hover:text-indigo-600 focus-visible:outline-indigo-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-200'
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
            'rounded-md border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
            resetDisabled
              ? 'cursor-not-allowed border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-600'
              : 'border-slate-200 text-slate-600 hover:border-indigo-400 hover:text-indigo-600 focus-visible:outline-indigo-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-200'
          )}
          aria-disabled={resetDisabled}
          disabled={resetDisabled}
          aria-label={t('dashboard.benchmarks.reset.aria')}
          title={t('dashboard.benchmarks.reset.title')}
        >
          {t('dashboard.benchmarks.reset')}
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
  roiSource = 'api',
  t,
  formatPercent,
}) {
  const formatBenchmarkLabel = (label) => `${label} ROI`;
  const legendPayload = useMemo(() => {
    const base = [
      {
        value: t('dashboard.series.portfolioRoi'),
        type: 'line',
        color: PORTFOLIO_COLOR,
        id: 'portfolio',
      },
    ];
    selectedBenchmarks.forEach((id) => {
      const meta = benchmarkOptions.find((option) => option.id === id);
      if (meta) {
        base.push({
          value: formatBenchmarkLabel(meta.label),
          type: 'line',
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
              {t('dashboard.roi.title')}
            </h3>
            {roiSource === 'fallback' && (
              <span
                className="inline-flex items-center rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-500/60 dark:bg-amber-500/10 dark:text-amber-200"
                title={t('dashboard.roi.approximate.tooltip')}
                data-testid="approximate-badge"
              >
                {t('dashboard.roi.approximate')}
              </span>
            )}
          </div>
          {loading && (
            <span className="text-xs font-medium text-indigo-500">{t('common.loading')}</span>
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
          {t('dashboard.roi.benchmarkNotice', {
            benchmarks: benchmarkHealth.unavailable.join(', '),
          })}
        </div>
      ) : null}
      <div className="mt-4 h-72 w-full">
        {data.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('dashboard.roi.chartEmpty')}
          </p>
        ) : (
          <ResponsiveContainer
            width="100%"
            height="100%"
            role="img"
            aria-label={t('dashboard.roi.chartAria')}
          >
            <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5f5" opacity={0.5} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                stroke="#94a3b8"
                tickFormatter={formatShortDate}
              />
              <YAxis tickFormatter={(value) => formatPercent(value, 1)} stroke="#94a3b8" />
              <Tooltip
                formatter={(value) => formatPercent(Number(value), ROI_DETAIL_PERCENT_DIGITS)}
                labelFormatter={formatFullDate}
              />
              <Legend payload={legendPayload} />
              <Line
                type="monotone"
                dataKey="portfolio"
                name={t('dashboard.series.portfolioRoi')}
                stroke={PORTFOLIO_COLOR}
                dot={false}
                strokeWidth={2}
              />
              {benchmarkOptions.map((option) => (
                <Line
                  key={option.id}
                  type="monotone"
                  dataKey={option.chartDataKey ?? option.dataKey}
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

function NavGrowthChart({ data, transactions, t, formatCurrency }) {
  const chartData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    const flows = [];
    if (Array.isArray(transactions)) {
      for (const tx of transactions) {
        if (!tx?.date) continue;
        const type = typeof tx.type === 'string' ? tx.type.trim().toUpperCase() : '';
        const amount = Number(tx.amount ?? 0);
        if (!Number.isFinite(amount)) continue;
        if (type === 'DEPOSIT') flows.push({ date: tx.date, delta: amount });
        else if (type === 'WITHDRAWAL') flows.push({ date: tx.date, delta: -Math.abs(amount) });
      }
    }
    flows.sort((a, b) => a.date.localeCompare(b.date));

    let flowIdx = 0;
    let cumContrib = 0;
    return data.map((row) => {
      const date = row.date;
      while (flowIdx < flows.length && flows[flowIdx].date <= date) {
        cumContrib += flows[flowIdx].delta;
        flowIdx++;
      }
      const nav = Number(row.portfolio_nav ?? 0);
      return { date, nav, contributions: cumContrib };
    });
  }, [data, transactions]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
        {t('dashboard.navChart.title')}
      </h3>
      <div className="mt-4 h-72 w-full">
        {chartData.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('dashboard.navChart.empty')}
          </p>
        ) : (
          <ResponsiveContainer
            width="100%"
            height="100%"
            role="img"
            aria-label={t('dashboard.navChart.aria')}
          >
            <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5f5" opacity={0.5} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                stroke="#94a3b8"
                tickFormatter={formatShortDate}
                interval="preserveStartEnd"
                tickCount={8}
              />
              <YAxis
                tickFormatter={(value) => formatCurrency(Math.round(value))}
                stroke="#94a3b8"
                width={90}
              />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                labelFormatter={formatFullDate}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="nav"
                name={t('dashboard.navChart.marketGain')}
                stroke={NAV_MARKET_GAIN_COLOR}
                fill={NAV_MARKET_GAIN_COLOR}
                fillOpacity={0.35}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="contributions"
                name={t('dashboard.navChart.contributions')}
                stroke={NAV_CONTRIBUTIONS_COLOR}
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DashboardChartsPanel
// ---------------------------------------------------------------------------

/**
 * Collapsible panel containing the ROI overlay chart and NAV growth chart.
 * Collapse state is persisted in localStorage; defaults to expanded (open).
 */
export default function DashboardChartsPanel({
  roiData = [],
  roiMeta = null,
  transactions = [],
  loadingRoi = false,
  roiSource = 'api',
  benchmarkCatalog,
  navDaily = [],
}) {
  const { t, formatCurrency, formatPercent } = useI18n();
  const [open, setOpen] = useState(() => readChartsOpen());

  useEffect(() => {
    writeChartsOpen(open);
  }, [open]);

  const handleToggle = useCallback(() => setOpen((prev) => !prev), []);

  // Compute flow-matched benchmark overlay series
  const roiChartData = useMemo(() => {
    const baseData = Array.isArray(roiData) ? roiData.map((entry) => ({ ...entry })) : [];
    if (baseData.length === 0) {
      return [];
    }
    return ['spy', 'qqq', 'blended', 'exCash', 'cash'].reduce((nextData, dataKey) => {
      const overlaySeries = buildFlowMatchedBenchmarkSeries(roiData, transactions, dataKey);
      return mergeBenchmarkOverlaySeries(nextData, overlaySeries, `${dataKey}Roi`);
    }, baseData);
  }, [roiData, transactions]);

  const benchmarkOptions = useMemo(() => {
    const safeRoiData = Array.isArray(roiChartData) ? roiChartData : [];
    const catalogMeta = buildBenchmarkSeriesMeta(benchmarkCatalog);
    return catalogMeta
      .map((option) => {
        const roiDataKey = `${option.dataKey}Roi`;
        const hasFlowMatchedSeries = safeRoiData.some(
          (point) => typeof point?.[roiDataKey] === 'number' && Number.isFinite(point[roiDataKey])
        );
        const hasFallbackSeries = safeRoiData.some(
          (point) =>
            typeof point?.[option.dataKey] === 'number' && Number.isFinite(point[option.dataKey])
        );
        return {
          ...option,
          chartDataKey: hasFlowMatchedSeries ? roiDataKey : option.dataKey,
          hasSeries: hasFlowMatchedSeries || hasFallbackSeries,
        };
      })
      .filter((option) => option.hasSeries)
      .map((option) => ({
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
  }, [benchmarkCatalog, roiChartData, t]);

  const benchmarkOptionIds = useMemo(
    () => benchmarkOptions.map((option) => option.id),
    [benchmarkOptions]
  );

  const defaultBenchmarkSelection = useMemo(() => {
    const configuredDefaults = Array.isArray(benchmarkCatalog?.defaults)
      ? benchmarkCatalog.defaults.map((entry) => String(entry))
      : [];
    return configuredDefaults.length > 0 ? configuredDefaults : ['spy', 'qqq'];
  }, [benchmarkCatalog]);

  const [selectedBenchmarks, setSelectedBenchmarks] = usePersistentBenchmarkSelection(
    benchmarkOptionIds,
    defaultBenchmarkSelection
  );

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
        prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
      );
    },
    [setSelectedBenchmarks]
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

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
        aria-expanded={open}
        aria-controls="dashboard-charts-content"
      >
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t('dashboard.charts.title', { defaultValue: 'Portfolio charts' })}
        </span>
        <svg
          className={clsx(
            'h-4 w-4 text-slate-500 transition-transform dark:text-slate-400',
            open && 'rotate-180'
          )}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <div id="dashboard-charts-content" className="space-y-6 px-4 pb-4">
          <RoiChart
            data={roiChartData}
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
            transactions={transactions}
            t={t}
            formatCurrency={formatCurrency}
          />
        </div>
      )}
    </div>
  );
}
