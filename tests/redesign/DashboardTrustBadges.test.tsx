import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import DashboardZone1 from '../../src/components/dashboard/DashboardZone1.jsx';
import { I18nProvider } from '../../src/i18n/I18nProvider.jsx';

const FEATURE_FLAGS_KEY = 'portfolio-manager-feature-flags';

const portfolioMetrics = {
  totals: {
    totalNav: 1250,
    totalValue: 1000,
    cashBalance: 250,
    pricedHoldingsCount: 2,
    holdingsCount: 2,
    valuationStatus: 'complete_live',
    missingTickers: [],
  },
  percentages: {
    cashAllocationPct: 20,
  },
};

function renderZone() {
  render(
    <I18nProvider>
      <DashboardZone1
        portfolioMetrics={portfolioMetrics}
        navChange={10}
        navChangePct={0.8}
        priceStatus="api"
        onRefresh={() => {}}
      />
    </I18nProvider>
  );
}

describe('SR-005 Dashboard TrustBadge flag', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  test('does not render the NAV TrustBadge when redesign.trustBadges is off', () => {
    window.localStorage.setItem(
      FEATURE_FLAGS_KEY,
      JSON.stringify({ 'redesign.trustBadges': false })
    );

    renderZone();

    expect(screen.queryByLabelText('Data trust: Live')).not.toBeInTheDocument();
  });

  test('renders the NAV TrustBadge when redesign.trustBadges is on', () => {
    window.localStorage.setItem(
      FEATURE_FLAGS_KEY,
      JSON.stringify({ 'redesign.trustBadges': true })
    );

    renderZone();

    expect(screen.getByLabelText('Data trust: Live')).toBeVisible();
  });
});
