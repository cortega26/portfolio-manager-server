import { useI18n } from '../i18n/I18nProvider.jsx';

export default function SystemAlerts({ alerts }) {
  const { t } = useI18n();

  if (!alerts || alerts.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 space-y-3" role="region" aria-label={t('app.systemAlertsRegion')}>
      {alerts.map((alert) => (
        <div
          key={alert.id}
          role="alert"
          className={`rounded-lg border px-4 py-3 text-sm shadow ${
            alert.type === 'error'
              ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200'
              : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'
          }`}
        >
          <p className="font-semibold">{alert.message}</p>
          {alert.detail ? <p className="mt-1 text-sm">{alert.detail}</p> : null}
          {alert.requestDetails && (
            <span className="mt-1 block font-mono text-xs">{alert.requestDetails}</span>
          )}
        </div>
      ))}
    </div>
  );
}
