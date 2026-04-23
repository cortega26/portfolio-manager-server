/**
 * src/components/review/PortfolioHealthBar.jsx
 * SR-021 — Calls /api/portfolio/:id/health and renders a status bar.
 */

import { useEffect, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { requestJson } from '../../lib/apiClient.js';

const CONFIDENCE_BAR_STYLES = {
  high: 'bg-emerald-500',
  medium: 'bg-amber-400',
  low: 'bg-orange-500',
  degraded: 'bg-rose-500',
  unknown: 'bg-slate-300 dark:bg-slate-700',
};

function resolveHealthStatus(data) {
  if (!data) return 'blocked';
  if (data.freshness_state === 'expired' || ['low', 'degraded'].includes(data.confidence_state)) {
    return 'blocked';
  }
  if (
    data.action_count > 0 ||
    data.confidence_state === 'medium' ||
    data.freshness_state === 'stale' ||
    (Array.isArray(data.degraded_reasons) && data.degraded_reasons.length > 0)
  ) {
    return 'needs_attention';
  }
  return 'healthy';
}

export default function PortfolioHealthBar({ portfolioId, onHealthChange }) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  const load = useCallback(async () => {
    if (!portfolioId) {
      setState({ status: 'empty', data: null, error: null });
      onHealthChange?.(null);
      return;
    }
    setState({ status: 'loading', data: null, error: null });
    try {
      const { data } = await requestJson(`/portfolio/${encodeURIComponent(portfolioId)}/health`);
      setState({ status: 'ready', data, error: null });
      onHealthChange?.(data);
    } catch (err) {
      setState({ status: 'error', data: null, error: String(err?.message ?? err) });
      onHealthChange?.(null);
    }
  }, [onHealthChange, portfolioId]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <div
        data-testid="portfolio-health-bar"
        className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
        aria-label="Loading portfolio health..."
      />
    );
  }

  if (state.status === 'error') {
    return (
      <div
        data-testid="portfolio-health-bar"
        className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-400"
        role="alert"
      >
        Unable to load portfolio health. {state.error}
      </div>
    );
  }

  if (state.status === 'empty') {
    return (
      <div
        data-testid="portfolio-health-bar"
        className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
        aria-label="Portfolio health unavailable"
      >
        Load a portfolio to review data freshness and confidence.
      </div>
    );
  }

  const { data } = state;
  const barStyle = CONFIDENCE_BAR_STYLES[data.confidence_state] ?? CONFIDENCE_BAR_STYLES.unknown;
  const healthStatus = resolveHealthStatus(data);

  return (
    <div
      data-testid="portfolio-health-bar"
      data-health-status={healthStatus}
      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center gap-3">
        <span className={`h-3 w-3 rounded-full ${barStyle}`} />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {data.confidence_state === 'high'
            ? 'Portfolio data is current'
            : healthStatus === 'needs_attention'
              ? 'Some data may be stale'
              : 'Data quality issues detected'}
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        {data.action_count > 0 && (
          <span>
            {data.action_count} item{data.action_count !== 1 ? 's' : ''} need review
          </span>
        )}
        {data.as_of && <span>as of {new Date(data.as_of).toLocaleTimeString()}</span>}
      </div>
    </div>
  );
}

PortfolioHealthBar.propTypes = {
  portfolioId: PropTypes.string.isRequired,
  onHealthChange: PropTypes.func,
};
