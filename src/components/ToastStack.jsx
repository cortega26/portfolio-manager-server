import { useEffect } from "react";

const TYPE_STYLES = {
  success:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
  error:
    "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200",
  warning:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
  info:
    "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200",
};

function resolveClassName(type) {
  return TYPE_STYLES[type] ?? TYPE_STYLES.info;
}

export default function ToastStack({ toasts, onDismiss }) {
  useEffect(() => {
    if (!Array.isArray(toasts) || toasts.length === 0) {
      return undefined;
    }
    const timers = toasts.map((toast) => {
      const timeout = Number.isFinite(toast.durationMs)
        ? toast.durationMs
        : 6000;
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
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-lg border px-4 py-3 shadow-lg transition ${resolveClassName(
              toast.type,
            )}`}
            role="status"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.message ? (
                  <p className="mt-1 text-sm leading-snug">{toast.message}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onDismiss?.(toast.id)}
                className="-mr-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold uppercase tracking-wide text-inherit/80 hover:text-inherit"
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
            {toast.detail ? (
              <p className="mt-1 font-mono text-xs opacity-80">{toast.detail}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

