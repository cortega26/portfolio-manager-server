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
import DesktopSessionGate from "./components/DesktopSessionGate.jsx";
import PortfolioControls from "./components/PortfolioControls.jsx";
import ToastStack from "./components/ToastStack.jsx";
import TabBar from "./components/TabBar.jsx";
import {
  evaluateSignals,
  fetchBenchmarkCatalog,
  fetchBulkPrices,
  fetchDailyReturns,
  persistPortfolio,
  retrievePortfolio,
} from "./utils/api.js";
import {
  computeDashboardMetrics,
  filterOpenHoldings,
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
import {
  getFallbackBenchmarkCatalog,
  normalizeBenchmarkCatalogResponse,
  buildBenchmarkOverlaySeries,
  buildRoiSeries,
  mergeBenchmarkOverlaySeries,
  mergeReturnSeries,
} from "./utils/roi.js";
import {
  createDefaultSettings,
  loadSettingsFromStorage,
  normalizeSettings,
  mergeSettings,
  persistSettingsToStorage,
  updateSetting,
} from "./utils/settings.js";
import useDebouncedValue from "./hooks/useDebouncedValue.js";
import {
  createInitialLedgerState,
  ledgerReducer,
} from "./utils/holdingsLedger.js";
import { useI18n } from "./i18n/I18nProvider.jsx";
import {
  loadActivePortfolioId,
  setActivePortfolioId,
} from "./state/portfolioStore.js";
import { getRuntimeConfigSync, mergeRuntimeConfig } from "./lib/runtimeConfig.js";
import { isSignalStatusActionable, SIGNAL_STATUS } from "../shared/signals.js";
import { getMarketClock } from "./utils/marketHours.js";

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
const DESKTOP_SESSION_ERROR_KEYS = {
  INVALID_PIN: "desktopSession.error.INVALID_PIN",
  INVALID_PIN_CONFIRMATION: "desktopSession.error.INVALID_PIN_CONFIRMATION",
  INVALID_PIN_FORMAT: "desktopSession.error.INVALID_PIN_FORMAT",
  INVALID_PORTFOLIO_ID: "desktopSession.error.INVALID_PORTFOLIO_ID",
  PORTFOLIO_NOT_FOUND: "desktopSession.error.PORTFOLIO_NOT_FOUND",
  PORTFOLIO_REQUIRED: "desktopSession.error.PORTFOLIO_REQUIRED",
  PIN_ALREADY_SET: "desktopSession.error.PIN_ALREADY_SET",
  DESKTOP_SESSION_ERROR: "desktopSession.error.generic",
};

function getDesktopBridge() {
  if (typeof window === "undefined") {
    return null;
  }
  const bridge = window.portfolioDesktop;
  if (!bridge || bridge.isAvailable !== true) {
    return null;
  }
  return bridge;
}

function hasRuntimeSessionToken(runtimeConfig) {
  return (
    typeof runtimeConfig?.API_SESSION_TOKEN === "string"
    && runtimeConfig.API_SESSION_TOKEN.trim().length > 0
  );
}

function normalizeDesktopPin(pin) {
  if (typeof pin !== "string") {
    return "";
  }
  return pin.trim();
}

function formatDesktopSessionError(error, t) {
  const code =
    typeof error?.code === "string" && error.code.trim().length > 0
      ? error.code.trim()
      : null;
  const errorKey = code ? DESKTOP_SESSION_ERROR_KEYS[code] : null;
  if (errorKey) {
    return t(errorKey);
  }
  if (typeof error?.message === "string" && error.message.trim().length > 0) {
    return error.message.trim();
  }
  return t("desktopSession.error.generic");
}

function normalizeTickerSymbol(symbol) {
  if (typeof symbol !== "string") {
    return "";
  }
  const trimmed = symbol.trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : "";
}

function createRoiPriceFetcher({ fetcher, onErrors } = {}) {
  const cache = new Map();
  let inflight = null;

  const loadSymbols = async (symbols) => {
    const unique = Array.from(
      new Set(
        symbols
          .map((symbol) => normalizeTickerSymbol(symbol))
          .filter((symbol) => symbol.length > 0 && !cache.has(symbol)),
      ),
    );
    if (unique.length === 0) {
      return;
    }
    const result = await fetcher(unique);
    for (const [symbol, entries] of result.series.entries()) {
      cache.set(symbol, Array.isArray(entries) ? entries : []);
    }
    for (const symbol of unique) {
      if (!cache.has(symbol)) {
        cache.set(symbol, []);
      }
    }
    if (typeof onErrors === "function" && result.errors) {
      const errorKeys = Object.keys(result.errors);
      if (errorKeys.length > 0) {
        onErrors(result.errors);
      }
    }
  };

  const loader = async (symbol) => {
    const normalized = normalizeTickerSymbol(symbol);
    if (!normalized) {
      return [];
    }
    if (cache.has(normalized)) {
      return cache.get(normalized);
    }
    if (inflight) {
      try {
        await inflight;
      } catch (error) {
        console.error(error);
      }
      if (cache.has(normalized)) {
        return cache.get(normalized);
      }
    }
    await loadSymbols([normalized]);
    return cache.get(normalized) ?? [];
  };

  loader.prefetch = async (symbols) => {
    inflight = loadSymbols(symbols);
    try {
      await inflight;
    } finally {
      inflight = null;
    }
  };

  return loader;
}

async function augmentRoiDataWithBenchmarks(roiData, priceFetcher, benchmarks = []) {
  if (!Array.isArray(roiData) || roiData.length === 0 || typeof priceFetcher !== "function") {
    return Array.isArray(roiData) ? roiData : [];
  }

  let nextData = roiData.map((point) => ({ ...point }));
  for (const benchmark of benchmarks) {
    const symbol =
      typeof benchmark?.symbol === "string" ? benchmark.symbol.trim().toUpperCase() : "";
    const dataKey =
      typeof benchmark?.dataKey === "string" ? benchmark.dataKey.trim() : "";
    if (!symbol || !dataKey) {
      continue;
    }
    try {
      const response = await priceFetcher(symbol);
      const rawSeries = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
        ? response.data
        : [];
      const overlaySeries = buildBenchmarkOverlaySeries(nextData, rawSeries);
      nextData = mergeBenchmarkOverlaySeries(nextData, overlaySeries, dataKey);
    } catch (error) {
      console.error(`Failed to load benchmark overlay for ${symbol}`, error);
    }
  }
  return nextData;
}

function buildOverlayBenchmarkTargets(catalog) {
  const normalizedCatalog = normalizeBenchmarkCatalogResponse(catalog);
  return normalizedCatalog.available
    .filter((entry) => entry.id !== "spy")
    .map((entry) => ({
      symbol: entry.ticker,
      dataKey: entry.id,
    }));
}

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
  const runtimeConfig = getRuntimeConfigSync();
  const desktopBridge = getDesktopBridge();
  const initialDesktopLocked = Boolean(desktopBridge && !hasRuntimeSessionToken(runtimeConfig));
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB);
  const [portfolioId, setPortfolioId] = useState("");
  const [desktopSessionLocked, setDesktopSessionLocked] = useState(initialDesktopLocked);
  const [desktopSessionLoading, setDesktopSessionLoading] = useState(initialDesktopLocked);
  const [desktopSessionSubmitting, setDesktopSessionSubmitting] = useState(false);
  const [desktopSessionError, setDesktopSessionError] = useState("");
  const [desktopPortfolios, setDesktopPortfolios] = useState([]);
  const [desktopSelectedPortfolioId, setDesktopSelectedPortfolioId] = useState(() => {
    const storedId = loadActivePortfolioId();
    const runtimePortfolioId =
      typeof runtimeConfig?.ACTIVE_PORTFOLIO_ID === "string"
      && runtimeConfig.ACTIVE_PORTFOLIO_ID.trim().length > 0
        ? runtimeConfig.ACTIVE_PORTFOLIO_ID.trim()
        : "";
    return runtimePortfolioId || storedId || "";
  });
  const [desktopPin, setDesktopPin] = useState("");
  const [desktopPinConfirm, setDesktopPinConfirm] = useState("");
  const [ledger, dispatchLedger] = useReducer(ledgerReducer, undefined, createInitialLedgerState);
  const { transactions, holdings } = ledger;
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const bootstrapLoadAttemptedRef = useRef(false);
  const signalRowsRef = useRef(new Map());
  const signalNotificationsReadyRef = useRef(false);
  const [signals, setSignals] = useState({});
  const [signalRows, setSignalRows] = useState([]);
  const [currentPrices, setCurrentPrices] = useState({});
  const currentPricesRef = useRef({});
  const [roiData, setRoiData] = useState([]);
  const [loadingRoi, setLoadingRoi] = useState(false);
  const [roiRefreshKey, setRoiRefreshKey] = useState(0);
  const [settings, setSettings] = useState(() => loadSettingsFromStorage());
  const [priceAlert, setPriceAlert] = useState(null);
  const [roiAlert, setRoiAlert] = useState(null);
  const [roiSource, setRoiSource] = useState("api");
  const [roiServiceDisabled, setRoiServiceDisabled] = useState(false);
  const [benchmarkCatalog, setBenchmarkCatalog] = useState(() => getFallbackBenchmarkCatalog());

  const pushAlertsEnabled = settings?.notifications?.push !== false;
  const selectedCurrency = settings?.display?.currency ?? "";
  const refreshIntervalMinutes = Number(settings?.display?.refreshInterval ?? 0);
  const compactTables = Boolean(settings?.display?.compactTables);
  const desktopSelectedPortfolio = useMemo(
    () => desktopPortfolios.find((entry) => entry.id === desktopSelectedPortfolioId) ?? null,
    [desktopPortfolios, desktopSelectedPortfolioId],
  );
  const desktopRequiresPinSetup = desktopSessionLocked && desktopSelectedPortfolio?.hasPin === false;
  const signalDraft = useMemo(
    () => ({
      transactions,
      signals,
    }),
    [transactions, signals],
  );
  const debouncedSignalDraft = useDebouncedValue(signalDraft, 200);

  useEffect(() => {
    currentPricesRef.current = currentPrices;
  }, [currentPrices]);

  const dismissToast = useCallback((id) => {
    if (!id) {
      return;
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast) => {
      setToasts((current) => {
        const toastType = toast?.type ?? "info";
        if (!pushAlertsEnabled && toastType !== "error" && toastType !== "warning") {
          return current;
        }
        const generatedId = `toast-${Date.now()}-${toastIdRef.current + 1}`;
        toastIdRef.current += 1;
        const id =
          typeof toast?.id === "string" && toast.id.trim().length > 0
            ? toast.id
            : generatedId;
        const payload = {
          id,
          type: toastType,
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
    },
    [pushAlertsEnabled],
  );

  const metrics = useMemo(
    () => computeDashboardMetrics(holdings, currentPrices),
    [holdings, currentPrices],
  );
  const openHoldings = useMemo(() => filterOpenHoldings(holdings), [holdings]);
  const debouncedOpenHoldings = useDebouncedValue(openHoldings, 200);

  const historyMonthlyBreakdown = useMemo(
    () => groupTransactionsByMonth(transactions, { locale }),
    [transactions, locale],
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
      [transactions, locale, formatCurrency, formatNumber, t, formatDate],
    );

  const metricCards = useMemo(
    () => buildMetricCards(metrics, { translate: t, formatCurrency, formatPercent }),
    [metrics, t, formatCurrency, formatPercent],
  );
  const allocationBreakdown = useMemo(
    () => calculateAllocationBreakdown(openHoldings, currentPrices),
    [openHoldings, currentPrices],
  );
  const performanceHighlights = useMemo(
    () => derivePerformanceHighlights(roiData, { translate: t, formatPercent, formatDate }),
    [roiData, t, formatPercent, formatDate],
  );
  const reportSummaryCards = useMemo(
    () =>
      buildReportSummary(transactions, openHoldings, metrics, {
        translate: t,
        formatDate,
      }),
    [transactions, openHoldings, metrics, t, formatDate],
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
    if (typeof setCurrencyOverride !== "function") {
      return;
    }
    if (typeof selectedCurrency === "string" && selectedCurrency.trim().length > 0) {
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
      setRoiRefreshKey((previous) => previous + 1);
    }, intervalMs);
    return () => {
      clearInterval(timerId);
    };
  }, [refreshIntervalMinutes]);

  useEffect(() => {
    let cancelled = false;

    async function loadBenchmarkMetadata() {
      try {
        const { data } = await fetchBenchmarkCatalog();
        if (!cancelled) {
          setBenchmarkCatalog(normalizeBenchmarkCatalogResponse(data));
        }
      } catch (error) {
        console.warn("Failed to load benchmark catalog; using fallback metadata", error);
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

  useEffect(() => {
    if (openHoldings.length > 0) {
      return;
    }

    setSignalRows([]);
    setCurrentPrices({});
    setPriceAlert(null);
    signalRowsRef.current = new Map();
    signalNotificationsReadyRef.current = false;
  }, [openHoldings.length]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadSignalPreview() {
      if (debouncedOpenHoldings.length === 0) {
        return;
      }

      const uniqueTickers = [
        ...new Set(
          debouncedOpenHoldings
            .map((holding) => holding.ticker)
            .filter((ticker) => typeof ticker === "string" && ticker.trim().length > 0),
        ),
      ];
      if (uniqueTickers.length === 0) {
        return;
      }

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
          [
            previewResponse?.requestId,
            requestMetadata?.requestId,
            previewError?.requestId,
          ].filter((value) => typeof value === "string" && value.trim().length > 0),
        ),
      );
      const responseData = previewResponse?.data ?? {};
      const responseRows = Array.isArray(responseData?.rows) ? responseData.rows : [];
      const responsePrices =
        responseData?.prices && typeof responseData.prices === "object"
          ? responseData.prices
          : {};
      const responseErrors =
        responseData?.errors && typeof responseData.errors === "object"
          ? responseData.errors
          : {};
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

      const failures = Object.entries(responseErrors).map(([ticker, error]) => ({
        ticker,
        error,
      }));
      const successfulTickers = uniqueTickers.filter((ticker) => Number.isFinite(responsePrices[ticker]));
      const impactedList = Array.from(
        new Set(
          (failures.length > 0 ? failures.map((entry) => entry.ticker) : responseRows.map((row) => row.ticker))
            .filter((ticker) => typeof ticker === "string" && ticker.length > 0),
        ),
      );
      const hasFallbackPrices = uniqueTickers.some((ticker) => Number.isFinite(nextPrices[ticker]));

      if (effectiveMarket && effectiveMarket.isOpen === false && (failures.length === 0 || hasFallbackPrices)) {
        const lastCloseLabel = formatMarketDate(effectiveMarket.lastTradingDate);
        const nextSessionLabel =
          effectiveMarket.isBeforeOpen === true
            ? t("alerts.price.marketClosed.detailToday")
            : typeof effectiveMarket.nextTradingDate === "string"
              ? formatMarketDate(effectiveMarket.nextTradingDate)
              : t("alerts.price.marketClosed.nextSession");
        const summary =
          impactedList.length > 0
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
      } else if (failures.length > 0 || previewError) {
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

      const nextRows = new Map(
        responseRows
          .filter((row) => typeof row?.ticker === "string" && row.ticker.length > 0)
          .map((row) => [row.ticker, row]),
      );
      const pendingNotifications = [];

      for (const row of responseRows) {
        const previousRow = signalRowsRef.current.get(row.ticker);
        const priceChanged =
          previousRow
          && previousRow.currentPrice !== null
          && row.currentPrice !== null
          && previousRow.currentPrice !== row.currentPrice;

        if (
          signalNotificationsReadyRef.current
          && priceChanged
          && previousRow?.status !== row.status
          && isSignalStatusActionable(row.status)
        ) {
          pendingNotifications.push(row);
        }
      }

      if (signalNotificationsReadyRef.current) {
        for (const row of pendingNotifications) {
          const titleKey =
            row.status === SIGNAL_STATUS.BUY_ZONE
              ? "alerts.signal.buyZone.title"
              : "alerts.signal.trimZone.title";
          pushToast({
            id: `signal-${row.ticker}-${row.status}`,
            type: row.status === SIGNAL_STATUS.BUY_ZONE ? "success" : "warning",
            title: t(titleKey, { ticker: row.ticker }),
            message: t("alerts.signal.message", {
              ticker: row.ticker,
              price: formatCurrency(row.currentPrice ?? 0),
              reference: formatCurrency(row.referencePrice ?? 0),
              lower: row.lowerBound !== null ? formatCurrency(row.lowerBound) : "—",
              upper: row.upperBound !== null ? formatCurrency(row.upperBound) : "—",
            }),
          });
        }
      }

      signalRowsRef.current = nextRows;
      signalNotificationsReadyRef.current = true;
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
    pushToast,
    t,
  ]);

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
        const priceFetcher = createRoiPriceFetcher({
          fetcher: async (symbols) => {
            const { series, errors } = await fetchBulkPrices(symbols, { range: "max" });
            return { series, errors };
          },
          onErrors: (errors) => {
            console.warn("Bulk price fetch encountered errors", errors);
          },
        });
        const fallbackSeries = await buildRoiSeries(transactions, priceFetcher);
        const enhancedFallbackSeries = await augmentRoiDataWithBenchmarks(
          fallbackSeries,
          priceFetcher,
          buildOverlayBenchmarkTargets(benchmarkCatalog),
        );
        if (cancelled) {
          return;
        }
        setRoiData(enhancedFallbackSeries);
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
        const benchmarkPriceFetcher = async (symbol) => {
          const { series } = await fetchBulkPrices([symbol], { range: "max" });
          return series.get(String(symbol).toUpperCase()) ?? [];
        };
        const enhancedSeries = await augmentRoiDataWithBenchmarks(
          mergedSeries,
          benchmarkPriceFetcher,
          buildOverlayBenchmarkTargets(benchmarkCatalog),
        );
        if (!cancelled) {
          setRoiData(enhancedSeries);
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
  }, [benchmarkCatalog, transactions, roiRefreshKey, roiServiceDisabled, t]);

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
    if (!normalizedId) {
      throw new Error("Portfolio ID required");
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
  }, [
    portfolioId,
    transactions,
    signals,
    settings,
  ]);

  const applyLoadedPortfolio = useCallback((data, normalizedId) => {
    dispatchLedger({
      type: "replace",
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
  }, []);

  const handleLoadPortfolio = useCallback(async () => {
    const normalizedId = portfolioId.trim();
    if (!normalizedId) {
      throw new Error("Portfolio ID required");
    }
    const { data, requestId } = await retrievePortfolio(normalizedId);
    applyLoadedPortfolio(data, normalizedId);
    return { requestId };
  }, [applyLoadedPortfolio, portfolioId]);

  useEffect(() => {
    if (!desktopBridge || !desktopSessionLocked) {
      return undefined;
    }

    let cancelled = false;
    setDesktopSessionLoading(true);
    setDesktopSessionError("");
    void desktopBridge
      .listPortfolios()
      .then((result) => {
        if (cancelled) {
          return;
        }
        const portfolios = Array.isArray(result?.portfolios) ? result.portfolios : [];
        setDesktopPortfolios(portfolios);
        setDesktopSelectedPortfolioId((current) => {
          const requested = current && portfolios.some((entry) => entry.id === current) ? current : "";
          if (requested) {
            return requested;
          }
          const nextDefault =
            typeof result?.defaultPortfolioId === "string" ? result.defaultPortfolioId.trim() : "";
          if (nextDefault && portfolios.some((entry) => entry.id === nextDefault)) {
            return nextDefault;
          }
          return portfolios[0]?.id ?? "";
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setDesktopSessionError(formatDesktopSessionError(error, t));
      })
      .finally(() => {
        if (!cancelled) {
          setDesktopSessionLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [desktopBridge, desktopSessionLocked, t]);

  const unlockDesktopSession = useCallback(async () => {
    if (!desktopBridge) {
      return;
    }
    const selectedId = desktopSelectedPortfolioId.trim();
    const normalizedPin = normalizeDesktopPin(desktopPin);
    const normalizedPinConfirm = normalizeDesktopPin(desktopPinConfirm);

    if (!selectedId) {
      setDesktopSessionError(t("desktopSession.error.PORTFOLIO_REQUIRED"));
      return;
    }
    if (!/^\d{4,12}$/u.test(normalizedPin)) {
      setDesktopSessionError(t("desktopSession.error.INVALID_PIN_FORMAT"));
      return;
    }
    if (desktopRequiresPinSetup && normalizedPin !== normalizedPinConfirm) {
      setDesktopSessionError(t("desktopSession.error.INVALID_PIN_CONFIRMATION"));
      return;
    }

    setDesktopSessionSubmitting(true);
    setDesktopSessionError("");
    try {
      const session = desktopRequiresPinSetup
        ? await desktopBridge.setupPin({ portfolioId: selectedId, pin: normalizedPin })
        : await desktopBridge.unlockSession({ portfolioId: selectedId, pin: normalizedPin });

      mergeRuntimeConfig(session?.runtimeConfig ?? {});
      setActivePortfolioId(selectedId);
      setPortfolioId(selectedId);
      setDesktopSessionLocked(false);
      setDesktopPin("");
      setDesktopPinConfirm("");
      bootstrapLoadAttemptedRef.current = true;

      const { data } = await retrievePortfolio(selectedId);
      applyLoadedPortfolio(data, selectedId);
    } catch (error) {
      setDesktopSessionError(formatDesktopSessionError(error, t));
    } finally {
      setDesktopSessionSubmitting(false);
    }
  }, [
    applyLoadedPortfolio,
    desktopBridge,
    desktopPin,
    desktopPinConfirm,
    desktopRequiresPinSetup,
    desktopSelectedPortfolioId,
    t,
  ]);

  useEffect(() => {
    if (desktopSessionLocked) {
      return;
    }
    if (bootstrapLoadAttemptedRef.current) {
      return;
    }
    bootstrapLoadAttemptedRef.current = true;

    const storedId = loadActivePortfolioId();
    const runtimeConfig = getRuntimeConfigSync();
    const runtimePortfolioId =
      typeof runtimeConfig?.ACTIVE_PORTFOLIO_ID === "string" &&
      runtimeConfig.ACTIVE_PORTFOLIO_ID.trim().length > 0
        ? runtimeConfig.ACTIVE_PORTFOLIO_ID.trim()
        : "";
    const initialPortfolioId = runtimePortfolioId || storedId;

    if (!initialPortfolioId) {
      return;
    }

    setPortfolioId((current) =>
      current && current.trim().length > 0 ? current : initialPortfolioId,
    );
    void retrievePortfolio(initialPortfolioId)
      .then(({ data }) => {
        applyLoadedPortfolio(data, initialPortfolioId);
      })
      .catch((error) => {
        console.error("Failed to bootstrap initial portfolio", error);
      });
  }, [applyLoadedPortfolio, desktopSessionLocked]);

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
    const csv = buildHoldingsCsv(openHoldings, currentPrices);
    if (csv) {
      triggerCsvDownload("portfolio-holdings.csv", csv);
    }
  }, [openHoldings, currentPrices]);

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

  if (desktopSessionLocked) {
    return (
      <DesktopSessionGate
        portfolios={desktopPortfolios}
        selectedPortfolioId={desktopSelectedPortfolioId}
        onPortfolioChange={(nextPortfolioId) => {
          setDesktopSelectedPortfolioId(nextPortfolioId);
          setDesktopPin("");
          setDesktopPinConfirm("");
          setDesktopSessionError("");
        }}
        pin={desktopPin}
        onPinChange={(value) => {
          setDesktopPin(value);
          setDesktopSessionError("");
        }}
        pinConfirm={desktopPinConfirm}
        onPinConfirmChange={(value) => {
          setDesktopPinConfirm(value);
          setDesktopSessionError("");
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
      className={`min-h-screen bg-slate-100 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100${compactTables ? " compact-tables" : ""}`}
    >
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
          onPortfolioIdChange={setPortfolioId}
          onSave={handleSavePortfolio}
          onLoad={handleLoadPortfolio}
          onNotify={pushToast}
        />

        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

        <main className="pb-12">
            {activeAlerts.length > 0 && (
              <div className="mb-6 space-y-3" role="region" aria-label={t("app.systemAlertsRegion")}>
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
                  benchmarkCatalog={benchmarkCatalog}
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
                  holdings={openHoldings}
                  transactions={transactions}
                  currentPrices={currentPrices}
                  signals={signals}
                  signalRows={signalRows}
                  onSignalChange={handleSignalChange}
                  compact={compactTables}
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
                  compact={compactTables}
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
                  compact={compactTables}
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
