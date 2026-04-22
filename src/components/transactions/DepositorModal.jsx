import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';

export default function DepositorModal({ open, onClose, onSubmit }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [reference, setReference] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setReference('');
      setShowErrors(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  function handleSubmit(event) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setShowErrors(true);
      return;
    }
    onSubmit({
      name: trimmedName,
      reference: reference.trim(),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-depositor-title"
      data-testid="depositor-modal"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <h3
            id="add-depositor-title"
            className="text-lg font-semibold text-slate-700 dark:text-slate-100"
          >
            {t('transactions.depositor.title')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label={t('transactions.depositor.close')}
          >
            ×
          </button>
        </div>
        <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
          <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
            {t('transactions.depositor.name')}
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder={t('transactions.depositor.name.placeholder')}
              aria-invalid={showErrors && !name.trim()}
              autoFocus
            />
            {showErrors && !name.trim() ? (
              <span className="mt-1 text-xs font-medium text-rose-600">
                {t('transactions.depositor.nameError')}
              </span>
            ) : null}
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
            {t('transactions.depositor.reference')}
            <input
              type="text"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder={t('transactions.depositor.reference.placeholder')}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              {t('transactions.depositor.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
