import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import { FixedSizeList } from "react-window";

import useDebouncedValue from "../hooks/useDebouncedValue.js";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { validateNonNegativeCash } from "../utils/cashGuards.js";

const defaultForm = {
  date: "",
  ticker: "",
  type: "BUY",
  amount: "",
  price: "",
  shares: "",
};

const CASH_ONLY_TYPES = new Set(["DEPOSIT", "WITHDRAWAL", "DIVIDEND", "INTEREST"]);

function isCashOnlyType(type) {
  return CASH_ONLY_TYPES.has(type);
}

const initialState = {
  form: { ...defaultForm },
  error: null,
  fieldErrors: {},
};

function createInitialForm() {
  return { ...defaultForm };
}

function reducer(state, action) {
  switch (action.type) {
    case "update":
      return {
        ...state,
        form: { ...state.form, [action.field]: action.value },
      };
    case "set-form":
      return {
        ...state,
        form: { ...action.form },
      };
    case "set-error":
      return {
        ...state,
        error: action.error,
        fieldErrors: action.fieldErrors ?? state.fieldErrors,
      };
    case "clear-error":
      return { ...state, error: null, fieldErrors: {} };
    case "set-field-errors":
      return {
        ...state,
        fieldErrors: { ...state.fieldErrors, ...action.fieldErrors },
      };
    case "clear-field-error": {
      if (!state.fieldErrors[action.field]) {
        return state;
      }
      const nextErrors = { ...state.fieldErrors };
      delete nextErrors[action.field];
      return { ...state, fieldErrors: nextErrors };
    }
    case "reset":
      return { form: createInitialForm(), error: null, fieldErrors: {} };
    default:
      return state;
  }
}

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [25, 50, 100];
const VIRTUALIZATION_THRESHOLD = 200;
const ROW_HEIGHT = 56;
const VIRTUALIZED_MAX_HEIGHT = 480;
const GRID_TEMPLATE =
  "140px minmax(100px, 1fr) 120px 140px 140px 120px minmax(120px, 1fr)";

function formatTransactionMatchValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).toLowerCase();
}

function matchesTransaction(transaction, term) {
  if (!term) {
    return true;
  }

  const normalized = term.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    transaction.ticker,
    transaction.type,
    transaction.date,
    transaction.shares,
    transaction.amount,
    transaction.price,
  ]
    .map((value) => formatTransactionMatchValue(value))
    .some((value) => value.includes(normalized));
}

