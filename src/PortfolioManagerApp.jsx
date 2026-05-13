import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import AppHeader from './components/AppHeader.jsx';
import SystemAlerts from './components/SystemAlerts.jsx';
import TabPanel from './components/TabPanel.jsx';
import DesktopSessionGate from './components/DesktopSessionGate.jsx';
import PortfolioControls from './components/PortfolioControls.jsx';
import ToastStack from './components/ToastStack.jsx';
import TabBar from './components/TabBar.jsx';
import {
  fetchBenchmarkCatalog,
  fetchBulkPrices,
  persistPortfolio,
  retrievePortfolio,
} from './utils/api.js';
import { computeDashboardMetrics, filterOpenHoldings } from './utils/holdings.js';
import { groupTransactionsByMonth, buildTransactionTimeline } from './utils/history.js';
import {
  buildMetricCards,
  calculateAllocationBreakdown,
  derivePerformanceHighlights,
} from './utils/metrics.js';
import {
  buildPerformanceCsv,
  buildReportSummary,
  buildTransactionsCsv,
  buildHoldingsCsv,
  triggerCsvDownload,
} from './utils/reports.js';
import { getFallbackBenchmarkCatalog, normalizeBenchmarkCatalogResponse } from './utils/roi.js';
import {
  buildPriceBoardRows,
  extractQuotesState,
  isUsablePricingResolution,
  mergePricingSymbolMetadata,
  normalizePricingResolutionStatus,
  normalizeTickerSymbol,
} from './utils/portfolioManagerApp.js';
import {
  createDefaultSettings,
  loadSettingsFromStorage,
  normalizeSettings,
  mergeSettings,
  persistSettingsToStorage,
  updateSetting,
} from './utils/settings.js';
import useDebouncedValue from './hooks/useDebouncedValue.js';
import useSystemAlerts from './hooks/useSystemAlerts.js';
import usePerformanceData from './hooks/usePerformanceData.js';
import useToasts from './hooks/useToasts.js';
import useDesktopSession from './hooks/useDesktopSession.js';
import useSignalPreview from './hooks/useSignalPreview.js';
import { usePortfolioMetrics } from './hooks/usePortfolioMetrics.js';
import { createInitialLedgerState, ledgerReducer } from './utils/holdingsLedger.js';
import { useI18n } from './i18n/I18nProvider.jsx';
import { setActivePortfolioId } from './utils/activePortfolioStorage.js';
import { getRuntimeConfigSync } from './lib/runtimeConfig.js';
import { getMarketClock } from './utils/marketHours.js';
import { resolveFlags, getFlag } from './lib/featureFlags.js';

const DEFAULT_TAB = 'Dashboard';

