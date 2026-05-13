import { useI18n } from '../i18n/I18nProvider.jsx';

function EmptyState({ message, compact = false }) {
  return (
    <div
      className={`rounded-xl border border-dashed border-surface-300 bg-surface-50/70 text-center text-surface-600 dark:border-surface-700 dark:bg-surface-900/60 dark:text-surface-400 ${compact ? 'p-4 text-xs' : 'p-6 text-sm'}`}
    >
      {message}
    </div>
  );
}

function MonthlyBreakdownTable({ breakdown, formatCurrency, t, compact = false }) {
  if (breakdown.length === 0) {
    return <EmptyState message={t('transactions.table.empty')} compact={compact} />;
  }

  return (
    <div className="overflow-x-auto">
      <table
        className={`min-w-full divide-y divide-surface-200 dark:divide-surface-800 ${compact ? 'text-xs' : 'text-sm'}`}
      >
        <thead className="bg-surface-50/80 dark:bg-surface-800/60">
          <tr
            className={`text-left font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-300 ${compact ? 'text-[11px]' : 'text-xs'}`}
          >
            <th className={`px-3 ${compact ? 'py-1.5' : 'py-2'}`}>{t('history.table.month')}</th>
            <th className={`px-3 ${compact ? 'py-1.5' : 'py-2'}`}>{t('history.table.inflows')}</th>
            <th className={`px-3 ${compact ? 'py-1.5' : 'py-2'}`}>{t('history.table.outflows')}</th>
            <th className={`px-3 ${compact ? 'py-1.5' : 'py-2'}`}>{t('history.table.net')}</th>
            <th className={`px-3 ${compact ? 'py-1.5' : 'py-2'}`}>{t('history.table.activity')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-200 dark:divide-surface-900">
          {breakdown.map((row) => (
            <tr key={row.month} className="bg-white dark:bg-surface-950">
              <td
                className={`px-3 font-semibold text-surface-700 dark:text-surface-200 ${compact ? 'py-1.5' : 'py-2'}`}
              >
                {row.label}
              </td>
              <td
                className={`px-3 text-surface-700 dark:text-surface-300 ${compact ? 'py-1.5' : 'py-2'}`}
              >
                {formatCurrency(row.inflows)}
              </td>
              <td
                className={`px-3 text-surface-700 dark:text-surface-300 ${compact ? 'py-1.5' : 'py-2'}`}
              >
                {formatCurrency(row.outflows)}
              </td>
              <td
                className={
                  row.net >= 0
                    ? `px-3 ${compact ? 'py-1.5' : 'py-2'} text-emerald-600 dark:text-emerald-300`
                    : `px-3 ${compact ? 'py-1.5' : 'py-2'} text-rose-600 dark:text-rose-300`
                }
              >
                {formatCurrency(row.net)}
              </td>
              <td
                className={`px-3 text-surface-600 dark:text-surface-400 ${compact ? 'py-1.5' : 'py-2'}`}
              >
                {t('history.table.events', { count: row.count })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivityTimeline({ timeline, t, compact = false }) {
  if (timeline.length === 0) {
    return <EmptyState message={t('transactions.table.empty')} compact={compact} />;
  }

  return (
    <ol className={compact ? 'space-y-3' : 'space-y-4'}>
      {timeline.map((item) => (
        <li
          key={`${item.date}-${item.title}`}
          className={`card-base transition-all duration-150 hover:shadow-card-hover ${compact ? 'p-3' : 'p-4'}`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p
                className={`font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400 ${compact ? 'text-[11px]' : 'text-xs'}`}
              >
                {item.dateLabel}
              </p>
              <h3
                className={`font-semibold text-surface-800 dark:text-surface-100 ${compact ? 'text-sm' : 'text-base'}`}
              >
                {item.title}
              </h3>
            </div>
            <span
              className={`tag bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300 ${compact ? 'text-[11px]' : 'text-xs'}`}
            >
              {item.typeLabel}
            </span>
          </div>
          <p
            className={`text-surface-600 dark:text-surface-400 ${compact ? 'mt-2 text-xs' : 'mt-3 text-sm'}`}
          >
            {item.description ?? ''}
          </p>
        </li>
      ))}
    </ol>
  );
}

export default function HistoryTab({ monthlyBreakdown, timeline, compact = false }) {
  const { t, formatCurrency } = useI18n();

  return (
    <div className="space-y-6">
      <section className={`card-base ${compact ? 'p-4' : 'p-5'}`}>
        <header className="flex items-center justify-between">
          <div>
            <h2
              className={`font-heading font-bold text-surface-800 dark:text-surface-100 ${compact ? 'text-base' : 'text-lg'}`}
            >
              {t('history.contribution.title')}
            </h2>
            <p
              className={`text-surface-500 dark:text-surface-400 ${compact ? 'mt-1 text-xs' : 'mt-1 text-sm'}`}
            >
              {t('history.contribution.subtitle')}
            </p>
          </div>
        </header>
        <div className="mt-4">
          <MonthlyBreakdownTable
            breakdown={monthlyBreakdown}
            formatCurrency={formatCurrency}
            t={t}
            compact={compact}
          />
        </div>
      </section>

      <section className={`card-base ${compact ? 'p-4' : 'p-5'}`}>
        <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              className={`font-heading font-bold text-surface-800 dark:text-surface-100 ${compact ? 'text-base' : 'text-lg'}`}
            >
              {t('history.timeline.title')}
            </h2>
            <p
              className={`text-surface-500 dark:text-surface-400 ${compact ? 'mt-1 text-xs' : 'mt-1 text-sm'}`}
            >
              {t('history.timeline.subtitle')}
            </p>
          </div>
        </header>
        <div className="mt-4">
          <ActivityTimeline timeline={timeline} t={t} compact={compact} />
        </div>
      </section>
    </div>
  );
}
