import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useDebouncedValue from './useDebouncedValue.js';
import { evaluateSignals } from '../utils/api.js';
import { isSignalStatusActionable, SIGNAL_STATUS } from '../../shared/signals.js';
import { getMarketClock } from '../utils/marketHours.js';
import { mergePricingSymbolMetadata } from '../utils/portfolioManagerApp.js';

export default function useSignalPreview({
  debouncedOpenHoldings,
  transactions,
  formatCurrency,
  formatDate,
  marketStatusAlertsEnabled,
  signalTransitionAlertsEnabled,
  pushToast,
  t,
}) {
  const signalRowsRef = useRef(new Map());
  const signalNotificationsReadyRef = useRef(false);
  const [signals, setSignals] = useState({});
  const [signalRows, setSignalRows] = useState([]);
  const [currentPrices, setCurrentPrices] = useState({});
  const [signalPricingMeta, setSignalPricingMeta] = useState({});
  const [trackedPriceRefreshReady, setTrackedPriceRefreshReady] = useState(false);
  const [priceAlert, setPriceAlert] = useState(null);
  const currentPricesRef = useRef({});

  useEffect(() => {
    currentPricesRef.current = currentPrices;
  }, [currentPrices]);

  const signalDraft = useMemo(() => ({ transactions, signals }), [transactions, signals]);
  const debouncedSignalDraft = useDebouncedValue(signalDraft, 200);

  const handleSignalChange = useCallback((ticker, pct) => {
    const pctValue = Number.parseFloat(pct);
    if (!Number.isFinite(pctValue)) {
      return;
    }
    setSignals((prev) => ({ ...prev, [ticker]: { pct: pctValue } }));
  }, []);

  const signalPriceAsOfByTicker = useMemo(
    () =>
      Object.fromEntries(
        signalRows
          .filter((row) => typeof row?.ticker === 'string' && row.ticker.trim().length > 0)
          .map((row) => [row.ticker.trim().toUpperCase(), row.currentPriceAsOf ?? null])
      ),
    [signalRows]
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadSignalPreview() {
      if (debouncedOpenHoldings.length === 0) {
        setTrackedPriceRefreshReady(false);
        setSignalRows([]);
        setCurrentPrices({});
        setSignalPricingMeta({});
        setPriceAlert(null);
        signalRowsRef.current = new Map();
        signalNotificationsReadyRef.current = false;
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

  return {
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
  };
}
