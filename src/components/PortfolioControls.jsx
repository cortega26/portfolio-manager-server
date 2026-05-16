import { useState, useRef } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { usePortfolioList } from '../hooks/usePortfolioList.js';

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
    return { message: t('portfolioControls.status.genericError'), requestId: undefined };
  }
  const requestId =
    typeof error.requestId === 'string' && error.requestId.trim().length > 0
      ? error.requestId
      : undefined;
  if (error.name === 'ApiError') {
    const code = error.body?.error;
    const errorKey = code ? ERROR_MESSAGE_KEYS[code] : null;
    if (errorKey) return { message: t(errorKey), requestId };
    const statusKey = STATUS_MESSAGE_KEYS[error.status];
    if (statusKey) return { message: t(statusKey), requestId };
    return { message: t('portfolioControls.status.genericError'), requestId };
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
  const { portfolios, create, remove, duplicate } = usePortfolioList();
  const [status, setStatus] = useState(null);
  const [newIdInput, setNewIdInput] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const createInputRef = useRef(null);

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
            ? t('portfolioControls.toast.requestId', { requestId: result.requestId })
            : undefined;
        const normalizedId = portfolioId.trim();
        if (action === onSave) {
          onNotify({
            type: 'success',
            title: t('portfolioControls.toast.saveSuccess.title', { id: normalizedId }),
            message: t('portfolioControls.toast.saveSuccess.body', { id: normalizedId }),
            detail,
          });
        } else if (action === onLoad) {
          onNotify({
            type: 'success',
            title: t('portfolioControls.toast.loadSuccess.title', { id: normalizedId }),
            message: t('portfolioControls.toast.loadSuccess.body'),
            detail,
          });
        }
      }
    } catch (error) {
      const { message, requestId } = formatControlError(error, t);
      setStatus({ type: 'error', message, requestId });
      if (typeof onNotify === 'function') {
        const detail = requestId
          ? t('portfolioControls.toast.requestId', { requestId })
          : undefined;
        const normalizedId = portfolioId.trim();
        onNotify({
          type: 'error',
          title:
            action === onSave
              ? t('portfolioControls.toast.saveError.title', { id: normalizedId })
              : t('portfolioControls.toast.loadError.title', { id: normalizedId }),
          message,
          detail,
        });
      }
    }
  }

  const handleCreate = async () => {
    const id = newIdInput.trim() || `portfolio-${Date.now()}`;
    try {
      await create({ id });
      onPortfolioIdChange(id);
      setShowCreate(false);
      setNewIdInput('');
      setStatus({ type: 'success', message: `Portfolio "${id}" created.`, requestId: undefined });
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.message || 'Failed to create portfolio',
        requestId: undefined,
      });
    }
  };

  const handleDelete = async () => {
    if (!portfolioId) return;
    try {
      await remove(portfolioId);
      const remaining = portfolios.filter((p) => p.id !== portfolioId);
      if (remaining.length > 0) {
        onPortfolioIdChange(remaining[0].id);
      } else {
        onPortfolioIdChange(portfolioId); // keep current if no others
      }
      setShowDelete(false);
      setStatus({
        type: 'success',
        message: `Portfolio "${portfolioId}" deleted.`,
        requestId: undefined,
      });
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.message || 'Failed to delete portfolio',
        requestId: undefined,
      });
    }
  };

  const handleDuplicate = async () => {
    const newId = newIdInput.trim() || `${portfolioId}-copy`;
    try {
      await duplicate(portfolioId, newId);
      onPortfolioIdChange(newId);
      setShowDuplicate(false);
      setNewIdInput('');
      setStatus({ type: 'success', message: `Duplicated to "${newId}".`, requestId: undefined });
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.message || 'Failed to duplicate',
        requestId: undefined,
      });
    }
  };

  return (
    <div className="card-base p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 flex-col">
          <label
            htmlFor="portfolioSelector"
            className="text-sm font-medium text-surface-600 dark:text-surface-400"
          >
            {t('portfolioControls.id')}
          </label>
          <div className="mt-1 flex gap-2">
            {portfolios.length > 0 ? (
              <select
                id="portfolioSelector"
                className="w-56 rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-surface-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-surface-700 dark:bg-surface-950 dark:text-surface-100"
                value={portfolioId}
                onChange={(e) => onPortfolioIdChange(e.target.value)}
              >
                {portfolios.length === 0 && <option value="">-- No portfolios --</option>}
                {portfolios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName} ({p.transactionCount} txns)
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="portfolioSelector"
                type="text"
                value={portfolioId}
                onChange={(e) => onPortfolioIdChange(e.target.value)}
                placeholder={t('portfolioControls.id.placeholder')}
                className="w-56 rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-surface-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-surface-700 dark:bg-surface-950 dark:text-surface-100"
              />
            )}
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => {
                  setShowCreate(!showCreate);
                  setShowDuplicate(false);
                  setShowDelete(false);
                }}
                className="rounded-lg border border-surface-200 bg-white px-2 py-2 text-xs font-semibold text-surface-600 hover:bg-surface-50 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-300 dark:hover:bg-surface-800"
                title="Create portfolio"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDuplicate(!showDuplicate);
                  setShowCreate(false);
                  setShowDelete(false);
                }}
                className="rounded-lg border border-surface-200 bg-white px-2 py-2 text-xs font-semibold text-surface-600 hover:bg-surface-50 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-300 dark:hover:bg-surface-800"
                title="Duplicate portfolio"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDelete(!showDelete);
                  setShowCreate(false);
                  setShowDuplicate(false);
                }}
                className="rounded-lg border border-rose-200 bg-white px-2 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900/30 dark:bg-surface-900 dark:text-rose-400 dark:hover:bg-rose-950/20"
                title="Delete portfolio"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </div>
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
            className="inline-flex items-center rounded-lg border border-surface-200 bg-white px-4 py-2 text-sm font-semibold text-surface-700 shadow-sm transition-all duration-150 hover:bg-surface-50 hover:shadow-tab dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200 dark:hover:bg-surface-800"
          >
            {t('portfolioControls.load')}
          </button>
        </div>
      </div>

      {/* Inline create form */}
      {showCreate && (
        <div className="mt-3 flex gap-2 rounded-lg border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-900/30 dark:bg-brand-950/10">
          <input
            ref={createInputRef}
            type="text"
            value={newIdInput}
            onChange={(e) => setNewIdInput(e.target.value)}
            placeholder="Portfolio ID (leave blank for auto-generated)"
            className="flex-1 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-sm text-surface-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-surface-700 dark:bg-surface-950 dark:text-surface-100"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
          />
          <button
            type="button"
            onClick={handleCreate}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="rounded-lg border border-surface-200 px-3 py-1.5 text-sm font-semibold text-surface-600 hover:bg-surface-50 dark:border-surface-700 dark:text-surface-300"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Inline duplicate form */}
      {showDuplicate && (
        <div className="mt-3 flex gap-2 rounded-lg border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-900/30 dark:bg-brand-950/10">
          <input
            type="text"
            value={newIdInput}
            onChange={(e) => setNewIdInput(e.target.value)}
            placeholder={`New ID (copy of "${portfolioId}")`}
            className="flex-1 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-sm text-surface-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-surface-700 dark:bg-surface-950 dark:text-surface-100"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleDuplicate();
            }}
          />
          <button
            type="button"
            onClick={handleDuplicate}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => setShowDuplicate(false)}
            className="rounded-lg border border-surface-200 px-3 py-1.5 text-sm font-semibold text-surface-600 hover:bg-surface-50 dark:border-surface-700 dark:text-surface-300"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Inline delete confirmation */}
      {showDelete && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-900/30 dark:bg-rose-950/10">
          <p className="text-sm text-rose-700 dark:text-rose-300">
            Delete portfolio <strong>{portfolioId}</strong>? This cannot be undone.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setShowDelete(false)}
              className="rounded-lg border border-surface-200 px-3 py-1.5 text-sm font-semibold text-surface-600 hover:bg-surface-50 dark:border-surface-700 dark:text-surface-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status && (
        <div
          className={`mt-3 text-sm ${status.type === 'success' ? 'text-brand-600 dark:text-brand-400' : 'text-rose-600 dark:text-rose-400'}`}
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
