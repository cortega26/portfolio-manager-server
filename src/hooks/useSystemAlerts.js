import { useMemo } from 'react';

export default function useSystemAlerts(priceAlert, roiAlert) {
  return useMemo(() => {
    return [priceAlert, roiAlert].filter(Boolean).map((alert) => {
      if (!alert) {
        return alert;
      }
      const requestDetails = (() => {
        if (Array.isArray(alert.requestIds) && alert.requestIds.length > 0) {
          return `Request IDs: ${alert.requestIds.join(', ')}`;
        }
        if (alert.requestId) {
          return `Request ID: ${alert.requestId}`;
        }
        if (alert.resolvedRequestId) {
          return `Last success request ID: ${alert.resolvedRequestId}`;
        }
        return null;
      })();
      return { ...alert, requestDetails };
    });
  }, [priceAlert, roiAlert]);
}
