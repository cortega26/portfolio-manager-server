import { useState } from "react";

export default function PortfolioControls({
  portfolioId,
  onPortfolioIdChange,
  onSave,
  onLoad,
}) {
  const [status, setStatus] = useState(null);

  async function handle(action) {
    if (!portfolioId) {
      setStatus({ type: "error", message: "Set a portfolio ID first." });
      return;
    }

    try {
      await action();
      setStatus({
        type: "success",
        message: "Operation completed successfully.",
      });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  }

  return (
    <div className="rounded-xl bg-white p-4 shadow dark:bg-slate-900">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col">
          <label
            htmlFor="portfolioId"
            className="text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            Portfolio ID
          </label>
          <input
            id="portfolioId"
            type="text"
            className="mt-1 w-48 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            value={portfolioId}
            onChange={(event) => onPortfolioIdChange(event.target.value)}
            placeholder="e.g. demo-portfolio"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handle(onSave)}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            Save Portfolio
          </button>
          <button
            type="button"
            onClick={() => handle(onLoad)}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
          >
            Load Portfolio
          </button>
        </div>
      </div>
      {status && (
        <p
          className={`mt-3 text-sm ${
            status.type === "success"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {status.message}
        </p>
      )}
    </div>
  );
}
