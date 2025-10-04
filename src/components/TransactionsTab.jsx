import { useState } from "react";
import { formatCurrency } from "../utils/format.js";

const defaultForm = {
  date: "",
  ticker: "",
  type: "BUY",
  amount: "",
  price: "",
};

function TransactionsTable({ transactions }) {
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
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {transactions.map((transaction, index) => (
            <tr
              key={`${transaction.ticker}-${transaction.date}-${index}`}
              className="bg-white dark:bg-slate-900"
            >
              <td className="px-3 py-2">{transaction.date}</td>
              <td className="px-3 py-2 font-semibold">{transaction.ticker}</td>
              <td className="px-3 py-2">{transaction.type}</td>
              <td className="px-3 py-2">
                {formatCurrency(transaction.amount)}
              </td>
              <td className="px-3 py-2">{formatCurrency(transaction.price)}</td>
              <td className="px-3 py-2">{transaction.shares.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TransactionsTab({ onAddTransaction, transactions }) {
  const [form, setForm] = useState(defaultForm);
  const [error, setError] = useState(null);

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const { date, ticker, type, amount, price } = form;
    if (!date || !ticker || !type || !amount || !price) {
      setError("Please fill in all fields.");
      return;
    }

    const amountValue = Number.parseFloat(amount);
    const priceValue = Number.parseFloat(price);
    if (
      !Number.isFinite(amountValue) ||
      !Number.isFinite(priceValue) ||
      priceValue === 0
    ) {
      setError("Amount and price must be valid numbers.");
      return;
    }

    const shares = Math.abs(amountValue) / priceValue;
    const payload = {
      date,
      ticker: ticker.trim().toUpperCase(),
      type,
      amount: type === "BUY" ? -Math.abs(amountValue) : Math.abs(amountValue),
      price: priceValue,
      shares,
    };

    onAddTransaction(payload);
    setForm(defaultForm);
    setError(null);
  }

  const computedShares =
    form.amount && form.price && Number.isFinite(Number.parseFloat(form.price))
      ? Math.abs(Number.parseFloat(form.amount || 0)) /
        Number.parseFloat(form.price || 1)
      : null;

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
                <option value="WITHDRAW">WITHDRAW</option>
              </select>
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              Amount (USD)
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(event) => updateForm("amount", event.target.value)}
                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              Price (USD)
              <input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(event) => updateForm("price", event.target.value)}
                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <div className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              Shares
              <span className="mt-1 rounded-md border border-dashed border-slate-300 px-3 py-2 font-mono text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                {computedShares ? computedShares.toFixed(4) : "—"}
              </span>
            </div>
          </div>
          {error && (
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          )}
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            Add Transaction
          </button>
        </form>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
          Recent Activity
        </h2>
        <div className="mt-4">
          <TransactionsTable transactions={transactions} />
        </div>
      </div>
    </div>
  );
}
