import { forwardRef, useEffect, useMemo, useReducer, useRef, useState } from "react";
import clsx from "clsx";
import { FixedSizeList } from "react-window";

import useDebouncedValue from "../hooks/useDebouncedValue.js";
import { formatCurrency } from "../utils/format.js";

const defaultForm = {
  date: "",
  ticker: "",
  type: "BUY",
  amount: "",
  price: "",
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
  const { transaction, originalIndex } = item;
  const sharesDisplay =
    typeof transaction.shares === "number"
      ? transaction.shares.toFixed(4)
      : "—";

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
      <span role="cell">{transaction.type}</span>
      <span role="cell">{formatCurrency(transaction.amount)}</span>
      <span role="cell">{formatCurrency(transaction.price)}</span>
      <span role="cell">{sharesDisplay}</span>
      <span className="flex justify-end" role="cell">
        <button
          type="button"
          onClick={() => onDeleteTransaction?.(originalIndex)}
          className="rounded-md border border-transparent px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 dark:hover:bg-rose-500/10"
          aria-label={`Undo transaction for ${transaction.ticker} on ${transaction.date}`}
        >
          Undo
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

function TransactionsTable({
  transactions,
  onDeleteTransaction,
  virtualized,
  rowIndexOffset = 0,
  listRef,
  hasSearch = false,
  totalTransactions = 0,
}) {
  if (transactions.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400" role="status">
        {totalTransactions === 0
          ? "No transactions recorded yet."
          : hasSearch
            ? "No transactions match your filters yet."
            : "No transactions available."}
      </p>
    );
  }

  const listHeight = Math.min(
    Math.max(ROW_HEIGHT * 6, transactions.length * ROW_HEIGHT),
    VIRTUALIZED_MAX_HEIGHT,
  );

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
      <div role="table" aria-label="Transactions" className="w-full">
        <div
          role="rowgroup"
          className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-300"
        >
          <div
            role="row"
            className="grid grid-cols-[140px_minmax(100px,1fr)_120px_140px_140px_120px_minmax(120px,1fr)] items-center px-3 py-2"
          >
            <span role="columnheader">Date</span>
            <span role="columnheader">Ticker</span>
            <span role="columnheader">Type</span>
            <span role="columnheader">Amount</span>
            <span role="columnheader">Price</span>
            <span role="columnheader">Shares</span>
            <span className="text-right" role="columnheader">
              Actions
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
  const [state, dispatch] = useReducer(reducer, initialState);
  const { form, error, fieldErrors } = state;
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
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

  function updateForm(field, value) {
    dispatch({ type: "update", field, value });

    if (error) {
      dispatch({ type: "clear-error" });
    }
    if (fieldErrors[field]) {
      dispatch({ type: "clear-field-error", field });
    }
    if (field === "type" && isCashOnlyType(value)) {
      dispatch({ type: "update", field: "price", value: "" });
      if (fieldErrors.price) {
        dispatch({ type: "clear-field-error", field: "price" });
      }
    }
  }

  function recordError(message, fields = {}) {
    dispatch({ type: "set-error", error: message, fieldErrors: fields });
  }

  function handleSubmit(event) {
    event.preventDefault();
    const { date, ticker, type, amount, price } = form;
    const cashOnly = isCashOnlyType(type);

    const normalizedTicker = ticker.trim();
    const missingFields = {};
    if (!date) {
      missingFields.date = "Date is required.";
    }
    if (!cashOnly && !normalizedTicker) {
      missingFields.ticker = "Ticker is required.";
    }
    if (!type) {
      missingFields.type = "Type is required.";
    }
    if (!amount) {
      missingFields.amount = "Amount is required.";
    }
    if (!price && !cashOnly) {
      missingFields.price = "Price is required.";
    }

    if (Object.keys(missingFields).length > 0) {
      recordError("Please fill in all fields.", missingFields);
      return;
    }

    const amountValue = Number.parseFloat(amount);

    if (!Number.isFinite(amountValue)) {
      recordError("Amount must be a valid number.", {
        amount: "Enter a valid number for amount.",
      });
      return;
    }

    let priceValue = null;
    if (!cashOnly) {
      priceValue = Number.parseFloat(price);
      if (!Number.isFinite(priceValue) || priceValue <= 0) {
        recordError("Price must be a positive number.", {
          price: "Price must be greater than zero.",
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
      const shares = Math.abs(amountValue) / Math.abs(priceValue);
      payload.ticker = normalisedTickerValue;
      payload.price = Math.abs(priceValue);
      payload.shares = Number(shares.toFixed(8));
    }

    onAddTransaction(payload);
    dispatch({ type: "reset" });
  }

  const requiresPrice = !isCashOnlyType(form.type);
  const computedShares =
    requiresPrice &&
    form.amount &&
    form.price &&
    Number.isFinite(Number.parseFloat(form.price)) &&
    Number.parseFloat(form.price) > 0
      ? Math.abs(Number.parseFloat(form.amount || 0)) /
        Math.abs(Number.parseFloat(form.price || 1))
      : null;

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
      return "No transactions recorded yet.";
    }
    if (filteredCount === 0) {
      return hasSearch
        ? "No transactions match your filters."
        : "No transactions recorded yet.";
    }
    if (virtualized) {
      const base = `Showing ${filteredLabel} of ${totalLabel} transactions`;
      return hasSearch ? `${base} (filtered)` : base;
    }
    const base = `Showing ${startLabel}-${endLabel} of ${filteredLabel} transactions`;
    return hasSearch
      ? `${base} (filtered from ${totalLabel})`
      : base;
  })();

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow dark:border-slate-800 dark:bg-slate-900">
        <h2
          id="add-transaction-heading"
          className="text-lg font-semibold text-slate-700 dark:text-slate-200"
        >
          Add Transaction
        </h2>
        <form
          aria-labelledby="add-transaction-heading"
          onSubmit={handleSubmit}
          className="mt-4 space-y-4"
          noValidate
        >
          <div className="grid gap-4 md:grid-cols-6">
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              Date
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
              Ticker
              <input
                type="text"
                value={form.ticker}
                onChange={(event) => updateForm("ticker", event.target.value)}
                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm uppercase focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                placeholder="Enter ticker symbol"
                aria-invalid={Boolean(fieldErrors.ticker)}
              />
              {fieldErrors.ticker ? (
                <span
                  className="mt-1 text-xs font-medium text-rose-600"
                  data-testid="error-ticker"
                >
                  {fieldErrors.ticker}
                </span>
              ) : null}
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              Type
              <select
                value={form.type}
                onChange={(event) => updateForm("type", event.target.value)}
                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                aria-invalid={Boolean(fieldErrors.type)}
              >
                <option value="BUY">Buy</option>
                <option value="SELL">Sell</option>
                <option value="DEPOSIT">Deposit</option>
                <option value="WITHDRAWAL">Withdrawal</option>
                <option value="DIVIDEND">Dividend</option>
                <option value="INTEREST">Interest</option>
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
              Amount
              <input
                type="number"
                value={form.amount}
                onChange={(event) => updateForm("amount", event.target.value)}
                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                step="0.01"
                placeholder="Amount in USD"
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
                Price
                <input
                  type="number"
                  value={form.price}
                  onChange={(event) => updateForm("price", event.target.value)}
                  className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  step="0.01"
                  placeholder="Price per share"
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
            <div className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              Estimated Shares
              <div className="mt-1 rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300">
                {computedShares ? computedShares.toFixed(4) : "—"}
              </div>
            </div>
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
            >
              Add Transaction
            </button>
          </div>
        </form>
      </div>

      <section aria-label="Recorded transactions" className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
          Recent Activity
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600 dark:text-slate-300">{summaryText}</p>
          {totalTransactions > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                <span className="whitespace-nowrap">Rows per page</span>
                <select
                  aria-label="Rows per page"
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
                <span className="whitespace-nowrap">Search</span>
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Ticker, type, date…"
                  className="w-full min-w-[200px] rounded-md border border-slate-300 px-3 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  aria-label="Search transactions"
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
              aria-label="Previous page"
              disabled={currentPage <= 1}
            >
              Previous
            </button>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Page {currentPage} of {totalPages}
            </p>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              aria-label="Next page"
              disabled={currentPage >= totalPages}
            >
              Next
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
