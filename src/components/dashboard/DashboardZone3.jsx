import clsx from 'clsx';
import AllocationChart from '../AllocationChart.jsx';
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
} from './dashboardFormatters.js';

// ---------------------------------------------------------------------------
// Inner components
// ---------------------------------------------------------------------------

function MetricCard({ label, value, description, title }) {
  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      title={title}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      {description && (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      )}
    </div>
  );
}

function MetricCardBadge({ label, tone = 'default' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium',
        tone === 'warning' &&
          'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/20 dark:text-amber-200',
        tone === 'info' &&
          'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700/60 dark:bg-sky-950/20 dark:text-sky-200',
        tone === 'default' &&
          'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
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
        'rounded-lg border p-4',
        tone === 'positive' &&
          'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20',
        tone === 'negative' &&
          'border-rose-200 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/20',
        tone === 'default' && 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
      )}
    >
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">{value}</p>
      {detail ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{detail}</p> : null}
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
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t('dashboard.context.title')}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t('dashboard.context.subtitle')}
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
    },
    {
      label: t('dashboard.metrics.externalContributions'),
      value: formatCurrency(netContributions),
      description: t('dashboard.metrics.externalContributions.description', {
        buys: formatCurrency(grossBuys),
        sells: formatCurrency(grossSells),
        income: formatCurrency(netIncome),
      }),
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
