import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import clsx from 'clsx';
import Decimal from 'decimal.js';

import useDebouncedValue from '../hooks/useDebouncedValue.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { validateNonNegativeCash } from '../utils/cashGuards.js';
import { fetchBulkPrices } from '../utils/api.js';
import DepositorModal from './transactions/DepositorModal.jsx';
import TransactionsTable from './transactions/TransactionsTable.jsx';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const CASH_ONLY_TYPES = new Set(['DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'INTEREST']);

function isCashOnlyType(type) {
  return CASH_ONLY_TYPES.has(type);
}

function createInitialForm() {
  return {
    date: todayIso(),
    ticker: '',
    type: 'BUY',
    amount: '',
    price: '',
    shares: '',
  };
}

const initialState = {
  form: createInitialForm(),
  error: null,
  fieldErrors: {},
};

function reducer(state, action) {
  switch (action.type) {
    case 'update':
      return {
        ...state,
        form: { ...state.form, [action.field]: action.value },
      };
    case 'set-form':
      return {
        ...state,
        form: { ...action.form },
      };
    case 'set-error':
      return {
        ...state,
        error: action.error,
        fieldErrors: action.fieldErrors ?? state.fieldErrors,
      };
    case 'clear-error':
      return { ...state, error: null, fieldErrors: {} };
    case 'set-field-errors':
      return {
        ...state,
        fieldErrors: { ...state.fieldErrors, ...action.fieldErrors },
      };
    case 'clear-field-error': {
      if (!state.fieldErrors[action.field]) {
        return state;
      }
      const nextErrors = { ...state.fieldErrors };
      delete nextErrors[action.field];
      return { ...state, fieldErrors: nextErrors };
    }
    case 'reset':
      return { form: createInitialForm(), error: null, fieldErrors: {} };
    default:
      return state;
  }
}

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [25, 50, 100];
const VIRTUALIZATION_THRESHOLD = 200;
const ROW_HEIGHT_DEFAULT = 56;
const ROW_HEIGHT_COMPACT = 44;
const SHARE_INPUT_DECIMALS = 9;
const PRICE_INPUT_DECIMALS = 9;

function toPositiveDecimalOrNull(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  try {
    const decimal = new Decimal(value);
    if (!decimal.isFinite() || decimal.lte(0)) {
      return null;
    }
    return decimal;
  } catch {
    return null;
  }
}

function toInputDecimalLabel(decimal, digits) {
  return decimal.toFixed(digits).replace(/\.?0+$/, '');
}

function normalizeSearchValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getTransactionTypeSearchTokens(type, t) {
  if (typeof type !== 'string') {
    return [];
  }

  const typeKey = type.toLowerCase();
  return [type, t(`transactions.type.${typeKey}`)];
}

function matchesTransaction(transaction, term, t) {
  if (!term) {
    return true;
  }

  const normalized = normalizeSearchValue(term.trim());
  if (!normalized) {
    return true;
  }

  return [
    transaction.ticker,
    ...getTransactionTypeSearchTokens(transaction.type, t),
    transaction.date,
    transaction.shares,
    transaction.amount,
    transaction.price,
  ]
    .map((value) => normalizeSearchValue(value))
    .some((value) => value.includes(normalized));
}

export default function TransactionsTab({
  onAddTransaction,
  onDeleteTransaction,
  transactions = [],
  compact = false,
  holdings = [],
  cashBalance = null,
}) {
  const { t } = useI18n();
  const [state, dispatch] = useReducer(reducer, initialState);
  const { form, error, fieldErrors } = state;
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [isDepositorModalOpen, setDepositorModalOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const listRef = useRef(null);
  const rowHeight = compact ? ROW_HEIGHT_COMPACT : ROW_HEIGHT_DEFAULT;

  // lockedFields tracks which two of {amount, price, shares} were most recently edited.
  // The third is computed. Max size 2.
  const [lockedFields, setLockedFields] = useState(new Set());

  // Price auto-fill state: null | { source: string, timestamp: string } | 'unavailable'
  const [priceAutoFill, setPriceAutoFill] = useState(null);

  const indexedTransactions = useMemo(
    () =>
      transactions.map((transaction, originalIndex) => ({
        originalIndex,
        transaction,
      })),
    [transactions]
  );

  const filteredTransactions = useMemo(() => {
    if (!debouncedSearch) {
      return indexedTransactions;
    }

    return indexedTransactions.filter(({ transaction }) =>
      matchesTransaction(transaction, debouncedSearch, t)
    );
  }, [debouncedSearch, indexedTransactions, t]);

  const totalTransactions = indexedTransactions.length;
  const filteredCount = filteredTransactions.length;
  const safePageSize = pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(filteredCount / safePageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * safePageSize;
  const endIndex = Math.min(startIndex + safePageSize, filteredCount);

  const visibleTransactions = useMemo(() => {
    return filteredTransactions.slice(startIndex, endIndex);
  }, [filteredTransactions, startIndex, endIndex]);

  const virtualized = filteredCount > VIRTUALIZATION_THRESHOLD;

  useEffect(() => {
    if (currentPage !== page) {
      setPage(currentPage);
    }
  }, [currentPage, page]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (listRef.current && typeof listRef.current.scrollTo === 'function') {
      listRef.current.scrollTo(0);
    }
  }, [currentPage, debouncedSearch, filteredCount, pageSize, virtualized]);

  const handleDepositorOpen = useCallback(() => {
    setDepositorModalOpen(true);
  }, []);

  const handleDepositorClose = useCallback(() => {
    setDepositorModalOpen(false);
  }, []);

  const handleDepositorSubmit = useCallback((_details) => {
    void _details;
    setDepositorModalOpen(false);
  }, []);

  function computeMutualField(nextForm, nextLocked) {
    // Only compute when exactly 2 fields are locked.
    if (nextLocked.size !== 2) {
      return nextForm;
    }
    const result = { ...nextForm };
    const hasAmount = nextLocked.has('amount');
    const hasPrice = nextLocked.has('price');
    const hasShares = nextLocked.has('shares');

    const amountD = toPositiveDecimalOrNull(result.amount);
    const priceD = toPositiveDecimalOrNull(result.price);
    const sharesD = toPositiveDecimalOrNull(result.shares);

    if (hasAmount && hasPrice && !hasShares) {
      // compute shares = amount / price
      if (amountD && priceD && !priceD.isZero()) {
        result.shares = toInputDecimalLabel(amountD.div(priceD), SHARE_INPUT_DECIMALS);
      }
    } else if (hasAmount && hasShares && !hasPrice) {
      // compute price = amount / shares
      if (amountD && sharesD && !sharesD.isZero()) {
        result.price = toInputDecimalLabel(amountD.div(sharesD), PRICE_INPUT_DECIMALS);
      }
    } else if (hasPrice && hasShares && !hasAmount) {
      // compute amount = price × shares
      if (priceD && sharesD) {
        result.amount = toInputDecimalLabel(priceD.mul(sharesD), 2);
      }
    }
    return result;
  }

  function lockField(prevLocked, field) {
    const next = new Set(prevLocked);
    next.add(field);
    // Evict the oldest if we exceed 2. We store insertion order in a Set,
    // so the first element is the oldest.
    if (next.size > 2) {
      const [oldest] = next;
      next.delete(oldest);
    }
    return next;
  }

  function updateForm(field, value) {
    const nextForm = { ...form, [field]: value };
    const wasCashOnly = isCashOnlyType(form.type);
    const nextCashOnly = isCashOnlyType(nextForm.type);
    const nextIsDeposit = nextForm.type === 'DEPOSIT';

    if (nextCashOnly) {
      nextForm.price = '';
      if (nextIsDeposit) {
        nextForm.ticker = '';
        nextForm.shares = '';
      }
    }

    // Mutual field computation for equity fields
    let nextLocked = lockedFields;
    if (!nextCashOnly && (field === 'amount' || field === 'price' || field === 'shares')) {
      nextLocked = lockField(lockedFields, field);
      setLockedFields(nextLocked);
      // Clear auto-fill label if user manually edits price
      if (field === 'price') {
        setPriceAutoFill(null);
      }
      const computed = computeMutualField({ ...nextForm }, nextLocked);
      nextForm.amount = computed.amount;
      nextForm.price = computed.price;
      nextForm.shares = computed.shares;
    }

    if (nextCashOnly) {
      nextForm.shares = '';
      // Reset locked fields when switching to cash-only
      if (!wasCashOnly) {
        setLockedFields(new Set());
        setPriceAutoFill(null);
      }
    }

    dispatch({ type: 'set-form', form: nextForm });

    const clearFieldError = (fieldName) => {
      if (fieldErrors[fieldName]) {
        dispatch({ type: 'clear-field-error', field: fieldName });
      }
    };

    if (error) {
      dispatch({ type: 'clear-error' });
    }
    clearFieldError(field);

    if (field === 'type') {
      if (nextCashOnly && !wasCashOnly) {
        clearFieldError('price');
      }
      if (nextIsDeposit) {
        clearFieldError('ticker');
        clearFieldError('shares');
      }
      if (!nextCashOnly && wasCashOnly && nextForm.shares) {
        clearFieldError('shares');
      }
    }
    if ((field === 'amount' || field === 'shares') && nextForm.shares) {
      clearFieldError('shares');
    }
  }

  function recordError(message, fields = {}) {
    dispatch({ type: 'set-error', error: message, fieldErrors: fields });
  }

  function handleSubmit(event) {
    event.preventDefault();
    const { date, ticker, type, amount, shares } = form;
    const cashOnly = isCashOnlyType(type);

    const normalizedTicker = ticker.trim();
    const missingFields = {};
    if (!date) {
      missingFields.date = t('transactions.form.validation.date');
    }
    if (!cashOnly && !normalizedTicker) {
      missingFields.ticker = t('transactions.form.validation.ticker');
    }
    if (!type) {
      missingFields.type = t('transactions.form.validation.type');
    }
    if (!amount) {
      missingFields.amount = t('transactions.form.validation.amountField');
    }
    if (!cashOnly && !shares) {
      missingFields.shares = t('transactions.form.validation.shares');
    }
    if (Object.keys(missingFields).length > 0) {
      recordError(t('transactions.form.validation.missing'), missingFields);
      return;
    }

    const amountValue = Number.parseFloat(amount);

    if (!Number.isFinite(amountValue)) {
      recordError(t('transactions.form.validation.amount'), {
        amount: t('transactions.form.validation.amountField'),
      });
      return;
    }

    let priceDecimal = null;
    let sharesValue = null;
    if (!cashOnly) {
      const amountDecimal = toPositiveDecimalOrNull(amount);
      const sharesDecimal = toPositiveDecimalOrNull(shares);
      // Use the price directly from form when available; fall back to amount/shares derivation.
      const priceFromForm = toPositiveDecimalOrNull(form.price);
      if (!amountDecimal || !sharesDecimal) {
        recordError(t('transactions.form.validation.shares'), {
          shares: t('transactions.form.validation.shares'),
        });
        return;
      }
      priceDecimal = priceFromForm ?? amountDecimal.div(sharesDecimal);
      if (!priceDecimal) {
        recordError(t('transactions.form.validation.price'), {
          price: t('transactions.form.validation.price'),
        });
        return;
      }
      sharesValue = Number(sharesDecimal.toFixed(SHARE_INPUT_DECIMALS));
    }

    const payload = {
      date,
      type,
      amount: type === 'BUY' ? -Math.abs(amountValue) : Math.abs(amountValue),
    };

    if (!cashOnly) {
      const normalisedTickerValue = normalizedTicker.toUpperCase();
      payload.ticker = normalisedTickerValue;
      payload.price = Number(priceDecimal.toFixed(PRICE_INPUT_DECIMALS));
      payload.shares = sharesValue;
    }

    const validation = validateNonNegativeCash([...transactions, payload]);
    if (!validation.ok) {
      recordError(t('transactions.form.validation.cashOverdraw'), {
        amount: t('transactions.form.validation.cashField'),
      });
      return;
    }

    onAddTransaction(payload);
    dispatch({ type: 'reset' });
    setLockedFields(new Set());
    setPriceAutoFill(null);
  }

  // Step 3.3 — Auto-fill price on ticker blur
  async function handleTickerBlur() {
    const ticker = form.ticker.trim().toUpperCase();
    const type = form.type;
    if (!ticker || !/^[A-Z]{1,8}$/.test(ticker) || (type !== 'BUY' && type !== 'SELL')) {
      return;
    }
    try {
      const { series } = await fetchBulkPrices([ticker], { latestOnly: true, range: '5d' });
      const entries = series.get(ticker) ?? [];
      const last = entries.at(-1);
      const price = Number(last?.close ?? last?.price ?? last?.value);
      if (!Number.isFinite(price) || price <= 0) {
        setPriceAutoFill('unavailable');
        return;
      }
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const source = last?.source ?? 'price engine';
      setPriceAutoFill({ source, timestamp });
      // Update price and recompute mutual field
      const nextLocked = lockField(lockedFields, 'price');
      setLockedFields(nextLocked);
      const priceLabel = toInputDecimalLabel(new Decimal(price), PRICE_INPUT_DECIMALS);
      const nextForm = { ...form, ticker: form.ticker.trim(), price: priceLabel };
      const computed = computeMutualField(nextForm, nextLocked);
      dispatch({ type: 'set-form', form: computed });
    } catch {
      setPriceAutoFill('unavailable');
    }
  }

  // Step 3.5 — Smart type default on ticker blur
  function applySmartTypeDefault(ticker) {
    if (form.type !== 'BUY' && form.type !== 'SELL') {
      return;
    }
    const normalizedTicker = ticker.trim().toUpperCase();
    if (!normalizedTicker) {
      return;
    }
    const holding = holdings.find(
      (h) => typeof h?.ticker === 'string' && h.ticker.trim().toUpperCase() === normalizedTicker
    );
    const holdingShares = Number(holding?.shares ?? 0);
    if (holdingShares > 0 && form.type === 'BUY') {
      // Suggest SELL for existing positions — soft default only if user hasn't changed type
      updateForm('type', 'SELL');
    }
  }

  function handleTickerBlurFull() {
    applySmartTypeDefault(form.ticker);
    void handleTickerBlur();
  }
  const requiresPrice = !isCashOnlyType(form.type);
  const tickerDisabled = form.type === 'DEPOSIT';
  const sharesDisabled = isCashOnlyType(form.type);

  // Determine which field (if any) is the computed one — it gets visual distinction.
  const computedField = (() => {
    if (!requiresPrice || lockedFields.size !== 2) {
      return null;
    }
    if (!lockedFields.has('amount')) return 'amount';
    if (!lockedFields.has('price')) return 'price';
    return 'shares';
  })();

  // Step 3.6 — Remaining cash indicator
  const remainingCashInfo = (() => {
    if (form.type !== 'BUY' || !form.amount || cashBalance === null) {
      return null;
    }
    const enteredAmount = toPositiveDecimalOrNull(form.amount);
    if (!enteredAmount) {
      return null;
    }
    const cashD = new Decimal(cashBalance);
    const remaining = cashD.minus(enteredAmount);
    return { remaining: remaining.toNumber(), sufficient: remaining.gte(0) };
  })();

  const hasSearch = Boolean(debouncedSearch?.trim());
  const showingStart = filteredCount === 0 ? 0 : startIndex + 1;
  const showingEnd = Math.min(endIndex, filteredCount);
  const startLabel = showingStart.toLocaleString();
  const endLabel = showingEnd.toLocaleString();
  const filteredLabel = filteredCount.toLocaleString();
  const totalLabel = totalTransactions.toLocaleString();
  const summaryText = (() => {
    if (totalTransactions === 0) {
      return t('transactions.table.empty');
    }
    if (filteredCount === 0) {
      return hasSearch ? t('transactions.table.noMatch') : t('transactions.table.empty');
    }
    return hasSearch
      ? t('transactions.summary.filtered', {
          start: startLabel,
          end: endLabel,
          length: filteredLabel,
          total: totalLabel,
        })
      : t('transactions.summary.range', {
          start: startLabel,
          end: endLabel,
          total: filteredLabel,
        });
  })();

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2
            id="add-transaction-heading"
            className="text-lg font-semibold text-slate-700 dark:text-slate-200"
          >
            {t('transactions.form.title')}
          </h2>
          <button
            type="button"
            onClick={handleDepositorOpen}
            className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {t('transactions.form.addDepositor')}
          </button>
        </div>
        <form
          aria-labelledby="add-transaction-heading"
          onSubmit={handleSubmit}
          className="mt-4 space-y-4"
          noValidate
        >
          <div className="grid gap-4 md:grid-cols-6">
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              {t('transactions.form.date')}
              <input
                type="date"
                value={form.date}
                max={new Date().toISOString().split('T')[0]}
                onChange={(event) => updateForm('date', event.target.value)}
                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                aria-invalid={Boolean(fieldErrors.date)}
              />
              {fieldErrors.date ? (
                <span className="mt-1 text-xs font-medium text-rose-600" data-testid="error-date">
                  {fieldErrors.date}
                </span>
              ) : null}
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              {t('transactions.form.ticker')}
              <input
                type="text"
                value={form.ticker}
                onChange={(event) => updateForm('ticker', event.target.value)}
                onBlur={tickerDisabled ? undefined : handleTickerBlurFull}
                className={clsx(
                  'mt-1 rounded-md border px-3 py-2 text-sm uppercase focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
                  tickerDisabled
                    ? 'cursor-not-allowed border-dashed border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400'
                    : 'border-slate-300'
                )}
                placeholder={
                  tickerDisabled
                    ? t('transactions.form.ticker.disabledPlaceholder')
                    : t('transactions.form.ticker.placeholder')
                }
                aria-invalid={Boolean(fieldErrors.ticker)}
                disabled={tickerDisabled}
                aria-disabled={tickerDisabled ? 'true' : undefined}
              />
              {tickerDisabled ? (
                <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t('transactions.form.ticker.disabledHelper')}
                </span>
              ) : fieldErrors.ticker ? (
                <span className="mt-1 text-xs font-medium text-rose-600" data-testid="error-ticker">
                  {fieldErrors.ticker}
                </span>
              ) : null}
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              {t('transactions.form.type')}
              <select
                value={form.type}
                onChange={(event) => updateForm('type', event.target.value)}
                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                aria-invalid={Boolean(fieldErrors.type)}
              >
                <option value="BUY">{t('transactions.type.buy')}</option>
                <option value="SELL">{t('transactions.type.sell')}</option>
                <option value="DEPOSIT">{t('transactions.type.deposit')}</option>
                <option value="WITHDRAWAL">{t('transactions.type.withdrawal')}</option>
                <option value="DIVIDEND">{t('transactions.type.dividend')}</option>
                <option value="INTEREST">{t('transactions.type.interest')}</option>
              </select>
              {fieldErrors.type ? (
                <span className="mt-1 text-xs font-medium text-rose-600" data-testid="error-type">
                  {fieldErrors.type}
                </span>
              ) : null}
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              {t('transactions.form.amount')}
              <input
                type="number"
                value={form.amount}
                onChange={(event) => updateForm('amount', event.target.value)}
                className={clsx(
                  'mt-1 rounded-md border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
                  computedField === 'amount'
                    ? 'border-slate-300 bg-slate-50 italic dark:bg-slate-800/50'
                    : 'border-slate-300'
                )}
                step="0.01"
                placeholder={t('transactions.form.amount.placeholder')}
                aria-invalid={Boolean(fieldErrors.amount)}
                aria-label={
                  computedField === 'amount'
                    ? `${t('transactions.form.amount')} (computed)`
                    : t('transactions.form.amount')
                }
              />
              {fieldErrors.amount ? (
                <span className="mt-1 text-xs font-medium text-rose-600" data-testid="error-amount">
                  {fieldErrors.amount}
                </span>
              ) : remainingCashInfo !== null ? (
                remainingCashInfo.sufficient ? (
                  <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t('transactions.form.amount.remainingCash', {
                      amount: remainingCashInfo.remaining.toLocaleString('en-US', {
                        style: 'currency',
                        currency: 'USD',
                      }),
                    })}
                  </span>
                ) : (
                  <span className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                    {t('transactions.form.amount.insufficientCash', {
                      amount: Math.abs(remainingCashInfo.remaining).toLocaleString('en-US', {
                        style: 'currency',
                        currency: 'USD',
                      }),
                    })}
                  </span>
                )
              ) : null}
            </label>
            {requiresPrice ? (
              <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
                {t('transactions.form.price')}
                <input
                  type="number"
                  value={form.price}
                  onChange={(event) => updateForm('price', event.target.value)}
                  className={clsx(
                    'mt-1 rounded-md border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
                    computedField === 'price'
                      ? 'border-slate-300 bg-slate-50 italic dark:bg-slate-800/50'
                      : 'border-slate-300'
                  )}
                  step="0.000000001"
                  placeholder={t('transactions.form.price.placeholder')}
                  aria-invalid={Boolean(fieldErrors.price)}
                  aria-label={
                    computedField === 'price'
                      ? `${t('transactions.form.price')} (computed)`
                      : t('transactions.form.price')
                  }
                />
                {fieldErrors.price ? (
                  <span
                    className="mt-1 text-xs font-medium text-rose-600"
                    data-testid="error-price"
                  >
                    {fieldErrors.price}
                  </span>
                ) : priceAutoFill === 'unavailable' ? (
                  <span className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    {t('transactions.form.price.autoFillUnavailable')}
                  </span>
                ) : priceAutoFill !== null ? (
                  <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t('transactions.form.price.autoFilled', {
                      source: priceAutoFill.source,
                      time: priceAutoFill.timestamp,
                    })}
                  </span>
                ) : (
                  <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t('transactions.form.price.helper')}
                  </span>
                )}
              </label>
            ) : null}
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              {t('transactions.form.shares')}
              <input
                type="number"
                value={form.shares}
                onChange={(event) => updateForm('shares', event.target.value)}
                readOnly={sharesDisabled}
                disabled={sharesDisabled}
                aria-disabled={sharesDisabled ? 'true' : undefined}
                aria-readonly={sharesDisabled ? 'true' : undefined}
                step="0.000000001"
                className={clsx(
                  'mt-1 rounded-md border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
                  sharesDisabled
                    ? 'border-dashed border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400'
                    : computedField === 'shares'
                      ? 'border-slate-300 bg-slate-50 italic dark:bg-slate-800/50'
                      : 'border-slate-300'
                )}
                placeholder={
                  sharesDisabled
                    ? form.type === 'DEPOSIT'
                      ? t('transactions.form.shares.disabledDeposit')
                      : t('transactions.form.shares.disabledCash')
                    : t('transactions.form.shares.placeholder')
                }
                aria-invalid={Boolean(fieldErrors.shares)}
                aria-label={
                  computedField === 'shares'
                    ? `${t('transactions.form.shares')} (computed)`
                    : t('transactions.form.shares')
                }
              />
              {sharesDisabled ? (
                <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {form.type === 'DEPOSIT'
                    ? t('transactions.form.shares.disabledDepositHelper')
                    : t('transactions.form.shares.disabledCashHelper')}
                </span>
              ) : fieldErrors.shares ? (
                <span className="mt-1 text-xs font-medium text-rose-600" data-testid="error-shares">
                  {fieldErrors.shares}
                </span>
              ) : (
                <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t('transactions.form.shares.helper')}
                </span>
              )}
            </label>
          </div>

          {error ? (
            <p className="text-sm font-medium text-rose-600" role="alert" data-testid="error-form">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              {t('transactions.form.title')}
            </button>
          </div>
        </form>
        <DepositorModal
          open={isDepositorModalOpen}
          onClose={handleDepositorClose}
          onSubmit={handleDepositorSubmit}
        />
      </div>

      <section
        aria-label={t('transactions.section.aria')}
        className={clsx('space-y-4', compact && 'space-y-3')}
      >
        <h2
          className={clsx(
            'font-semibold text-slate-700 dark:text-slate-200',
            compact ? 'text-base' : 'text-lg'
          )}
        >
          {t('transactions.section.recent')}
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={clsx('text-sm text-slate-600 dark:text-slate-300', compact && 'text-xs')}>
            {summaryText}
          </p>
          {totalTransactions > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                <span className="whitespace-nowrap">{t('transactions.pagination.rows')}</span>
                <select
                  aria-label={t('transactions.pagination.rows')}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  onChange={(event) => {
                    const nextValue = Number.parseInt(event.target.value, 10);
                    setPageSize(Number.isFinite(nextValue) ? nextValue : DEFAULT_PAGE_SIZE);
                    setPage(1);
                  }}
                  value={pageSize}
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                <span className="whitespace-nowrap">{t('transactions.search.label')}</span>
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder={t('transactions.search.placeholder')}
                  className={clsx(
                    'w-full min-w-[200px] rounded-md border border-slate-300 px-3 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
                    compact ? 'py-0.5 text-xs' : 'py-1 text-sm'
                  )}
                  aria-label={t('transactions.search.label')}
                />
              </label>
            </div>
          ) : null}
        </div>

        <TransactionsTable
          onDeleteTransaction={onDeleteTransaction}
          transactions={visibleTransactions}
          virtualized={virtualized}
          listRef={virtualized ? listRef : null}
          rowIndexOffset={startIndex}
          hasSearch={hasSearch}
          totalTransactions={totalTransactions}
          rowHeight={rowHeight}
          compact={compact}
        />

        {filteredCount > safePageSize ? (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className={clsx(
                'rounded-md border border-slate-300 text-slate-600 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
                compact ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'
              )}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              aria-label={t('transactions.pagination.previous')}
              disabled={currentPage <= 1}
            >
              {t('transactions.pagination.previous')}
            </button>
            <p className={clsx('text-sm text-slate-600 dark:text-slate-300', compact && 'text-xs')}>
              {t('transactions.pagination.page', {
                current: currentPage,
                total: totalPages,
              })}
            </p>
            <button
              type="button"
              className={clsx(
                'rounded-md border border-slate-300 text-slate-600 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
                compact ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'
              )}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              aria-label={t('transactions.pagination.next')}
              disabled={currentPage >= totalPages}
            >
              {t('transactions.pagination.next')}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
