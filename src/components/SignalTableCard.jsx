import clsx from 'clsx';

import { useI18n } from '../i18n/I18nProvider.jsx';
import { formatCurrency } from '../utils/format.js';
import {
  deriveLastOperationReference,
  deriveSignalRow,
  resolveSignalWindow,
} from '../utils/holdings.js';
import { SIGNAL_STATUS } from '../../shared/signals.js';

const SIGNAL_LABEL_KEYS = {
  'BUY zone': 'holdings.signals.status.buyZone',
  'TRIM zone': 'holdings.signals.status.trimZone',
  HOLD: 'holdings.signals.status.hold',
  'NO DATA': 'holdings.signals.status.noData',
};

function formatSignalStatus(status) {
  if (status === SIGNAL_STATUS.BUY_ZONE) {
    return 'BUY zone';
  }
  if (status === SIGNAL_STATUS.TRIM_ZONE) {
    return 'TRIM zone';
  }
  if (status === SIGNAL_STATUS.HOLD) {
    return 'HOLD';
  }
  return 'NO DATA';
}

function getDisplaySignalRow({
  holding,
  transactions,
  currentPrices,
  signals,
  signalRowsByTicker,
}) {
  const precomputedRow = signalRowsByTicker.get(holding.ticker);
  if (precomputedRow) {
    return {
      price: Number.isFinite(precomputedRow.currentPrice)
        ? formatCurrency(precomputedRow.currentPrice)
        : '—',
      lower: Number.isFinite(precomputedRow.lowerBound)
        ? formatCurrency(precomputedRow.lowerBound)
        : '—',
      upper: Number.isFinite(precomputedRow.upperBound)
        ? formatCurrency(precomputedRow.upperBound)
        : '—',
      signal: formatSignalStatus(precomputedRow.status),
      status: precomputedRow.status,
    };
  }

  const pctWindow = resolveSignalWindow(signals, holding.ticker);
  const reference = deriveLastOperationReference(transactions, holding.ticker);
  return deriveSignalRow(holding, currentPrices[holding.ticker], pctWindow, reference);
}

function SignalsTable({
  holdings,
  transactions,
  currentPrices,
  signals,
  signalRows,
  onSignalChange,
  t,
  compact = false,
}) {
  if (holdings.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">{t('holdings.signals.empty')}</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table
        className={clsx(
          'min-w-full divide-y divide-slate-200 dark:divide-slate-700',
          compact ? 'text-xs' : 'text-sm'
        )}
        aria-label={t('holdings.signals.aria')}
      >
        <thead className="bg-slate-50 dark:bg-slate-800/60">
          <tr
            className={clsx(
              'text-left font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300',
              compact ? 'text-[11px]' : 'text-xs'
            )}
          >
            <th className={clsx('px-3', compact ? 'py-1.5' : 'py-2')}>
              {t('holdings.signals.header.ticker')}
            </th>
            <th className={clsx('px-3', compact ? 'py-1.5' : 'py-2')}>
              {t('holdings.signals.header.window')}
            </th>
            <th className={clsx('px-3', compact ? 'py-1.5' : 'py-2')}>
              {t('holdings.signals.header.lastPrice')}
            </th>
            <th className={clsx('px-3', compact ? 'py-1.5' : 'py-2')}>
              {t('holdings.signals.header.lower')}
            </th>
            <th className={clsx('px-3', compact ? 'py-1.5' : 'py-2')}>
              {t('holdings.signals.header.upper')}
            </th>
            <th className={clsx('px-3', compact ? 'py-1.5' : 'py-2')}>
              {t('holdings.signals.header.signal')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {(() => {
            const signalRowsByTicker = new Map(
              Array.isArray(signalRows)
                ? signalRows
                    .filter((row) => typeof row?.ticker === 'string' && row.ticker.length > 0)
                    .map((row) => [row.ticker, row])
                : []
            );
            return holdings.map((holding) => {
              const pctWindow = resolveSignalWindow(signals, holding.ticker);
              const row = getDisplaySignalRow({
                holding,
                transactions,
                currentPrices,
                signals,
                signalRowsByTicker,
              });
              return (
                <tr key={holding.ticker} className="bg-white dark:bg-slate-900">
                  <td className={clsx('px-3 font-semibold', compact ? 'py-1.5' : 'py-2')}>
                    {holding.ticker}
                  </td>
                  <td className={clsx('px-3', compact ? 'py-1.5' : 'py-2')}>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      className={clsx(
                        'w-20 rounded-md border border-slate-300 px-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
                        compact ? 'py-0.5 text-xs' : 'py-1 text-sm'
                      )}
                      value={pctWindow}
                      onChange={(event) => onSignalChange(holding.ticker, event.target.value)}
                      aria-label={t('holdings.signals.windowAria', { ticker: holding.ticker })}
                      title={t('holdings.signals.windowAria', { ticker: holding.ticker })}
                    />
                  </td>
                  <td className={clsx('px-3', compact ? 'py-1.5' : 'py-2')}>{row.price}</td>
                  <td className={clsx('px-3', compact ? 'py-1.5' : 'py-2')}>{row.lower}</td>
                  <td className={clsx('px-3', compact ? 'py-1.5' : 'py-2')}>{row.upper}</td>
                  <td className={clsx('px-3', compact ? 'py-1.5' : 'py-2')}>
                    {(() => {
                      const translationKey = SIGNAL_LABEL_KEYS[row.signal];
                      const signalLabel = translationKey ? t(translationKey) : row.signal;
                      return (
                        <span
                          className={clsx(
                            'rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide',
                            row.signal === 'BUY zone' &&
                              'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200',
                            row.signal === 'TRIM zone' &&
                              'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200',
                            row.signal === 'HOLD' &&
                              'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
                            row.signal === 'NO DATA' &&
                              'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                          )}
                        >
                          {signalLabel}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              );
            });
          })()}
        </tbody>
      </table>
    </div>
  );
}

export default function SignalTableCard({
  holdings,
  transactions = [],
  currentPrices,
  signals,
  signalRows,
  onSignalChange,
  compact = false,
  title,
  subtitle = null,
}) {
  const { t } = useI18n();

  return (
    <div
      className={clsx(
        'rounded-xl border border-slate-200 bg-white shadow dark:border-slate-800 dark:bg-slate-900',
        compact ? 'p-3' : 'p-4'
      )}
    >
      <div className="flex flex-col gap-1">
        <h2
          className={clsx(
            'font-semibold text-slate-700 dark:text-slate-200',
            compact ? 'text-base' : 'text-lg'
          )}
        >
          {title ?? t('holdings.signals.title')}
        </h2>
        {subtitle ? <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
      </div>
      <div className="mt-4">
        <SignalsTable
          holdings={holdings}
          transactions={transactions}
          currentPrices={currentPrices}
          signals={signals}
          signalRows={signalRows}
          onSignalChange={onSignalChange}
          t={t}
          compact={compact}
        />
      </div>
    </div>
  );
}
