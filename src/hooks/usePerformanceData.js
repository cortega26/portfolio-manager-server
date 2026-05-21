import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchBenchmarkSummary, fetchDailyRoi, fetchNavDaily } from '../utils/api.js';
import { deriveBenchmarkSummaryWindow } from '../utils/portfolioManagerApp.js';
import { mergeDailyRoiSeries } from '../utils/roi.js';

export default function usePerformanceData({
  portfolioId,
  transactions,
  roiFallbackAlertsEnabled,
  t,
}) {
  const [roiData, setRoiData] = useState([]);
  const [roiMeta, setRoiMeta] = useState(null);
  const [roiSource, setRoiSource] = useState('api');
  const [roiAlert, setRoiAlert] = useState(null);
  const [loadingRoi, setLoadingRoi] = useState(false);
  const [benchmarkSummary, setBenchmarkSummary] = useState(null);
  const [returnsSummary, setReturnsSummary] = useState(null);
  const [navDaily, setNavDaily] = useState([]);
  const [roiRefreshKey, setRoiRefreshKey] = useState(0);
  const lastGoodRoiDataRef = useRef([]);
  const lastGoodBenchmarkSummaryRef = useRef(null);

  const benchmarkSummaryWindow = useMemo(() => deriveBenchmarkSummaryWindow(roiData), [roiData]);

  const refreshRoi = useCallback(() => {
    setRoiRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const resolveRequestId = (error) => {
      if (typeof error?.requestId === 'string' && error.requestId.trim().length > 0) {
        return error.requestId;
      }
      return null;
    };

    const resolveErrorDetail = (error) => {
      if (error?.body && typeof error.body === 'object' && typeof error.body.message === 'string') {
        return error.body.message.trim();
      }
      if (typeof error?.message === 'string' && error.message.trim().length > 0) {
        return error.message.trim();
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
        const errorDetail = resolveErrorDetail(error);
        if (lastGoodRoiDataRef.current.length > 0) {
          setRoiData(lastGoodRoiDataRef.current);
          setRoiSource('stale');
          setRoiAlert(
            roiFallbackAlertsEnabled
              ? {
                  id: 'roi-stale',
                  type: 'warning',
                  message: t('alerts.roi.stale'),
                  detail: errorDetail,
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
          detail: errorDetail,
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
        const sharpeRatio = data?.sharpe_ratio;
        const currentDrawdown = data?.current_drawdown;
        const rollingReturns = data?.rolling_returns;
        setReturnsSummary(
          summary
            ? {
                ...summary,
                max_drawdown: maxDrawdown,
                sharpe_ratio: sharpeRatio,
                current_drawdown: currentDrawdown,
                rolling_returns: rollingReturns,
              }
            : null
        );
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

  return {
    roiData,
    roiMeta,
    roiSource,
    roiAlert,
    loadingRoi,
    benchmarkSummary,
    returnsSummary,
    navDaily,
    refreshRoi,
  };
}