export default function PortfolioManagerApp() {
  const {
    t,
    language,
    setLanguage,
    locale,
    formatCurrency,
    formatNumber,
    formatDate,
    formatPercent,
    setCurrencyOverride,
  } = useI18n();
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB);
  const runtimeConfig = getRuntimeConfigSync();
  const applyLoadedPortfolioRef = useRef(null);
  const pushToastRef = useRef(null);

  const {
    sessionLocked: desktopSessionLocked,
    sessionLoading: desktopSessionLoading,
    sessionSubmitting: desktopSessionSubmitting,
    sessionError: desktopSessionError,
    setSessionError: setDesktopSessionError,
    portfolios: desktopPortfolios,
    selectedPortfolioId: desktopSelectedPortfolioId,
    setSelectedPortfolioId: setDesktopSelectedPortfolioId,
    pin: desktopPin,
    setPin: setDesktopPin,
    pinConfirm: desktopPinConfirm,
    setPinConfirm: setDesktopPinConfirm,
    desktopRequiresPinSetup,
    unlockSession: unlockDesktopSession,
    recoverFromPortfolioLoadError,
    portfolioId,
    setPortfolioId,
  } = useDesktopSession({ applyLoadedPortfolioRef, pushToastRef, t });
  const [ledger, dispatchLedger] = useReducer(ledgerReducer, undefined, createInitialLedgerState);
  const { transactions, holdings } = ledger;
  const [settings, setSettings] = useState(() => loadSettingsFromStorage());
  const { toasts, dismissToast, pushToast } = useToasts(settings);
  pushToastRef.current = pushToast;

  const pushAlertsEnabled = settings?.notifications?.push !== false;
  const signalTransitionAlertsEnabled =
    pushAlertsEnabled && settings?.notifications?.signalTransitions !== false;
  const marketStatusAlertsEnabled = settings?.alerts?.marketStatus !== false;
  const roiFallbackAlertsEnabled = settings?.alerts?.roiFallback !== false;
  const selectedCurrency = settings?.display?.currency ?? '';
  const refreshIntervalMinutes = Number(settings?.display?.refreshInterval ?? 0);
  const compactTables = Boolean(settings?.display?.compactTables);

  const openHoldings = useMemo(() => filterOpenHoldings(holdings), [holdings]);
  const debouncedOpenHoldings = useDebouncedValue(openHoldings, 200);

  const {
    signals,
    setSignals,
    signalRows,
    currentPrices,
    setCurrentPrices,
    signalPricingMeta,
    signalPriceAsOfByTicker,
    trackedPriceRefreshReady,
    priceAlert,
    handleSignalChange,
  } = useSignalPreview({
    debouncedOpenHoldings,
    transactions,
    formatCurrency,
    formatDate,
    marketStatusAlertsEnabled,
    signalTransitionAlertsEnabled,
    pushToast,
    t,
  });

  const trackedPricesRefreshInFlightRef = useRef(false);
  const isMountedRef = useRef(false);
  const [benchmarkCatalog, setBenchmarkCatalog] = useState(() => getFallbackBenchmarkCatalog());
  const [pricesTabState, setPricesTabState] = useState({
    loading: false,
    quotes: {},
    errors: {},
    metadata: {},
    requestId: null,
    version: null,
    lastUpdatedAt: null,
  });

  const {
    roiData,
    roiMeta,
    roiSource,
    roiAlert,
    loadingRoi,
    benchmarkSummary,
    returnsSummary,
    navDaily,
    refreshRoi,
  } = usePerformanceData({
    portfolioId,
    transactions,
    roiFallbackAlertsEnabled,
    t,
  });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const schedulerStatus = {
    active:
      typeof runtimeConfig?.JOB_NIGHTLY_ACTIVE === 'boolean'
        ? runtimeConfig.JOB_NIGHTLY_ACTIVE
        : null,
    hourUtc: Number.isInteger(runtimeConfig?.JOB_NIGHTLY_HOUR_UTC)
      ? runtimeConfig.JOB_NIGHTLY_HOUR_UTC
      : null,
  };

  const historyMonthlyBreakdown = useMemo(
    () => groupTransactionsByMonth(transactions, { locale }),
    [transactions, locale]
  );
  const historyTimeline = useMemo(
    () =>
      buildTransactionTimeline(transactions, {
        locale,
        formatCurrency,
        formatNumber,
        translate: t,
        formatDate,
      }),
    [transactions, locale, formatCurrency, formatNumber, t, formatDate]
  );

  const holdingValuationByTicker = useMemo(() => {
    const latestSymbols = pricesTabState.metadata?.symbols ?? {};
    const mergedMeta = mergePricingSymbolMetadata(signalPricingMeta, latestSymbols);
    return Object.fromEntries(
      openHoldings
        .map((holding) => normalizeTickerSymbol(holding?.ticker))
        .filter(Boolean)
        .map((ticker) => {
          const meta = mergedMeta[ticker] ?? null;
          const price = Number(currentPrices?.[ticker]);
          const status = normalizePricingResolutionStatus(meta?.status);
          const usableStatus = isUsablePricingResolution(status);
          const hasPrice = Number.isFinite(price) && price > 0;
          return [
            ticker,
            {
              price: hasPrice ? price : null,
              asOf: meta?.asOf ?? signalPriceAsOfByTicker[ticker] ?? null,
              status: status || (hasPrice ? 'cache_fresh' : 'unavailable'),
              available: hasPrice && (usableStatus || !status),
              estimated: status ? status !== 'live' : hasPrice,
            },
          ];
        })
    );
  }, [
    currentPrices,
    openHoldings,
    pricesTabState.metadata,
    signalPriceAsOfByTicker,
    signalPricingMeta,
  ]);
  const metrics = useMemo(
    () => computeDashboardMetrics(holdings, currentPrices, holdingValuationByTicker),
    [currentPrices, holdingValuationByTicker, holdings]
  );
  const metricCards = useMemo(
    () => buildMetricCards(metrics, { translate: t, formatCurrency, formatPercent }),
    [metrics, t, formatCurrency, formatPercent]
  );
  const trackedPriceSymbols = useMemo(() => {
    const holdingsSymbols = openHoldings
      .map((holding) => normalizeTickerSymbol(holding?.ticker))
      .filter(Boolean);
    const benchmarkSymbols = normalizeBenchmarkCatalogResponse(benchmarkCatalog)
      .priceSymbols.map((symbol) => normalizeTickerSymbol(symbol))
      .filter(Boolean);
    return Array.from(new Set([...holdingsSymbols, ...benchmarkSymbols]));
  }, [benchmarkCatalog, openHoldings]);
  const priceBoardRows = useMemo(
    () =>
      buildPriceBoardRows({
        holdings: openHoldings,
        benchmarkCatalog,
        latestQuotes: pricesTabState.quotes,
        latestErrors: pricesTabState.errors,
        latestMeta: pricesTabState.metadata?.symbols,
        fallbackPrices: currentPrices,
        fallbackAsOf: signalPriceAsOfByTicker,
        translate: t,
      }),
    [
      benchmarkCatalog,
      currentPrices,
      openHoldings,
      pricesTabState.errors,
      pricesTabState.metadata,
      pricesTabState.quotes,
      signalPriceAsOfByTicker,
      t,
    ]
  );
  const allocationBreakdown = useMemo(
    () => calculateAllocationBreakdown(openHoldings, currentPrices),
    [openHoldings, currentPrices]
  );
  const performanceHighlights = useMemo(
    () => derivePerformanceHighlights(roiData, { translate: t, formatPercent, formatDate }),
    [roiData, t, formatPercent, formatDate]
  );
  const portfolioSummary = usePortfolioMetrics({ metrics, transactions, roiData });
  const reportSummaryCards = useMemo(
    () =>
      buildReportSummary(transactions, openHoldings, metrics, {
        translate: t,
        formatDate,
      }),
    [transactions, openHoldings, metrics, t, formatDate]
  );

  useEffect(() => {
    if (typeof setCurrencyOverride !== 'function') {
      return;
    }
    if (typeof selectedCurrency === 'string' && selectedCurrency.trim().length > 0) {
      setCurrencyOverride(selectedCurrency.trim());
    } else {
      setCurrencyOverride(null);
    }
  }, [selectedCurrency, setCurrencyOverride]);

  useEffect(() => {
    if (!Number.isFinite(refreshIntervalMinutes) || refreshIntervalMinutes <= 0) {
      return undefined;
    }
    const intervalMs = Math.max(1, refreshIntervalMinutes) * 60 * 1000;
    const timerId = setInterval(() => {
      refreshRoi();
    }, intervalMs);
    return () => {
      clearInterval(timerId);
    };
  }, [refreshIntervalMinutes, refreshRoi]);

  useEffect(() => {
    let cancelled = false;

    async function loadBenchmarkMetadata() {
      try {
        const { data } = await fetchBenchmarkCatalog();
        if (!cancelled) {
          setBenchmarkCatalog(normalizeBenchmarkCatalogResponse(data));
        }
      } catch (error) {
        console.warn('Failed to load benchmark catalog; using fallback metadata', error);
        if (!cancelled) {
          setBenchmarkCatalog(getFallbackBenchmarkCatalog());
        }
      }
    }

    loadBenchmarkMetadata();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshTrackedPrices = useCallback(
    async ({ signal } = {}) => {
      if (trackedPriceSymbols.length === 0) {
        setPricesTabState({
          loading: false,
          quotes: {},
          errors: {},
          metadata: {},
          requestId: null,
          version: null,
          lastUpdatedAt: null,
        });
        return;
      }

      if (trackedPricesRefreshInFlightRef.current) {
        return;
      }

      trackedPricesRefreshInFlightRef.current = true;
      setPricesTabState((previous) => ({ ...previous, loading: true }));
      try {
        const response = await fetchBulkPrices(trackedPriceSymbols, {
          latestOnly: true,
          signal,
        });
        if (signal?.aborted || !isMountedRef.current) {
          return;
        }
        const {
          series = new Map(),
          errors = {},
          metadata = {},
          requestId = null,
          version = null,
        } = response ?? {};
        const nextQuotes = extractQuotesState(series, trackedPriceSymbols);

        setPricesTabState({
          loading: false,
          quotes: nextQuotes,
          errors,
          metadata,
          requestId,
          version,
          lastUpdatedAt: new Date().toISOString(),
        });

        setCurrentPrices((previous) => {
          const next = { ...previous };
          for (const holding of openHoldings) {
            const symbol = normalizeTickerSymbol(holding?.ticker);
            const latestQuote = nextQuotes[symbol];
            if (symbol && latestQuote) {
              next[symbol] = latestQuote.price;
            }
          }
          return next;
        });
      } catch (error) {
        if (signal?.aborted || !isMountedRef.current) {
          return;
        }
        console.error('Failed to refresh tracked prices', error);
        setPricesTabState((previous) => ({
          ...previous,
          loading: false,
          requestId:
            typeof error?.requestId === 'string' && error.requestId.trim().length > 0
              ? error.requestId.trim()
              : previous.requestId,
          version:
            typeof error?.version === 'string' && error.version.trim().length > 0
              ? error.version.trim()
              : previous.version,
        }));
      } finally {
        trackedPricesRefreshInFlightRef.current = false;
      }
    },
    [openHoldings, setCurrentPrices, trackedPriceSymbols]
  );

  useEffect(() => {
    if (
      !trackedPriceRefreshReady ||
      trackedPriceSymbols.length === 0 ||
      !Number.isFinite(refreshIntervalMinutes) ||
      refreshIntervalMinutes <= 0
    ) {
      return undefined;
    }

    const controller = new AbortController();
    const intervalMs = Math.max(1, refreshIntervalMinutes) * 60 * 1000;

    const refreshDuringLiveSession = () => {
      const market = getMarketClock();
      if (!market.isOpen && !market.isExtendedHours) {
        return;
      }
      void refreshTrackedPrices({ signal: controller.signal });
    };

    refreshDuringLiveSession();
    const timerId = setInterval(refreshDuringLiveSession, intervalMs);

    return () => {
      controller.abort();
      clearInterval(timerId);
    };
  }, [
    refreshIntervalMinutes,
    refreshTrackedPrices,
    trackedPriceRefreshReady,
    trackedPriceSymbols.length,
  ]);

  useEffect(() => {
    const market = getMarketClock();
    if (market.isOpen || market.isExtendedHours || trackedPriceSymbols.length === 0) {
      return undefined;
    }

    const controller = new AbortController();

    async function preloadAfterHoursQuotes() {
      try {
        const response = await fetchBulkPrices(trackedPriceSymbols, {
          latestOnly: true,
          signal: controller.signal,
        });
        const {
          series = new Map(),
          errors = {},
          metadata = {},
          requestId = null,
          version = null,
        } = response ?? {};
        if (controller.signal.aborted || !isMountedRef.current) {
          return;
        }

        const nextQuotes = extractQuotesState(series, trackedPriceSymbols);

        setPricesTabState((previous) => ({
          ...previous,
          quotes: Object.keys(nextQuotes).length > 0 ? nextQuotes : previous.quotes,
          errors,
          metadata,
          requestId: requestId ?? previous.requestId,
          version: version ?? previous.version,
          lastUpdatedAt: new Date().toISOString(),
        }));

        setCurrentPrices((previous) => {
          const next = { ...previous };
          for (const holding of openHoldings) {
            const symbol = normalizeTickerSymbol(holding?.ticker);
            const latestQuote = nextQuotes[symbol];
            if (symbol && latestQuote) {
              next[symbol] = latestQuote.price;
            }
          }
          return next;
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Failed to preload after-hours tracked prices', error);
        }
      }
    }

    void preloadAfterHoursQuotes();

    return () => {
      controller.abort();
    };
  }, [openHoldings, setCurrentPrices, trackedPriceSymbols]);

  useEffect(() => {
    if (activeTab !== 'Prices') {
      return undefined;
    }
    const controller = new AbortController();
    void refreshTrackedPrices({ signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [activeTab, refreshTrackedPrices]);

  useEffect(() => {
    persistSettingsToStorage(settings);
  }, [settings]);

  const handleAddTransaction = useCallback((transaction) => {
    dispatchLedger({ type: 'append', transaction });
  }, []);

  const handleDeleteTransaction = useCallback((indexToRemove) => {
    dispatchLedger({ type: 'remove', index: indexToRemove });
  }, []);

  const handleSavePortfolio = useCallback(async () => {
    const normalizedId = portfolioId.trim();
    if (!normalizedId) {
      throw new Error('Portfolio ID required');
    }
    const normalizedSettings = normalizeSettings(settings);
    const body = {
      transactions,
      signals,
      settings: normalizedSettings,
    };
    const { requestId } = await persistPortfolio(normalizedId, body);
    setActivePortfolioId(normalizedId);
    return { requestId };
  }, [portfolioId, transactions, signals, settings]);

  const applyLoadedPortfolio = useCallback(
    (data, normalizedId) => {
      dispatchLedger({
        type: 'replace',
        transactions: Array.isArray(data?.transactions) ? data.transactions : [],
        logSummary: true,
      });
      setSignals(data?.signals ?? {});
      setSettings((previous) => {
        const mergedSettings = mergeSettings(previous, data?.settings);
        persistSettingsToStorage(mergedSettings);
        return mergedSettings;
      });
      setActivePortfolioId(normalizedId);
    },
    [setSignals]
  );
  applyLoadedPortfolioRef.current = applyLoadedPortfolio;

  const handleLoadPortfolio = useCallback(async () => {
    const normalizedId = portfolioId.trim();
    if (!normalizedId) {
      throw new Error('Portfolio ID required');
    }
    try {
      const { data, requestId } = await retrievePortfolio(normalizedId);
      applyLoadedPortfolio(data, normalizedId);
      return { requestId };
    } catch (error) {
      recoverFromPortfolioLoadError(error, normalizedId);
      throw error;
    }
  }, [applyLoadedPortfolio, portfolioId, recoverFromPortfolioLoadError]);

  const handleExportTransactions = useCallback(() => {
    const csv = buildTransactionsCsv(transactions);
    if (csv) {
      triggerCsvDownload('portfolio-transactions.csv', csv);
    }
  }, [transactions]);

  const handleExportHoldings = useCallback(() => {
    const csv = buildHoldingsCsv(openHoldings, currentPrices);
    if (csv) {
      triggerCsvDownload('portfolio-holdings.csv', csv);
    }
  }, [openHoldings, currentPrices]);

  const handleExportPerformance = useCallback(() => {
    const csv = buildPerformanceCsv(roiData);
    if (csv) {
      triggerCsvDownload('portfolio-performance.csv', csv);
    }
  }, [roiData]);

  const handleSettingChange = useCallback((path, value) => {
    setSettings((prev) => updateSetting(prev, path, value));
  }, []);

  const handleResetSettings = useCallback(() => {
    setSettings(createDefaultSettings());
  }, []);

  const activeAlerts = useSystemAlerts(priceAlert, roiAlert);

  if (desktopSessionLocked) {
    return (
      <DesktopSessionGate
        portfolios={desktopPortfolios}
        selectedPortfolioId={desktopSelectedPortfolioId}
        onPortfolioChange={(nextPortfolioId) => {
          setDesktopSelectedPortfolioId(nextPortfolioId);
          setDesktopPin('');
          setDesktopPinConfirm('');
          setDesktopSessionError('');
        }}
        pin={desktopPin}
        onPinChange={(value) => {
          setDesktopPin(value);
          setDesktopSessionError('');
        }}
        pinConfirm={desktopPinConfirm}
        onPinConfirmChange={(value) => {
          setDesktopPinConfirm(value);
          setDesktopSessionError('');
        }}
        loading={desktopSessionLoading}
        submitting={desktopSessionSubmitting}
        requiresPinSetup={desktopRequiresPinSetup}
        error={desktopSessionError}
        onSubmit={unlockDesktopSession}
      />
    );
  }

  return (
    <div
      className={`min-h-screen bg-slate-100 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100${compactTables ? ' compact-tables' : ''}`}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        <AppHeader language={language} onLanguageChange={setLanguage} />

        <PortfolioControls
          portfolioId={portfolioId}
          onPortfolioIdChange={setPortfolioId}
          onSave={handleSavePortfolio}
          onLoad={handleLoadPortfolio}
          onNotify={pushToast}
        />

        <TabBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          showTodayTab={getFlag(resolveFlags(), 'redesign.todayShell')}
        />

        <main className="pb-12">
          <SystemAlerts alerts={activeAlerts} />
          <div key={activeTab} className="animate-slide-up">
            <TabPanel
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              portfolioId={portfolioId}
              metrics={metrics}
              roiData={roiData}
              benchmarkSummary={benchmarkSummary}
              returnsSummary={returnsSummary}
              navDaily={navDaily}
              transactions={transactions}
              loadingRoi={loadingRoi}
              roiSource={roiSource}
              roiMeta={roiMeta}
              benchmarkCatalog={benchmarkCatalog}
              openHoldings={openHoldings}
              currentPrices={currentPrices}
              signals={signals}
              signalRows={signalRows}
              compactTables={compactTables}
              handleRefreshRoi={refreshRoi}
              handleSignalChange={handleSignalChange}
              handleAddTransaction={handleAddTransaction}
              handleDeleteTransaction={handleDeleteTransaction}
              priceBoardRows={priceBoardRows}
              portfolioSummary={portfolioSummary}
              pricesTabState={pricesTabState}
              refreshTrackedPrices={refreshTrackedPrices}
              historyMonthlyBreakdown={historyMonthlyBreakdown}
              historyTimeline={historyTimeline}
              metricCards={metricCards}
              allocationBreakdown={allocationBreakdown}
              performanceHighlights={performanceHighlights}
              reportSummaryCards={reportSummaryCards}
              handleExportTransactions={handleExportTransactions}
              handleExportHoldings={handleExportHoldings}
              handleExportPerformance={handleExportPerformance}
              settings={settings}
              schedulerStatus={schedulerStatus}
              handleSettingChange={handleSettingChange}
              handleResetSettings={handleResetSettings}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
