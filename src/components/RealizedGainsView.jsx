// src/components/RealizedGainsView.jsx
// Realized gains / tax year view — Phase 4.
// Fetches from GET /api/portfolio/:id/realized-gains and renders a year accordion.
// CSV export reuses the toCsv / triggerCsvDownload pattern from src/utils/reports.js.
import { useState, useEffect, useCallback } from 'react';
import { getRealizedGains } from '../lib/apiClient.js';
import { triggerCsvDownload } from '../utils/reports.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

// ── CSV helpers (same pattern as reports.js) ──────────────────────────────────

function toCsvValue(value) {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows) {
  return rows.map((row) => row.map(toCsvValue).join(',')).join('\n');
}

function buildGainsCsv(closedLots, year) {
  if (!Array.isArray(closedLots) || closedLots.length === 0) return '';
  const header = [
    'year',
    'ticker',
    'buy_date',
    'sell_date',
    'shares',
    'cost_basis',
    'proceeds',
    'gain_loss',
    'holding_days',
    'term',
  ];
  const rows = closedLots.map((lot) => [
    year,
    lot.ticker,
    lot.buyDate,
    lot.sellDate,
    lot.shares,
    lot.costBasis,
    lot.proceeds,
    lot.gainLoss,
    lot.holdingDays,
    lot.holdingDays >= 365 ? 'Long-term' : 'Short-term',
  ]);
  return toCsv([header, ...rows]);
}

function buildAllGainsCsv(years) {
  if (!Array.isArray(years) || years.length === 0) return '';
  const header = [
    'year',
    'ticker',
    'buy_date',
    'sell_date',
    'shares',
    'cost_basis',
    'proceeds',
    'gain_loss',
    'holding_days',
    'term',
  ];
  const rows = years.flatMap((yearData) =>
    (yearData.closedLots ?? []).map((lot) => [
      yearData.year,
      lot.ticker,
      lot.buyDate,
      lot.sellDate,
      lot.shares,
      lot.costBasis,
      lot.proceeds,
      lot.gainLoss,
      lot.holdingDays,
      lot.holdingDays >= 365 ? 'Long-term' : 'Short-term',
    ])
  );
  return toCsv([header, ...rows]);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function formatUsd(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value ?? '');
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function GainLossAmount({ value }) {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) {
    return <span className="text-surface-500 dark:text-surface-400">${formatUsd(value)}</span>;
  }
  if (num > 0) {
    return <span className="text-emerald-600 dark:text-emerald-400">+${formatUsd(value)}</span>;
  }
  return <span className="text-red-600 dark:text-red-400">${formatUsd(value)}</span>;
}

function ClosedLotRow({ lot }) {
  const { t } = useI18n();
  const term =
    lot.holdingDays >= 365 ? t('realizedGains.term.long') : t('realizedGains.term.short');
  const termColor =
    term === 'Long-term'
      ? 'text-brand-600 dark:text-brand-400'
      : 'text-amber-600 dark:text-amber-400';

  return (
    <tr className="border-b border-surface-100 dark:border-surface-800 text-sm">
      <td className="py-2 px-3 font-medium text-surface-800 dark:text-surface-100">{lot.ticker}</td>
      <td className="py-2 px-3 text-surface-500 dark:text-surface-400">{lot.buyDate}</td>
      <td className="py-2 px-3 text-surface-500 dark:text-surface-400">{lot.sellDate}</td>
      <td className="py-2 px-3 text-right text-surface-700 dark:text-surface-200">{lot.shares}</td>
      <td className="py-2 px-3 text-right text-surface-700 dark:text-surface-200">
        ${formatUsd(lot.costBasis)}
      </td>
      <td className="py-2 px-3 text-right text-surface-700 dark:text-surface-200">
        ${formatUsd(lot.proceeds)}
      </td>
      <td className="py-2 px-3 text-right font-semibold">
        <GainLossAmount value={lot.gainLoss} />
      </td>
      <td className="py-2 px-3 text-right text-surface-500 dark:text-surface-400">
        {lot.holdingDays}d
      </td>
      <td className={`py-2 px-3 text-right text-xs font-semibold ${termColor}`}>{term}</td>
    </tr>
  );
}

