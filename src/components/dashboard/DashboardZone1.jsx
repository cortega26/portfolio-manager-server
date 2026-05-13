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
      (!Number.isFinite(navChange) && 'text-surface-500 dark:text-surface-400')
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
    <div className="relative overflow-hidden rounded-xl border border-surface-200 bg-gradient-to-br from-white to-surface-50 p-6 shadow-card dark:border-surface-800 dark:from-surface-900 dark:to-surface-900/80">
      {/* subtle decorative gradient */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-brand-500/5 blur-3xl dark:bg-brand-400/5" />
      <div className="relative flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-heading text-xs font-semibold uppercase tracking-widest text-surface-500 dark:text-surface-400">
            {t('dashboard.metrics.nav')}
          </p>
          <p className="font-heading text-4xl font-bold tracking-tight text-surface-900 dark:text-surface-50">
            {navDisplay}
          </p>
          {description && (
            <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">{description}</p>
          )}
          {deltaText && (
            <p className={clsx('text-sm font-semibold', deltaColor)} aria-label="Daily change">
              {deltaText}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2 sm:pt-0">
          {valuationBadge && (
            <span
              className={clsx(
                'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold',
                valuationBadge.tone === 'warning' &&
                  'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/20 dark:text-amber-200',
                valuationBadge.tone === 'info' &&
                  'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-700/60 dark:bg-sky-950/20 dark:text-sky-200'
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
            className="inline-flex items-center rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-brand-700 hover:shadow-tab focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <svg
              className="-ml-0.5 mr-1.5 h-4 w-4"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8 2.5a5.5 5.5 0 0 0-4.57 2.586.75.75 0 1 1-1.274-.792 7 7 0 0 1 12.032 3.07.75.75 0 0 1-1.46.344A5.5 5.5 0 0 0 8 2.5ZM1.217 8.988a.75.75 0 0 1 .777.647A5.472 5.472 0 0 0 8 13.5a5.5 5.5 0 0 0 4.57-2.586.75.75 0 1 1 1.274.792 7 7 0 0 1-12.032-3.07.75.75 0 0 1 .405-.648Z"
                clipRule="evenodd"
              />
              <path d="M11.36 4.242a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.69a4.004 4.004 0 0 0-7.11-.736.75.75 0 1 1-1.278-.785 5.504 5.504 0 0 1 9.198 1.27V4.992a.75.75 0 0 1 .75-.75Z" />
            </svg>
            {t('dashboard.quickActions.refresh')}
          </button>
        </div>
      </div>
    </div>
  );
}
