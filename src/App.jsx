import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import PortfolioControls from "./components/PortfolioControls.jsx";
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
  persistSettingsToStorage,
  updateSetting,
} from "./utils/settings.js";
import { loadPortfolioKey, savePortfolioKey } from "./utils/portfolioKeys.js";
import {
  createInitialLedgerState,
  ledgerReducer,
} from "./utils/holdingsLedger.js";

const DashboardTab = lazy(() => import("./components/DashboardTab.jsx"));
const HoldingsTab = lazy(() => import("./components/HoldingsTab.jsx"));
const HistoryTab = lazy(() => import("./components/HistoryTab.jsx"));
const MetricsTab = lazy(() => import("./components/MetricsTab.jsx"));
const ReportsTab = lazy(() => import("./components/ReportsTab.jsx"));
const SettingsTab = lazy(() => import("./components/SettingsTab.jsx"));
const TransactionsTab = lazy(() => import("./components/TransactionsTab.jsx"));
const AdminTab = lazy(() => import("./components/AdminTab.jsx"));

function LoadingFallback() {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      <span className="text-sm text-slate-600 dark:text-slate-300">Loading view…</span>
    </div>
  );
}

const DEFAULT_TAB = "Dashboard";

export default function App() {
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB);
  const [portfolioId, setPortfolioId] = useState("");
  const [portfolioKey, setPortfolioKey] = useState("");
  const [portfolioKeyNew, setPortfolioKeyNew] = useState("");
  const [ledger, dispatchLedger] = useReducer(ledgerReducer, undefined, createInitialLedgerState);
  const { transactions, holdings } = ledger;
  const [signals, setSignals] = useState({});
  const [currentPrices, setCurrentPrices] = useState({});
  const [roiData, setRoiData] = useState([]);
  const [loadingRoi, setLoadingRoi] = useState(false);
  const [roiRefreshKey, setRoiRefreshKey] = useState(0);
  const [settings, setSettings] = useState(() => loadSettingsFromStorage());
  const [priceAlert, setPriceAlert] = useState(null);
  const [roiAlert, setRoiAlert] = useState(null);
  const [roiSource, setRoiSource] = useState("api");

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
    () => groupTransactionsByMonth(transactions),
    [transactions],
  );
  const historyTimeline = useMemo(
    () => buildTransactionTimeline(transactions),
    [transactions],
  );

  const metricCards = useMemo(() => buildMetricCards(metrics), [metrics]);
  const allocationBreakdown = useMemo(
    () => calculateAllocationBreakdown(holdings, currentPrices),
    [holdings, currentPrices],
  );
  const performanceHighlights = useMemo(
    () => derivePerformanceHighlights(roiData),
    [roiData],
  );
  const reportSummaryCards = useMemo(
    () => buildReportSummary(transactions, holdings, metrics),
    [transactions, holdings, metrics],
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

      const priceEntries = await Promise.all(
        uniqueTickers.map(async (ticker) => {
          try {
            const { data: priceSeries, requestId } = await fetchPrices(ticker);
            const latest = priceSeries.at(-1);
            return {
              ticker,
              price: latest?.close ?? 0,
              requestId: requestId ?? null,
              error: null,
            };
          } catch (error) {
            console.error(error);
            return {
              ticker,
              price: null,
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
      if (failures.length > 0) {
        const impacted = failures
          .map((entry) => entry.ticker)
          .filter((ticker) => typeof ticker === "string" && ticker.length > 0);
        const requestIds = failures
          .map((entry) => entry.requestId)
          .filter((value) => typeof value === "string" && value.length > 0);
        const impactedList = impacted.length > 0 ? impacted.join(", ") : "selected holdings";
        setPriceAlert({
          id: "price-fetch",
          type: "error",
          message: "Price refresh failed",
          detail: `Unable to update prices for ${impactedList}. Showing last known values until the next successful refresh.`,
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
  }, [transactions]);

  useEffect(() => {
    let cancelled = false;

    async function loadRoi() {
      if (transactions.length === 0) {
        setRoiData([]);
        return;
      }

      const orderedDates = transactions
        .map((tx) => tx.date)
        .filter((date) => typeof date === "string" && date.trim().length > 0)
        .sort((a, b) => a.localeCompare(b));
      if (orderedDates.length === 0) {
        setRoiData([]);
        return;
      }

      setLoadingRoi(true);
      try {
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
        console.error(error);
        try {
          const fallbackSeries = await buildRoiSeries(transactions, fetchPrices);
          if (!cancelled) {
            setRoiData(fallbackSeries);
            setRoiSource("fallback");
            const requestId = error?.requestId;
            setRoiAlert({
              id: "roi-fallback",
              type: "warning",
              message: "ROI service failed. Displaying locally computed fallback data.",
              requestId: typeof requestId === "string" && requestId.length > 0 ? requestId : null,
            });
          }
        } catch (fallbackError) {
          console.error(fallbackError);
          if (!cancelled) {
            setRoiData([]);
            setRoiSource("error");
            setRoiAlert({
              id: "roi-fallback",
              type: "error",
              message: "ROI service and fallback computation failed. Try again after reloading the page.",
              requestId: error?.requestId ?? null,
            });
          }
        }
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
  }, [transactions, roiRefreshKey]);

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
    const currentKey = portfolioKey.trim();
    const nextKeyCandidate = portfolioKeyNew.trim();
    if (!portfolioId) {
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
    await persistPortfolio(portfolioId, body, {
      apiKey: currentKey,
      newApiKey: nextKeyCandidate || undefined,
    });
    const storedKey = nextKeyCandidate || currentKey;
    setPortfolioKey(storedKey);
    setPortfolioKeyNew("");
    savePortfolioKey(portfolioId, storedKey);
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
    if (!portfolioId) {
      throw new Error("Portfolio ID required");
    }
    if (!currentKey) {
      throw new Error("API key required");
    }
    const { data } = await retrievePortfolio(portfolioId, { apiKey: currentKey });
    dispatchLedger({
      type: "replace",
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
      logSummary: true,
    });
    setSignals(data.signals ?? {});
    const normalizedSettings = normalizeSettings(data.settings);
    setSettings(normalizedSettings);
    persistSettingsToStorage(normalizedSettings);
    setPortfolioKey(currentKey);
    setPortfolioKeyNew("");
    savePortfolioKey(portfolioId, currentKey);
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
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Portfolio Manager
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Monitor your assets, manage trades, and benchmark performance across
            dedicated views.
          </p>
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

            {activeTab === "Admin" && (
              <section
                role="tabpanel"
                id="panel-admin"
                aria-labelledby="tab-admin"
                data-testid="panel-admin"
              >
                <AdminTab />
              </section>
            )}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
