// src/components/InboxTab.jsx
// Action Inbox tab — replaces SignalsTab in the tab bar (Phase 5).
//
// Renders a feed of InboxItem events ordered by urgency.
// "Dismiss" records a dismiss event via the API (optimistic update).
// "View position" navigates to the HoldingsTab.
// Collapsible "Configure thresholds" panel at the bottom uses existing SignalTableCard.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import SignalTableCard from './SignalTableCard.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { fetchInbox, dismissInboxItem } from '../utils/api.js';

// ── Urgency badge colours ─────────────────────────────────────────────────────

const URGENCY_CLASS = {
  HIGH: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
  LOW: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400',
};

// ── Inbox reducer ─────────────────────────────────────────────────────────────

function inboxReducer(state, action) {
  switch (action.type) {
    case 'LOADED':
      return { ...state, items: action.items, loading: false, error: null };
    case 'LOADING':
      return { ...state, loading: true, error: null };
    case 'ERROR':
      return { ...state, loading: false, error: action.message };
    case 'DISMISS':
      return {
        ...state,
        items: state.items.filter((item) => item.eventKey !== action.eventKey),
      };
    default:
      return state;
  }
}

// ── InboxItem card ────────────────────────────────────────────────────────────

function InboxItemCard({ item, onDismiss, onViewPosition }) {
  const { t } = useI18n();
  const [dismissing, setDismissing] = useState(false);

  const handleDismiss = useCallback(async () => {
    setDismissing(true);
    await onDismiss(item);
  }, [item, onDismiss]);

  return (
    <div
      className="card-base flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4"
      data-testid="inbox-item"
    >
      {/* Urgency badge */}
      <div className="flex-shrink-0">
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${URGENCY_CLASS[item.urgency] ?? URGENCY_CLASS.LOW}`}
          aria-label={`Urgency: ${item.urgency}`}
        >
          {item.urgency}
        </span>
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-surface-900 dark:text-surface-100">{item.ticker}</p>
        <p className="mt-0.5 text-sm text-surface-600 dark:text-surface-300">{item.description}</p>
        {item.rationale && (
          <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">{item.rationale}</p>
        )}
        {item.currentValue != null && (
          <p className="mt-0.5 text-xs text-surface-400 dark:text-surface-500">
            {t('inbox.item.valueLabel', { defaultValue: 'Position value' })}
            {': '}
            <span className="font-mono">${item.currentValue}</span>{' '}
            <span className="font-mono">{`(${item.shares} shares)`}</span>
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-shrink-0 gap-2">
        <button
          type="button"
          onClick={() => onViewPosition(item.ticker)}
          className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-950/30 dark:text-brand-300 dark:hover:bg-brand-950/50"
        >
          {t('inbox.item.viewPosition', { defaultValue: 'View position' })}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={dismissing}
          className="rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-surface-600 transition-colors hover:bg-surface-50 disabled:opacity-50 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700"
        >
          {dismissing
            ? t('inbox.item.dismissing', { defaultValue: 'Dismissing…' })
            : t('inbox.item.dismiss', { defaultValue: 'Dismiss' })}
        </button>
      </div>
    </div>
  );
}

// ── InboxTab ──────────────────────────────────────────────────────────────────

export default function InboxTab({
  portfolioId,
  holdings = [],
  transactions = [],
  currentPrices,
  signals,
  signalRows,
  onSignalChange,
  onNavigateToHoldings,
  compact = false,
}) {
  const { t } = useI18n();
  const [state, dispatch] = useReducer(inboxReducer, {
    items: [],
    loading: false,
    error: null,
  });
  const [configOpen, setConfigOpen] = useState(false);
  const abortRef = useRef(null);

  const loadInbox = useCallback(async () => {
    if (!portfolioId) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    dispatch({ type: 'LOADING' });
    try {
      const response = await fetchInbox(portfolioId, { signal: controller.signal });
      const items = response?.items ?? [];
      dispatch({ type: 'LOADED', items });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      dispatch({ type: 'ERROR', message: err?.message ?? 'Failed to load inbox' });
    }
  }, [portfolioId]);

  useEffect(() => {
    loadInbox();
    return () => abortRef.current?.abort();
  }, [loadInbox]);

  const handleDismiss = useCallback(
    async (item) => {
      try {
        await dismissInboxItem(portfolioId, {
          ticker: item.ticker,
          eventType: item.eventType,
          eventKey: item.eventKey,
        });
        // Optimistic update — remove from local state.
        dispatch({ type: 'DISMISS', eventKey: item.eventKey });
      } catch {
        // Reload to get consistent state on error.
        loadInbox();
      }
    },
    [portfolioId, loadInbox]
  );

  const handleViewPosition = useCallback(
    (ticker) => {
      if (typeof onNavigateToHoldings === 'function') {
        onNavigateToHoldings(ticker);
      }
    },
    [onNavigateToHoldings]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="card-base p-5">
        <h2 className="font-heading text-lg font-bold text-surface-900 dark:text-surface-100">
          {t('inbox.title', { defaultValue: 'Action Inbox' })}
        </h2>
        <p className="mt-1 text-sm text-surface-600 dark:text-surface-400">
          {t('inbox.subtitle', {
            defaultValue: 'Actionable position alerts and milestones, ordered by urgency.',
          })}
        </p>
      </section>

      {/* Feed */}
      <section aria-label={t('inbox.feed.aria', { defaultValue: 'Inbox feed' })}>
        {state.loading && (
          <p className="text-sm text-surface-500 dark:text-surface-400">
            {t('common.loading', { defaultValue: 'Loading…' })}
          </p>
        )}
        {!state.loading && state.error && (
          <p className="text-sm text-rose-600 dark:text-rose-400">{state.error}</p>
        )}
        {!state.loading && !state.error && state.items.length === 0 && (
          <div
            className="rounded-xl border border-dashed border-surface-300 bg-surface-50/60 px-4 py-6 text-center dark:border-surface-700 dark:bg-surface-900/40"
            data-testid="inbox-empty"
          >
            <p className="text-sm font-medium text-surface-600 dark:text-surface-400">
              {t('inbox.empty', { defaultValue: 'Portfolio is on track. No alerts.' })}
            </p>
          </div>
        )}
        {!state.loading && state.items.length > 0 && (
          <div className="space-y-3" data-testid="inbox-feed">
            {state.items.map((item) => (
              <InboxItemCard
                key={item.eventKey}
                item={item}
                onDismiss={handleDismiss}
                onViewPosition={handleViewPosition}
              />
            ))}
          </div>
        )}
      </section>

      {/* Collapsible "Configure thresholds" panel */}
      <section className="card-base overflow-hidden">
        <button
          type="button"
          className="flex w-full items-center justify-between px-5 py-4 text-left"
          aria-expanded={configOpen}
          onClick={() => setConfigOpen((v) => !v)}
        >
          <span className="font-heading text-sm font-bold text-surface-700 dark:text-surface-200">
            {t('inbox.configure.title', { defaultValue: 'Configure thresholds' })}
          </span>
          <svg
            className={`h-4 w-4 text-surface-400 transition-transform duration-200 dark:text-surface-500 ${configOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        {configOpen && (
          <div className="border-t border-surface-200 p-5 dark:border-surface-800">
            <SignalTableCard
              holdings={holdings}
              transactions={transactions}
              currentPrices={currentPrices}
              signals={signals}
              signalRows={signalRows}
              onSignalChange={onSignalChange}
              compact={compact}
              title={t('signals.matrix.title')}
              subtitle={t('signals.matrix.subtitle')}
            />
          </div>
        )}
      </section>
    </div>
  );
}
