import clsx from "clsx";

import { useI18n } from "../i18n/I18nProvider.jsx";
import { deriveHoldingStats, deriveSignalRow } from "../utils/holdings.js";

function HoldingsTable({ holdings, currentPrices, t, compact = false }) {
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
            return (
              <tr key={holding.ticker} className="bg-white dark:bg-slate-900">
                <td className={clsx("px-3 font-semibold", compact ? "py-1.5" : "py-2")}>
                  {holding.ticker}
                </td>
                <td className={clsx("px-3", compact ? "py-1.5" : "py-2")}>
                  {holding.shares.toFixed(4)}
                </td>
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

const SIGNAL_LABEL_KEYS = {
  "BUY zone": "holdings.signals.status.buyZone",
  "TRIM zone": "holdings.signals.status.trimZone",
  HOLD: "holdings.signals.status.hold",
  "NO DATA": "holdings.signals.status.noData",
};

function SignalsTable({ holdings, currentPrices, signals, onSignalChange, t, compact = false }) {
  function resolvePctWindow(ticker) {
    if (!signals || !ticker) {
      return 3;
    }

    const normalizedTicker = ticker.toUpperCase();
    const candidate =
      signals[ticker] ??
      signals[normalizedTicker] ??
      signals[normalizedTicker.toLowerCase?.() ?? ""] ??
      null;

    const value =
      candidate && typeof candidate === "object"
        ? candidate.pct ?? candidate.percent ?? candidate.windowPct ?? candidate.window
        : candidate;

    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number.parseFloat(value)
          : Number.NaN;

    return Number.isFinite(parsed) ? parsed : 3;
  }

  if (holdings.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {t("holdings.signals.empty")}
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
        aria-label={t("holdings.signals.aria")}
      >
        <thead className="bg-slate-50 dark:bg-slate-800/60">
          <tr
            className={clsx(
              "text-left font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300",
              compact ? "text-[11px]" : "text-xs",
            )}
          >
            <th className={clsx("px-3", compact ? "py-1.5" : "py-2")}>{t("holdings.signals.header.ticker")}</th>
            <th className={clsx("px-3", compact ? "py-1.5" : "py-2")}>{t("holdings.signals.header.window")}</th>
            <th className={clsx("px-3", compact ? "py-1.5" : "py-2")}>{t("holdings.signals.header.lastPrice")}</th>
            <th className={clsx("px-3", compact ? "py-1.5" : "py-2")}>{t("holdings.signals.header.lower")}</th>
            <th className={clsx("px-3", compact ? "py-1.5" : "py-2")}>{t("holdings.signals.header.upper")}</th>
            <th className={clsx("px-3", compact ? "py-1.5" : "py-2")}>{t("holdings.signals.header.signal")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {holdings.map((holding) => {
            const pctWindow = resolvePctWindow(holding.ticker);
            const row = deriveSignalRow(
              holding,
              currentPrices[holding.ticker],
              pctWindow,
            );
            return (
              <tr key={holding.ticker} className="bg-white dark:bg-slate-900">
                <td className={clsx("px-3 font-semibold", compact ? "py-1.5" : "py-2")}>{holding.ticker}</td>
                <td className={clsx("px-3", compact ? "py-1.5" : "py-2")}>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    className={clsx(
                      "w-20 rounded-md border border-slate-300 px-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100",
                      compact ? "py-0.5 text-xs" : "py-1 text-sm",
                    )}
                    value={pctWindow}
                    onChange={(event) =>
                      onSignalChange(holding.ticker, event.target.value)
                    }
                    aria-label={t("holdings.signals.windowAria", { ticker: holding.ticker })}
                    title={t("holdings.signals.windowAria", { ticker: holding.ticker })}
                  />
                </td>
                <td className={clsx("px-3", compact ? "py-1.5" : "py-2")}>{row.price}</td>
                <td className={clsx("px-3", compact ? "py-1.5" : "py-2")}>{row.lower}</td>
                <td className={clsx("px-3", compact ? "py-1.5" : "py-2")}>{row.upper}</td>
                <td className={clsx("px-3", compact ? "py-1.5" : "py-2")}>
                  {(() => {
                    const translationKey = SIGNAL_LABEL_KEYS[row.signal];
                    const signalLabel = translationKey ? t(translationKey) : row.signal;
                    return (
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
                      {signalLabel}
                  </span>
                    );
                  })()}
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
  compact = false,
}) {
  const { t } = useI18n();
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
            compact={compact}
          />
        </div>
      </div>
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
          {t("holdings.signals.title")}
        </h2>
        <div className="mt-4">
          <SignalsTable
            holdings={holdings}
            currentPrices={currentPrices}
            signals={signals}
            onSignalChange={onSignalChange}
            t={t}
            compact={compact}
          />
        </div>
      </div>
    </div>
  );
}