function TransactionRow({
  index,
  item,
  onDeleteTransaction,
  style,
  rowIndexOffset = 0,
}) {
  const { t, formatCurrency } = useI18n();
  const { transaction, originalIndex } = item;
  const sharesDisplay =
    typeof transaction.shares === "number"
      ? transaction.shares.toFixed(4)
      : "—";
  const typeKey =
    typeof transaction.type === "string" ? transaction.type.toLowerCase() : "";
  const typeLabel =
    typeKey !== ""
      ? t(`transactions.type.${typeKey}`)
      : String(transaction.type ?? "—");

  return (
    <div
      aria-rowindex={rowIndexOffset + index + 2}
      className={clsx(
        "grid items-center border-b border-slate-200 px-3 py-2 text-sm transition-colors last:border-none dark:border-slate-800",
        index % 2 === 0
          ? "bg-white dark:bg-slate-900"
          : "bg-slate-50 dark:bg-slate-900/70",
      )}
      role="row"
      style={{
        ...style,
        display: "grid",
        gridTemplateColumns: GRID_TEMPLATE,
        width: "100%",
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
          className="rounded-md border border-transparent px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 dark:hover:bg-rose-500/10"
          aria-label={t("transactions.table.undoAria", {
            ticker: transaction.ticker,
            date: transaction.date,
          })}
        >
          {t("transactions.table.undo")}
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
      rowIndexOffset={0}
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
      className={clsx("focus:outline-none", props.className)}
    />
  );
});

const VirtualizedInner = forwardRef(function VirtualizedInner(props, ref) {
  return <div {...props} ref={ref} role="presentation" />;
});

function DepositorModal({ open, onClose, onSubmit }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [reference, setReference] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setReference("");
      setShowErrors(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  function handleSubmit(event) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setShowErrors(true);
      return;
    }
    onSubmit({
      name: trimmedName,
      reference: reference.trim(),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-depositor-title"
      data-testid="depositor-modal"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <h3
            id="add-depositor-title"
            className="text-lg font-semibold text-slate-700 dark:text-slate-100"
          >
            {t("transactions.depositor.title")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label={t("transactions.depositor.close")}
          >
            ×
          </button>
        </div>
        <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
          <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
            {t("transactions.depositor.name")}
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder={t("transactions.depositor.name.placeholder")}
              aria-invalid={showErrors && !name.trim()}
              autoFocus
            />
            {showErrors && !name.trim() ? (
              <span className="mt-1 text-xs font-medium text-rose-600">
                {t("transactions.depositor.nameError")}
              </span>
            ) : null}
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
            {t("transactions.depositor.reference")}
            <input
              type="text"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder={t("transactions.depositor.reference.placeholder")}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              {t("transactions.depositor.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TransactionsTable({
  transactions,
  onDeleteTransaction,
  virtualized,
  rowIndexOffset = 0,
  listRef,
  hasSearch = false,
  totalTransactions = 0,
}) {
  const { t } = useI18n();
  if (transactions.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400" role="status">
        {totalTransactions === 0
          ? t("transactions.table.empty")
          : hasSearch
            ? t("transactions.table.noMatch")
            : t("transactions.table.noneAvailable")}
      </p>
    );
  }

  const listHeight = Math.min(
    Math.max(ROW_HEIGHT * 6, transactions.length * ROW_HEIGHT),
    VIRTUALIZED_MAX_HEIGHT,
  );

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
      <div role="table" aria-label={t("transactions.table.aria")} className="w-full">
        <div
          role="rowgroup"
          className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-300"
        >
          <div
            role="row"
            className="grid grid-cols-[140px_minmax(100px,1fr)_120px_140px_140px_120px_minmax(120px,1fr)] items-center px-3 py-2"
          >
            <span role="columnheader">{t("transactions.table.date")}</span>
            <span role="columnheader">{t("transactions.table.ticker")}</span>
            <span role="columnheader">{t("transactions.table.type")}</span>
            <span role="columnheader">{t("transactions.table.amount")}</span>
            <span role="columnheader">{t("transactions.table.price")}</span>
            <span role="columnheader">{t("transactions.table.shares")}</span>
            <span className="text-right" role="columnheader">
              {t("transactions.table.actions")}
            </span>
          </div>
        </div>
        {virtualized ? (
          <FixedSizeList
            height={listHeight}
            innerElementType={VirtualizedInner}
            itemCount={transactions.length}
            itemData={{ transactions, onDeleteTransaction }}
            itemSize={ROW_HEIGHT}
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TransactionsTab({
  onAddTransaction,
  onDeleteTransaction,
  transactions = [],
}) {
  const { t } = useI18n();
  const [state, dispatch] = useReducer(reducer, initialState);
  const { form, error, fieldErrors } = state;
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [isDepositorModalOpen, setDepositorModalOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const listRef = useRef(null);

  const indexedTransactions = useMemo(
    () =>
      transactions.map((transaction, originalIndex) => ({
        originalIndex,
        transaction,
      })),
    [transactions],
  );

  const filteredTransactions = useMemo(() => {
    if (!debouncedSearch) {
      return indexedTransactions;
    }

    return indexedTransactions.filter(({ transaction }) =>
      matchesTransaction(transaction, debouncedSearch),
    );
  }, [debouncedSearch, indexedTransactions]);

  const totalTransactions = indexedTransactions.length;
  const filteredCount = filteredTransactions.length;
  const safePageSize = pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
  const virtualized = filteredCount > VIRTUALIZATION_THRESHOLD;
  const totalPages = virtualized
    ? 1
    : Math.max(1, Math.ceil(filteredCount / safePageSize));
  const currentPage = virtualized ? 1 : Math.min(page, totalPages);
  const startIndex = virtualized ? 0 : (currentPage - 1) * safePageSize;
  const endIndex = virtualized
    ? filteredCount
    : Math.min(startIndex + safePageSize, filteredCount);

  const visibleTransactions = useMemo(() => {
    if (virtualized) {
      return filteredTransactions;
    }
    return filteredTransactions.slice(startIndex, endIndex);
  }, [filteredTransactions, startIndex, endIndex, virtualized]);

  useEffect(() => {
    if (!virtualized && currentPage !== page) {
      setPage(currentPage);
    }
  }, [currentPage, page, virtualized]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (listRef.current && typeof listRef.current.scrollTo === "function") {
      listRef.current.scrollTo(0);
    }
  }, [debouncedSearch, filteredCount, virtualized]);

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

  function updateForm(field, value) {
    const nextForm = { ...form, [field]: value };
    const wasCashOnly = isCashOnlyType(form.type);
    const nextCashOnly = isCashOnlyType(nextForm.type);
    const nextIsDeposit = nextForm.type === "DEPOSIT";

    if (nextCashOnly) {
      nextForm.price = "";
      if (nextIsDeposit) {
        nextForm.ticker = "";
        nextForm.shares = "";
      }
    }

    if (!nextCashOnly) {
      const amountValue = Number.parseFloat(nextForm.amount);
      const priceValue = Number.parseFloat(nextForm.price);
      if (
        Number.isFinite(amountValue) &&
        Number.isFinite(priceValue) &&
        priceValue !== 0
      ) {
        const computedShares = Math.abs(amountValue) / Math.abs(priceValue);
        nextForm.shares = computedShares.toFixed(8);
      } else {
        nextForm.shares = "";
      }
    }

    if (nextCashOnly) {
      nextForm.shares = "";
    }

    dispatch({ type: "set-form", form: nextForm });

    const clearFieldError = (fieldName) => {
      if (fieldErrors[fieldName]) {
        dispatch({ type: "clear-field-error", field: fieldName });
      }
    };

    if (error) {
      dispatch({ type: "clear-error" });
    }
    clearFieldError(field);

    if (field === "type") {
      if (nextCashOnly && !wasCashOnly) {
        clearFieldError("price");
      }
      if (nextIsDeposit) {
        clearFieldError("ticker");
        clearFieldError("shares");
      }
      if (!nextCashOnly && wasCashOnly && nextForm.shares) {
        clearFieldError("shares");
      }
    }
    if ((field === "amount" || field === "price") && nextForm.shares) {
      clearFieldError("shares");
    }
  }

  function recordError(message, fields = {}) {
    dispatch({ type: "set-error", error: message, fieldErrors: fields });
  }

  function handleSubmit(event) {
    event.preventDefault();
    const { date, ticker, type, amount, price, shares } = form;
    const cashOnly = isCashOnlyType(type);

    const normalizedTicker = ticker.trim();
    const missingFields = {};
    if (!date) {
      missingFields.date = t("transactions.form.validation.date");
    }
    if (!cashOnly && !normalizedTicker) {
      missingFields.ticker = t("transactions.form.validation.ticker");
    }
    if (!type) {
      missingFields.type = t("transactions.form.validation.type");
    }
    if (!amount) {
      missingFields.amount = t("transactions.form.validation.amountField");
    }
    if (!price && !cashOnly) {
      missingFields.price = t("transactions.form.validation.price");
    }

    if (Object.keys(missingFields).length > 0) {
      recordError(t("transactions.form.validation.missing"), missingFields);
      return;
    }

    const amountValue = Number.parseFloat(amount);

    if (!Number.isFinite(amountValue)) {
      recordError(t("transactions.form.validation.amount"), {
        amount: t("transactions.form.validation.amountField"),
      });
      return;
    }

    let priceValue = null;
    let sharesValue = null;
    if (!cashOnly) {
      priceValue = Number.parseFloat(price);
      if (!Number.isFinite(priceValue) || priceValue <= 0) {
        recordError(t("transactions.form.validation.price"), {
          price: t("transactions.form.validation.price"),
        });
        return;
      }
      sharesValue = Number.parseFloat(shares);
      if (!Number.isFinite(sharesValue) || sharesValue <= 0) {
        recordError(t("transactions.form.validation.shares"), {
          shares: t("transactions.form.validation.shares"),
        });
        return;
      }
    }

    const payload = {
      date,
      type,
      amount: type === "BUY" ? -Math.abs(amountValue) : Math.abs(amountValue),
    };

    if (!cashOnly) {
      const normalisedTickerValue = normalizedTicker.toUpperCase();
      payload.ticker = normalisedTickerValue;
      payload.price = Math.abs(priceValue);
      payload.shares = Number(sharesValue.toFixed(8));
    }

    const validation = validateNonNegativeCash([...transactions, payload]);
    if (!validation.ok) {
      recordError(t("transactions.form.validation.cashOverdraw"), {
        amount: t("transactions.form.validation.cashField"),
      });
      return;
    }

    onAddTransaction(payload);
    dispatch({ type: "reset" });
  }

  const requiresPrice = !isCashOnlyType(form.type);
  const tickerDisabled = form.type === "DEPOSIT";
  const sharesDisabled = isCashOnlyType(form.type);

  const hasSearch = Boolean(debouncedSearch?.trim());
  const showingStart =
    filteredCount === 0 ? 0 : virtualized ? 1 : startIndex + 1;
  const showingEnd = virtualized
    ? filteredCount
    : Math.min(endIndex, filteredCount);
  const startLabel = showingStart.toLocaleString();
  const endLabel = showingEnd.toLocaleString();
  const filteredLabel = filteredCount.toLocaleString();
  const totalLabel = totalTransactions.toLocaleString();
  const summaryText = (() => {
    if (totalTransactions === 0) {
      return t("transactions.table.empty");
    }
    if (filteredCount === 0) {
      return hasSearch
        ? t("transactions.table.noMatch")
        : t("transactions.table.empty");
    }
    if (virtualized) {
      return hasSearch
        ? t("transactions.summary.virtualFiltered", {
            count: filteredLabel,
            total: totalLabel,
          })
        : t("transactions.summary.virtual", {
            count: filteredLabel,
            total: totalLabel,
          });
    }
    return hasSearch
      ? t("transactions.summary.filtered", {
          start: startLabel,
          end: endLabel,
          length: filteredLabel,
          total: totalLabel,
        })
      : t("transactions.summary.range", {
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
          >{t("transactions.form.title")}</h2>
          <button
            type="button"
            onClick={handleDepositorOpen}
            className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >{t("transactions.form.addDepositor")}</button>
        </div>
        <form
          aria-labelledby="add-transaction-heading"
          onSubmit={handleSubmit}
          className="mt-4 space-y-4"
          noValidate
        >
          <div className="grid gap-4 md:grid-cols-6">
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("transactions.form.date")}
              <input
                type="date"
                value={form.date}
                max={new Date().toISOString().split("T")[0]}
                onChange={(event) => updateForm("date", event.target.value)}
                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                aria-invalid={Boolean(fieldErrors.date)}
              />
              {fieldErrors.date ? (
                <span
                  className="mt-1 text-xs font-medium text-rose-600"
                  data-testid="error-date"
                >
                  {fieldErrors.date}
                </span>
              ) : null}
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("transactions.form.ticker")}
              <input
                type="text"
                value={form.ticker}
                onChange={(event) => updateForm("ticker", event.target.value)}
                className={clsx(
                  "mt-1 rounded-md border px-3 py-2 text-sm uppercase focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100",
                  tickerDisabled
                    ? "cursor-not-allowed border-dashed border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                    : "border-slate-300",
                )}
                placeholder={
                  tickerDisabled
                    ? t("transactions.form.ticker.disabledPlaceholder")
                    : t("transactions.form.ticker.placeholder")
                }
                aria-invalid={Boolean(fieldErrors.ticker)}
                disabled={tickerDisabled}
                aria-disabled={tickerDisabled ? "true" : undefined}
              />
              {tickerDisabled ? (
                <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t("transactions.form.ticker.disabledHelper")}
                </span>
              ) : fieldErrors.ticker ? (
                <span
                  className="mt-1 text-xs font-medium text-rose-600"
                  data-testid="error-ticker"
                >
                  {fieldErrors.ticker}
                </span>
              ) : null}
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("transactions.form.type")}
              <select
                value={form.type}
                onChange={(event) => updateForm("type", event.target.value)}
                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                aria-invalid={Boolean(fieldErrors.type)}
              >
                <option value="BUY">{t("transactions.type.buy")}</option>
                <option value="SELL">{t("transactions.type.sell")}</option>
                <option value="DEPOSIT">{t("transactions.type.deposit")}</option>
                <option value="WITHDRAWAL">{t("transactions.type.withdrawal")}</option>
                <option value="DIVIDEND">{t("transactions.type.dividend")}</option>
                <option value="INTEREST">{t("transactions.type.interest")}</option>
              </select>
              {fieldErrors.type ? (
                <span
                  className="mt-1 text-xs font-medium text-rose-600"
                  data-testid="error-type"
                >
                  {fieldErrors.type}
                </span>
              ) : null}
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("transactions.form.amount")}
              <input
                type="number"
                value={form.amount}
                onChange={(event) => updateForm("amount", event.target.value)}
                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                step="0.01"
                placeholder={t("transactions.form.amount.placeholder")}
                aria-invalid={Boolean(fieldErrors.amount)}
              />
              {fieldErrors.amount ? (
                <span
                  className="mt-1 text-xs font-medium text-rose-600"
                  data-testid="error-amount"
                >
                  {fieldErrors.amount}
                </span>
              ) : null}
            </label>
            {requiresPrice ? (
              <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
                {t("transactions.form.price")}
                <input
                  type="number"
                  value={form.price}
                  onChange={(event) => updateForm("price", event.target.value)}
                  className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  step="0.01"
                  placeholder={t("transactions.form.price.placeholder")}
                  aria-invalid={Boolean(fieldErrors.price)}
                />
                {fieldErrors.price ? (
                  <span
                    className="mt-1 text-xs font-medium text-rose-600"
                    data-testid="error-price"
                  >
                    {fieldErrors.price}
                  </span>
                ) : null}
              </label>
            ) : null}
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("transactions.form.shares")}
              <input
                type="number"
                value={form.shares}
                readOnly={!sharesDisabled}
                disabled={sharesDisabled}
                aria-disabled={sharesDisabled ? "true" : undefined}
                aria-readonly={!sharesDisabled ? "true" : undefined}
                className={clsx(
                  "mt-1 rounded-md border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100",
                  sharesDisabled
                    ? "border-dashed border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                    : "border-slate-300",
                )}
                placeholder={
                  sharesDisabled
                    ? form.type === "DEPOSIT"
                      ? t("transactions.form.shares.disabledDeposit")
                      : t("transactions.form.shares.disabledCash")
                    : t("transactions.form.shares.placeholder")
                }
                aria-invalid={Boolean(fieldErrors.shares)}
              />
              {sharesDisabled ? (
                <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {form.type === "DEPOSIT"
                    ? t("transactions.form.shares.disabledDepositHelper")
                    : t("transactions.form.shares.disabledCashHelper")}
                </span>
              ) : fieldErrors.shares ? (
                <span
                  className="mt-1 text-xs font-medium text-rose-600"
                  data-testid="error-shares"
                >
                  {fieldErrors.shares}
                </span>
              ) : (
                <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t("transactions.form.shares.helper")}
                </span>
              )}
            </label>
          </div>

          {error ? (
            <p
              className="text-sm font-medium text-rose-600"
              role="alert"
              data-testid="error-form"
            >
              {error}
            </p>
          ) : null}

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >{t("transactions.form.title")}</button>
          </div>
        </form>
        <DepositorModal
          open={isDepositorModalOpen}
          onClose={handleDepositorClose}
          onSubmit={handleDepositorSubmit}
        />
      </div>

      <section aria-label={t("transactions.section.aria")} className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
          {t("transactions.section.recent")}
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600 dark:text-slate-300">{summaryText}</p>
          {totalTransactions > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                <span className="whitespace-nowrap">{t("transactions.pagination.rows")}</span>
                <select
                  aria-label={t("transactions.pagination.rows")}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  onChange={(event) => {
                    const nextValue = Number.parseInt(event.target.value, 10);
                    setPageSize(
                      Number.isFinite(nextValue) ? nextValue : DEFAULT_PAGE_SIZE,
                    );
                    setPage(1);
                  }}
                  value={pageSize}
                  disabled={virtualized}
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                <span className="whitespace-nowrap">{t("transactions.search.label")}</span>
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder={t("transactions.search.placeholder")}
                  className="w-full min-w-[200px] rounded-md border border-slate-300 px-3 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  aria-label={t("transactions.search.label")}
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
          rowIndexOffset={virtualized ? 0 : startIndex}
          hasSearch={hasSearch}
          totalTransactions={totalTransactions}
        />

        {!virtualized && filteredCount > pageSize ? (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              aria-label={t("transactions.pagination.previous")}
              disabled={currentPage <= 1}
            >
              {t("transactions.pagination.previous")}
            </button>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {t("transactions.pagination.page", {
                current: currentPage,
                total: totalPages,
              })}
            </p>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              aria-label={t("transactions.pagination.next")}
              disabled={currentPage >= totalPages}
            >
              {t("transactions.pagination.next")}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
