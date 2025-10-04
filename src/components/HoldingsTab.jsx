import clsx from "clsx";
import { deriveHoldingStats, deriveSignalRow } from "../utils/holdings.js";

function HoldingsTable({ holdings, currentPrices }) {
  if (holdings.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No holdings yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
        <thead className="bg-slate-50 dark:bg-slate-800/60">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
            <th className="px-3 py-2">Ticker</th>
            <th className="px-3 py-2">Shares</th>
            <th className="px-3 py-2">Avg Cost</th>
            <th className="px-3 py-2">Current Price</th>
            <th className="px-3 py-2">Value</th>
            <th className="px-3 py-2">Unrealised PnL</th>
            <th className="px-3 py-2">Realised PnL</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {holdings.map((holding) => {
            const enriched = deriveHoldingStats(
              holding,
              currentPrices[holding.ticker],
            );
            return (
              <tr key={holding.ticker} className="bg-white dark:bg-slate-900">
                <td className="px-3 py-2 font-semibold">{holding.ticker}</td>
                <td className="px-3 py-2">{holding.shares.toFixed(4)}</td>
                <td className="px-3 py-2">{enriched.avgCostLabel}</td>
                <td className="px-3 py-2">{enriched.priceLabel}</td>
                <td className="px-3 py-2">{enriched.valueLabel}</td>
                <td className="px-3 py-2">{enriched.unrealisedLabel}</td>
                <td className="px-3 py-2">{enriched.realisedLabel ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SignalsTable({ holdings, currentPrices, signals, onSignalChange }) {
  if (holdings.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Add transactions to configure signals.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
        <thead className="bg-slate-50 dark:bg-slate-800/60">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
            <th className="px-3 py-2">Ticker</th>
            <th className="px-3 py-2">Pct Window (%)</th>
            <th className="px-3 py-2">Last Price</th>
            <th className="px-3 py-2">Lower Bound</th>
            <th className="px-3 py-2">Upper Bound</th>
            <th className="px-3 py-2">Signal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {holdings.map((holding) => {
            const pctWindow = signals[holding.ticker]?.pct ?? 3;
            const row = deriveSignalRow(
              holding,
              currentPrices[holding.ticker],
              pctWindow,
            );
            return (
              <tr key={holding.ticker} className="bg-white dark:bg-slate-900">
                <td className="px-3 py-2 font-semibold">{holding.ticker}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    value={pctWindow}
                    onChange={(event) =>
                      onSignalChange(holding.ticker, event.target.value)
                    }
                  />
                </td>
                <td className="px-3 py-2">{row.price}</td>
                <td className="px-3 py-2">{row.lower}</td>
                <td className="px-3 py-2">{row.upper}</td>
                <td className="px-3 py-2">
                  <span
                    className={clsx(
                      "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                      row.signal === "BUY zone" &&
                        "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
                      row.signal === "TRIM zone" &&
                        "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
                      row.signal === "HOLD" &&
                        "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
                      row.signal === "NO DATA" &&
                        "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
                    )}
                  >
                    {row.signal}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function HoldingsTab({
  holdings,
  currentPrices,
  signals,
  onSignalChange,
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
          Holdings
        </h2>
        <div className="mt-4">
          <HoldingsTable holdings={holdings} currentPrices={currentPrices} />
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
          Signals
        </h2>
        <div className="mt-4">
          <SignalsTable
            holdings={holdings}
            currentPrices={currentPrices}
            signals={signals}
            onSignalChange={onSignalChange}
          />
        </div>
      </div>
    </div>
  );
}
