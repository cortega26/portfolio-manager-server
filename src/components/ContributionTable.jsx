import { useMemo } from 'react';
import { computeAssetContributions } from '../utils/allocation.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

function formatSignedPp(value, fractionDigits = 2) {
  if (value === null || !Number.isFinite(value)) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(fractionDigits)} pp`;
}

function formatSignedPct(value, fractionDigits = 1) {
  if (value === null || !Number.isFinite(value)) return '—';
  const percent = value * 100;
  const prefix = percent > 0 ? '+' : '';
  return `${prefix}${percent.toFixed(fractionDigits)}%`;
}

export default function ContributionTable({
  openHoldings = [],
  currentPrices = {},
  cashBalance = 0,
}) {
  const { t } = useI18n();
  const rows = useMemo(
    () => computeAssetContributions(openHoldings, currentPrices, cashBalance),
    [openHoldings, currentPrices, cashBalance]
  );

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="contribution-table"
    >
      <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
        {t('dashboard.contribution.title')}
      </h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {t('dashboard.contribution.subtitle')}
      </p>

      {rows.length === 0 ? (
        <p
          className="mt-4 text-sm text-slate-500 dark:text-slate-400"
          data-testid="contribution-table-empty"
        >
          {t('dashboard.contribution.empty')}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto" data-testid="contribution-table-content">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('dashboard.contribution.col.ticker')}
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('dashboard.contribution.col.weight')}
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('dashboard.contribution.col.individualReturn')}
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('dashboard.contribution.col.contribution')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row) => (
                <tr key={row.ticker} data-testid={`contribution-row-${row.ticker}`}>
                  <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                    {row.ticker}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                    {(row.weight * 100).toFixed(1)}%
                  </td>
                  <td
                    className={`px-3 py-2 text-right ${
                      row.individualReturn !== null && row.individualReturn >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {formatSignedPct(row.individualReturn)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-medium ${
                      row.contributionPp !== null && row.contributionPp >= 0
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {formatSignedPp(row.contributionPp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
