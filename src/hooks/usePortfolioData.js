/**
 * src/hooks/usePortfolioData.js
 *
 * SR-080 — Data-fetching state and effects extracted from PortfolioManagerApp.jsx.
 *
 * Owns: signals, signalRows, currentPrices, signalPricingMeta, roiData, roiMeta,
 *       benchmarkSummary, returnsSummary, navDaily, loadingRoi, roiRefreshKey,
 *       roiSource, pricesTabState, benchmarkCatalog, trackedPriceRefreshReady
 *
 * Parameters: portfolioId, transactions, openHoldings, debouncedOpenHoldings,
 *             debouncedSignalDraft, trackedPriceSymbols, benchmarkSummaryWindow,
 *             activeTab, refreshIntervalMinutes, roiFallbackAlertsEnabled,
 *             marketStatusAlertsEnabled, signalTransitionAlertsEnabled,
 *             isMountedRef, pushToast, t, formatCurrency, formatDate
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  evaluateSignals,
  fetchBenchmarkCatalog,
  fetchBenchmarkSummary,
  fetchBulkPrices,
  fetchDailyRoi,
  fetchNavDaily,
} from '../utils/api.js';
import {
  getFallbackBenchmarkCatalog,
  normalizeBenchmarkCatalogResponse,
  mergeDailyRoiSeries,
} from '../utils/roi.js';
import {
  deriveBenchmarkSummaryWindow,
  extractQuotesState,
  mergePricingSymbolMetadata,
  normalizeTickerSymbol,
} from '../utils/portfolioManagerApp.js';
import { isSignalStatusActionable, SIGNAL_STATUS } from '../../shared/signals.js';
import { getMarketClock } from '../utils/marketHours.js';

/**
 * @param {object} params
 */
