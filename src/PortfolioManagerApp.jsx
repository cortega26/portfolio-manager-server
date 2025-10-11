import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import PortfolioControls from "./components/PortfolioControls.jsx";
import ToastStack from "./components/ToastStack.jsx";
import TabBar from "./components/TabBar.jsx";
import {
  fetchDailyReturns,
  fetchPrices,
  persistPortfolio,
  retrievePortfolio,
} from "./utils/api.js";
import { computeDashboardMetrics } from "./utils/holdings.js";
import { groupTransactionsByMonth, buildTransactionTimeline } from "./utils/history.js";
import {
  buildMetricCards,
  calculateAllocationBreakdown,
  derivePerformanceHighlights,
} from "./utils/metrics.js";
import {
  buildPerformanceCsv,
  buildReportSummary,
  buildTransactionsCsv,
  buildHoldingsCsv,
  triggerCsvDownload,
} from "./utils/reports.js";
import { buildRoiSeries, mergeReturnSeries } from "./utils/roi.js";
import {
  createDefaultSettings,
  loadSettingsFromStorage,
  normalizeSettings,
  mergeSettings,
  persistSettingsToStorage,
  updateSetting,
} from "./utils/settings.js";
import { getMarketClock } from "./utils/marketHours.js";
import { loadPortfolioKey, savePortfolioKey } from "./utils/portfolioKeys.js";
import {
  createInitialLedgerState,
  ledgerReducer,
} from "./utils/holdingsLedger.js";
import { useI18n } from "./i18n/I18nProvider.jsx";
import {
  loadActivePortfolioSnapshot,
  persistActivePortfolioSnapshot,
  setActivePortfolioId,
} from "./state/portfolioStore.js";

const DashboardTab = lazy(() => import("./components/DashboardTab.jsx"));
const HoldingsTab = lazy(() => import("./components/HoldingsTab.jsx"));
const HistoryTab = lazy(() => import("./components/HistoryTab.jsx"));
const MetricsTab = lazy(() => import("./components/MetricsTab.jsx"));
const ReportsTab = lazy(() => import("./components/ReportsTab.jsx"));
const SettingsTab = lazy(() => import("./components/SettingsTab.jsx"));
const TransactionsTab = lazy(() => import("./components/TransactionsTab.jsx"));

export function LoadingFallback() {
  const { t } = useI18n();
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      <span className="text-sm text-slate-600 dark:text-slate-300">{t("loading.view")}</span>
    </div>
  );
}

const DEFAULT_TAB = "Dashboard";

