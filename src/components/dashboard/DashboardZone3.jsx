import clsx from 'clsx';
import AllocationChart from '../AllocationChart.jsx';
import SectorAllocationChart from './SectorAllocationChart.jsx';
import ContributionTable from '../ContributionTable.jsx';
import { ROI_PRIMARY_PERCENT_DIGITS } from '../../../shared/precision.js';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import {
  formatNullableCurrency,
  formatNullablePercent,
  formatDrawdownPeriod,
  formatInvestorMwrValue,
  formatInvestorMwrDetail,
  resolveInvestorMwrTone,
  toPercentPoints,
  formatSharpeRatio,
  formatRollingReturn,
} from './dashboardFormatters.js';

// ---------------------------------------------------------------------------
// Inner components
// ---------------------------------------------------------------------------

function MetricIcon({ type }) {
  const paths = {
    return:
      'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
    contributions:
      'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s1.806-.879 2.912-.659A3.1 3.1 0 0012 9',
    change:
      'M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25',
  };
  return (
    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-500/10">
      <svg
        className="h-5 w-5 text-brand-600 dark:text-brand-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={paths[type] ?? paths.return} />
      </svg>
    </div>
  );
}

function MetricCard({ label, value, description, title, iconType }) {
  return (
    <div className="card-base p-5" title={title}>
      {iconType && <MetricIcon type={iconType} />}
      <p className="text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">
        {label}
      </p>
      <p className="mt-1.5 font-heading text-2xl font-bold tracking-tight text-surface-900 dark:text-surface-50">
        {value}
      </p>
      {description && (
        <p className="mt-1.5 text-sm leading-relaxed text-surface-500 dark:text-surface-400">
          {description}
        </p>
      )}
    </div>
  );
}

function MetricCardBadge({ label, tone = 'default' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        tone === 'warning' &&
          'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/20 dark:text-amber-200',
        tone === 'info' &&
          'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-700/60 dark:bg-sky-950/20 dark:text-sky-200',
        tone === 'default' &&
          'border-surface-200 bg-surface-50 text-surface-600 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-300'
      )}
    >
      {label}
    </span>
  );
}

