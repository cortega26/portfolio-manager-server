import { useI18n } from '../i18n/I18nProvider.jsx';

function StatusBadge({ status, label }) {
  const className = (() => {
    if (status === 'live') {
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200';
    }
    if (status === 'eod_fresh') {
      return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200';
    }
    if (status === 'cache_fresh' || status === 'cached') {
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200';
    }
    if (status === 'degraded') {
      return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200';
    }
    if (status === 'error') {
      return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200';
    }
    return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
  })();

  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

export default function PricesTab({
  rows,
  summary,
  loading,
  onRefresh,
  lastUpdatedAt,
  requestId,
  version,
}) {
  const { t, formatCurrency, formatNumber, formatDate, formatSignedPercent } = useI18n();
  const hasRows = Array.isArray(rows) && rows.length > 0;
  const summaryCards = [
    {
      label: t('prices.summary.totalCost'),
      value: Number.isFinite(Number(summary?.totals?.totalCost))
        ? formatCurrency(Number(summary.totals.totalCost))
        : '—',
    },
    {
      label: t('prices.summary.realised'),
      value: Number.isFinite(Number(summary?.totals?.totalRealised))
        ? formatCurrency(Number(summary.totals.totalRealised))
        : '—',
    },
    {
      label: t('prices.summary.unrealised'),
      value: Number.isFinite(Number(summary?.totals?.totalUnrealised))
        ? formatCurrency(Number(summary.totals.totalUnrealised))
        : '—',
    },
    {
      label: t('prices.summary.totalNav'),
      value: Number.isFinite(Number(summary?.totals?.totalNav))
        ? formatCurrency(Number(summary.totals.totalNav))
        : Number.isFinite(Number(summary?.totals?.totalValue))
          ? formatCurrency(Number(summary.totals.totalValue))
          : '—',
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t('prices.title')}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">{t('prices.subtitle')}</p>
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <div>
                <dt className="inline">{t('prices.meta.tracked')}: </dt>
                <dd className="inline font-medium text-slate-700 dark:text-slate-200">
                  {rows.length}
                </dd>
              </div>
              <div>
                <dt className="inline">{t('prices.meta.lastUpdated')}: </dt>
                <dd className="inline font-medium text-slate-700 dark:text-slate-200">
                  {lastUpdatedAt
                    ? formatDate(lastUpdatedAt, { dateStyle: 'medium', timeStyle: 'short' })
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="inline">{t('prices.meta.requestId')}: </dt>
                <dd className="inline font-mono text-slate-700 dark:text-slate-200">
                  {requestId ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="inline">{t('prices.meta.version')}: </dt>
                <dd className="inline font-medium text-slate-700 dark:text-slate-200">
                  {version ?? '—'}
                </dd>
              </div>
            </dl>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
          >
            {loading ? t('prices.refresh.loading') : t('prices.refresh.action')}
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-950/30"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {card.label}
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {card.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {!hasRows ? (
          <div className="p-5 text-sm text-slate-500 dark:text-slate-400">{t('prices.empty')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="min-w-full border-collapse text-sm"
              aria-label={t('prices.table.aria')}
            >
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">{t('prices.table.symbol')}</th>
                  <th className="px-4 py-3">{t('prices.table.scope')}</th>
                  <th className="px-4 py-3">{t('prices.table.lastPrice')}</th>
                  <th className="px-4 py-3">{t('prices.table.asOf')}</th>
                  <th className="px-4 py-3">{t('prices.table.shares')}</th>
                  <th className="px-4 py-3">{t('prices.table.avgCost')}</th>
                  <th className="px-4 py-3">{t('prices.table.totalCost')}</th>
                  <th className="px-4 py-3">{t('prices.table.marketValue')}</th>
                  <th className="px-4 py-3">{t('prices.table.unrealised')}</th>
                  <th className="px-4 py-3">{t('prices.table.realised')}</th>
                  <th className="px-4 py-3">{t('prices.table.returnPct')}</th>
                  <th className="px-4 py-3">{t('prices.table.status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={`${row.scope}-${row.symbol}`}
                    className="border-t border-slate-200 dark:border-slate-800"
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {row.symbol}
                      </div>
                      {row.description ? (
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {row.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">
                      {row.scopeLabel}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-900 dark:text-slate-100">
                      {row.price !== null ? formatCurrency(row.price) : '—'}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">
                      {row.asOf ? formatDate(row.asOf) : '—'}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">
                      {row.shares !== null
                        ? formatNumber(row.shares, { maximumFractionDigits: 9 })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-900 dark:text-slate-100">
                      {row.scope === 'holding' && row.avgCost !== null
                        ? formatCurrency(row.avgCost)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-900 dark:text-slate-100">
                      {row.scope === 'holding' && row.totalCost !== null
                        ? formatCurrency(row.totalCost)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-900 dark:text-slate-100">
                      {row.marketValue !== null ? formatCurrency(row.marketValue) : '—'}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-900 dark:text-slate-100">
                      {row.scope === 'holding' && row.unrealised !== null
                        ? formatCurrency(row.unrealised)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-900 dark:text-slate-100">
                      {row.scope === 'holding' && row.realised !== null
                        ? formatCurrency(row.realised)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-900 dark:text-slate-100">
                      {row.scope === 'holding' && row.totalReturnPct !== null
                        ? formatSignedPercent(row.totalReturnPct, 2)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="space-y-1">
                        <StatusBadge status={row.status} label={row.statusLabel} />
                        {row.errorMessage ? (
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {row.errorMessage}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
