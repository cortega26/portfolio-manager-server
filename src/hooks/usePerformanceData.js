import { useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';

import { fetchBenchmarkSummary, fetchDailyRoi, fetchNavDaily } from '../utils/api.js';
import { deriveBenchmarkSummaryWindow } from '../utils/portfolioManagerApp.js';
import { mergeDailyRoiSeries } from '../utils/roi.js';
import { queryKeys } from '../lib/queryKeys.js';
import { DEFAULT_API_CACHE_TTL_SECONDS } from '../../shared/constants.js';

const STALE_TIME_MS = DEFAULT_API_CACHE_TTL_SECONDS * 1000;

export default function usePerformanceData({
  portfolioId,
  transactions,
  roiFallbackAlertsEnabled,
  t,
}) {
  const queryClient = useQueryClient();
  const lastGoodRoiDataRef = useRef([]);
  const lastGoodBenchmarkSummaryRef = useRef(null);

  // ── Derived pre-conditions ──────────────────────────────────────────────
  const orderedDates = useMemo(
    () =>
      transactions
        .map((tx) => tx.date)
        .filter((date) => typeof date === 'string' && date.trim().length > 0)
        .sort((a, b) => a.localeCompare(b)),
    [transactions]
  );

  const hasSecurityTransactions = useMemo(
    () => transactions.some((tx) => typeof tx?.ticker === 'string' && tx.ticker.trim().length > 0),
    [transactions]
  );

  const roiEnabled = hasSecurityTransactions && transactions.length > 0;

  // ── Helpers ─────────────────────────────────────────────────────────────
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

  // ── ROI query ───────────────────────────────────────────────────────────
  const roiQuery = useQuery({
    queryKey: queryKeys.performance(portfolioId, orderedDates[0] ?? '', transactions.length),
    queryFn: async ({ signal }) => {
      const { data, requestId } = await fetchDailyRoi({
        portfolioId,
        from: orderedDates[0],
        to: new Date(),
        signal,
      });
      return { ...data, _requestId: requestId };
    },
    enabled: roiEnabled,
    staleTime: STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const mergedSeries = useMemo(() => mergeDailyRoiSeries(roiQuery.data?.series), [roiQuery.data]);

  // Update last-good ref when query succeeds with non-empty data
  if (roiQuery.isSuccess && mergedSeries.length > 0) {
    lastGoodRoiDataRef.current = mergedSeries;
  }

  // ── Benchmark summary window (depends on merged ROI series) ─────────────
  const benchmarkSummaryWindow = useMemo(
    () => deriveBenchmarkSummaryWindow(mergedSeries),
    [mergedSeries]
  );

  const benchEnabled = !!benchmarkSummaryWindow?.from && !!benchmarkSummaryWindow?.to;

  // ── Benchmark summary query ─────────────────────────────────────────────
  const benchmarkQuery = useQuery({
    queryKey: queryKeys.benchmarkSummary(
      portfolioId,
      benchmarkSummaryWindow?.from ?? '',
      benchmarkSummaryWindow?.to ?? ''
    ),
    queryFn: async ({ signal }) => {
      const { data } = await fetchBenchmarkSummary({
        portfolioId,
        from: benchmarkSummaryWindow.from,
        to: benchmarkSummaryWindow.to,
        signal,
      });
      return data;
    },
    enabled: benchEnabled,
    staleTime: STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  if (benchmarkQuery.isSuccess && benchmarkQuery.data) {
    const moneyWeighted =
      benchmarkQuery.data?.money_weighted && typeof benchmarkQuery.data.money_weighted === 'object'
        ? benchmarkQuery.data.money_weighted
        : null;
    if (moneyWeighted) {
      lastGoodBenchmarkSummaryRef.current = moneyWeighted;
    }
  }

  // ── NAV daily query ─────────────────────────────────────────────────────
  const navFrom =
    mergedSeries.length > 0 && mergedSeries[0]?.date
      ? mergedSeries[0].date
      : benchmarkSummaryWindow?.from;

  const navQuery = useQuery({
    queryKey: queryKeys.navDaily(
      portfolioId,
      benchmarkSummaryWindow?.from ?? '',
      benchmarkSummaryWindow?.to ?? ''
    ),
    queryFn: async ({ signal }) => {
      const { data } = await fetchNavDaily({
        portfolioId,
        from: navFrom,
        to: benchmarkSummaryWindow.to,
        signal,
      });
      return Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
    },
    enabled: benchEnabled && !!navFrom,
    staleTime: STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  // ── Derived state (matches pre-TanStack return shape) ───────────────────

  const roiData = useMemo(() => {
    if (!roiEnabled) return [];
    if (roiQuery.isSuccess) return mergedSeries;
    if (roiQuery.isError && lastGoodRoiDataRef.current.length > 0) {
      return lastGoodRoiDataRef.current;
    }
    if (roiQuery.data) return mergedSeries;
    return [];
  }, [roiEnabled, roiQuery.isSuccess, roiQuery.isError, roiQuery.data, mergedSeries]);

  const roiMeta = useMemo(() => roiQuery.data?.meta ?? null, [roiQuery.data]);

  const roiSource = useMemo(() => {
    if (!hasSecurityTransactions && transactions.length === 0) return 'api';
    if (!hasSecurityTransactions) return 'cash-only';
    if (roiQuery.isSuccess) return 'api';
    if (roiQuery.isError) {
      return lastGoodRoiDataRef.current.length > 0 ? 'stale' : 'error';
    }
    if (roiQuery.data) return 'api';
    return 'api';
  }, [
    hasSecurityTransactions,
    transactions.length,
    roiQuery.isSuccess,
    roiQuery.isError,
    roiQuery.data,
  ]);

  const roiAlert = useMemo(() => {
    if (!roiEnabled) return null;

    // Error state
    if (roiQuery.isError) {
      const errorDetail = resolveErrorDetail(roiQuery.error);
      if (lastGoodRoiDataRef.current.length > 0 && roiFallbackAlertsEnabled) {
        return {
          id: 'roi-stale',
          type: 'warning',
          message: t('alerts.roi.stale'),
          detail: errorDetail,
          requestId: resolveRequestId(roiQuery.error),
        };
      }
      return {
        id: 'roi-unavailable',
        type: 'error',
        message: t('alerts.roi.unavailable'),
        detail: errorDetail,
        requestId: resolveRequestId(roiQuery.error),
      };
    }

    // Success — check benchmark health
    if (roiQuery.isSuccess && roiMeta) {
      const unavailableBenchmarks = Array.isArray(roiMeta?.benchmarkHealth?.unavailable)
        ? roiMeta.benchmarkHealth.unavailable
        : [];
      if (unavailableBenchmarks.length > 0) {
        return {
          id: 'roi-benchmark-health',
          type: 'warning',
          message: t('alerts.roi.benchmarkUnavailable.title'),
          detail: t('alerts.roi.benchmarkUnavailable.detail', {
            benchmarks: unavailableBenchmarks.join(', '),
          }),
        };
      }
    }

    return null;
  }, [
    roiEnabled,
    roiQuery.isSuccess,
    roiQuery.isError,
    roiQuery.error,
    roiMeta,
    roiFallbackAlertsEnabled,
    t,
  ]);

  // ── Benchmark & returns summary ────────────────────────────────────────

  const benchmarkSummary = useMemo(() => {
    if (benchmarkQuery.isSuccess && benchmarkQuery.data) {
      const moneyWeighted =
        benchmarkQuery.data?.money_weighted &&
        typeof benchmarkQuery.data.money_weighted === 'object'
          ? benchmarkQuery.data.money_weighted
          : null;
      return moneyWeighted;
    }
    if (benchmarkQuery.isError && lastGoodBenchmarkSummaryRef.current) {
      return lastGoodBenchmarkSummaryRef.current;
    }
    return null;
  }, [benchmarkQuery.isSuccess, benchmarkQuery.isError, benchmarkQuery.data]);

  const returnsSummary = useMemo(() => {
    if (!benchmarkQuery.isSuccess || !benchmarkQuery.data) return null;
    const d = benchmarkQuery.data;
    const summary = d?.summary && typeof d.summary === 'object' ? d.summary : null;
    const maxDrawdown =
      d?.max_drawdown && typeof d.max_drawdown === 'object' ? d.max_drawdown : null;
    const sharpeRatio = d?.sharpe_ratio;
    const currentDrawdown = d?.current_drawdown;
    const rollingReturns = d?.rolling_returns;
    return summary
      ? {
          ...summary,
          max_drawdown: maxDrawdown,
          sharpe_ratio: sharpeRatio,
          current_drawdown: currentDrawdown,
          rolling_returns: rollingReturns,
        }
      : null;
  }, [benchmarkQuery.isSuccess, benchmarkQuery.data]);

  // ── refreshRoi — invalidate all performance queries for this portfolio ──
  const refreshRoi = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.portfolio(portfolioId),
    });
  }, [portfolioId, queryClient]);

  return {
    roiData,
    roiMeta,
    roiSource,
    roiAlert,
    loadingRoi: roiQuery.isLoading,
    benchmarkSummary,
    returnsSummary,
    navDaily: navQuery.data ?? [],
    refreshRoi,
  };
}
