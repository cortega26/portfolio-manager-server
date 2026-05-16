import { useState, useEffect } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { getDividends } from '../../lib/apiClient.js';

function DividendIcon() {
  return (
    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-500/10">
      <svg
        className="h-5 w-5 text-emerald-600 dark:text-emerald-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
      </svg>
    </div>
  );
}

export default function DividendIncomeCard({ portfolioId }) {
  const { t, formatCurrency } = useI18n();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data } = await getDividends(portfolioId);
        if (!cancelled) {
          setMetrics(data);
        }
      } catch {
        // Silently fail — card will show empty state.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (portfolioId) {
      load();
    } else {
      setLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [portfolioId]);

  const description = metrics
    ? t('dashboard.metrics.dividends.description', {
        ytd: formatCurrency(Number(metrics.ytdNet)),
        gross: formatCurrency(Number(metrics.ytdGross)),
        ttm: formatCurrency(Number(metrics.trailing12mNet)),
      })
    : t('dashboard.metrics.dividends.empty');

  return (
    <div className="card-base p-5" data-testid="dividend-income-card">
      <DividendIcon />
      <p className="text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">
        {t('dashboard.metrics.dividends')}
      </p>
      <p className="mt-1.5 font-heading text-2xl font-bold tracking-tight text-surface-900 dark:text-surface-50">
        {metrics ? formatCurrency(Number(metrics.ytdNet)) : '—'}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-surface-500 dark:text-surface-400">
        {loading ? '…' : description}
      </p>
    </div>
  );
}
