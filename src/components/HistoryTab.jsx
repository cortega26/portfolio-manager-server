import { useI18n } from "../i18n/I18nProvider.jsx";

function EmptyState({ message }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
      {message}
    </div>
  );
}

function MonthlyBreakdownTable({ breakdown, formatCurrency, t }) {
  if (breakdown.length === 0) {
    return <EmptyState message={t("transactions.table.empty")} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
        <thead className="bg-slate-50/80 dark:bg-slate-800/60">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
            <th className="px-3 py-2">{t("history.table.month")}</th>
            <th className="px-3 py-2">{t("history.table.inflows")}</th>
            <th className="px-3 py-2">{t("history.table.outflows")}</th>
            <th className="px-3 py-2">{t("history.table.net")}</th>
            <th className="px-3 py-2">{t("history.table.activity")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-900">
          {breakdown.map((row) => (
            <tr key={row.month} className="bg-white dark:bg-slate-950">
              <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">
                {row.label}
              </td>
              <td className="px-3 py-2">{formatCurrency(row.inflows)}</td>
              <td className="px-3 py-2">{formatCurrency(row.outflows)}</td>
              <td
                className={
                  row.net >= 0
                    ? "px-3 py-2 text-emerald-600 dark:text-emerald-300"
                  : "px-3 py-2 text-rose-600 dark:text-rose-300"
                }
              >
                {formatCurrency(row.net)}
              </td>
              <td className="px-3 py-2">
                {t("history.table.events", { count: row.count })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivityTimeline({ timeline, t }) {
  if (timeline.length === 0) {
    return <EmptyState message={t("transactions.table.empty")} />;
  }

  return (
    <ol className="space-y-4">
      {timeline.map((item) => (
        <li
          key={`${item.date}-${item.title}`}
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/60"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-300">
                {item.dateLabel}
              </p>
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                {item.title}
              </h3>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {item.typeLabel}
            </span>
          </div>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            {item.description ?? ""}
          </p>
        </li>
      ))}
    </ol>
  );
}

export default function HistoryTab({ monthlyBreakdown, timeline }) {
  const { t, formatCurrency } = useI18n();

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {t("history.contribution.title")}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {t("history.contribution.subtitle")}
            </p>
          </div>
        </header>
        <div className="mt-4">
          <MonthlyBreakdownTable
            breakdown={monthlyBreakdown}
            formatCurrency={formatCurrency}
            t={t}
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow dark:border-slate-800 dark:bg-slate-900">
        <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {t("history.timeline.title")}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {t("history.timeline.subtitle")}
            </p>
          </div>
        </header>
        <div className="mt-4">
          <ActivityTimeline timeline={timeline} t={t} />
        </div>
      </section>
    </div>
  );
}
