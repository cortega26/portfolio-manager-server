import { useCallback } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';

export default function AppHeader({ language, onLanguageChange }) {
  const { t } = useI18n();

  const handleLanguageChange = useCallback(
    (event) => {
      const next = event.target.value;
      if (next && next !== language) {
        onLanguageChange(next);
      }
    },
    [language, onLanguageChange]
  );

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-surface-900 dark:text-white">
          {t('app.title')}
        </h1>
        <div className="h-0.5 w-12 rounded-full bg-brand-500" />
        <p className="mt-1 max-w-3xl text-sm text-surface-500 dark:text-surface-400">
          {t('app.subtitle')}
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium text-surface-500 dark:text-surface-400">
        <span>{t('app.language')}</span>
        <select
          value={language}
          onChange={handleLanguageChange}
          className="rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-sm text-surface-700 shadow-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200"
        >
          <option value="en">{t('app.language.english')}</option>
          <option value="es">{t('app.language.spanish')}</option>
        </select>
      </label>
    </header>
  );
}
