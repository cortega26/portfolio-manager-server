import { useState, useEffect, useMemo } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { usePortfolioList } from '../hooks/usePortfolioList.js';
import { comparePortfolios } from '../utils/api.js';

function formatPct(value) {
  if (value == null || typeof value !== 'number') return '—';
  return `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value) {
  if (value == null || typeof value !== 'number') return '—';
  return value.toFixed(2);
}

const METRICS = [
  { key: 'r_port', labelKey: 'compare.metrics.cumulativeReturn', format: formatPct },
  { key: 'sharpe_ratio', labelKey: 'compare.metrics.sharpeRatio', format: formatNumber },
  { key: 'max_drawdown', labelKey: 'compare.metrics.maxDrawdown', format: formatPct },
  { key: 'current_drawdown', labelKey: 'compare.metrics.currentDrawdown', format: formatPct },
];

export default function ComparisonView() {
  const { t } = useI18n();
  const { portfolios } = usePortfolioList();
  const [selectedIds, setSelectedIds] = useState([]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (selectedIds.length < 2) {
      setResults(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    comparePortfolios(selectedIds)
      .then((data) => {
        if (!cancelled) setResults(data?.results ?? null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Comparison failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedIds]);

  const togglePortfolio = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const metricsRows = useMemo(() => {
    if (!results) return [];
    const ids = selectedIds.filter((id) => results[id]);
    return METRICS.map((metric) => {
      const row = { label: t(metric.labelKey) };
      for (const id of ids) {
        if (metric.key === 'sharpe_ratio') {
          const portfolio = results[id];
          const val = id === 'sharpe_ratio' ? undefined : portfolio?.sharpe_ratio;
          row[id] = metric.format(val);
        } else if (metric.key === 'max_drawdown') {
          const portfolio = results[id];
          row[id] = metric.format(portfolio?.max_drawdown?.value);
        } else if (metric.key === 'current_drawdown') {
          const portfolio = results[id];
          row[id] = metric.format(portfolio?.current_drawdown?.currentDrawdown);
        } else {
          const portfolio = results[id];
          row[id] = metric.format(portfolio?.summary?.[metric.key]);
        }
      }
      return row;
    });
  }, [results, selectedIds, t]);

  const navChartSeries = useMemo(() => {
    if (!results) return [];
    const ids = selectedIds.filter((id) => results[id]?.nav_series?.length > 0);
    const series = ids.map((id) => ({
      id,
      label: portfolios.find((p) => p.id === id)?.displayName ?? id,
      data: results[id].nav_series.map((point) => ({
        date: point.date,
        nav: point.nav,
      })),
    }));
    return series;
  }, [results, selectedIds, portfolios]);

  const allDates = useMemo(() => {
    if (navChartSeries.length === 0) return [];
    const dateSet = new Set();
    for (const s of navChartSeries) {
      for (const d of s.data) dateSet.add(d.date);
    }
    return Array.from(dateSet).sort();
  }, [navChartSeries]);

  const chartHeight = 300;
  const chartWidth = 800;
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };

  const xScale = (date) => {
    const idx = allDates.indexOf(date);
    if (idx === -1) return padding.left;
    return (
      padding.left +
      (idx / Math.max(allDates.length - 1, 1)) * (chartWidth - padding.left - padding.right)
    );
  };

  const allNavs = navChartSeries.flatMap((s) => s.data.map((d) => d.nav));
  const minNav = allNavs.length > 0 ? Math.min(...allNavs) : 0;
  const maxNav = allNavs.length > 0 ? Math.max(...allNavs) : 1;
  const navRange = maxNav - minNav || 1;

  const yScale = (nav) => {
    return (
      chartHeight -
      padding.bottom -
      ((nav - minNav) / navRange) * (chartHeight - padding.top - padding.bottom)
    );
  };

  const yTicks = [];
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    const val = minNav + (navRange * i) / tickCount;
    yTicks.push(val);
  }

  const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];
  const seriesPaths = navChartSeries.map((s) => {
    if (s.data.length < 2) return null;
    const sorted = [...s.data].sort((a, b) => a.date.localeCompare(b.date));
    const points = sorted.map((d) => `${xScale(d.date)},${yScale(d.nav)}`);
    return {
      id: s.id,
      label: s.label,
      path: points.join(' '),
      color: COLORS[navChartSeries.indexOf(s) % COLORS.length],
    };
  });

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
        {t('compare.title')}
      </h2>

      {/* Portfolio selector */}
      <div className="flex flex-wrap gap-2">
        {portfolios.map((p) => {
          const selected = selectedIds.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => togglePortfolio(p.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                selected
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-950/20 dark:text-brand-300'
                  : 'border-surface-200 bg-white text-surface-600 hover:bg-surface-50 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-300'
              }`}
            >
              {p.displayName || p.id}
            </button>
          );
        })}
      </div>

      {selectedIds.length < 2 && (
        <p className="text-sm text-surface-500 dark:text-surface-400">
          {t('compare.selectPrompt')}
        </p>
      )}

      {loading && <p className="text-sm text-surface-500">{t('common.loading')}</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}

      {/* NAV chart */}
      {seriesPaths.length > 0 && allDates.length > 0 && (
        <div className="rounded-lg border border-surface-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-900">
          <h3 className="mb-3 text-sm font-semibold text-surface-700 dark:text-surface-200">
            NAV Overlay
          </h3>
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full"
            style={{ maxHeight: chartHeight }}
            role="img"
            aria-label="NAV comparison chart"
          >
            {/* Y-axis grid lines */}
            {yTicks.map((val, i) => (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={yScale(val)}
                  x2={chartWidth - padding.right}
                  y2={yScale(val)}
                  stroke="#e5e7eb"
                  strokeWidth={1}
                />
                <text
                  x={padding.left - 8}
                  y={yScale(val) + 4}
                  textAnchor="end"
                  className="fill-surface-400 text-[10px]"
                >
                  {val.toFixed(0)}
                </text>
              </g>
            ))}
            {/* Series lines */}
            {seriesPaths.map((sp) =>
              sp ? (
                <polyline
                  key={sp.id}
                  points={sp.path}
                  fill="none"
                  stroke={sp.color}
                  strokeWidth={2}
                />
              ) : null
            )}
          </svg>
          <div className="mt-2 flex flex-wrap gap-4">
            {seriesPaths.map((sp) => (
              <div
                key={sp.id}
                className="flex items-center gap-1.5 text-xs text-surface-600 dark:text-surface-400"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: sp.color }}
                />
                {sp.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics table */}
      {metricsRows.length > 0 && selectedIds.length >= 2 && (
        <div className="overflow-x-auto rounded-lg border border-surface-200 dark:border-surface-700">
          <table className="min-w-full divide-y divide-surface-200 dark:divide-surface-700">
            <thead className="bg-surface-50 dark:bg-surface-800/50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-surface-500 dark:text-surface-400">
                  {t('compare.portfolioLabel')}
                </th>
                {selectedIds.map((id) => (
                  <th
                    key={id}
                    className="px-4 py-2 text-right text-xs font-semibold uppercase text-surface-500 dark:text-surface-400"
                  >
                    {portfolios.find((p) => p.id === id)?.displayName ?? id}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200 dark:divide-surface-700">
              {metricsRows.map((row, i) => (
                <tr key={i} className="even:bg-surface-50/50 dark:even:bg-surface-800/20">
                  <td className="px-4 py-2 text-sm text-surface-700 dark:text-surface-200">
                    {row.label}
                  </td>
                  {selectedIds.map((id) => (
                    <td
                      key={id}
                      className="px-4 py-2 text-right text-sm text-surface-900 dark:text-surface-100"
                    >
                      {row[id] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