function YearSection({ yearData, defaultOpen }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const currentYear = new Date().getFullYear();
  const isCurrentYear = yearData.year === currentYear;

  const handleExportYear = useCallback(() => {
    const csv = buildGainsCsv(yearData.closedLots, yearData.year);
    if (csv) triggerCsvDownload(`realized-gains-${yearData.year}.csv`, csv);
  }, [yearData]);

  const netNum = parseFloat(yearData.netRealized);
  const netColor =
    isNaN(netNum) || netNum === 0
      ? 'text-surface-700 dark:text-surface-200'
      : netNum > 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-red-600 dark:text-red-400';

  return (
    <div className="card-base overflow-hidden">
      {/* Year header / toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-4 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <span className="font-heading text-base font-bold text-surface-800 dark:text-surface-100">
            {yearData.year}
            {isCurrentYear && (
              <span className="tag ml-2 bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                {t('realizedGains.currentYear')}
              </span>
            )}
          </span>
          <span className="text-sm text-surface-500 dark:text-surface-400">
            {t('realizedGains.lots', { count: yearData.lotCount })}
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden sm:flex gap-6 text-sm">
            <span className="text-surface-500 dark:text-surface-400">
              {t('realizedGains.gains')}{' '}
              <span className="text-emerald-600 dark:text-emerald-400">
                ${formatUsd(yearData.totalGain)}
              </span>
            </span>
            <span className="text-surface-500 dark:text-surface-400">
              {t('realizedGains.losses')}{' '}
              <span className="text-red-600 dark:text-red-400">
                ${formatUsd(yearData.totalLoss)}
              </span>
            </span>
            <span className="text-surface-500 dark:text-surface-400">
              {t('realizedGains.net')}{' '}
              <span className={`font-semibold ${netColor}`}>
                ${formatUsd(yearData.netRealized)}
              </span>
            </span>
          </div>
          <svg
            className={`h-4 w-4 text-surface-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {/* Mobile summary row */}
          <div className="mb-3 flex gap-4 text-sm sm:hidden">
            <span className="text-surface-500 dark:text-surface-400">
              {t('realizedGains.gains')}{' '}
              <span className="text-emerald-600 dark:text-emerald-400">
                ${formatUsd(yearData.totalGain)}
              </span>
            </span>
            <span className="text-surface-500 dark:text-surface-400">
              {t('realizedGains.losses')}{' '}
              <span className="text-red-600 dark:text-red-400">
                ${formatUsd(yearData.totalLoss)}
              </span>
            </span>
            <span className="text-surface-500 dark:text-surface-400">
              {t('realizedGains.net')}{' '}
              <span className={`font-semibold ${netColor}`}>
                ${formatUsd(yearData.netRealized)}
              </span>
            </span>
          </div>

          {yearData.closedLots?.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-xl border border-surface-200 dark:border-surface-800">
                <table className="w-full min-w-[700px] text-left">
                  <thead>
                    <tr className="border-b border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-800/60 text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">
                      <th className="py-2 px-3">{t('realizedGains.table.ticker')}</th>
                      <th className="py-2 px-3">{t('realizedGains.table.buyDate')}</th>
                      <th className="py-2 px-3">{t('realizedGains.table.sellDate')}</th>
                      <th className="py-2 px-3 text-right">{t('realizedGains.table.shares')}</th>
                      <th className="py-2 px-3 text-right">{t('realizedGains.table.costBasis')}</th>
                      <th className="py-2 px-3 text-right">{t('realizedGains.table.proceeds')}</th>
                      <th className="py-2 px-3 text-right">{t('realizedGains.table.gainLoss')}</th>
                      <th className="py-2 px-3 text-right">{t('realizedGains.table.daysHeld')}</th>
                      <th className="py-2 px-3 text-right">{t('realizedGains.table.term')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearData.closedLots.map((lot, i) => (
                      <ClosedLotRow
                        key={`${lot.ticker}-${lot.buyDate}-${lot.sellDate}-${i}`}
                        lot={lot}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={handleExportYear}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-surface-700 shadow-sm transition-all duration-150 hover:bg-surface-50 hover:shadow-tab dark:border-surface-700 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700"
                >
                  {t('realizedGains.exportYear', { year: yearData.year })}
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-surface-500 dark:text-surface-400">
              {t('realizedGains.yearEmpty', { year: yearData.year })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function RealizedGainsView({ portfolioId }) {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (!portfolioId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getRealizedGains(portfolioId)
      .then(({ data: result }) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? 'Failed to load realized gains.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [portfolioId]);

  const handleExportAll = useCallback(() => {
    if (!data?.years) return;
    const csv = buildAllGainsCsv(data.years);
    if (csv) triggerCsvDownload('realized-gains-all.csv', csv);
  }, [data]);

  const hasAnyLots = data?.years?.some((y) => y.lotCount > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-lg font-bold text-surface-800 dark:text-surface-100">
            {t('realizedGains.title')}
          </h2>
          <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
            {t('realizedGains.subtitle')}
          </p>
        </div>
        {hasAnyLots && (
          <button
            type="button"
            onClick={handleExportAll}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-brand-700 hover:shadow-tab"
          >
            {t('realizedGains.exportAll')}
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <p className="text-sm text-surface-500 dark:text-surface-400">
          {t('realizedGains.loading')}
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400">
          {error}
        </div>
      )}

      {/* Year accordion */}
      {!loading && !error && data && (
        <>
          {data.years?.length > 0 ? (
            <div className="space-y-3">
              {[...data.years].reverse().map((yearData) => (
                <YearSection
                  key={yearData.year}
                  yearData={yearData}
                  defaultOpen={yearData.year === currentYear}
                />
              ))}
            </div>
          ) : (
            <div className="card-base p-8 text-center">
              <p className="text-sm text-surface-500 dark:text-surface-400">
                {t('realizedGains.empty')}
              </p>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-xs text-surface-400 dark:text-surface-500 border-t border-surface-200 dark:border-surface-800 pt-4">
            {t('realizedGains.disclaimer')}
          </p>
        </>
      )}
    </div>
  );
}
