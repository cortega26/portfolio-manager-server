// @ts-nocheck
import { useI18n } from "../i18n/I18nProvider.jsx";

function EmptyState({ message, compact = false }) {
  return (
    <div
      className={`rounded-lg border border-dashed border-slate-300 bg-slate-50/70 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400 ${compact ? "p-4 text-xs" : "p-6 text-sm"}`}
    >
      {message}
    </div>
  );
}

function MonthlyBreakdownTable({ breakdown, formatCurrency, t, compact = false }) {
  if (breakdown.length === 0) {
    return <EmptyState message={t("transactions.table.empty")} compact={compact} />;
  }

  return (
    <div className="overflow-x-auto">
      <table
        className={`min-w-full divide-y divide-slate-200 dark:divide-slate-800 ${compact ? "text-xs" : "text-sm"}`}
      >
        <thead className="bg-slate-50/80 dark:bg-slate-800/60">
          <tr
            className={`text-left font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300 ${compact ? "text-[11px]" : "text-xs"}`}
          >
            <th className={`px-3 ${compact ? "py-1.5" : "py-2"}`}>{t("history.table.month")}</th>
            <th className={`px-3 ${compact ? "py-1.5" : "py-2"}`}>{t("history.table.inflows")}</th>
            <th className={`px-3 ${compact ? "py-1.5" : "py-2"}`}>{t("history.table.outflows")}</th>
            <th className={`px-3 ${compact ? "py-1.5" : "py-2"}`}>{t("history.table.net")}</th>
            <th className={`px-3 ${compact ? "py-1.5" : "py-2"}`}>{t("history.table.activity")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-900">
          {breakdown.map((row) => (
            <tr key={row.month} className="bg-white dark:bg-slate-950">
              <td className={`px-3 font-semibold text-slate-700 dark:text-slate-200 ${compact ? "py-1.5" : "py-2"}`}>
                {row.label}
              </td>
              <td className={`px-3 ${compact ? "py-1.5" : "py-2"}`}>{formatCurrency(row.inflows)}</td>
              <td className={`px-3 ${compact ? "py-1.5" : "py-2"}`}>{formatCurrency(row.outflows)}</td>
              <td
                className={
                  row.net >= 0
                    ? `px-3 ${compact ? "py-1.5" : "py-2"} text-emerald-600 dark:text-emerald-300`
                    : `px-3 ${compact ? "py-1.5" : "py-2"} text-rose-600 dark:text-rose-300`
                }
              >
                {formatCurrency(row.net)}
              </td>
              <td className={`px-3 ${compact ? "py-1.5" : "py-2"}`}>
                {t("history.table.events", { count: row.count })}
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
    return <EmptyState message={t("transactions.table.empty")} compact={compact} />;
  }

  return (
    <ol className={compact ? "space-y-3" : "space-y-4"}>
      {timeline.map((item) => (
        <li
          key={`${item.date}-${item.title}`}
          className={`rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/60 ${compact ? "p-3" : "p-4"}`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className={`font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-300 ${compact ? "text-[11px]" : "text-xs"}`}>
                {item.dateLabel}
              </p>
              <h3 className={`font-semibold text-slate-800 dark:text-slate-100 ${compact ? "text-sm" : "text-base"}`}>
                {item.title}
              </h3>
            </div>
            <span
              className={`rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 ${compact ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-xs"}`}
            >
              {item.typeLabel}
            </span>
          </div>
          <p className={`text-slate-600 dark:text-slate-400 ${compact ? "mt-2 text-xs" : "mt-3 text-sm"}`}>
            {item.description ?? ""}
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
      <section
        className={`rounded-xl border border-slate-200 bg-white shadow dark:border-slate-800 dark:bg-slate-900 ${compact ? "p-4" : "p-5"}`}
      >
        <header className="flex items-center justify-between">
          <div>
            <h2
              className={`font-semibold text-slate-800 dark:text-slate-100 ${compact ? "text-base" : "text-lg"}`}
            >
              {t("history.contribution.title")}
            </h2>
            <p className={`text-slate-500 dark:text-slate-400 ${compact ? "mt-1 text-xs" : "mt-1 text-sm"}`}>
              {t("history.contribution.subtitle")}
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

      <section
        className={`rounded-xl border border-slate-200 bg-white shadow dark:border-slate-800 dark:bg-slate-900 ${compact ? "p-4" : "p-5"}`}
      >
        <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              className={`font-semibold text-slate-800 dark:text-slate-100 ${compact ? "text-base" : "text-lg"}`}
            >
              {t("history.timeline.title")}
            </h2>
            <p className={`text-slate-500 dark:text-slate-400 ${compact ? "mt-1 text-xs" : "mt-1 text-sm"}`}>
              {t("history.timeline.subtitle")}
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
