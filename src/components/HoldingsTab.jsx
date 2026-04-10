import clsx from "clsx";

import { useI18n } from "../i18n/I18nProvider.jsx";
import {
  deriveHoldingStats,
} from "../utils/holdings.js";
import SignalTableCard from "./SignalTableCard.jsx";

function HoldingsTable({
  holdings,
  currentPrices,
  t,
  formatNumber,
  compact = false,
}) {
  if (holdings.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {t("holdings.table.empty")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table
        className={clsx(
          "min-w-full divide-y divide-slate-200 dark:divide-slate-700",
          compact ? "text-xs" : "text-sm",
        )}
        aria-label={t("holdings.table.aria")}
      >
        <thead className="bg-slate-50 dark:bg-slate-800/60">
          <tr
            className={clsx(
              "text-left font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300",
              compact ? "text-[11px]" : "text-xs",
            )}
          >
            <th className={clsx("px-3", compact ? "py-1.5" : "py-2")}>
              {t("holdings.table.header.ticker")}
            </th>
            <th className={clsx("px-3", compact ? "py-1.5" : "py-2")}>
              {t("holdings.table.header.shares")}
            </th>
            <th className={clsx("px-3", compact ? "py-1.5" : "py-2")}>
              {t("holdings.table.header.avgCost")}
            </th>
            <th className={clsx("px-3", compact ? "py-1.5" : "py-2")}>
              {t("holdings.table.header.currentPrice")}
            </th>
            <th className={clsx("px-3", compact ? "py-1.5" : "py-2")}>
              {t("holdings.table.header.value")}
            </th>
            <th className={clsx("px-3", compact ? "py-1.5" : "py-2")}>
              {t("holdings.table.header.unrealised")}
            </th>
            <th className={clsx("px-3", compact ? "py-1.5" : "py-2")}>
              {t("holdings.table.header.realised")}
            </th>
          </tr>
        </thead>
        <tbody
          className="divide-y divide-slate-200 dark:divide-slate-800"
          data-testid="holdings-tbody"
        >
            {holdings.map((holding) => {
              const enriched = deriveHoldingStats(
                holding,
                currentPrices[holding.ticker],
              );
              const parsedShares =
                typeof holding.shares === "number"
                  ? holding.shares
                  : typeof holding.shares === "string"
                    ? Number.parseFloat(holding.shares)
                    : Number.NaN;
              const sharesLabel = (() => {
                if (Number.isFinite(parsedShares) && typeof formatNumber === "function") {
                  return formatNumber(parsedShares, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 9,
                  });
                }
                if (Number.isFinite(parsedShares)) {
                  return parsedShares.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 9,
                  });
                }
                return typeof holding.shares === "string" && holding.shares.trim()
                  ? holding.shares
                  : "—";
              })();
              return (
                <tr key={holding.ticker} className="bg-white dark:bg-slate-900">
                <td className={clsx("px-3 font-semibold", compact ? "py-1.5" : "py-2")}>
                  {holding.ticker}
                </td>
                  <td className={clsx("px-3", compact ? "py-1.5" : "py-2")}>{sharesLabel}</td>
                <td className={clsx("px-3", compact ? "py-1.5" : "py-2")}>{enriched.avgCostLabel}</td>
                <td className={clsx("px-3", compact ? "py-1.5" : "py-2")}>{enriched.priceLabel}</td>
                <td className={clsx("px-3", compact ? "py-1.5" : "py-2")}>{enriched.valueLabel}</td>
                <td className={clsx("px-3", compact ? "py-1.5" : "py-2")}>{enriched.unrealisedLabel}</td>
                <td className={clsx("px-3", compact ? "py-1.5" : "py-2")}>
                  {enriched.realisedLabel ?? "—"}
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
  transactions = [],
  currentPrices,
  signals,
  signalRows,
  onSignalChange,
  compact = false,
}) {
  const { t, formatNumber } = useI18n();
  return (
    <div className="space-y-6">
      <div
        className={clsx(
          "rounded-xl border border-slate-200 bg-white shadow dark:border-slate-800 dark:bg-slate-900",
          compact ? "p-3" : "p-4",
        )}
      >
        <h2
          className={clsx(
            "font-semibold text-slate-700 dark:text-slate-200",
            compact ? "text-base" : "text-lg",
          )}
        >
          {t("holdings.section.title")}
        </h2>
        <div className="mt-4">
          <HoldingsTable
            holdings={holdings}
            currentPrices={currentPrices}
            t={t}
            formatNumber={formatNumber}
            compact={compact}
          />
        </div>
      </div>
      <SignalTableCard
        holdings={holdings}
        transactions={transactions}
        currentPrices={currentPrices}
        signals={signals}
        signalRows={signalRows}
        onSignalChange={onSignalChange}
        compact={compact}
      />
    </div>
  );
}
