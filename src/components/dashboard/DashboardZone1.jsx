import clsx from 'clsx';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { formatNullableCurrency, formatNullablePercent } from './dashboardFormatters.js';
import { TrustBadge } from '../shared/TrustBadge.jsx';
import { resolveFlags, getFlag } from '../../lib/featureFlags.js';

function resolveStatusStyle(priceStatus) {
  if (priceStatus === 'fallback') {
    return {
      label: 'dashboard.quickActions.status.fallback',
      className:
        'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500/60 dark:bg-amber-500/10 dark:text-amber-200',
    };
  }
  if (priceStatus === 'error') {
    return {
      label: 'dashboard.quickActions.status.unavailable',
      className:
        'border-rose-400 bg-rose-50 text-rose-700 dark:border-rose-500/60 dark:bg-rose-500/10 dark:text-rose-200',
    };
  }
  if (priceStatus === 'stale') {
    return {
      label: 'dashboard.quickActions.status.stale',
      className:
        'border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-500/60 dark:bg-sky-500/10 dark:text-sky-200',
    };
  }
  return {
    label: 'dashboard.quickActions.status.live',
    className:
      'border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-500/60 dark:bg-emerald-500/10 dark:text-emerald-200',
  };
}

/**
 * Zone 1 — large NAV headline with description, daily delta, status badge, and refresh.
 * Absorbs the "Total NAV" metric card so the value appears exactly once in the DOM.
 *
 * @param {{
 *   portfolioMetrics: import('../../hooks/usePortfolioMetrics.js').PortfolioMetricsResult,
 *   navChange: number | null,
 *   navChangePct: number | null,
 *   priceStatus: string,
 *   onRefresh: () => void,
 * }} props
 */
export default function DashboardZone1({
  portfolioMetrics,
  navChange,
  navChangePct,
  priceStatus,
  onRefresh,
}) {
  const { t, formatCurrency, formatPercent, formatSignedPercent } = useI18n();

  const {
    totals: {
      totalNav,
      totalValue,
      cashBalance,
      pricedHoldingsCount,
      holdingsCount,
      valuationStatus,
      missingTickers,
    },
    percentages: { cashAllocationPct },
  } = portfolioMetrics;

  const navDisplay = formatNullableCurrency(formatCurrency, totalNav);

  const cashPct =
    Number.isFinite(cashAllocationPct) && totalNav !== 0
      ? formatPercent(cashAllocationPct, 1)
      : '—';

  const missingTickersSummary =
    Array.isArray(missingTickers) && missingTickers.length > 0
      ? ` (${missingTickers.join(', ')})`
      : '';

  const description = (() => {
    if (valuationStatus === 'complete_live') {
      return t('dashboard.metrics.nav.description', {
        equity: formatCurrency(totalValue ?? 0),
        cash: formatCurrency(cashBalance),
        cashPct,
      });
    }
    if (valuationStatus === 'complete_estimated') {
      return t('dashboard.metrics.nav.estimated', {
        equity: formatCurrency(totalValue ?? 0),
        cash: formatCurrency(cashBalance),
        cashPct,
        priced: pricedHoldingsCount,
        total: holdingsCount,
      });
    }
    if (valuationStatus === 'partial_estimated') {
      return t('dashboard.metrics.nav.partial', {
        equity: formatCurrency(totalValue ?? 0),
        cash: formatCurrency(cashBalance),
        priced: pricedHoldingsCount,
        total: holdingsCount,
        missing: missingTickersSummary,
      });
    }
    return t('dashboard.metrics.nav.unavailable', {
      cash: formatCurrency(cashBalance),
    });
  })();

  const valuationBadge = (() => {
    if (valuationStatus === 'complete_estimated') {
      return { label: t('dashboard.metrics.valuation.estimatedBadge'), tone: 'warning' };
    }
    if (valuationStatus === 'partial_estimated') {
      return { label: t('dashboard.metrics.valuation.partialBadge'), tone: 'info' };
    }
    return null;
  })();

  const changeSign = Number.isFinite(navChange) && navChange > 0 ? '+' : '';
  const changeAbsolute = Number.isFinite(navChange)
    ? `${changeSign}${formatCurrency(navChange)}`
    : null;
  const changePct = formatNullablePercent(formatSignedPercent, navChangePct, 2);
  const deltaText = changeAbsolute && changePct !== '—' ? `${changeAbsolute} (${changePct})` : null;
  const deltaColor = clsx(
    Number.isFinite(navChange) && navChange > 0 && 'text-emerald-600 dark:text-emerald-400',
    Number.isFinite(navChange) && navChange < 0 && 'text-rose-600 dark:text-rose-400',
    (Number.isFinite(navChange) && navChange === 0) ||
      (!Number.isFinite(navChange) && 'text-slate-500 dark:text-slate-400')
  );

  const status = resolveStatusStyle(priceStatus);

  // SR-005: trust badge, behind feature flag
  const showTrustBadges = getFlag(resolveFlags(), 'redesign.trustBadges');
  const trustFromStatus = {
    api: { source_type: 'eod', freshness_state: 'fresh', confidence_state: 'high' },
    stale: { source_type: 'cached', freshness_state: 'stale', confidence_state: 'low' },
    'cash-only': {
      source_type: 'unknown',
      freshness_state: 'unknown',
      confidence_state: 'unknown',
    },
    error: { source_type: 'unknown', freshness_state: 'unknown', confidence_state: 'degraded' },
  };
  const navTrust = trustFromStatus[priceStatus] ?? trustFromStatus.error;

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      title={t('dashboard.metrics.nav.title')}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t('dashboard.metrics.nav')}
          </p>
          <p className="text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {navDisplay}
          </p>
          {description && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
          )}
          {deltaText && (
            <p className={clsx('text-sm font-medium', deltaColor)} aria-label="Daily change">
              {deltaText}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2 sm:pt-0">
          {valuationBadge && (
            <span
              className={clsx(
                'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium',
                valuationBadge.tone === 'warning' &&
                  'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/20 dark:text-amber-200',
                valuationBadge.tone === 'info' &&
                  'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700/60 dark:bg-sky-950/20 dark:text-sky-200'
              )}
            >
              {valuationBadge.label}
            </span>
          )}
          <span
            className={clsx(
              'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold',
              status.className
            )}
            role="status"
            aria-live="polite"
          >
            {t(status.label)}
          </span>
          {showTrustBadges && <TrustBadge trust={navTrust} />}
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            {t('dashboard.quickActions.refresh')}
          </button>
        </div>
      </div>
    </div>
  );
}
