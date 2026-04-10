import SignalTableCard from "./SignalTableCard.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";

export default function SignalsTab({
  holdings,
  transactions = [],
  currentPrices,
  signals,
  signalRows,
  onSignalChange,
  compact = false,
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {t("signals.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {t("signals.subtitle")}
        </p>
      </section>

      <SignalTableCard
        holdings={holdings}
        transactions={transactions}
        currentPrices={currentPrices}
        signals={signals}
        signalRows={signalRows}
        onSignalChange={onSignalChange}
        compact={compact}
        title={t("signals.matrix.title")}
        subtitle={t("signals.matrix.subtitle")}
      />
    </div>
  );
}
