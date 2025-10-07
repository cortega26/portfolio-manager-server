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
  const [portfolioSettings, setPortfolioSettings] = useState({ autoClip: false });
  const [currentPrices, setCurrentPrices] = useState({});
  const [roiData, setRoiData] = useState([]);
  const [loadingRoi, setLoadingRoi] = useState(false);
  const [roiRefreshKey, setRoiRefreshKey] = useState(0);
  const [settings, setSettings] = useState(() => loadSettingsFromStorage());

  useEffect(() => {
    if (!portfolioId) {
      setPortfolioKey("");
      setPortfolioKeyNew("");
      setPortfolioSettings({ autoClip: false });
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
        setCurrentPrices({});
        return;
      }

      const uniqueTickers = [...new Set(transactions.map((tx) => tx.ticker))];
      const priceEntries = await Promise.all(
        uniqueTickers.map(async (ticker) => {
          try {
            const { data: priceSeries } = await fetchPrices(ticker);
            const latest = priceSeries.at(-1);
            return [ticker, latest?.close ?? 0];
          } catch (error) {
            console.error(error);
            return [ticker, 0];
          }
        }),
      );

      if (!cancelled) {
        setCurrentPrices(Object.fromEntries(priceEntries));
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
        const { data } = await fetchDailyReturns({
          from: orderedDates[0],
          to: orderedDates[orderedDates.length - 1],
          views: ["port", "spy", "bench", "excash", "cash"],
        });
        const mergedSeries = mergeReturnSeries(data?.series);
        if (!cancelled) {
          setRoiData(mergedSeries);
        }
      } catch (error) {
        console.error(error);
        try {
          const fallbackSeries = await buildRoiSeries(transactions, fetchPrices);
          if (!cancelled) {
            setRoiData(fallbackSeries);
          }
        } catch (fallbackError) {
          console.error(fallbackError);
          if (!cancelled) {
            setRoiData([]);
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
    const body = {
      transactions,
      signals,
      settings: { autoClip: Boolean(portfolioSettings.autoClip) },
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
    portfolioSettings,
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
    if (data.settings) {
      setPortfolioSettings({ autoClip: Boolean(data.settings.autoClip) });
    } else {
      setPortfolioSettings({ autoClip: false });
    }
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

  const handlePortfolioSettingChange = useCallback((autoClipValue) => {
    setPortfolioSettings((prev) => ({
      ...prev,
      autoClip: Boolean(autoClipValue),
    }));
  }, []);

  const handleResetSettings = useCallback(() => {
    setSettings(createDefaultSettings());
    setPortfolioSettings({ autoClip: false });
  }, []);

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
          <Suspense fallback={<LoadingFallback />}>
            {activeTab === "Dashboard" && (
              <DashboardTab
                metrics={metrics}
                roiData={roiData}
                loadingRoi={loadingRoi}
                onRefreshRoi={handleRefreshRoi}
              />
            )}

            {activeTab === "Holdings" && (
              <HoldingsTab
                holdings={holdings}
                currentPrices={currentPrices}
                signals={signals}
                onSignalChange={handleSignalChange}
              />
            )}

            {activeTab === "Transactions" && (
              <TransactionsTab
                transactions={transactions}
                onAddTransaction={handleAddTransaction}
                onDeleteTransaction={handleDeleteTransaction}
              />
            )}

            {activeTab === "History" && (
              <HistoryTab
                monthlyBreakdown={historyMonthlyBreakdown}
                timeline={historyTimeline}
              />
            )}

            {activeTab === "Metrics" && (
              <MetricsTab
                metricCards={metricCards}
                allocations={allocationBreakdown}
                performance={performanceHighlights}
              />
            )}

            {activeTab === "Reports" && (
              <ReportsTab
                summaryCards={reportSummaryCards}
                onExportTransactions={handleExportTransactions}
                onExportHoldings={handleExportHoldings}
                onExportPerformance={handleExportPerformance}
              />
            )}

            {activeTab === "Settings" && (
              <SettingsTab
                settings={settings}
                onSettingChange={handleSettingChange}
                onReset={handleResetSettings}
                portfolioSettings={portfolioSettings}
                onPortfolioSettingChange={handlePortfolioSettingChange}
              />
            )}

            {activeTab === "Admin" && <AdminTab />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