export default function PortfolioManagerApp() {
  const { t, language, setLanguage, locale, formatCurrency, formatDate, formatPercent } = useI18n();
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB);
  const [portfolioId, setPortfolioId] = useState("");
  const [portfolioKey, setPortfolioKey] = useState("");
  const [portfolioKeyNew, setPortfolioKeyNew] = useState("");
  const [ledger, dispatchLedger] = useReducer(ledgerReducer, undefined, createInitialLedgerState);
  const { transactions, holdings } = ledger;
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const [signals, setSignals] = useState({});
  const [currentPrices, setCurrentPrices] = useState({});
  const [roiData, setRoiData] = useState([]);
  const [loadingRoi, setLoadingRoi] = useState(false);
  const [roiRefreshKey, setRoiRefreshKey] = useState(0);
  const [settings, setSettings] = useState(() => loadSettingsFromStorage());
  const [priceAlert, setPriceAlert] = useState(null);
  const [roiAlert, setRoiAlert] = useState(null);
  const [roiSource, setRoiSource] = useState("api");
  const [roiServiceDisabled, setRoiServiceDisabled] = useState(false);

  const dismissToast = useCallback((id) => {
    if (!id) {
      return;
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((toast) => {
    setToasts((current) => {
      const generatedId = `toast-${Date.now()}-${toastIdRef.current + 1}`;
      toastIdRef.current += 1;
      const id =
        typeof toast?.id === "string" && toast.id.trim().length > 0
          ? toast.id
          : generatedId;
      const payload = {
        id,
        type: toast?.type ?? "info",
        title: toast?.title ?? "",
        message: toast?.message ?? "",
        detail: toast?.detail,
        durationMs: toast?.durationMs,
      };
      const filtered = current.filter((entry) => entry.id !== id);
      const merged = [...filtered, payload];
      if (merged.length > 5) {
        merged.shift();
      }
      return merged;
    });
  }, []);

  useEffect(() => {
    const snapshot = loadActivePortfolioSnapshot();
    if (!snapshot || !snapshot.id) {
      return;
    }
    const normalizedId = String(snapshot.id);
    setPortfolioId(normalizedId);
    if (Array.isArray(snapshot.transactions)) {
      dispatchLedger({
        type: "replace",
        transactions: snapshot.transactions,
        logSummary: false,
      });
    }
    if (snapshot.signals && typeof snapshot.signals === "object") {
      setSignals(snapshot.signals);
    }
    if (snapshot.settings && typeof snapshot.settings === "object") {
      setSettings((previous) => mergeSettings(previous, snapshot.settings));
    }
  }, []);

  useEffect(() => {
    if (!portfolioId) {
      setPortfolioKey("");
      setPortfolioKeyNew("");
      return;
    }
    const stored = loadPortfolioKey(portfolioId);
    setPortfolioKey(stored);
    setPortfolioKeyNew("");
  }, [portfolioId]);

  const metrics = useMemo(
    () => computeDashboardMetrics(holdings, currentPrices),
    [holdings, currentPrices],
  );

  const historyMonthlyBreakdown = useMemo(
    () => groupTransactionsByMonth(transactions, { locale }),
    [transactions, locale],
  );
  const historyTimeline = useMemo(
    () =>
      buildTransactionTimeline(transactions, {
        locale,
        formatCurrency,
        translate: t,
        formatDate,
      }),
    [transactions, locale, formatCurrency, t, formatDate],
  );

  const metricCards = useMemo(
    () => buildMetricCards(metrics, { translate: t, formatCurrency, formatPercent }),
    [metrics, t, formatCurrency, formatPercent],
  );
  const allocationBreakdown = useMemo(
    () => calculateAllocationBreakdown(holdings, currentPrices),
    [holdings, currentPrices],
  );
  const performanceHighlights = useMemo(
    () => derivePerformanceHighlights(roiData, { translate: t, formatPercent, formatDate }),
    [roiData, t, formatPercent, formatDate],
  );
  const reportSummaryCards = useMemo(
    () =>
      buildReportSummary(transactions, holdings, metrics, {
        translate: t,
        formatDate,
      }),
    [transactions, holdings, metrics, t, formatDate],
  );

  const handleLanguageChange = useCallback(
    (event) => {
      const next = event.target.value;
      if (next && next !== language) {
        setLanguage(next);
      }
    },
    [language, setLanguage],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPrices() {
      if (transactions.length === 0) {
        if (!cancelled) {
          setCurrentPrices({});
          setPriceAlert(null);
        }
        return;
      }

      const uniqueTickers = [
        ...new Set(
          transactions
            .map((tx) => tx.ticker)
            .filter((ticker) => typeof ticker === "string" && ticker.trim().length > 0),
        ),
      ];

      if (uniqueTickers.length === 0) {
        if (!cancelled) {
          setCurrentPrices({});
          setPriceAlert(null);
        }
        return;
      }

      const marketClock = getMarketClock();

      const formatMarketDate = (dateKey) => {
        if (typeof dateKey !== "string" || dateKey.length === 0) {
          return t("alerts.price.marketClosed.nextSession");
        }
        const segments = dateKey.split("-");
        if (segments.length !== 3) {
          return dateKey;
        }
        const [yearRaw, monthRaw, dayRaw] = segments;
        const year = Number.parseInt(yearRaw, 10);
        const month = Number.parseInt(monthRaw, 10);
        const day = Number.parseInt(dayRaw, 10);
        if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
          return dateKey;
        }
        return formatDate(new Date(year, month - 1, day));
      };

      const priceEntries = await Promise.all(
        uniqueTickers.map(async (ticker) => {
          try {
            const { data: priceSeries, requestId } = await fetchPrices(ticker);
            const latest = priceSeries.at(-1);
            return {
              ticker,
              price: latest?.close ?? 0,
              asOf: latest?.date ?? null,
              requestId: requestId ?? null,
              error: null,
            };
          } catch (error) {
            console.error(error);
            return {
              ticker,
              price: null,
              asOf: null,
              requestId: error?.requestId ?? null,
              error,
            };
          }
        }),
      );

      if (cancelled) {
        return;
      }

      setCurrentPrices((previous) => {
        const next = {};
        for (const ticker of uniqueTickers) {
          const result = priceEntries.find((entry) => entry.ticker === ticker);
          if (result && Number.isFinite(result.price)) {
            next[ticker] = result.price;
          } else if (previous && Number.isFinite(previous[ticker])) {
            next[ticker] = previous[ticker];
          }
        }
        return next;
      });

      const failures = priceEntries.filter((entry) => entry.error);
      const successfulTickers = priceEntries
        .filter((entry) => Number.isFinite(entry.price))
        .map((entry) => entry.ticker);
      const impactedTickers = failures.length > 0 ? failures : priceEntries;
      const impactedList = Array.from(
        new Set(
          impactedTickers
            .map((entry) => entry.ticker)
            .filter((ticker) => typeof ticker === "string" && ticker.length > 0),
        ),
      );
      const requestIds = failures
        .map((entry) => entry.requestId)
        .filter((value) => typeof value === "string" && value?.trim().length > 0);

      if (!marketClock.isOpen) {
        const lastCloseLabel = formatMarketDate(marketClock.lastTradingDate);
        const nextSessionLabel = (() => {
          if (marketClock.isTradingDay && marketClock.isBeforeOpen) {
            return t("alerts.price.marketClosed.detailToday");
          }
          if (typeof marketClock.nextTradingDate === "string") {
            return formatMarketDate(marketClock.nextTradingDate);
          }
          return t("alerts.price.marketClosed.nextSession");
        })();
        const summary = impactedList.length > 0
          ? impactedList.join(", ")
          : successfulTickers.length > 0
            ? successfulTickers.join(", ")
            : t("alerts.price.marketClosed.allHoldings");
        setPriceAlert({
          id: "market-closed",
          type: failures.length > 0 ? "warning" : "info",
          message: t("alerts.price.marketClosed.title", { date: lastCloseLabel }),
          detail: t("alerts.price.marketClosed.detail", {
            tickers: summary,
            next: nextSessionLabel,
          }),
          requestIds,
        });
        return;
      }

      if (failures.length > 0) {
        setPriceAlert({
          id: "price-fetch",
          type: "error",
          message: t("alerts.price.refreshFailed.title"),
          detail: t("alerts.price.refreshFailed.detail", {
            tickers:
              impactedList.length > 0
                ? impactedList.join(", ")
                : t("alerts.price.refreshFailed.detailFallback"),
          }),
          requestIds,
        });
      } else {
        setPriceAlert(null);
      }
    }

    loadPrices();

    return () => {
      cancelled = true;
    };
  }, [transactions, t, formatDate]);

  useEffect(() => {
    let cancelled = false;

    const fallbackMessages = {
      disabled: {
        type: "info",
        message: t("alerts.roi.disabled"),
      },
      failure: {
        type: "warning",
        message: t("alerts.roi.fallback"),
      },
    };

    const resolveRequestId = (error) => {
      if (typeof error?.requestId === "string" && error.requestId.trim().length > 0) {
        return error.requestId;
      }
      return null;
    };

    async function applyRoiFallback(reason, error) {
      try {
        const fallbackSeries = await buildRoiSeries(transactions, fetchPrices);
        if (cancelled) {
          return;
        }
        setRoiData(fallbackSeries);
        setRoiSource("fallback");
        const meta = fallbackMessages[reason];
        if (meta) {
          setRoiAlert({
            id: "roi-fallback",
            type: meta.type,
            message: meta.message,
            requestId: resolveRequestId(error),
          });
        } else {
          setRoiAlert(null);
        }
      } catch (fallbackError) {
        console.error(fallbackError);
        if (cancelled) {
          return;
        }
        setRoiData([]);
        setRoiSource("error");
        setRoiAlert({
          id: "roi-fallback",
          type: "error",
          message: t("alerts.roi.unavailable"),
          requestId: resolveRequestId(error),
        });
      }
    }

    async function loadRoi() {
      if (transactions.length === 0) {
        setRoiData([]);
        setRoiAlert(null);
        setRoiSource("api");
        return;
      }

      const orderedDates = transactions
        .map((tx) => tx.date)
        .filter((date) => typeof date === "string" && date.trim().length > 0)
        .sort((a, b) => a.localeCompare(b));
      if (orderedDates.length === 0) {
        setRoiData([]);
        setRoiAlert(null);
        setRoiSource("api");
        return;
      }

      const hasSecurityTransactions = transactions.some(
        (tx) => typeof tx?.ticker === "string" && tx.ticker.trim().length > 0,
      );
      if (!hasSecurityTransactions) {
        setRoiData([]);
        setRoiAlert(null);
        setRoiSource("cash-only");
        return;
      }

      setLoadingRoi(true);
      try {
        if (roiServiceDisabled) {
          await applyRoiFallback("disabled");
          return;
        }

        const { data, requestId } = await fetchDailyReturns({
          from: orderedDates[0],
          to: orderedDates[orderedDates.length - 1],
          views: ["port", "spy", "bench", "excash", "cash"],
        });
        const mergedSeries = mergeReturnSeries(data?.series);
        if (!cancelled) {
          setRoiData(mergedSeries);
          setRoiSource("api");
          setRoiAlert(null);
          if (requestId) {
            setRoiAlert((current) =>
              current && current.id === "roi-fallback"
                ? { ...current, resolvedRequestId: requestId }
                : current,
            );
          }
        }
      } catch (error) {
        if (error?.body?.error === "CASH_BENCHMARKS_DISABLED") {
          console.warn(error);
          if (!cancelled) {
            setRoiServiceDisabled(true);
          }
          await applyRoiFallback("disabled", error);
          return;
        }

        console.error(error);
        await applyRoiFallback("failure", error);
      } finally {
        if (!cancelled) {
          setLoadingRoi(false);
        }
      }
    }

    loadRoi();

    return () => {
      cancelled = true;
    };
  }, [transactions, roiRefreshKey, roiServiceDisabled, t]);

  useEffect(() => {
    persistSettingsToStorage(settings);
  }, [settings]);

  const handleAddTransaction = useCallback((transaction) => {
    dispatchLedger({ type: "append", transaction });
  }, []);

  const handleDeleteTransaction = useCallback((indexToRemove) => {
    dispatchLedger({ type: "remove", index: indexToRemove });
  }, []);

  const handleSignalChange = useCallback((ticker, pct) => {
    const pctValue = Number.parseFloat(pct);
    if (!Number.isFinite(pctValue)) {
      return;
    }

    setSignals((prev) => ({ ...prev, [ticker]: { pct: pctValue } }));
  }, []);

  const handleSavePortfolio = useCallback(async () => {
    const normalizedId = portfolioId.trim();
    const currentKey = portfolioKey.trim();
    const nextKeyCandidate = portfolioKeyNew.trim();
    if (!normalizedId) {
      throw new Error("Portfolio ID required");
    }
    if (!currentKey) {
      throw new Error("API key required");
    }
    const normalizedSettings = normalizeSettings(settings);
    const body = {
      transactions,
      signals,
      settings: normalizedSettings,
    };
    const { requestId } = await persistPortfolio(normalizedId, body, {
      apiKey: currentKey,
      newApiKey: nextKeyCandidate || undefined,
    });
    const storedKey = nextKeyCandidate || currentKey;
    setPortfolioKey(storedKey);
    setPortfolioKeyNew("");
    savePortfolioKey(normalizedId, storedKey);
    const snapshotPersisted = persistActivePortfolioSnapshot({
      id: normalizedId,
      name: normalizedId,
      transactions,
      signals,
      settings: normalizedSettings,
      updatedAt: new Date().toISOString(),
    });
    if (snapshotPersisted) {
      setActivePortfolioId(normalizedId);
    }
    return { snapshotPersisted, requestId };
  }, [
    portfolioId,
    portfolioKey,
    portfolioKeyNew,
    transactions,
    signals,
    settings,
  ]);

  const handleLoadPortfolio = useCallback(async () => {
    const currentKey = portfolioKey.trim();
    const normalizedId = portfolioId.trim();
    if (!normalizedId) {
      throw new Error("Portfolio ID required");
    }
    if (!currentKey) {
      throw new Error("API key required");
    }
    const { data, requestId } = await retrievePortfolio(normalizedId, { apiKey: currentKey });
    dispatchLedger({
      type: "replace",
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
      logSummary: true,
    });
    setSignals(data.signals ?? {});
    setSettings((previous) => {
      const mergedSettings = mergeSettings(previous, data.settings);
      persistSettingsToStorage(mergedSettings);
      return mergedSettings;
    });
    setPortfolioKey(currentKey);
    setPortfolioKeyNew("");
    savePortfolioKey(normalizedId, currentKey);
    const normalizedSettings = normalizeSettings(data.settings ?? {});
    const snapshotPersisted = persistActivePortfolioSnapshot({
      id: normalizedId,
      name: normalizedId,
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
      signals: data.signals ?? {},
      settings: normalizedSettings,
      updatedAt: new Date().toISOString(),
    });
    if (snapshotPersisted) {
      setActivePortfolioId(normalizedId);
    }
    return { requestId, snapshotPersisted };
  }, [portfolioId, portfolioKey]);

  const handleRefreshRoi = useCallback(() => {
    setRoiRefreshKey((prev) => prev + 1);
  }, []);

  const handleExportTransactions = useCallback(() => {
    const csv = buildTransactionsCsv(transactions);
    if (csv) {
      triggerCsvDownload("portfolio-transactions.csv", csv);
    }
  }, [transactions]);

  const handleExportHoldings = useCallback(() => {
    const csv = buildHoldingsCsv(holdings, currentPrices);
    if (csv) {
      triggerCsvDownload("portfolio-holdings.csv", csv);
    }
  }, [holdings, currentPrices]);

  const handleExportPerformance = useCallback(() => {
    const csv = buildPerformanceCsv(roiData);
    if (csv) {
      triggerCsvDownload("portfolio-performance.csv", csv);
    }
  }, [roiData]);

  const handleSettingChange = useCallback((path, value) => {
    setSettings((prev) => updateSetting(prev, path, value));
  }, []);

  const handleResetSettings = useCallback(() => {
    setSettings(createDefaultSettings());
  }, []);

  const activeAlerts = useMemo(() => {
    return [priceAlert, roiAlert]
      .filter(Boolean)
      .map((alert) => {
        if (!alert) {
          return alert;
        }
        const requestDetails = (() => {
          if (Array.isArray(alert.requestIds) && alert.requestIds.length > 0) {
            return `Request IDs: ${alert.requestIds.join(", ")}`;
          }
          if (alert.requestId) {
            return `Request ID: ${alert.requestId}`;
          }
          if (alert.resolvedRequestId) {
            return `Last success request ID: ${alert.resolvedRequestId}`;
          }
          return null;
        })();
        return { ...alert, requestDetails };
      });
  }, [priceAlert, roiAlert]);

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t("app.title")}
            </h1>
            <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-400">
              {t("app.subtitle")}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
            <span>{t("app.language")}</span>
            <select
              value={language}
              onChange={handleLanguageChange}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="en">{t("app.language.english")}</option>
              <option value="es">{t("app.language.spanish")}</option>
            </select>
          </label>
        </header>

        <PortfolioControls
          portfolioId={portfolioId}
          portfolioKey={portfolioKey}
          portfolioKeyNew={portfolioKeyNew}
          onPortfolioIdChange={setPortfolioId}
          onPortfolioKeyChange={setPortfolioKey}
          onPortfolioKeyNewChange={setPortfolioKeyNew}
          onSave={handleSavePortfolio}
          onLoad={handleLoadPortfolio}
          onNotify={pushToast}
        />

        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

        <main className="pb-12">
          {activeAlerts.length > 0 && (
            <div className="mb-6 space-y-3" role="region" aria-label="System alerts">
              {activeAlerts.map((alert) => (
                <div
                  key={alert.id}
                  role="alert"
                  className={`rounded-lg border px-4 py-3 text-sm shadow ${
                    alert.type === "error"
                      ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
                      : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
                  }`}
                >
                  <p className="font-semibold">{alert.message}</p>
                  {alert.detail ? (
                    <p className="mt-1 text-sm">{alert.detail}</p>
                  ) : null}
                  {alert.requestDetails && (
                    <span className="mt-1 block font-mono text-xs">{alert.requestDetails}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <Suspense fallback={<LoadingFallback />}>
            {activeTab === "Dashboard" && (
              <section
                role="tabpanel"
                id="panel-dashboard"
                aria-labelledby="tab-dashboard"
                data-testid="panel-dashboard"
              >
                <DashboardTab
                  metrics={metrics}
                  roiData={roiData}
                  transactions={transactions}
                  loadingRoi={loadingRoi}
                  roiSource={roiSource}
                  onRefreshRoi={handleRefreshRoi}
                />
              </section>
            )}

            {activeTab === "Holdings" && (
              <section
                role="tabpanel"
                id="panel-holdings"
                aria-labelledby="tab-holdings"
                data-testid="panel-holdings"
              >
                <HoldingsTab
                  holdings={holdings}
                  currentPrices={currentPrices}
                  signals={signals}
                  onSignalChange={handleSignalChange}
                />
              </section>
            )}

            {activeTab === "Transactions" && (
              <section
                role="tabpanel"
                id="panel-transactions"
                aria-labelledby="tab-transactions"
                data-testid="panel-transactions"
              >
                <TransactionsTab
                  transactions={transactions}
                  onAddTransaction={handleAddTransaction}
                  onDeleteTransaction={handleDeleteTransaction}
                />
              </section>
            )}

            {activeTab === "History" && (
              <section
                role="tabpanel"
                id="panel-history"
                aria-labelledby="tab-history"
                data-testid="panel-history"
              >
                <HistoryTab
                  monthlyBreakdown={historyMonthlyBreakdown}
                  timeline={historyTimeline}
                />
              </section>
            )}

            {activeTab === "Metrics" && (
              <section
                role="tabpanel"
                id="panel-metrics"
                aria-labelledby="tab-metrics"
                data-testid="panel-metrics"
              >
                <MetricsTab
                  metricCards={metricCards}
                  allocations={allocationBreakdown}
                  performance={performanceHighlights}
                />
              </section>
            )}

            {activeTab === "Reports" && (
              <section
                role="tabpanel"
                id="panel-reports"
                aria-labelledby="tab-reports"
                data-testid="panel-reports"
              >
                <ReportsTab
                  summaryCards={reportSummaryCards}
                  onExportTransactions={handleExportTransactions}
                  onExportHoldings={handleExportHoldings}
                  onExportPerformance={handleExportPerformance}
                />
              </section>
            )}

            {activeTab === "Settings" && (
              <section
                role="tabpanel"
                id="panel-settings"
                aria-labelledby="tab-settings"
                data-testid="panel-settings"
              >
                <SettingsTab
                  settings={settings}
                  onSettingChange={handleSettingChange}
                  onReset={handleResetSettings}
                />
              </section>
            )}

          </Suspense>
        </main>
      </div>
    </div>
  );
}
