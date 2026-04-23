/**
 * src/components/review/TodayTab.jsx
 * SR-021 — Today shell: health bar + four sections behind redesign.todayShell flag.
 */

import PropTypes from 'prop-types';
import PortfolioHealthBar from './PortfolioHealthBar.jsx';
import NeedsAttentionSection from './NeedsAttentionSection.jsx';
import RecentChangesSection from './RecentChangesSection.jsx';
import DataBlockersSection from './DataBlockersSection.jsx';

export default function TodayTab({
  portfolioId,
  inboxItems = [],
  recentChanges = [],
  degradedReasons = [],
  staleTickers = [],
}) {
  return (
    <div
      data-testid="today-tab"
      className="space-y-4"
      role="tabpanel"
      id="panel-today"
      aria-labelledby="tab-today"
    >
      <PortfolioHealthBar portfolioId={portfolioId} />
      <NeedsAttentionSection items={inboxItems} />
      <RecentChangesSection changes={recentChanges} />
      <DataBlockersSection degradedReasons={degradedReasons} staleTickers={staleTickers} />
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
