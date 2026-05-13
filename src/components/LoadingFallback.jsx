import { useI18n } from '../i18n/I18nProvider.jsx';

export default function LoadingFallback() {
  const { t } = useI18n();
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <div className="skeleton h-24 w-full rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="skeleton h-32 rounded-xl" />
        <div className="skeleton h-32 rounded-xl" />
        <div className="skeleton h-32 rounded-xl" />
      </div>
      <div className="skeleton h-64 w-full rounded-xl" />
      <span className="sr-only">{t('loadingFallback.text')}</span>
    </div>
  );
}
