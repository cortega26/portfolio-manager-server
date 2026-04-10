import React from 'react';
import { screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import DashboardTab from '../components/DashboardTab.jsx';
import { renderWithProviders } from './test-utils';

const metricsFixture = {
  totalValue: 1000,
  totalCost: 800,
  totalUnrealised: 200,
  totalRealised: 0,
  holdingsCount: 1,
};

const benchmarkCatalogFixture = {
  available: [
    { id: 'spy', ticker: 'SPY', label: 'S&P 500', kind: 'market' },
    { id: 'qqq', ticker: 'QQQ', label: 'Nasdaq-100', kind: 'market' },
  ],
  derived: [{ id: 'blended', label: 'Blended benchmark', kind: 'derived' }],
  defaults: ['spy', 'qqq'],
  priceSymbols: ['SPY', 'QQQ'],
};

describe('DashboardTab benchmark health notice', () => {
  test('renders a compact backend benchmark availability notice when canonical series are rebuilding', () => {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    renderWithProviders(
      <DashboardTab
        metrics={metricsFixture}
        roiData={[
          { date: '2024-01-01', portfolio: 0, spy: null, qqq: null, blended: null, exCash: 0, cash: 0 },
          { date: '2024-01-02', portfolio: 1.2, spy: null, qqq: null, blended: null, exCash: 1.1, cash: 0.1 },
        ]}
        roiMeta={{
          benchmarkHealth: {
            unavailable: ['SPY', 'QQQ'],
          },
        }}
        loadingRoi={false}
        onRefreshRoi={() => {}}
        benchmarkCatalog={benchmarkCatalogFixture}
      />,
    );

    expect(
      screen.getByText(
        /Canonical benchmark data is still being rebuilt for: SPY, QQQ/i,
      ),
    ).toBeVisible();
  });
});
