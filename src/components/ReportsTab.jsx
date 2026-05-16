import { useI18n } from '../i18n/I18nProvider.jsx';

function SummaryCards({ cards, t }) {
  if (cards.length === 0) {
    return (
      <p className="text-sm text-surface-500 dark:text-surface-400">{t('reports.summary.empty')}</p>
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

function ExportAction({ title, description, actionLabel, onAction, disabled }) {
  return (
    <div className="card-base p-5">
      <h3 className="font-heading text-base font-bold text-surface-800 dark:text-surface-100">
        {title}
      </h3>
      <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">{description}</p>
      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        className="mt-4 inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-brand-700 hover:shadow-tab focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:bg-surface-300 disabled:text-surface-500 dark:disabled:bg-surface-700 dark:disabled:text-surface-500"
      >
        {actionLabel}
      </button>
    </div>
  );
}

export default function ReportsTab({
  summaryCards,
  onExportTransactions,
  onExportHoldings,
  onExportPerformance,
  onImportCsv,
  onExportJson,
  onImportJson,
}) {
  const { t } = useI18n();
  const disabled = summaryCards.length === 0;

  const exportActions = [
    {
      title: t('reports.export.transactions.title'),
      description: t('reports.export.transactions.description'),
      actionLabel: t('reports.export.transactions.action'),
      onAction: onExportTransactions,
    },
    {
      title: t('reports.export.holdings.title'),
      description: t('reports.export.holdings.description'),
      actionLabel: t('reports.export.holdings.action'),
      onAction: onExportHoldings,
    },
    {
      title: t('reports.export.performance.title'),
      description: t('reports.export.performance.description'),
      actionLabel: t('reports.export.performance.action'),
      onAction: onExportPerformance,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="card-base p-5">
        <header>
          <h2 className="font-heading text-lg font-bold text-surface-800 dark:text-surface-100">
            {t('reports.section.snapshot.title')}
          </h2>
          <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
            {t('reports.section.snapshot.subtitle')}
          </p>
        </header>
        <div className="mt-4">
          <SummaryCards cards={summaryCards} t={t} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {exportActions.map((action) => (
          <ExportAction
            key={action.title}
            title={action.title}
            description={action.description}
            actionLabel={action.actionLabel}
            onAction={action.onAction}
            disabled={disabled}
          />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card-base p-5">
          <h3 className="font-heading text-base font-bold text-surface-800 dark:text-surface-100">
            {t('reports.export.json.title') || 'Export Portfolio (JSON)'}
          </h3>
          <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
            {t('reports.export.json.description') ||
              'Download the full portfolio as JSON for backup or migration.'}
          </p>
          <button
            type="button"
            onClick={onExportJson}
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-surface-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface-500"
          >
            <svg
              className="-ml-1 mr-2 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            {t('reports.export.json.action') || 'Export JSON'}
          </button>
        </div>
        <div className="card-base p-5">
          <h3 className="font-heading text-base font-bold text-surface-800 dark:text-surface-100">
            {t('reports.import.json.title') || 'Import Portfolio (JSON)'}
          </h3>
          <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
            {t('reports.import.json.description') ||
              'Restore a portfolio from a previously exported JSON file.'}
          </p>
          <button
            type="button"
            onClick={onImportJson}
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-surface-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface-500"
          >
            <svg
              className="-ml-1 mr-2 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            {t('reports.import.json.action') || 'Import JSON'}
          </button>
        </div>
      </section>

      <section className="card-base p-5">
        <header>
          <h2 className="font-heading text-lg font-bold text-surface-800 dark:text-surface-100">
            {t('import.title')}
          </h2>
          <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
            {t('import.dropzone.hint')}
          </p>
        </header>
        <button
          type="button"
          onClick={onImportCsv}
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-brand-700 hover:shadow-tab focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <svg className="-ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          {t('import.import')}
        </button>
      </section>

      <section className="card-base p-5">
        <h2 className="font-heading text-lg font-bold text-surface-800 dark:text-surface-100">
          {t('reports.tips.title')}
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-surface-600 dark:text-surface-400">
          <li>{t('reports.tips.reconcile')}</li>
          <li>{t('reports.tips.combine')}</li>
          <li>{t('reports.tips.audit')}</li>
          <li>
            {t('reports.tips.importer.prefix')}{' '}
            <code className="rounded bg-surface-100 px-1 font-mono text-xs dark:bg-surface-800">
              /api/v1/portfolio/&lt;id&gt;
            </code>
            {t('reports.tips.importer.suffix')}
          </li>
        </ul>
      </section>
    </div>
  );
}
