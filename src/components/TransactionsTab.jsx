import { useEffect, useMemo, useReducer, useState } from "react";
import { formatCurrency } from "../utils/format.js";

const defaultForm = {
  date: "",
  ticker: "",
  type: "BUY",
  amount: "",
  price: "",
};

const initialState = {
  form: { ...defaultForm },
  error: null,
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
      return { ...state, error: action.error };
    case "clear-error":
      return { ...state, error: null };
    case "reset":
      return { form: createInitialForm(), error: null };
    default:
      return state;
  }
}

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [25, 50, 100];

function TransactionsTable({ offset, transactions, onDeleteTransaction }) {
  if (transactions.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No transactions recorded yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
        <thead className="bg-slate-50 dark:bg-slate-800/60">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Ticker</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Amount</th>
            <th className="px-3 py-2">Price</th>
            <th className="px-3 py-2">Shares</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {transactions.map((transaction, index) => {
            const globalIndex = offset + index;
            const sharesDisplay =
              typeof transaction.shares === "number"
                ? transaction.shares.toFixed(4)
                : "—";

            return (
              <tr
                key={`${transaction.ticker}-${transaction.date}-${globalIndex}`}
                className="bg-white dark:bg-slate-900"
              >
                <td className="px-3 py-2">{transaction.date}</td>
                <td className="px-3 py-2 font-semibold">{transaction.ticker}</td>
                <td className="px-3 py-2">{transaction.type}</td>
                <td className="px-3 py-2">
                  {formatCurrency(transaction.amount)}
                </td>
                <td className="px-3 py-2">{formatCurrency(transaction.price)}</td>
                <td className="px-3 py-2">{sharesDisplay}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onDeleteTransaction?.(globalIndex)}
                    className="rounded-md border border-transparent px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 dark:hover:bg-rose-500/10"
                    aria-label={`Undo transaction for ${transaction.ticker} on ${transaction.date}`}
                  >
                    Undo
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function TransactionsTab({
  onAddTransaction,
  onDeleteTransaction,
  transactions = [],
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { form, error } = state;
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);

  const pagination = useMemo(() => {
    const total = transactions.length;
    const safePageSize = pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
    const totalPages = Math.max(1, Math.ceil(total / safePageSize));
    const currentPage = Math.min(page, totalPages);
    const startIndex = (currentPage - 1) * safePageSize;
    const endIndex = Math.min(startIndex + safePageSize, total);

    return {
      currentPage,
      endIndex,
      startIndex,
      totalPages,
      totalTransactions: total,
      visibleTransactions: transactions.slice(startIndex, endIndex),
    };
  }, [page, pageSize, transactions]);

  useEffect(() => {
    if (pagination.currentPage !== page) {
      setPage(pagination.currentPage);
    }
  }, [page, pagination.currentPage]);

  function updateForm(field, value) {
    dispatch({ type: "update", field, value });
    if (error) {
      dispatch({ type: "clear-error" });
    }
  }

  function recordError(message) {
    dispatch({ type: "set-error", error: message });
  }

  function handleSubmit(event) {
    event.preventDefault();
    const { date, ticker, type, amount, price } = form;

    if (!date || !ticker || !type || !amount || !price) {
      recordError("Please fill in all fields.");
      return;
    }

    const amountValue = Number.parseFloat(amount);
    const priceValue = Number.parseFloat(price);

    if (!Number.isFinite(amountValue)) {
      recordError("Amount must be a valid number.");
      return;
    }

    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      recordError("Price must be a positive number.");
      return;
    }

    if (Math.abs(amountValue) <= 0) {
      recordError("Amount must be non-zero.");
      return;
    }

    const shares = Math.abs(amountValue) / Math.abs(priceValue);

    const payload = {
      date,
      ticker: ticker.trim().toUpperCase(),
      type,
      amount: type === "BUY" ? -Math.abs(amountValue) : Math.abs(amountValue),
      price: Math.abs(priceValue),
      shares: Number(shares.toFixed(8)),
    };

    onAddTransaction(payload);
    dispatch({ type: "reset" });
  }

  const computedShares =
    form.amount &&
    form.price &&
    Number.isFinite(Number.parseFloat(form.price)) &&
    Number.parseFloat(form.price) > 0
      ? Math.abs(Number.parseFloat(form.amount || 0)) /
        Math.abs(Number.parseFloat(form.price || 1))
      : null;

  const { currentPage, endIndex, startIndex, totalPages, totalTransactions, visibleTransactions } =
    pagination;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
          Add Transaction
        </h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
          <div className="grid gap-4 md:grid-cols-6">
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              Date
              <input
                type="date"
                value={form.date}
                max={new Date().toISOString().split("T")[0]}
                onChange={(event) => updateForm("date", event.target.value)}
                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              Ticker
              <input
                type="text"
                value={form.ticker}
                onChange={(event) => updateForm("ticker", event.target.value)}
                placeholder="e.g. AAPL"
                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm uppercase focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              Type
              <select
                value={form.type}
                onChange={(event) => updateForm("type", event.target.value)}
                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
                <option value="DIVIDEND">DIVIDEND</option>
                <option value="DEPOSIT">DEPOSIT</option>
                <option value="WITHDRAWAL">WITHDRAWAL</option>
                <option value="INTEREST">INTEREST</option>
                <option value="FEE">FEE</option>
              </select>
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              Amount (USD)
              <input
                type="number"
                value={form.amount}
                onChange={(event) => updateForm("amount", event.target.value)}
                placeholder="e.g. 1000"
                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              Price (USD)
              <input
                type="number"
                value={form.price}
                onChange={(event) => updateForm("price", event.target.value)}
                placeholder="e.g. 100"
                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              Computed Shares
              <input
                type="text"
                readOnly
                value={
                  computedShares === null
                    ? "—"
                    : Number(computedShares).toFixed(4)
                }
                className="mt-1 cursor-not-allowed rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                aria-live="polite"
              />
            </label>
          </div>

          {error ? (
            <p className="text-sm font-medium text-rose-600" role="alert">
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
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {totalTransactions === 0
              ? "No transactions recorded yet."
              : `Showing ${startIndex + 1}-${endIndex} of ${totalTransactions} transactions`}
          </p>
          {totalTransactions > 0 ? (
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
              Rows per page
              <select
                aria-label="Rows per page"
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
          ) : null}
        </div>

        <TransactionsTable
          offset={startIndex}
          onDeleteTransaction={onDeleteTransaction}
          transactions={visibleTransactions}
        />

        {totalTransactions > pageSize ? (
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
