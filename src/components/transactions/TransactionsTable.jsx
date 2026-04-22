import { forwardRef } from 'react';
import clsx from 'clsx';
import { FixedSizeList } from 'react-window';

import { useI18n } from '../../i18n/I18nProvider.jsx';

const GRID_TEMPLATE = '140px minmax(100px, 1fr) 120px 140px 140px 120px minmax(120px, 1fr)';
const VIRTUALIZED_MAX_HEIGHT = 480;
const ROW_HEIGHT_DEFAULT = 56;

function TransactionRow({
  index,
  item,
  onDeleteTransaction,
  style,
  rowIndexOffset = 0,
  compact = false,
}) {
  const { t, formatCurrency, formatNumber } = useI18n();
  const { transaction, originalIndex } = item;
  const shareValue =
    typeof transaction.shares === 'number'
      ? transaction.shares
      : typeof transaction.shares === 'string'
        ? Number.parseFloat(transaction.shares)
        : Number.NaN;
  const sharesDisplay = (() => {
    if (typeof formatNumber === 'function' && Number.isFinite(shareValue)) {
      return formatNumber(shareValue, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 6,
      });
    }
    if (Number.isFinite(shareValue)) {
      return shareValue.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 6,
      });
    }
    return '—';
  })();
  const typeKey = typeof transaction.type === 'string' ? transaction.type.toLowerCase() : '';
  const typeLabel =
    typeKey !== '' ? t(`transactions.type.${typeKey}`) : String(transaction.type ?? '—');

  return (
    <div
      aria-rowindex={rowIndexOffset + index + 2}
      className={clsx(
        'grid items-center border-b border-slate-200 px-3 transition-colors last:border-none dark:border-slate-800',
        compact ? 'py-1 text-xs' : 'py-2 text-sm',
        index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-900/70'
      )}
      role="row"
      style={{
        ...style,
        display: 'grid',
        gridTemplateColumns: GRID_TEMPLATE,
        width: '100%',
      }}
    >
      <span className="truncate" role="cell">
        {transaction.date}
      </span>
      <span className="font-semibold" role="cell">
        {transaction.ticker}
      </span>
      <span role="cell">{typeLabel}</span>
      <span role="cell">{formatCurrency(transaction.amount)}</span>
      <span role="cell">{formatCurrency(transaction.price)}</span>
      <span role="cell">{sharesDisplay}</span>
      <span className="flex justify-end" role="cell">
        <button
          type="button"
          onClick={() => onDeleteTransaction?.(originalIndex)}
          className={clsx(
            'rounded-md border border-transparent text-xs font-semibold text-rose-600 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 dark:hover:bg-rose-500/10',
            compact ? 'px-2 py-0.5' : 'px-3 py-1'
          )}
          aria-label={t('transactions.table.undoAria', {
            ticker: transaction.ticker,
            date: transaction.date,
          })}
        >
          {t('transactions.table.undo')}
        </button>
      </span>
    </div>
  );
}

function VirtualizedRow({ index, style, data }) {
  return (
    <TransactionRow
      index={index}
      item={data.transactions[index]}
      onDeleteTransaction={data.onDeleteTransaction}
      style={style}
      rowIndexOffset={data.rowIndexOffset}
      compact={data.compact}
    />
  );
}

const VirtualizedRowGroup = forwardRef(function VirtualizedRowGroup(props, ref) {
  return (
    <div
      {...props}
      ref={ref}
      role="rowgroup"
      data-testid="transactions-virtual-list"
      className={clsx('focus:outline-none', props.className)}
    />
  );
});

const VirtualizedInner = forwardRef(function VirtualizedInner(props, ref) {
  return <div {...props} ref={ref} role="presentation" />;
});

export default function TransactionsTable({
  transactions,
  onDeleteTransaction,
  virtualized,
  rowIndexOffset = 0,
  listRef,
  hasSearch = false,
  totalTransactions = 0,
  rowHeight = ROW_HEIGHT_DEFAULT,
  compact = false,
}) {
  const { t } = useI18n();
  if (transactions.length === 0) {
    return (
      <p
        className={clsx('text-sm text-slate-500 dark:text-slate-400', compact && 'text-xs')}
        role="status"
      >
        {totalTransactions === 0
          ? t('transactions.table.empty')
          : hasSearch
            ? t('transactions.table.noMatch')
            : t('transactions.table.noneAvailable')}
      </p>
    );
  }

  const listHeight = Math.min(
    Math.max(rowHeight * 6, transactions.length * rowHeight),
    VIRTUALIZED_MAX_HEIGHT
  );

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
      <div role="table" aria-label={t('transactions.table.aria')} className="w-full">
        <div
          role="rowgroup"
          className={clsx(
            'bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-300',
            compact && 'text-[11px]'
          )}
        >
          <div
            role="row"
            className={clsx(
              'grid grid-cols-[140px_minmax(100px,1fr)_120px_140px_140px_120px_minmax(120px,1fr)] items-center px-3',
              compact ? 'py-1.5' : 'py-2'
            )}
          >
            <span role="columnheader">{t('transactions.table.date')}</span>
            <span role="columnheader">{t('transactions.table.ticker')}</span>
            <span role="columnheader">{t('transactions.table.type')}</span>
            <span role="columnheader">{t('transactions.table.amount')}</span>
            <span role="columnheader">{t('transactions.table.price')}</span>
            <span role="columnheader">{t('transactions.table.shares')}</span>
            <span className="text-right" role="columnheader">
              {t('transactions.table.actions')}
            </span>
          </div>
        </div>
        {virtualized ? (
          <FixedSizeList
            height={listHeight}
            innerElementType={VirtualizedInner}
            itemCount={transactions.length}
            itemData={{
              transactions,
              onDeleteTransaction,
              compact,
              rowIndexOffset,
            }}
            itemSize={rowHeight}
            outerElementType={VirtualizedRowGroup}
            ref={listRef ?? undefined}
            width="100%"
          >
            {VirtualizedRow}
          </FixedSizeList>
        ) : (
          <div role="rowgroup">
            {transactions.map((item, index) => (
              <TransactionRow
                key={`${item.transaction.ticker}-${item.transaction.date}-${item.originalIndex}`}
                index={index}
                item={item}
                onDeleteTransaction={onDeleteTransaction}
                rowIndexOffset={rowIndexOffset}
                compact={compact}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