export function usePortfolioData({
  portfolioId,
  transactions,
  openHoldings,
  debouncedOpenHoldings,
  debouncedSignalDraft,
  trackedPriceSymbols,
  activeTab,
  refreshIntervalMinutes,
  roiFallbackAlertsEnabled,
  marketStatusAlertsEnabled,
  signalTransitionAlertsEnabled,
  isMountedRef,
  pushToast,
  t,
  formatCurrency,
  formatDate,
}) {
  const [signals, setSignals] = useState({});
  const [signalRows, setSignalRows] = useState([]);
  const [currentPrices, setCurrentPrices] = useState({});
  const currentPricesRef = useRef({});
  const trackedPricesRefreshInFlightRef = useRef(false);
  const [trackedPriceRefreshReady, setTrackedPriceRefreshReady] = useState(false);
  const [signalPricingMeta, setSignalPricingMeta] = useState({});
  const lastGoodRoiDataRef = useRef([]);
  const lastGoodBenchmarkSummaryRef = useRef(null);
  const signalRowsRef = useRef(new Map());
  const signalNotificationsReadyRef = useRef(false);
  const [roiData, setRoiData] = useState([]);
  const [roiMeta, setRoiMeta] = useState(null);
  const [benchmarkSummary, setBenchmarkSummary] = useState(null);
  const [returnsSummary, setReturnsSummary] = useState(null);
  const [navDaily, setNavDaily] = useState([]);
  const [loadingRoi, setLoadingRoi] = useState(false);
  const [roiRefreshKey, setRoiRefreshKey] = useState(0);
  const [roiSource, setRoiSource] = useState('api');
  const [priceAlert, setPriceAlert] = useState(null);
  const [roiAlert, setRoiAlert] = useState(null);
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

  // Derived state
  const benchmarkSummaryWindow = deriveBenchmarkSummaryWindow(roiData);

  // Sync currentPricesRef with state
  useEffect(() => {
    currentPricesRef.current = currentPrices;
  }, [currentPrices]);

  // Reset price/signal state when holdings become empty
  useEffect(() => {
    if (openHoldings.length > 0) {
      return;
    }
    setSignalRows([]);
    setCurrentPrices({});
    setTrackedPriceRefreshReady(false);
    setSignalPricingMeta({});
    setPriceAlert(null);
    setRoiMeta(null);
    signalRowsRef.current = new Map();
    signalNotificationsReadyRef.current = false;
  }, [openHoldings.length]);

  // ROI refresh interval — bump roiRefreshKey on a timer
  useEffect(() => {
    if (!Number.isFinite(refreshIntervalMinutes) || refreshIntervalMinutes <= 0) {
      return undefined;
    }
    const intervalMs = Math.max(1, refreshIntervalMinutes) * 60 * 1000;
    const timerId = setInterval(() => {
      setRoiRefreshKey((previous) => previous + 1);
    }, intervalMs);
    return () => {
      clearInterval(timerId);
    };
  }, [refreshIntervalMinutes]);

  // Fetch benchmark catalog once
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

    void loadBenchmarkMetadata();

    return () => {
      cancelled = true;
    };
  }, []);

  // Signal preview — load prices and signal state
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadSignalPreview() {
      if (debouncedOpenHoldings.length === 0) {
        setTrackedPriceRefreshReady(false);
        return;
      }

      const uniqueTickers = [
        ...new Set(
          debouncedOpenHoldings
            .map((holding) => holding.ticker)
            .filter((ticker) => typeof ticker === 'string' && ticker.trim().length > 0)
        ),
      ];
      if (uniqueTickers.length === 0) {
        setTrackedPriceRefreshReady(false);
        return;
      }

      setTrackedPriceRefreshReady(false);

      const formatMarketDate = (dateKey) => {
        if (typeof dateKey !== 'string' || dateKey.length === 0) {
          return t('alerts.price.marketClosed.nextSession');
        }
        const segments = dateKey.split('-');
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

      let requestMetadata = null;
      let previewResponse = null;
      let previewError = null;
      try {
        previewResponse = await evaluateSignals(debouncedSignalDraft, {
          signal: controller.signal,
          onRequestMetadata: (meta) => {
            requestMetadata = meta;
          },
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error(error);
        previewError = error;
      }

      if (cancelled) {
        return;
      }

      const requestIds = Array.from(
        new Set(
          [previewResponse?.requestId, requestMetadata?.requestId, previewError?.requestId].filter(
            (value) => typeof value === 'string' && value.trim().length > 0
          )
        )
      );
      const responseData = previewResponse?.data ?? {};
      const responseRows = Array.isArray(responseData?.rows) ? responseData.rows : [];
      const responsePrices =
        responseData?.prices && typeof responseData.prices === 'object' ? responseData.prices : {};
      const responseErrors =
        responseData?.errors && typeof responseData.errors === 'object' ? responseData.errors : {};
      const responsePricingSymbols =
        responseData?.pricing?.symbols && typeof responseData.pricing.symbols === 'object'
          ? responseData.pricing.symbols
          : {};
      const pricingSummary =
        responseData?.pricing?.summary && typeof responseData.pricing.summary === 'object'
          ? responseData.pricing.summary
          : null;
      const market = responseData?.market ?? null;
      const fallbackMarket = getMarketClock();
      const effectiveMarket = market ?? fallbackMarket;
      const previousPrices = currentPricesRef.current ?? {};
      const nextPrices = {};

      for (const ticker of uniqueTickers) {
        const nextPrice = responsePrices[ticker];
        if (Number.isFinite(nextPrice)) {
          nextPrices[ticker] = nextPrice;
        } else if (Number.isFinite(previousPrices[ticker])) {
          nextPrices[ticker] = previousPrices[ticker];
        }
      }

      setSignalRows(responseRows);
      setCurrentPrices(nextPrices);
      setSignalPricingMeta((previous) =>
        Object.keys(responsePricingSymbols).length > 0
          ? mergePricingSymbolMetadata(previous, responsePricingSymbols)
          : previous
      );

      const failures = Object.entries(responseErrors).map(([ticker, error]) => ({
        ticker,
        error,
      }));
      const staleOnlyFailures =
        failures.length > 0 && failures.every((entry) => entry?.error?.code === 'STALE_DATA');
      const successfulTickers = uniqueTickers.filter((ticker) =>
        Number.isFinite(responsePrices[ticker])
      );
      const impactedList = Array.from(
        new Set(
          (failures.length > 0
            ? failures.map((entry) => entry.ticker)
            : responseRows.map((row) => row.ticker)
          ).filter((ticker) => typeof ticker === 'string' && ticker.length > 0)
        )
      );
      const hasFallbackPrices = uniqueTickers.some((ticker) => Number.isFinite(nextPrices[ticker]));

      if (
        effectiveMarket &&
        effectiveMarket.isOpen === false &&
        (failures.length === 0 || hasFallbackPrices)
      ) {
        if (marketStatusAlertsEnabled) {
          const lastCloseLabel = formatMarketDate(effectiveMarket.lastTradingDate);
          const nextSessionLabel =
            effectiveMarket.isBeforeOpen === true
              ? t('alerts.price.marketClosed.detailToday')
              : typeof effectiveMarket.nextTradingDate === 'string'
                ? formatMarketDate(effectiveMarket.nextTradingDate)
                : t('alerts.price.marketClosed.nextSession');
          const summary =
            impactedList.length > 0
              ? impactedList.join(', ')
              : successfulTickers.length > 0
                ? successfulTickers.join(', ')
                : t('alerts.price.marketClosed.allHoldings');
          setPriceAlert({
            id: 'market-closed',
            type: failures.length > 0 ? 'warning' : 'info',
            message: t('alerts.price.marketClosed.title', { date: lastCloseLabel }),
            detail: t('alerts.price.marketClosed.detail', {
              tickers: summary,
              next: nextSessionLabel,
            }),
            requestIds,
          });
        } else {
          setPriceAlert(null);
        }
      } else if (staleOnlyFailures) {
        setPriceAlert({
          id: 'price-no-fresh',
          type: 'warning',
          message: t('alerts.price.noFresh.title'),
          detail: t('alerts.price.noFresh.detail', {
            tickers:
              impactedList.length > 0
                ? impactedList.join(', ')
                : t('alerts.price.refreshFailed.detailFallback'),
          }),
          requestIds,
        });
      } else if (failures.length > 0 || previewError) {
        setPriceAlert({
          id: 'price-fetch',
          type: 'error',
          message: t('alerts.price.refreshFailed.title'),
          detail: t('alerts.price.refreshFailed.detail', {
            tickers:
              impactedList.length > 0
                ? impactedList.join(', ')
                : t('alerts.price.refreshFailed.detailFallback'),
          }),
          requestIds,
        });
      } else if (
        pricingSummary?.status === 'degraded' &&
        Array.isArray(pricingSummary.degradedSymbols) &&
        pricingSummary.degradedSymbols.length > 0
      ) {
        const degradedSymbols = pricingSummary.degradedSymbols.join(', ');
        setPriceAlert({
          id: 'price-degraded',
          type: 'warning',
          message: t('alerts.price.degraded.title'),
          detail: t('alerts.price.degraded.detail', {
            tickers: degradedSymbols,
          }),
          requestIds,
        });
      } else {
        setPriceAlert(null);
      }

      const nextRows = new Map(
        responseRows
          .filter((row) => typeof row?.ticker === 'string' && row.ticker.length > 0)
          .map((row) => [row.ticker, row])
      );
      const pendingNotifications = [];

      for (const row of responseRows) {
        const previousRow = signalRowsRef.current.get(row.ticker);
        const priceChanged =
          previousRow &&
          previousRow.currentPrice !== null &&
          row.currentPrice !== null &&
          previousRow.currentPrice !== row.currentPrice;

        if (
          signalNotificationsReadyRef.current &&
          priceChanged &&
          previousRow?.status !== row.status &&
          isSignalStatusActionable(row.status)
        ) {
          pendingNotifications.push(row);
        }
      }

      if (signalNotificationsReadyRef.current && signalTransitionAlertsEnabled) {
        for (const row of pendingNotifications) {
          const titleKey =
            row.status === SIGNAL_STATUS.BUY_ZONE
              ? 'alerts.signal.buyZone.title'
              : 'alerts.signal.trimZone.title';
          pushToast({
            id: `signal-${row.ticker}-${row.status}`,
            type: row.status === SIGNAL_STATUS.BUY_ZONE ? 'success' : 'warning',
            title: t(titleKey, { ticker: row.ticker }),
            message: t('alerts.signal.message', {
              ticker: row.ticker,
              price: formatCurrency(row.currentPrice ?? 0),
              reference: formatCurrency(row.referencePrice ?? 0),
              lower: row.lowerBound !== null ? formatCurrency(row.lowerBound) : '—',
              upper: row.upperBound !== null ? formatCurrency(row.upperBound) : '—',
            }),
          });
        }
      }

      signalRowsRef.current = nextRows;
      signalNotificationsReadyRef.current = true;
      setTrackedPriceRefreshReady(true);
    }

    void loadSignalPreview();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    debouncedOpenHoldings,
    debouncedSignalDraft,
    formatCurrency,
    formatDate,
    marketStatusAlertsEnabled,
    pushToast,
    signalTransitionAlertsEnabled,
    t,
  ]);

  // ROI data loading
  useEffect(() => {
    let cancelled = false;

    const resolveRequestId = (error) => {
      if (typeof error?.requestId === 'string' && error.requestId.trim().length > 0) {
        return error.requestId;
      }
      return null;
    };

    async function loadRoi() {
      if (transactions.length === 0) {
        setRoiData([]);
        lastGoodRoiDataRef.current = [];
        setRoiMeta(null);
        setRoiAlert(null);
        setRoiSource('api');
        return;
      }

      const orderedDates = transactions
        .map((tx) => tx.date)
        .filter((date) => typeof date === 'string' && date.trim().length > 0)
        .sort((a, b) => a.localeCompare(b));
      if (orderedDates.length === 0) {
        setRoiData([]);
        lastGoodRoiDataRef.current = [];
        setRoiMeta(null);
        setRoiAlert(null);
        setRoiSource('api');
        return;
      }

      const hasSecurityTransactions = transactions.some(
        (tx) => typeof tx?.ticker === 'string' && tx.ticker.trim().length > 0
      );
      if (!hasSecurityTransactions) {
        setRoiData([]);
        lastGoodRoiDataRef.current = [];
        setRoiMeta(null);
        setRoiAlert(null);
        setRoiSource('cash-only');
        return;
      }

      setLoadingRoi(true);
      try {
        const { data, requestId } = await fetchDailyRoi({
          portfolioId,
          from: orderedDates[0],
          to: new Date(),
        });
        const mergedSeries = mergeDailyRoiSeries(data?.series);
        const nextRoiMeta = data?.meta ?? null;
        if (!cancelled) {
          setRoiData(mergedSeries);
          setRoiMeta(nextRoiMeta);
          lastGoodRoiDataRef.current = mergedSeries;
          setRoiSource('api');
          const unavailableBenchmarks = Array.isArray(nextRoiMeta?.benchmarkHealth?.unavailable)
            ? nextRoiMeta.benchmarkHealth.unavailable
            : [];
          setRoiAlert(
            unavailableBenchmarks.length > 0
              ? {
                  id: 'roi-benchmark-health',
                  type: 'warning',
                  message: t('alerts.roi.benchmarkUnavailable.title'),
                  detail: t('alerts.roi.benchmarkUnavailable.detail', {
                    benchmarks: unavailableBenchmarks.join(', '),
                  }),
                }
              : null
          );
          if (requestId) {
            setRoiAlert((current) =>
              current && current.id === 'roi-fallback'
                ? { ...current, resolvedRequestId: requestId }
                : current
            );
          }
        }
      } catch (error) {
        console.error(error);
        if (cancelled) {
          return;
        }
        if (lastGoodRoiDataRef.current.length > 0) {
          setRoiData(lastGoodRoiDataRef.current);
          setRoiSource('stale');
          setRoiAlert(
            roiFallbackAlertsEnabled
              ? {
                  id: 'roi-stale',
                  type: 'warning',
                  message: t('alerts.roi.stale'),
                  requestId: resolveRequestId(error),
                }
              : null
          );
          return;
        }
        setRoiData([]);
        setRoiMeta(null);
        setRoiSource('error');
        setRoiAlert({
          id: 'roi-unavailable',
          type: 'error',
          message: t('alerts.roi.unavailable'),
          requestId: resolveRequestId(error),
        });
      } finally {
        if (!cancelled) {
          setLoadingRoi(false);
        }
      }
    }

    void loadRoi();

    return () => {
      cancelled = true;
    };
  }, [portfolioId, roiFallbackAlertsEnabled, roiRefreshKey, t, transactions]);

  // Benchmark summary and NAV daily
  useEffect(() => {
    if (!benchmarkSummaryWindow?.from || !benchmarkSummaryWindow?.to) {
      lastGoodBenchmarkSummaryRef.current = null;
      setBenchmarkSummary(null);
      setReturnsSummary(null);
      setNavDaily([]);
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function loadBenchmarkSummary() {
      try {
        const response = await fetchBenchmarkSummary({
          portfolioId,
          from: benchmarkSummaryWindow.from,
          to: benchmarkSummaryWindow.to,
          signal: controller.signal,
        });
        const data = response?.data ?? null;
        if (cancelled) {
          return;
        }
        const moneyWeightedSummary =
          data?.money_weighted && typeof data.money_weighted === 'object'
            ? data.money_weighted
            : null;
        setBenchmarkSummary(moneyWeightedSummary);
        const summary = data?.summary && typeof data.summary === 'object' ? data.summary : null;
        const maxDrawdown =
          data?.max_drawdown && typeof data.max_drawdown === 'object' ? data.max_drawdown : null;
        setReturnsSummary(summary ? { ...summary, max_drawdown: maxDrawdown } : null);
        lastGoodBenchmarkSummaryRef.current = moneyWeightedSummary;
      } catch (error) {
        if (controller.signal.aborted || cancelled) {
          return;
        }
        console.warn('Failed to load benchmark summary', error);
        if (!lastGoodBenchmarkSummaryRef.current) {
          setBenchmarkSummary(null);
          setReturnsSummary(null);
        }
      }
    }

    async function loadNavDaily() {
      try {
        const navFrom =
          Array.isArray(roiData) && roiData.length > 0 && roiData[0]?.date
            ? roiData[0].date
            : benchmarkSummaryWindow.from;
        const { data } = await fetchNavDaily({
          portfolioId,
          from: navFrom,
          to: benchmarkSummaryWindow.to,
          signal: controller.signal,
        });
        const navRows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
        if (!cancelled && navRows.length > 0) {
          setNavDaily(navRows);
        }
      } catch {
        if (!cancelled) {
          setNavDaily([]);
        }
      }
    }

    void loadBenchmarkSummary();
    void loadNavDaily();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [benchmarkSummaryWindow, portfolioId, roiData]);

  // Refresh tracked prices on-demand
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
    [openHoldings, trackedPriceSymbols, isMountedRef]
  );

  // Periodic price refresh
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

  // Preload after-hours quotes
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
  }, [openHoldings, trackedPriceSymbols, isMountedRef]);

  // Refresh prices when Prices tab becomes active
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

  return {
    // State
    signals,
    setSignals,
    signalRows,
    currentPrices,
    currentPricesRef,
    trackedPriceRefreshReady,
    signalPricingMeta,
    roiData,
    roiMeta,
    benchmarkSummary,
    returnsSummary,
    navDaily,
    loadingRoi,
    roiRefreshKey,
    setRoiRefreshKey,
    roiSource,
    priceAlert,
    roiAlert,
    benchmarkCatalog,
    pricesTabState,
    benchmarkSummaryWindow,
    // Actions
    refreshTrackedPrices,
  };
}
