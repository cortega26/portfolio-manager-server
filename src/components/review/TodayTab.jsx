/**
 * src/components/review/TodayTab.jsx
 * SR-021 — Today shell: health bar + four sections behind redesign.todayShell flag.
 */

import { useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import PortfolioHealthBar from './PortfolioHealthBar.jsx';
import NeedsAttentionSection from './NeedsAttentionSection.jsx';
import RecentChangesSection from './RecentChangesSection.jsx';
import DataBlockersSection from './DataBlockersSection.jsx';

function resolveTodayStatus(health) {
  if (!health) return 'loading';
  if (
    health.freshness_state === 'expired' ||
    ['low', 'degraded'].includes(health.confidence_state)
  ) {
    return 'blocked';
  }
  if (
    health.action_count > 0 ||
    health.freshness_state === 'stale' ||
    health.confidence_state === 'medium' ||
    (Array.isArray(health.degraded_reasons) && health.degraded_reasons.length > 0)
  ) {
    return 'needs_attention';
  }
  return 'healthy';
}

export default function TodayTab({
  portfolioId,
  inboxItems = [],
  recentChanges = [],
  degradedReasons = [],
  staleTickers = [],
}) {
  const [health, setHealth] = useState(null);
  const handleHealthChange = useCallback((nextHealth) => {
    setHealth(nextHealth);
  }, []);
  const todayStatus = resolveTodayStatus(health);
  const resolvedDegradedReasons = useMemo(() => {
    const healthReasons = Array.isArray(health?.degraded_reasons) ? health.degraded_reasons : [];
    return [...new Set([...healthReasons, ...degradedReasons])];
  }, [degradedReasons, health]);

  return (
    <div
      data-testid="today-tab"
      data-today-status={todayStatus}
      className="space-y-4"
      role="tabpanel"
      id="panel-today"
      aria-labelledby="tab-today"
    >
      <PortfolioHealthBar portfolioId={portfolioId} onHealthChange={handleHealthChange} />
      <NeedsAttentionSection items={inboxItems} />
      <RecentChangesSection changes={recentChanges} />
      <DataBlockersSection degradedReasons={resolvedDegradedReasons} staleTickers={staleTickers} />
    </div>
  );
}

TodayTab.propTypes = {
  portfolioId: PropTypes.string.isRequired,
  inboxItems: PropTypes.array,
  recentChanges: PropTypes.array,
  degradedReasons: PropTypes.arrayOf(PropTypes.string),
  staleTickers: PropTypes.arrayOf(PropTypes.string),
};
