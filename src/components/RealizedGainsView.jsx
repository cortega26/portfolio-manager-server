// src/components/RealizedGainsView.jsx
// Realized gains / tax year view — Phase 4.
// Fetches from GET /api/portfolio/:id/realized-gains and renders a year accordion.
// CSV export reuses the toCsv / triggerCsvDownload pattern from src/utils/reports.js.
import { useState, useEffect, useCallback } from 'react';
import { getRealizedGains } from '../lib/apiClient.js';
import { triggerCsvDownload } from '../utils/reports.js';

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

function GainLossAmount({ value }) {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) {
    return <span className="text-slate-500 dark:text-slate-400">${value}</span>;
  }
  if (num > 0) {
    return <span className="text-emerald-600 dark:text-emerald-400">+${value}</span>;
  }
  return <span className="text-red-600 dark:text-red-400">${value}</span>;
}

function ClosedLotRow({ lot }) {
  const term = lot.holdingDays >= 365 ? 'Long-term' : 'Short-term';
  const termColor =
    term === 'Long-term'
      ? 'text-indigo-600 dark:text-indigo-400'
      : 'text-amber-600 dark:text-amber-400';

  return (
    <tr className="border-b border-slate-100 dark:border-slate-800 text-sm">
      <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-100">{lot.ticker}</td>
      <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{lot.buyDate}</td>
      <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{lot.sellDate}</td>
      <td className="py-2 px-3 text-right text-slate-700 dark:text-slate-200">{lot.shares}</td>
      <td className="py-2 px-3 text-right text-slate-700 dark:text-slate-200">${lot.costBasis}</td>
      <td className="py-2 px-3 text-right text-slate-700 dark:text-slate-200">${lot.proceeds}</td>
      <td className="py-2 px-3 text-right font-semibold">
        <GainLossAmount value={lot.gainLoss} />
      </td>
      <td className="py-2 px-3 text-right text-slate-500 dark:text-slate-400">
        {lot.holdingDays}d
      </td>
      <td className={`py-2 px-3 text-right text-xs font-semibold ${termColor}`}>{term}</td>
    </tr>
  );
}

function YearSection({ yearData, defaultOpen }) {
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
      ? 'text-slate-700 dark:text-slate-200'
      : netNum > 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-red-600 dark:text-red-400';

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Year header / toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-4 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {yearData.year}
            {isCurrentYear && (
              <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                Current year
              </span>
            )}
          </span>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {yearData.lotCount} {yearData.lotCount === 1 ? 'lot' : 'lots'}
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden sm:flex gap-6 text-sm">
            <span className="text-slate-500 dark:text-slate-400">
              Gains:{' '}
              <span className="text-emerald-600 dark:text-emerald-400">${yearData.totalGain}</span>
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              Losses: <span className="text-red-600 dark:text-red-400">${yearData.totalLoss}</span>
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              Net: <span className={`font-semibold ${netColor}`}>${yearData.netRealized}</span>
            </span>
          </div>
          <svg
            className={`h-4 w-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
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
            <span className="text-slate-500 dark:text-slate-400">
              Gains:{' '}
              <span className="text-emerald-600 dark:text-emerald-400">${yearData.totalGain}</span>
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              Losses: <span className="text-red-600 dark:text-red-400">${yearData.totalLoss}</span>
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              Net: <span className={`font-semibold ${netColor}`}>${yearData.netRealized}</span>
            </span>
          </div>

          {yearData.closedLots?.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
                <table className="w-full min-w-[700px] text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <th className="py-2 px-3">Ticker</th>
                      <th className="py-2 px-3">Buy date</th>
                      <th className="py-2 px-3">Sell date</th>
                      <th className="py-2 px-3 text-right">Shares</th>
                      <th className="py-2 px-3 text-right">Cost basis</th>
                      <th className="py-2 px-3 text-right">Proceeds</th>
                      <th className="py-2 px-3 text-right">Gain / Loss</th>
                      <th className="py-2 px-3 text-right">Days held</th>
                      <th className="py-2 px-3 text-right">Term</th>
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
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Export {yearData.year} as CSV
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No closed lots in {yearData.year}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function RealizedGainsView({ portfolioId }) {
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
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Realized Gains
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Lot matching method: FIFO · Grouped by calendar year of sale
          </p>
        </div>
        {hasAnyLots && (
          <button
            type="button"
            onClick={handleExportAll}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow transition hover:bg-indigo-700"
          >
            Export all CSV
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading realized gains…</p>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
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
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No realized gains yet. Closed lots will appear here once you have sell transactions.
              </p>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-xs text-slate-400 dark:text-slate-500 border-t border-slate-200 dark:border-slate-800 pt-4">
            For informational purposes only. Not tax advice. Consult a tax professional for your
            specific jurisdiction.
          </p>
        </>
      )}
    </div>
  );
}
