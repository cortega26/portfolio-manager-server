// @ts-nocheck
import { useI18n } from "../i18n/I18nProvider.jsx";

function SummaryCards({ cards, t }) {
  if (cards.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {t("reports.summary.empty")}
      </p>
    );
  }

  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {card.label}
          </dt>
          <dd className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {card.value}
          </dd>
          {card.detail && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{card.detail}</p>
          )}
        </div>
      ))}
    </dl>
  );
}

function ExportAction({ title, description, actionLabel, onAction, disabled }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        className="mt-4 inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:text-slate-200 dark:disabled:bg-slate-700"
      >
        {actionLabel}
      </button>
    </div>
  );
}

export default function ReportsTab({ summaryCards, onExportTransactions, onExportHoldings, onExportPerformance }) {
  const { t } = useI18n();
  const disabled = summaryCards.length === 0;

  const exportActions = [
    {
      title: t("reports.export.transactions.title"),
      description: t("reports.export.transactions.description"),
      actionLabel: t("reports.export.transactions.action"),
      onAction: onExportTransactions,
    },
    {
      title: t("reports.export.holdings.title"),
      description: t("reports.export.holdings.description"),
      actionLabel: t("reports.export.holdings.action"),
      onAction: onExportHoldings,
    },
    {
      title: t("reports.export.performance.title"),
      description: t("reports.export.performance.description"),
      actionLabel: t("reports.export.performance.action"),
      onAction: onExportPerformance,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
        <header>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            {t("reports.section.snapshot.title")}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("reports.section.snapshot.subtitle")}
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

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("reports.tips.title")}</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-400">
          <li>{t("reports.tips.reconcile")}</li>
          <li>{t("reports.tips.combine")}</li>
          <li>{t("reports.tips.audit")}</li>
          <li>
            {t("reports.tips.importer.prefix")} <code>/api/v1/portfolio/&lt;id&gt;</code>
            {t("reports.tips.importer.suffix")}
          </li>
        </ul>
      </section>
    </div>
  );
}
