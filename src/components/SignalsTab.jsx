import SignalTableCard from './SignalTableCard.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';

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
      <section className="card-base p-5">
        <h2 className="font-heading text-lg font-bold text-surface-900 dark:text-surface-100">
          {t('signals.title')}
        </h2>
        <p className="mt-1 text-sm text-surface-600 dark:text-surface-400">
          {t('signals.subtitle')}
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
        title={t('signals.matrix.title')}
        subtitle={t('signals.matrix.subtitle')}
      />
    </div>
  );
}
