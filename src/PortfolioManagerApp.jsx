import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import DesktopSessionGate from './components/DesktopSessionGate.jsx';
import PortfolioControls from './components/PortfolioControls.jsx';
import ToastStack from './components/ToastStack.jsx';
import TabBar from './components/TabBar.jsx';
import {
  evaluateSignals,
  fetchBenchmarkCatalog,
  fetchBenchmarkSummary,
  fetchBulkPrices,
  fetchDailyRoi,
  fetchNavDaily,
  persistPortfolio,
  retrievePortfolio,
} from './utils/api.js';
import {
  computeDashboardMetrics,
  deriveHoldingStats,
  filterOpenHoldings,
} from './utils/holdings.js';
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
import {
  getFallbackBenchmarkCatalog,
  normalizeBenchmarkCatalogResponse,
  mergeDailyRoiSeries,
} from './utils/roi.js';
import {
  createDefaultSettings,
  loadSettingsFromStorage,
  normalizeSettings,
  mergeSettings,
  persistSettingsToStorage,
  updateSetting,
} from './utils/settings.js';
import useDebouncedValue from './hooks/useDebouncedValue.js';
import { usePortfolioMetrics } from './hooks/usePortfolioMetrics.js';
import { createInitialLedgerState, ledgerReducer } from './utils/holdingsLedger.js';
import { useI18n } from './i18n/I18nProvider.jsx';
import { loadActivePortfolioId, setActivePortfolioId } from './state/portfolioStore.js';
import { getRuntimeConfigSync, mergeRuntimeConfig } from './lib/runtimeConfig.js';
import { isSignalStatusActionable, SIGNAL_STATUS } from '../shared/signals.js';
import { getMarketClock } from './utils/marketHours.js';

const DashboardTab = lazy(() => import('./components/DashboardTab.jsx'));
const HoldingsTab = lazy(() => import('./components/HoldingsTab.jsx'));
const HistoryTab = lazy(() => import('./components/HistoryTab.jsx'));
const MetricsTab = lazy(() => import('./components/MetricsTab.jsx'));
const PricesTab = lazy(() => import('./components/PricesTab.jsx'));
const ReportsTab = lazy(() => import('./components/ReportsTab.jsx'));
const SettingsTab = lazy(() => import('./components/SettingsTab.jsx'));
const SignalsTab = lazy(() => import('./components/SignalsTab.jsx'));
const TransactionsTab = lazy(() => import('./components/TransactionsTab.jsx'));

export function LoadingFallback() {
  const { t } = useI18n();
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      <span className="text-sm text-slate-600 dark:text-slate-300">{t('loading.view')}</span>
    </div>
  );
}

const DEFAULT_TAB = 'Dashboard';
const DESKTOP_SESSION_ERROR_KEYS = {
  INVALID_PIN: 'desktopSession.error.INVALID_PIN',
  INVALID_PIN_CONFIRMATION: 'desktopSession.error.INVALID_PIN_CONFIRMATION',
  INVALID_PIN_FORMAT: 'desktopSession.error.INVALID_PIN_FORMAT',
  INVALID_PORTFOLIO_ID: 'desktopSession.error.INVALID_PORTFOLIO_ID',
  PORTFOLIO_NOT_FOUND: 'desktopSession.error.PORTFOLIO_NOT_FOUND',
  PORTFOLIO_REQUIRED: 'desktopSession.error.PORTFOLIO_REQUIRED',
  PIN_ALREADY_SET: 'desktopSession.error.PIN_ALREADY_SET',
  DESKTOP_SESSION_ERROR: 'desktopSession.error.generic',
};
const PORTFOLIO_LOAD_ERROR_KEYS = {
  INVALID_SESSION_TOKEN: 'portfolioControls.error.INVALID_SESSION_TOKEN',
  NO_SESSION_TOKEN: 'portfolioControls.error.NO_SESSION_TOKEN',
  SESSION_AUTH_MISCONFIGURED: 'portfolioControls.error.SESSION_AUTH_MISCONFIGURED',
  PORTFOLIO_NOT_FOUND: 'portfolioControls.error.PORTFOLIO_NOT_FOUND',
};
const PORTFOLIO_LOAD_STATUS_KEYS = {
  400: 'portfolioControls.error.status.400',
  401: 'portfolioControls.error.status.401',
  403: 'portfolioControls.error.status.403',
  404: 'portfolioControls.error.status.404',
  429: 'portfolioControls.error.status.429',
  500: 'portfolioControls.error.status.500',
};

