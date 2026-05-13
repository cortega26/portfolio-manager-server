import { useI18n } from '../i18n/I18nProvider.jsx';

function MetricsGrid({ cards, t }) {
  if (cards.length === 0) {
    return (
      <p className="text-sm text-surface-500 dark:text-surface-400">{t('metrics.empty.cards')}</p>
    );
  }

  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="card-base p-4">
          <dt className="text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">
            {card.label}
          </dt>
          <dd className="mt-2 font-heading text-2xl font-bold tracking-tight text-surface-900 dark:text-surface-100">
            {card.value}
          </dd>
          {card.detail && (
            <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">{card.detail}</p>
          )}
        </div>
      ))}
    </dl>
  );
}

function AllocationList({ allocations, t, formatCurrency, formatPercent }) {
  if (allocations.length === 0) {
    return (
      <p className="text-sm text-surface-500 dark:text-surface-400">
        {t('metrics.empty.allocations')}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {allocations.map((row) => (
        <li key={row.ticker} className="card-base p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-surface-700 dark:text-surface-200">
              {row.ticker}
            </p>
            <span className="tag bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              {formatPercent(row.weight * 100, 1)}
            </span>
          </div>
          <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">
            {t('metrics.allocations.currentValue', { value: formatCurrency(row.value) })}
          </p>
          <div className="mt-3 h-1.5 rounded-full bg-surface-100 dark:bg-surface-800">
            <div
              className="h-full rounded-full bg-brand-500 dark:bg-brand-400"
              style={{ width: `${Math.min(row.weight * 100, 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function PerformanceHighlights({ performance, t }) {
  if (performance.length === 0) {
    return (
      <p className="text-sm text-surface-500 dark:text-surface-400">
        {t('metrics.empty.performance')}
      </p>
    );
  }

  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {performance.map((item) => (
        <div key={item.label} className="card-base p-4">
          <dt className="text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-300">
            {item.label}
          </dt>
          <dd className="mt-2 font-heading text-xl font-bold tracking-tight text-surface-900 dark:text-surface-100">
            {item.value}
          </dd>
          {item.description && (
            <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
              {item.description}
            </p>
          )}
        </div>
      ))}
    </dl>
  );
}

export default function MetricsTab({ metricCards, allocations, performance }) {
  const { t, formatCurrency, formatPercent } = useI18n();
  return (
    <div className="space-y-6">
      <section className="card-base p-5">
        <header>
          <h2 className="font-heading text-lg font-bold text-surface-800 dark:text-surface-100">
            {t('metrics.section.keyRatios')}
          </h2>
          <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
            {t('metrics.section.keyRatios.subtitle')}
          </p>
        </header>
        <div className="mt-4">
          <MetricsGrid cards={metricCards} t={t} />
        </div>
      </section>

      <section className="card-base p-5">
        <header>
          <h2 className="font-heading text-lg font-bold text-surface-800 dark:text-surface-100">
            {t('metrics.section.allocations')}
          </h2>
          <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
            {t('metrics.section.allocations.subtitle')}
          </p>
        </header>
        <div className="mt-4">
          <AllocationList
            allocations={allocations}
            t={t}
            formatCurrency={formatCurrency}
            formatPercent={formatPercent}
          />
        </div>
      </section>

      <section className="card-base p-5">
        <header>
          <h2 className="font-heading text-lg font-bold text-surface-800 dark:text-surface-100">
            {t('metrics.section.performance')}
          </h2>
          <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
            {t('metrics.section.performance.subtitle')}
          </p>
        </header>
        <div className="mt-4">
          <PerformanceHighlights performance={performance} t={t} />
        </div>
      </section>
    </div>
  );
}
