import { useCallback, useRef, useState } from 'react';

export default function useToasts(settings) {
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const effectiveSettings = settings ?? {};
  const pushAlertsEnabled = effectiveSettings?.notifications?.push !== false;

  const dismissToast = useCallback((id) => {
    if (!id) {
      return;
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast) => {
      setToasts((current) => {
        const toastType = toast?.type ?? 'info';
        if (!pushAlertsEnabled && toastType !== 'error' && toastType !== 'warning') {
          return current;
        }
        const generatedId = `toast-${Date.now()}-${toastIdRef.current + 1}`;
        toastIdRef.current += 1;
        const id =
          typeof toast?.id === 'string' && toast.id.trim().length > 0 ? toast.id : generatedId;
        const payload = {
          id,
          type: toastType,
          title: toast?.title ?? '',
          message: toast?.message ?? '',
          detail: toast?.detail,
          durationMs: toast?.durationMs,
        };
        const filtered = current.filter((entry) => entry.id !== id);
        const merged = [...filtered, payload];
        if (merged.length > 5) {
          merged.shift();
        }
        return merged;
      });
    },
    [pushAlertsEnabled]
  );

  return { toasts, dismissToast, pushToast };
}