function getDesktopBridge() {
  if (typeof window === 'undefined') {
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
    typeof runtimeConfig?.API_SESSION_TOKEN === 'string' &&
    runtimeConfig.API_SESSION_TOKEN.trim().length > 0
  );
}

function normalizeDesktopPin(pin) {
  if (typeof pin !== 'string') {
    return '';
  }
  return pin.trim();
}

function formatDesktopSessionError(error, t) {
  const code =
    typeof error?.code === 'string' && error.code.trim().length > 0 ? error.code.trim() : null;
  const errorKey = code ? DESKTOP_SESSION_ERROR_KEYS[code] : null;
  if (errorKey) {
    return t(errorKey);
  }
  if (typeof error?.message === 'string' && error.message.trim().length > 0) {
    return error.message.trim();
  }
  return t('desktopSession.error.generic');
}

function isPortfolioSessionAuthError(error) {
  if (!error || error.name !== 'ApiError') {
    return false;
  }
  const code =
    typeof error.body?.error === 'string' && error.body.error.trim().length > 0
      ? error.body.error.trim()
      : '';
  if (
    code === 'NO_SESSION_TOKEN' ||
    code === 'INVALID_SESSION_TOKEN' ||
    code === 'SESSION_AUTH_MISCONFIGURED'
  ) {
    return true;
  }
  return false;
}

function formatPortfolioLoadError(error, t) {
  if (error?.name === 'ApiError') {
    const code =
      typeof error.body?.error === 'string' && error.body.error.trim().length > 0
        ? error.body.error.trim()
        : '';
    const errorKey = code ? PORTFOLIO_LOAD_ERROR_KEYS[code] : null;
    if (errorKey) {
      return t(errorKey);
    }
    const statusKey = PORTFOLIO_LOAD_STATUS_KEYS[error.status];
    if (statusKey) {
      return t(statusKey);
    }
  }
  if (typeof error?.message === 'string' && error.message.trim().length > 0) {
    return error.message.trim();
  }
  return t('portfolioControls.status.genericError');
}

function normalizeTickerSymbol(symbol) {
  if (typeof symbol !== 'string') {
    return '';
  }
  const trimmed = symbol.trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : '';
}

function normalizePricingResolutionStatus(status) {
  if (typeof status !== 'string') {
    return '';
  }
  return status.trim().toLowerCase();
}

function isUsablePricingResolution(status) {
  return ['live', 'eod_fresh', 'cache_fresh', 'degraded'].includes(
    normalizePricingResolutionStatus(status)
  );
}

function mergePricingSymbolMetadata(...sources) {
  const merged = {};
  for (const source of sources) {
    if (!source || typeof source !== 'object') {
      continue;
    }
    for (const [ticker, meta] of Object.entries(source)) {
      const normalizedTicker = normalizeTickerSymbol(ticker);
      if (!normalizedTicker || !meta || typeof meta !== 'object') {
        continue;
      }
      merged[normalizedTicker] = {
        ...(merged[normalizedTicker] ?? {}),
        ...meta,
      };
    }
  }
  return merged;
}

