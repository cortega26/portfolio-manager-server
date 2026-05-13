import { useEffect } from 'react';

import { useI18n } from '../i18n/I18nProvider.jsx';

const TYPE_STYLES = {
  success:
    'border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200',
  error:
    'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
  warning:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
  info: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',
};

function resolveClassName(type) {
  return TYPE_STYLES[type] ?? TYPE_STYLES.info;
}

export default function ToastStack({ toasts, onDismiss }) {
  const { t } = useI18n();
  useEffect(() => {
    if (!Array.isArray(toasts) || toasts.length === 0) {
      return undefined;
    }
    const timers = toasts.map((toast) => {
      const timeout = Number.isFinite(toast.durationMs) ? toast.durationMs : 6000;
      if (timeout <= 0) {
        return null;
      }
      const id = toast.id;
      return window.setTimeout(() => {
        onDismiss?.(id);
      }, timeout);
    });
    return () => {
      for (const timer of timers) {
        if (timer) {
          window.clearTimeout(timer);
        }
      }
    };
  }, [toasts, onDismiss]);

  if (!Array.isArray(toasts) || toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4 sm:justify-end"
      aria-live="polite"
      aria-atomic="false"
    >
      <div className="flex w-full max-w-sm flex-col gap-3 sm:max-w-md">
        {toasts.map((toast, index) => (
          <div
            key={toast.id}
            className={`pointer-events-auto animate-slide-in-right rounded-xl border bg-white px-4 py-3 shadow-toast ${resolveClassName(toast.type)}`}
            role="status"
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.message ? (
                  <p className="mt-1 text-sm leading-snug opacity-90">{toast.message}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onDismiss?.(toast.id)}
                className="-mr-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-sm font-semibold text-inherit/60 transition-colors hover:bg-inherit/10 hover:text-inherit"
                aria-label={t('toast.dismiss')}
              >
                ×
              </button>
            </div>
            {toast.detail ? (
              <p className="mt-2 border-t border-inherit/10 pt-2 font-mono text-xs opacity-70">
                {toast.detail}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
