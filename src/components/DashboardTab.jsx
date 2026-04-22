import { useEffect, useMemo, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { fetchInbox } from '../utils/api.js';
import { usePortfolioMetrics } from '../hooks/usePortfolioMetrics.js';
import DashboardZone1 from './dashboard/DashboardZone1.jsx';
import DashboardZone2 from './dashboard/DashboardZone2.jsx';
import DashboardZone3 from './dashboard/DashboardZone3.jsx';
import DashboardChartsPanel from './dashboard/DashboardChartsPanel.jsx';
import { formatShortDate } from './dashboard/dashboardFormatters.js';

// Re-export formatShortDate so existing test imports continue to work.
export { formatShortDate };

/**
 * Dashboard tab orchestrator.
 *
 * All heavy sub-components are in `src/components/dashboard/`:
 *   - DashboardZone1  — large NAV display + daily delta
 *   - DashboardZone2  — action inbox (Phase 5 placeholder)
 *   - DashboardZone3  — metric cards + performance context + allocation + contributions
 *   - DashboardChartsPanel — collapsible ROI + NAV growth charts
 */
export default function DashboardTab({
  portfolioId,
  metrics,
  roiData,
  roiMeta = null,
  benchmarkSummary = null,
  returnsSummary = null,
  navDaily = [],
  transactions = [],
  loadingRoi,
  onRefreshRoi,
  roiSource = 'api',
  benchmarkCatalog,
  openHoldings = [],
  currentPrices = {},
  onNavigateToInbox,
}) {
  const portfolioMetrics = usePortfolioMetrics({ metrics, transactions, roiData });

  // Fetch inbox and derive top 3 HIGH urgency items for Zone 2.
  const [inboxItems, setInboxItems] = useState([]);
  const abortRef = useRef(null);
  useEffect(() => {
    if (!portfolioId) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetchInbox(portfolioId, { signal: controller.signal })
      .then((res) => {
        const items = res?.items ?? [];
        setInboxItems(items.filter((it) => it.urgency === 'HIGH').slice(0, 3));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [portfolioId]);

  const top3High = inboxItems;

  // Daily NAV change computed from the last two navDaily entries.
  const navChange = useMemo(() => {
    if (!Array.isArray(navDaily) || navDaily.length < 2) {
      return null;
    }
    const lastRaw = navDaily[navDaily.length - 1]?.portfolio_nav;
    const prevRaw = navDaily[navDaily.length - 2]?.portfolio_nav;
    if (lastRaw == null || prevRaw == null) {
      return null;
    }
    const last = new Decimal(lastRaw);
    const prev = new Decimal(prevRaw);
    if (prev.isZero()) {
      return null;
    }
    return {
      absolute: last.minus(prev).toNumber(),
      percent: last.minus(prev).dividedBy(prev).times(100).toNumber(),
    };
  }, [navDaily]);

  return (
    <div className="space-y-6">
      <DashboardZone1
        portfolioMetrics={portfolioMetrics}
        navChange={navChange?.absolute ?? null}
        navChangePct={navChange?.percent ?? null}
        priceStatus={roiSource}
        onRefresh={onRefreshRoi}
      />
      <DashboardZone2 items={top3High} onSeeAll={onNavigateToInbox} />
      <DashboardZone3
        portfolioMetrics={portfolioMetrics}
        benchmarkSummary={benchmarkSummary}
        returnsSummary={returnsSummary}
        openHoldings={openHoldings}
        currentPrices={currentPrices}
      />
      <DashboardChartsPanel
        roiData={roiData}
        roiMeta={roiMeta}
        transactions={transactions}
        loadingRoi={loadingRoi}
        roiSource={roiSource}
        benchmarkCatalog={benchmarkCatalog}
        navDaily={navDaily}
      />
    </div>
  );
}