function shiftDateKey(dateKey, deltaDays) {
  if (typeof dateKey !== 'string' || dateKey.trim().length === 0) {
    return null;
  }
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function deriveBenchmarkSummaryWindow(roiData = []) {
  const dates = Array.from(
    new Set(
      (Array.isArray(roiData) ? roiData : [])
        .map((entry) => (typeof entry?.date === 'string' ? entry.date.trim() : ''))
        .filter((date) => date.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));
  if (dates.length === 0) {
    return null;
  }
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const trailingFrom = shiftDateKey(lastDate, -365);
  if (!trailingFrom) {
    return null;
  }
  return {
    from: trailingFrom > firstDate ? trailingFrom : firstDate,
    to: lastDate,
  };
}

function extractLatestQuote(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }
  const lastEntry = entries.at(-1);
  const price = Number(lastEntry?.close ?? lastEntry?.price ?? lastEntry?.value);
  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }
  return {
    price,
    asOf:
      typeof lastEntry?.date === 'string' && lastEntry.date.trim().length > 0
        ? lastEntry.date.trim()
        : null,
  };
}

function extractQuotesState(series, trackedSymbols = []) {
  const nextQuotes = {};
  for (const symbol of trackedSymbols) {
    const normalizedSymbol = normalizeTickerSymbol(symbol);
    if (!normalizedSymbol) {
      continue;
    }
    const latestQuote = extractLatestQuote(series.get(normalizedSymbol));
    if (latestQuote) {
      nextQuotes[normalizedSymbol] = latestQuote;
    }
  }
  return nextQuotes;
}

