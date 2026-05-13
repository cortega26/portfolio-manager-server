import { useState } from 'react';

import { useI18n } from '../i18n/I18nProvider.jsx';

const ERROR_MESSAGE_KEYS = {
  INVALID_SESSION_TOKEN: 'portfolioControls.error.INVALID_SESSION_TOKEN',
  NO_SESSION_TOKEN: 'portfolioControls.error.NO_SESSION_TOKEN',
  SESSION_AUTH_MISCONFIGURED: 'portfolioControls.error.SESSION_AUTH_MISCONFIGURED',
  PORTFOLIO_NOT_FOUND: 'portfolioControls.error.PORTFOLIO_NOT_FOUND',
  E_OVERSELL: 'portfolioControls.error.E_OVERSELL',
  E_CASH_OVERDRAW: 'portfolioControls.error.E_CASH_OVERDRAW',
};

const STATUS_MESSAGE_KEYS = {
  400: 'portfolioControls.error.status.400',
  401: 'portfolioControls.error.status.401',
  403: 'portfolioControls.error.status.403',
  404: 'portfolioControls.error.status.404',
  429: 'portfolioControls.error.status.429',
  500: 'portfolioControls.error.status.500',
};

function formatControlError(error, t) {
  if (!error || typeof error !== 'object') {
    return {
      message: t('portfolioControls.status.genericError'),
      requestId: undefined,
    };
  }

  const requestId =
    typeof error.requestId === 'string' && error.requestId.trim().length > 0
      ? error.requestId
      : undefined;

  if (error.name === 'ApiError') {
    const code = error.body?.error;
    const errorKey = code ? ERROR_MESSAGE_KEYS[code] : null;
    if (errorKey) {
      return { message: t(errorKey), requestId };
    }
    const statusKey = STATUS_MESSAGE_KEYS[error.status];
    if (statusKey) {
      return { message: t(statusKey), requestId };
    }
    return {
      message: t('portfolioControls.status.genericError'),
      requestId,
    };
  }

  const message =
    typeof error.message === 'string' && error.message.trim().length > 0
      ? error.message
      : t('portfolioControls.status.genericError');
  return { message, requestId };
}

export default function PortfolioControls({
  portfolioId,
  onPortfolioIdChange,
  onSave,
  onLoad,
  onNotify,
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState(null);

  async function handle(action) {
    if (!portfolioId?.trim()) {
      setStatus({
        type: 'error',
        message: t('portfolioControls.error.validation'),
        requestId: undefined,
      });
      return;
    }

    try {
      const result = await action();
      setStatus({
        type: 'success',
        message: t('portfolioControls.status.success'),
        requestId: undefined,
      });
      if (typeof onNotify === 'function') {
        const detail =
          result?.requestId && typeof result.requestId === 'string'
            ? t('portfolioControls.toast.requestId', {
                requestId: result.requestId,
              })
            : undefined;
        const normalizedId = portfolioId.trim();
        if (action === onSave) {
          onNotify({
            type: 'success',
            title: t('portfolioControls.toast.saveSuccess.title', {
              id: normalizedId,
            }),
            message: t('portfolioControls.toast.saveSuccess.body', {
              id: normalizedId,
            }),
            detail,
          });
          if (result?.snapshotPersisted === false) {
            onNotify({
              type: 'warning',
              title: t('portfolioControls.toast.saveWarning.title', {
                id: normalizedId,
              }),
              message: t('portfolioControls.toast.saveWarning.body'),
              detail,
            });
          }
        } else if (action === onLoad) {
          onNotify({
            type: 'success',
            title: t('portfolioControls.toast.loadSuccess.title', {
              id: normalizedId,
            }),
            message: t('portfolioControls.toast.loadSuccess.body'),
            detail,
          });
          if (result?.snapshotPersisted === false) {
            onNotify({
              type: 'warning',
              title: t('portfolioControls.toast.saveWarning.title', {
                id: normalizedId,
              }),
              message: t('portfolioControls.toast.saveWarning.body'),
              detail,
            });
          }
        }
      }
    } catch (error) {
      const { message, requestId } = formatControlError(error, t);
      setStatus({ type: 'error', message, requestId });
      if (typeof onNotify === 'function') {
        const detail =
          requestId && typeof requestId === 'string'
            ? t('portfolioControls.toast.requestId', { requestId })
            : undefined;
        const normalizedId = portfolioId.trim();
        onNotify({
          type: 'error',
          title:
            action === onSave
              ? t('portfolioControls.toast.saveError.title', {
                  id: normalizedId,
                })
              : t('portfolioControls.toast.loadError.title', {
                  id: normalizedId,
                }),
          message,
          detail,
        });
      }
    }
  }

  return (
    <div className="card-base p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col">
          <label
            htmlFor="portfolioId"
            className="text-sm font-medium text-surface-600 dark:text-surface-400"
          >
            {t('portfolioControls.id')}
          </label>
          <input
            id="portfolioId"
            type="text"
            className="mt-1 w-48 rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-surface-900 shadow-sm transition-colors placeholder:text-surface-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-surface-700 dark:bg-surface-950 dark:text-surface-100 dark:placeholder:text-surface-500"
            value={portfolioId}
            onChange={(event) => onPortfolioIdChange(event.target.value)}
            placeholder={t('portfolioControls.id.placeholder')}
          />
        </div>
        <div className="max-w-xs rounded-lg border border-surface-200 bg-surface-50/80 px-3 py-2 text-xs text-surface-600 dark:border-surface-700 dark:bg-surface-800/50 dark:text-surface-400">
          <p className="font-semibold text-surface-700 dark:text-surface-200">
            {t('portfolioControls.session.title')}
          </p>
          <p className="mt-1">{t('portfolioControls.session.description')}</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handle(onSave)}
            className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-brand-700 hover:shadow-tab focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            {t('portfolioControls.save')}
          </button>
          <button
            type="button"
            onClick={() => handle(onLoad)}
            className="inline-flex items-center rounded-lg border border-surface-200 bg-white px-4 py-2 text-sm font-semibold text-surface-700 shadow-sm transition-all duration-150 hover:bg-surface-50 hover:shadow-tab focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200 dark:hover:bg-surface-800"
          >
            {t('portfolioControls.load')}
          </button>
        </div>
      </div>
      {status && (
        <div
          className={`mt-3 text-sm ${
            status.type === 'success'
              ? 'text-brand-600 dark:text-brand-400'
              : 'text-rose-600 dark:text-rose-400'
          }`}
          role="status"
        >
          <p>{status.message}</p>
          {status.requestId && (
            <span className="mt-1 block font-mono text-xs text-surface-500">
              Request ID: {status.requestId}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