function ContextCard({ label, value, detail, tone = 'default', title }) {
  return (
    <div
      title={title}
      className={clsx(
        'rounded-xl border p-4 transition-shadow duration-200',
        tone === 'positive' &&
          'border-emerald-200 bg-emerald-50/60 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/15',
        tone === 'negative' &&
          'border-rose-200 bg-rose-50/60 shadow-sm dark:border-rose-900/50 dark:bg-rose-950/15',
        tone === 'default' && 'card-base'
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-surface-500 dark:text-surface-400">
        {label}
      </p>
      <p className="mt-2 font-heading text-xl font-bold tracking-tight text-surface-900 dark:text-surface-50">
        {value}
      </p>
      {detail ? (
        <p className="mt-1 text-sm leading-relaxed text-surface-600 dark:text-surface-400">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function PerformanceContext({
  latest,
  spyDeltaPct,
  qqqDeltaPct,
  benchmarkSummary,
  returnsSummary,
}) {
  const { t, formatSignedPercent, formatDate } = useI18n();

  const annualizedTwrPct = toPercentPoints(returnsSummary?.annualized_r_port);
  const annualizedSuffix = Number.isFinite(annualizedTwrPct)
    ? ` (${formatSignedPercent(annualizedTwrPct, ROI_PRIMARY_PERCENT_DIGITS)} ${t('dashboard.context.portfolioTwr.annSuffix')})`
    : '';
  const twrDetail = Number.isFinite(annualizedTwrPct)
    ? t('dashboard.context.portfolioTwr.detailAnnualized')
    : t('dashboard.context.portfolioTwr.detail');

  const cards = [
    {
      label: t('dashboard.context.portfolio.label'),
      value: formatNullablePercent(
        formatSignedPercent,
        latest?.portfolio,
        ROI_PRIMARY_PERCENT_DIGITS
      ),
      detail: t('dashboard.context.portfolio.detail'),
      tone: 'default',
    },
    {
      label: t('dashboard.context.portfolioTwr.label'),
      value: `${formatNullablePercent(
        formatSignedPercent,
        latest?.portfolioTwr,
        ROI_PRIMARY_PERCENT_DIGITS
      )}${annualizedSuffix}`,
      detail: twrDetail,
      tone: 'default',
      title: Number.isFinite(annualizedTwrPct)
        ? t('dashboard.context.portfolioTwr.annTooltip')
        : undefined,
    },
    {
      label: t('dashboard.context.spyGap.label'),
      value: formatNullablePercent(formatSignedPercent, spyDeltaPct, ROI_PRIMARY_PERCENT_DIGITS),
      detail: t('dashboard.context.spyGap.detail', {
        benchmark: formatNullablePercent(
          formatSignedPercent,
          latest?.spy,
          ROI_PRIMARY_PERCENT_DIGITS
        ),
      }),
      tone:
        Number.isFinite(Number(spyDeltaPct)) && Number(spyDeltaPct) >= 0 ? 'positive' : 'negative',
    },
    {
      label: t('dashboard.context.qqqGap.label'),
      value: formatNullablePercent(formatSignedPercent, qqqDeltaPct, ROI_PRIMARY_PERCENT_DIGITS),
      detail: t('dashboard.context.qqqGap.detail', {
        benchmark: formatNullablePercent(
          formatSignedPercent,
          latest?.qqq,
          ROI_PRIMARY_PERCENT_DIGITS
        ),
      }),
      tone:
        Number.isFinite(Number(qqqDeltaPct)) && Number(qqqDeltaPct) >= 0 ? 'positive' : 'negative',
    },
    {
      label: t('dashboard.context.investorMwr.label'),
      value: formatInvestorMwrValue({ benchmarkSummary, t, formatSignedPercent }),
      detail: formatInvestorMwrDetail({ benchmarkSummary, t, formatSignedPercent, formatDate }),
      tone: resolveInvestorMwrTone(benchmarkSummary),
      title: t('dashboard.context.investorMwr.title'),
    },
    (() => {
      const dd = returnsSummary?.max_drawdown;
      const ddValue = dd?.value;
      const ddPct = Number.isFinite(ddValue) ? ddValue * 100 : null;
      return {
        label: t('dashboard.context.maxDrawdown.label'),
        value: Number.isFinite(ddPct)
          ? formatNullablePercent(formatSignedPercent, ddPct, ROI_PRIMARY_PERCENT_DIGITS)
          : '—',
        detail:
          Number.isFinite(ddPct) && dd?.peak_date && dd?.trough_date
            ? formatDrawdownPeriod(dd.peak_date, dd.trough_date)
            : t('dashboard.context.maxDrawdown.insufficient'),
        tone: Number.isFinite(ddPct) && ddPct < -10 ? 'negative' : 'default',
        title: t('dashboard.context.maxDrawdown.title'),
      };
    })(),
    {
      label: t('dashboard.context.sharpeRatio.label'),
      value: formatSharpeRatio(returnsSummary?.sharpe_ratio),
      detail: t('dashboard.context.sharpeRatio.detail'),
      tone: 'default',
    },
    (() => {
      const cd = returnsSummary?.current_drawdown;
      const cdPct = typeof cd?.currentDrawdown === 'number' ? cd.currentDrawdown * 100 : null;
      const peakDate = cd?.peakDate ?? null;
      const currentDate = cd?.currentDate ?? null;
      return {
        label: t('dashboard.context.currentDrawdown.label'),
        value: Number.isFinite(cdPct)
          ? formatNullablePercent(formatSignedPercent, cdPct, ROI_PRIMARY_PERCENT_DIGITS)
          : '—',
        detail:
          Number.isFinite(cdPct) && peakDate
            ? formatDrawdownPeriod(peakDate, currentDate)
            : t('dashboard.context.currentDrawdown.insufficient'),
        tone: Number.isFinite(cdPct) && cdPct < -5 ? 'negative' : 'default',
        title: t('dashboard.context.currentDrawdown.title'),
      };
    })(),
  ];

  const rr = returnsSummary?.rolling_returns;

  return (
    <section className="card-base p-5">
      <div className="flex flex-col gap-1">
        <h3 className="font-heading text-sm font-bold text-surface-700 dark:text-surface-200">
          {t('dashboard.context.title')}
        </h3>
        <p className="text-sm text-surface-500 dark:text-surface-400">
          {t('dashboard.context.subtitle')}
        </p>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
      {rr && (
        <div className="mt-4 border-t border-surface-200 pt-4 dark:border-surface-700">
          <div className="flex items-center gap-6">
            <span className="text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">
              {t('dashboard.context.rollingReturns.label')}
            </span>
            {[
              { key: 'oneMonth', label: t('dashboard.context.rollingReturns.oneMonth') },
              { key: 'threeMonth', label: t('dashboard.context.rollingReturns.threeMonth') },
              { key: 'oneYear', label: t('dashboard.context.rollingReturns.oneYear') },
            ].map(({ key, label }) => {
              const window_ = rr[key];
              const cum = window_?.cumulative;
              const ann = window_?.annualized;
              return (
                <div key={key} className="text-sm">
                  <span className="text-surface-500 dark:text-surface-400">{label}</span>{' '}
                  <span className="font-medium text-surface-900 dark:text-surface-50">
                    {formatRollingReturn(cum, formatSignedPercent)}
                  </span>
                  {ann != null && (
                    <span className="ml-1 text-xs text-surface-400">
                      ({formatRollingReturn(ann, formatSignedPercent)}{' '}
                      {t('dashboard.context.rollingReturns.annualized')})
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Zone 3 — Performance summary + allocation (below the fold)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   portfolioMetrics: import('../../hooks/usePortfolioMetrics.js').PortfolioMetricsResult,
 *   benchmarkSummary?: object | null,
 *   returnsSummary?: object | null,
 *   openHoldings?: unknown[],
 *   currentPrices?: object,
 * }} props
 */
export default function DashboardZone3({
  portfolioMetrics,
  benchmarkSummary = null,
  returnsSummary = null,
  openHoldings = [],
  currentPrices = {},
}) {
  const { t, formatCurrency, formatSignedPercent } = useI18n();
  const {
    totals: {
      cashBalance,
      netContributions,
      grossBuys,
      grossSells,
      netIncome,
      totalReturn,
      totalRealised,
      totalUnrealised,
      totalRoiPct,
      pricedHoldingsCount,
      holdingsCount,
      valuationStatus,
      historicalChange,
    },
    percentages: { spyDeltaPct, qqqDeltaPct },
    latest,
  } = portfolioMetrics;

  const valuationBadge =
    valuationStatus === 'complete_estimated'
      ? { label: t('dashboard.metrics.valuation.estimatedBadge'), tone: 'warning' }
      : valuationStatus === 'partial_estimated'
        ? { label: t('dashboard.metrics.valuation.partialBadge'), tone: 'info' }
        : null;

  // Total NAV is displayed in Zone 1 (DashboardZone1) which absorbs that metric card.
  const metricCards = [
    {
      label: t('dashboard.metrics.return'),
      value: formatNullableCurrency(formatCurrency, totalReturn),
      description:
        valuationStatus === 'complete_live'
          ? t('dashboard.metrics.return.description', {
              realised: formatCurrency(totalRealised),
              unrealised: formatCurrency(totalUnrealised),
              income: formatCurrency(netIncome),
              roi: formatNullablePercent(
                formatSignedPercent,
                totalRoiPct,
                ROI_PRIMARY_PERCENT_DIGITS
              ),
            })
          : valuationStatus === 'complete_estimated'
            ? t('dashboard.metrics.return.estimated', {
                realised: formatCurrency(totalRealised),
                unrealised: formatCurrency(totalUnrealised),
                income: formatCurrency(netIncome),
                roi: formatNullablePercent(
                  formatSignedPercent,
                  totalRoiPct,
                  ROI_PRIMARY_PERCENT_DIGITS
                ),
              })
            : valuationStatus === 'partial_estimated'
              ? t('dashboard.metrics.return.partial', {
                  realised: formatCurrency(totalRealised),
                  unrealised: formatCurrency(totalUnrealised),
                  income: formatCurrency(netIncome),
                  priced: pricedHoldingsCount,
                  total: holdingsCount,
                })
              : t('dashboard.metrics.return.unavailable'),
      title: t('dashboard.metrics.return.title'),
      badge: valuationBadge,
      iconType: 'return',
    },
    {
      label: t('dashboard.metrics.externalContributions'),
      value: formatCurrency(netContributions),
      description: t('dashboard.metrics.externalContributions.description', {
        buys: formatCurrency(grossBuys),
        sells: formatCurrency(grossSells),
        income: formatCurrency(netIncome),
      }),
      iconType: 'contributions',
    },
    {
      label: t('dashboard.metrics.historicalChange'),
      value: formatNullableCurrency(formatCurrency, historicalChange),
      description:
        valuationStatus === 'complete_live'
          ? t('dashboard.metrics.historicalChange.description')
          : valuationStatus === 'complete_estimated'
            ? t('dashboard.metrics.historicalChange.estimated')
            : valuationStatus === 'partial_estimated'
              ? t('dashboard.metrics.historicalChange.partial', {
                  priced: pricedHoldingsCount,
                  total: holdingsCount,
                })
              : t('dashboard.metrics.historicalChange.unavailable'),
      title: t('dashboard.metrics.historicalChange.title'),
      badge: valuationBadge,
      iconType: 'change',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metricCards.map((card) => (
          <div key={card.label} className="space-y-2">
            <MetricCard
              label={card.label}
              value={card.value}
              description={card.description}
              title={card.title}
              iconType={card.iconType}
            />
            {card.badge ? (
              <MetricCardBadge label={card.badge.label} tone={card.badge.tone} />
            ) : null}
          </div>
        ))}
      </div>
      <PerformanceContext
        latest={latest}
        spyDeltaPct={spyDeltaPct}
        qqqDeltaPct={qqqDeltaPct}
        benchmarkSummary={benchmarkSummary}
        returnsSummary={returnsSummary}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <AllocationChart
          openHoldings={openHoldings}
          currentPrices={currentPrices}
          cashBalance={cashBalance ?? 0}
        />
        <SectorAllocationChart
          openHoldings={openHoldings}
          currentPrices={currentPrices}
          cashBalance={cashBalance ?? 0}
        />
      </div>
      <ContributionTable
        openHoldings={openHoldings}
        currentPrices={currentPrices}
        cashBalance={cashBalance ?? 0}
      />
    </div>
  );
}