function buildPriceBoardRows({
  holdings,
  benchmarkCatalog,
  latestQuotes,
  latestErrors,
  latestMeta,
  fallbackPrices,
  fallbackAsOf,
  translate,
}) {
  const holdingTickers = new Set();
  const rows = [];

  for (const holding of holdings) {
    const symbol = normalizeTickerSymbol(holding?.ticker);
    if (!symbol) {
      continue;
    }
    holdingTickers.add(symbol);
    const latestQuote = latestQuotes[symbol] ?? null;
    const latestError = latestErrors[symbol] ?? null;
    const latestResolution = latestMeta?.[symbol] ?? null;
    const fallbackPrice = Number(fallbackPrices?.[symbol]);
    const hasFallbackPrice = Number.isFinite(fallbackPrice) && fallbackPrice > 0;
    const shares = Number(holding?.shares);
    const price = latestQuote?.price ?? (hasFallbackPrice ? fallbackPrice : null);
    const marketValue = Number.isFinite(price) && Number.isFinite(shares) ? shares * price : null;
    const holdingStats = deriveHoldingStats(holding, price);
    const totalReturn =
      Number.isFinite(holdingStats?.realised) && Number.isFinite(holdingStats?.unrealised)
        ? holdingStats.realised + holdingStats.unrealised
        : null;
    const totalReturnPct =
      Number.isFinite(totalReturn) && Number.isFinite(holdingStats?.cost) && holdingStats.cost > 0
        ? (totalReturn / holdingStats.cost) * 100
        : null;
    const status =
      typeof latestResolution?.status === 'string' && latestResolution.status.length > 0
        ? latestResolution.status
        : latestQuote
          ? 'live'
          : hasFallbackPrice
            ? 'cache_fresh'
            : latestError
              ? 'error'
              : 'unavailable';

    rows.push({
      symbol,
      scope: 'holding',
      scopeLabel: translate('prices.scope.holding'),
      description: translate('prices.scope.holdingDetail'),
      price,
      asOf: latestQuote?.asOf ?? fallbackAsOf?.[symbol] ?? null,
      shares: Number.isFinite(shares) ? shares : null,
      marketValue,
      avgCost: Number.isFinite(holdingStats?.avgCost) ? holdingStats.avgCost : null,
      totalCost: Number.isFinite(holdingStats?.cost) ? holdingStats.cost : null,
      unrealised: Number.isFinite(holdingStats?.unrealised) ? holdingStats.unrealised : null,
      realised: Number.isFinite(holdingStats?.realised) ? holdingStats.realised : null,
      totalReturnPct,
      status,
      statusLabel: translate(`prices.status.${status}`),
      errorMessage:
        typeof latestError?.message === 'string' && latestError.message.trim().length > 0
          ? latestError.message.trim()
          : null,
    });
  }

  const normalizedCatalog = normalizeBenchmarkCatalogResponse(benchmarkCatalog);
  for (const entry of normalizedCatalog.available) {
    const symbol = normalizeTickerSymbol(entry?.ticker);
    if (!symbol || holdingTickers.has(symbol)) {
      continue;
    }
    const latestQuote = latestQuotes[symbol] ?? null;
    const latestError = latestErrors[symbol] ?? null;
    const latestResolution = latestMeta?.[symbol] ?? null;
    const status =
      typeof latestResolution?.status === 'string' && latestResolution.status.length > 0
        ? latestResolution.status
        : latestQuote
          ? 'live'
          : latestError
            ? 'error'
            : 'unavailable';

    rows.push({
      symbol,
      scope: 'benchmark',
      scopeLabel: translate('prices.scope.benchmark'),
      description: entry?.label ?? '',
      price: latestQuote?.price ?? null,
      asOf: latestQuote?.asOf ?? null,
      shares: null,
      marketValue: null,
      status,
      statusLabel: translate(`prices.status.${status}`),
      errorMessage:
        typeof latestError?.message === 'string' && latestError.message.trim().length > 0
          ? latestError.message.trim()
          : null,
    });
  }

  return rows.sort((left, right) => {
    if (left.scope !== right.scope) {
      return left.scope === 'holding' ? -1 : 1;
    }
    return left.symbol.localeCompare(right.symbol);
  });
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
  const [portfolioId, setPortfolioId] = useState('');
  const [desktopSessionLocked, setDesktopSessionLocked] = useState(initialDesktopLocked);
  const [desktopSessionLoading, setDesktopSessionLoading] = useState(initialDesktopLocked);
  const [desktopSessionSubmitting, setDesktopSessionSubmitting] = useState(false);
  const [desktopSessionError, setDesktopSessionError] = useState('');
  const [desktopPortfolios, setDesktopPortfolios] = useState([]);
  const [desktopSelectedPortfolioId, setDesktopSelectedPortfolioId] = useState(() => {
    const storedId = loadActivePortfolioId();
    const runtimePortfolioId =
      typeof runtimeConfig?.ACTIVE_PORTFOLIO_ID === 'string' &&
      runtimeConfig.ACTIVE_PORTFOLIO_ID.trim().length > 0
        ? runtimeConfig.ACTIVE_PORTFOLIO_ID.trim()
        : '';
    return runtimePortfolioId || storedId || '';
  });
  const [desktopPin, setDesktopPin] = useState('');
  const [desktopPinConfirm, setDesktopPinConfirm] = useState('');
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
  const trackedPricesRefreshInFlightRef = useRef(false);
  const [trackedPriceRefreshReady, setTrackedPriceRefreshReady] = useState(false);
  const [signalPricingMeta, setSignalPricingMeta] = useState({});
  const lastGoodRoiDataRef = useRef([]);
  const lastGoodBenchmarkSummaryRef = useRef(null);
  const [roiData, setRoiData] = useState([]);
  const [roiMeta, setRoiMeta] = useState(null);
  const [benchmarkSummary, setBenchmarkSummary] = useState(null);
  const [returnsSummary, setReturnsSummary] = useState(null);
  const [navDaily, setNavDaily] = useState([]);
  const [loadingRoi, setLoadingRoi] = useState(false);
  const [roiRefreshKey, setRoiRefreshKey] = useState(0);
  const [settings, setSettings] = useState(() => loadSettingsFromStorage());
  const [priceAlert, setPriceAlert] = useState(null);
  const [roiAlert, setRoiAlert] = useState(null);
  const [roiSource, setRoiSource] = useState('api');
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

  const pushAlertsEnabled = settings?.notifications?.push !== false;
  const signalTransitionAlertsEnabled =
    pushAlertsEnabled && settings?.notifications?.signalTransitions !== false;
  const marketStatusAlertsEnabled = settings?.alerts?.marketStatus !== false;
  const roiFallbackAlertsEnabled = settings?.alerts?.roiFallback !== false;
  const selectedCurrency = settings?.display?.currency ?? '';
  const refreshIntervalMinutes = Number(settings?.display?.refreshInterval ?? 0);
  const compactTables = Boolean(settings?.display?.compactTables);
  const schedulerStatus = {
    active:
      typeof runtimeConfig?.JOB_NIGHTLY_ACTIVE === 'boolean'
        ? runtimeConfig.JOB_NIGHTLY_ACTIVE
        : null,
    hourUtc: Number.isInteger(runtimeConfig?.JOB_NIGHTLY_HOUR_UTC)
      ? runtimeConfig.JOB_NIGHTLY_HOUR_UTC
      : null,
  };
  const desktopSelectedPortfolio = useMemo(
    () => desktopPortfolios.find((entry) => entry.id === desktopSelectedPortfolioId) ?? null,
    [desktopPortfolios, desktopSelectedPortfolioId]
  );
  const desktopRequiresPinSetup =
    desktopSessionLocked && desktopSelectedPortfolio?.hasPin === false;
  const signalDraft = useMemo(
    () => ({
      transactions,
      signals,
    }),
    [transactions, signals]
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
        const toastType = toast?.type ?? 'info';
        if (!pushAlertsEnabled && toastType !== 'error' && toastType !== 'warning') {
          return current;
        }
        const generatedId = `toast-${Date.now()}-${toastIdRef.current + 1}`;
        toastIdRef.current += 1;
        const id =
          typeof toast?.id === 'string' && toast.id.trim().length > 0 ? toast.id : generatedId;
        const payload = {
          id,
          type: toastType,
          title: toast?.title ?? '',
          message: toast?.message ?? '',
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
    [pushAlertsEnabled]
  );

  const recoverFromPortfolioLoadError = useCallback(
    (error, requestedPortfolioId = '') => {
      if (!isPortfolioSessionAuthError(error)) {
        return false;
      }

      const message = formatPortfolioLoadError(error, t);
      const normalizedPortfolioId =
        typeof requestedPortfolioId === 'string' ? requestedPortfolioId.trim() : '';

      setActivePortfolioId(null);
      bootstrapLoadAttemptedRef.current = false;

      if (desktopBridge) {
        setDesktopSessionError(message);
        setDesktopSessionLocked(true);
        setDesktopSessionLoading(true);
        setDesktopSessionSubmitting(false);
        setDesktopPin('');
        setDesktopPinConfirm('');
        if (normalizedPortfolioId) {
          setDesktopSelectedPortfolioId((current) => current || normalizedPortfolioId);
        }
        return true;
      }

      setPortfolioId('');
      pushToast({
        type: 'error',
        title: t('portfolioControls.toast.loadError.title', {
          id: normalizedPortfolioId || 'desktop',
        }),
        message,
      });
      return true;
    },
    [desktopBridge, pushToast, t]
  );

  const openHoldings = useMemo(() => filterOpenHoldings(holdings), [holdings]);
  const debouncedOpenHoldings = useDebouncedValue(openHoldings, 200);

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

  const signalPriceAsOfByTicker = useMemo(
    () =>
      Object.fromEntries(
        signalRows
          .filter((row) => typeof row?.ticker === 'string' && row.ticker.trim().length > 0)
          .map((row) => [row.ticker.trim().toUpperCase(), row.currentPriceAsOf ?? null])
      ),
    [signalRows]
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
  const benchmarkSummaryWindow = useMemo(() => deriveBenchmarkSummaryWindow(roiData), [roiData]);
  const portfolioSummary = usePortfolioMetrics({ metrics, transactions, roiData });
  const reportSummaryCards = useMemo(
    () =>
      buildReportSummary(transactions, openHoldings, metrics, {
        translate: t,
        formatDate,
      }),
    [transactions, openHoldings, metrics, t, formatDate]
  );

  const handleLanguageChange = useCallback(
    (event) => {
      const next = event.target.value;
      if (next && next !== language) {
        setLanguage(next);
      }
    },
    [language, setLanguage]
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

    loadRoi();

    return () => {
      cancelled = true;
    };
  }, [portfolioId, roiFallbackAlertsEnabled, roiRefreshKey, t, transactions]);

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
        const { data } = await fetchNavDaily({
          portfolioId,
          from: benchmarkSummaryWindow.from,
          to: benchmarkSummaryWindow.to,
          signal: controller.signal,
        });
        if (!cancelled && Array.isArray(data)) {
          setNavDaily(data);
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
  }, [benchmarkSummaryWindow, portfolioId]);

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
        if (signal?.aborted) {
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
    [openHoldings, trackedPriceSymbols]
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
        if (controller.signal.aborted) {
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
  }, [openHoldings, trackedPriceSymbols]);

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

  const applyLoadedPortfolio = useCallback((data, normalizedId) => {
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
  }, []);

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

  useEffect(() => {
    if (!desktopBridge || !desktopSessionLocked) {
      return undefined;
    }

    let cancelled = false;
    setDesktopSessionLoading(true);
    void desktopBridge
      .listPortfolios()
      .then((result) => {
        if (cancelled) {
          return;
        }
        const portfolios = Array.isArray(result?.portfolios) ? result.portfolios : [];
        setDesktopPortfolios(portfolios);
        setDesktopSelectedPortfolioId((current) => {
          const requested =
            current && portfolios.some((entry) => entry.id === current) ? current : '';
          if (requested) {
            return requested;
          }
          const nextDefault =
            typeof result?.defaultPortfolioId === 'string' ? result.defaultPortfolioId.trim() : '';
          if (nextDefault && portfolios.some((entry) => entry.id === nextDefault)) {
            return nextDefault;
          }
          return portfolios[0]?.id ?? '';
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
      setDesktopSessionError(t('desktopSession.error.PORTFOLIO_REQUIRED'));
      return;
    }
    if (!/^\d{4,12}$/u.test(normalizedPin)) {
      setDesktopSessionError(t('desktopSession.error.INVALID_PIN_FORMAT'));
      return;
    }
    if (desktopRequiresPinSetup && normalizedPin !== normalizedPinConfirm) {
      setDesktopSessionError(t('desktopSession.error.INVALID_PIN_CONFIRMATION'));
      return;
    }

    setDesktopSessionSubmitting(true);
    setDesktopSessionError('');
    try {
      const session = desktopRequiresPinSetup
        ? await desktopBridge.setupPin({ portfolioId: selectedId, pin: normalizedPin })
        : await desktopBridge.unlockSession({ portfolioId: selectedId, pin: normalizedPin });

      mergeRuntimeConfig(session?.runtimeConfig ?? {});
      setActivePortfolioId(selectedId);
      setPortfolioId(selectedId);
      setDesktopSessionLocked(false);
      setDesktopPin('');
      setDesktopPinConfirm('');
      bootstrapLoadAttemptedRef.current = true;

      const { data } = await retrievePortfolio(selectedId);
      applyLoadedPortfolio(data, selectedId);
    } catch (error) {
      if (recoverFromPortfolioLoadError(error, selectedId)) {
        return;
      }
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
    recoverFromPortfolioLoadError,
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
      typeof runtimeConfig?.ACTIVE_PORTFOLIO_ID === 'string' &&
      runtimeConfig.ACTIVE_PORTFOLIO_ID.trim().length > 0
        ? runtimeConfig.ACTIVE_PORTFOLIO_ID.trim()
        : '';
    const initialPortfolioId = runtimePortfolioId || storedId;

    if (!initialPortfolioId) {
      return;
    }

    setPortfolioId((current) =>
      current && current.trim().length > 0 ? current : initialPortfolioId
    );
    void retrievePortfolio(initialPortfolioId)
      .then(({ data }) => {
        applyLoadedPortfolio(data, initialPortfolioId);
      })
      .catch((error) => {
        if (recoverFromPortfolioLoadError(error, initialPortfolioId)) {
          return;
        }
        console.error('Failed to bootstrap initial portfolio', error);
      });
  }, [applyLoadedPortfolio, desktopSessionLocked, recoverFromPortfolioLoadError]);

  const handleRefreshRoi = useCallback(() => {
    setRoiRefreshKey((prev) => prev + 1);
  }, []);

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

  const activeAlerts = useMemo(() => {
    return [priceAlert, roiAlert].filter(Boolean).map((alert) => {
      if (!alert) {
        return alert;
      }
      const requestDetails = (() => {
        if (Array.isArray(alert.requestIds) && alert.requestIds.length > 0) {
          return `Request IDs: ${alert.requestIds.join(', ')}`;
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
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t('app.title')}
            </h1>
            <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-400">
              {t('app.subtitle')}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
            <span>{t('app.language')}</span>
            <select
              value={language}
              onChange={handleLanguageChange}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="en">{t('app.language.english')}</option>
              <option value="es">{t('app.language.spanish')}</option>
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
            <div className="mb-6 space-y-3" role="region" aria-label={t('app.systemAlertsRegion')}>
              {activeAlerts.map((alert) => (
                <div
                  key={alert.id}
                  role="alert"
                  className={`rounded-lg border px-4 py-3 text-sm shadow ${
                    alert.type === 'error'
                      ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200'
                      : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'
                  }`}
                >
                  <p className="font-semibold">{alert.message}</p>
                  {alert.detail ? <p className="mt-1 text-sm">{alert.detail}</p> : null}
                  {alert.requestDetails && (
                    <span className="mt-1 block font-mono text-xs">{alert.requestDetails}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <Suspense fallback={<LoadingFallback />}>
            {activeTab === 'Dashboard' && (
              <section
                role="tabpanel"
                id="panel-dashboard"
                aria-labelledby="tab-dashboard"
                data-testid="panel-dashboard"
              >
                <DashboardTab
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
                  onRefreshRoi={handleRefreshRoi}
                  openHoldings={openHoldings}
                  currentPrices={currentPrices}
                />
              </section>
            )}

            {activeTab === 'Holdings' && (
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

            {activeTab === 'Prices' && (
              <section
                role="tabpanel"
                id="panel-prices"
                aria-labelledby="tab-prices"
                data-testid="panel-prices"
              >
                <PricesTab
                  rows={priceBoardRows}
                  summary={portfolioSummary}
                  loading={pricesTabState.loading}
                  onRefresh={() => refreshTrackedPrices()}
                  lastUpdatedAt={pricesTabState.lastUpdatedAt}
                  requestId={pricesTabState.requestId}
                  version={pricesTabState.version}
                />
              </section>
            )}

            {activeTab === 'Signals' && (
              <section
                role="tabpanel"
                id="panel-signals"
                aria-labelledby="tab-signals"
                data-testid="panel-signals"
              >
                <SignalsTab
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

            {activeTab === 'Transactions' && (
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

            {activeTab === 'History' && (
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

            {activeTab === 'Metrics' && (
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

            {activeTab === 'Reports' && (
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

            {activeTab === 'Settings' && (
              <section
                role="tabpanel"
                id="panel-settings"
                aria-labelledby="tab-settings"
                data-testid="panel-settings"
              >
                <SettingsTab
                  settings={settings}
                  schedulerStatus={schedulerStatus}
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
