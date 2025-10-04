import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardTab from "./components/DashboardTab.jsx";
import HoldingsTab from "./components/HoldingsTab.jsx";
import HistoryTab from "./components/HistoryTab.jsx";
import MetricsTab from "./components/MetricsTab.jsx";
import PortfolioControls from "./components/PortfolioControls.jsx";
import ReportsTab from "./components/ReportsTab.jsx";
import SettingsTab from "./components/SettingsTab.jsx";
import TabBar from "./components/TabBar.jsx";
import TransactionsTab from "./components/TransactionsTab.jsx";
import {
  fetchPrices,
  persistPortfolio,
  retrievePortfolio,
} from "./utils/api.js";
import {
  buildHoldings,
  computeDashboardMetrics,
} from "./utils/holdings.js";
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
import { buildRoiSeries } from "./utils/roi.js";
import {
  createDefaultSettings,
  loadSettingsFromStorage,
  persistSettingsToStorage,
  updateSetting,
} from "./utils/settings.js";

const DEFAULT_TAB = "Dashboard";

export default function App() {
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB);
  const [portfolioId, setPortfolioId] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [signals, setSignals] = useState({});
  const [currentPrices, setCurrentPrices] = useState({});
  const [roiData, setRoiData] = useState([]);
  const [loadingRoi, setLoadingRoi] = useState(false);
  const [roiRefreshKey, setRoiRefreshKey] = useState(0);
  const [settings, setSettings] = useState(() => loadSettingsFromStorage());

  const holdings = useMemo(() => buildHoldings(transactions), [transactions]);
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
            const data = await fetchPrices(ticker);
            const latest = data.at(-1);
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

      setLoadingRoi(true);
      try {
        const series = await buildRoiSeries(transactions, fetchPrices);
        if (!cancelled) {
          setRoiData(series);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setRoiData([]);
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
    setTransactions((prev) => [...prev, transaction]);
  }, []);

  const handleDeleteTransaction = useCallback((indexToRemove) => {
    setTransactions((prev) =>
      prev.filter((_, index) => index !== indexToRemove),
    );
  }, []);

  const handleSignalChange = useCallback((ticker, pct) => {
    const pctValue = Number.parseFloat(pct);
    if (!Number.isFinite(pctValue)) {
      return;
    }

    setSignals((prev) => ({ ...prev, [ticker]: { pct: pctValue } }));
  }, []);

  const handleSavePortfolio = useCallback(async () => {
    const body = { transactions, signals };
    await persistPortfolio(portfolioId, body);
  }, [portfolioId, transactions, signals]);

  const handleLoadPortfolio = useCallback(async () => {
    const data = await retrievePortfolio(portfolioId);
    if (Array.isArray(data.transactions)) {
      setTransactions(data.transactions);
    }
    if (data.signals) {
      setSignals(data.signals);
    }
  }, [portfolioId]);

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
          onPortfolioIdChange={setPortfolioId}
          onSave={handleSavePortfolio}
          onLoad={handleLoadPortfolio}
        />

        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

        <main className="pb-12">
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
            />
          )}
        </main>
      </div>
    </div>
  );
}
