import React from 'react';
import { screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import DashboardTab from '../components/DashboardTab.jsx';
import {
  computeCashBalance,
  deriveDashboardMetrics,
  summarizePortfolioFlows,
} from '../hooks/usePortfolioMetrics.js';
import { renderWithProviders } from './test-utils';

const TRANSACTION_FIXTURE = [
  { date: '2024-01-01', type: 'DEPOSIT', amount: 1000 },
  { date: '2024-01-02', type: 'BUY', amount: -400 },
  { date: '2024-01-05', type: 'SELL', amount: 200 },
  { date: '2024-01-07', type: 'WITHDRAWAL', amount: 50 },
  { date: '2024-01-09', type: 'FEE', amount: 5 },
];

const METRICS_FIXTURE = {
  totalValue: 600,
  totalCost: 500,
  totalRealised: 50,
  totalUnrealised: 100,
  holdingsCount: 3,
};

const ROI_FIXTURE = [
  {
    date: '2024-01-01',
    portfolio: 0,
    portfolioTwr: 0,
    spy: 0,
    qqq: 0,
    blended: 0,
    exCash: 0,
    cash: 0,
  },
  {
    date: '2024-01-10',
    portfolio: 5.5,
    portfolioTwr: 5.5,
    spy: 6,
    qqq: 8,
    blended: 4.5,
    exCash: 7.2,
    cash: 0.9,
  },
];

describe('Dashboard summary metrics', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  });

  afterAll(() => {
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver;
      return;
    }
    delete (globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver;
  });

  it('derives cash balance, net contributions, and return percentages from ledger flows', () => {
    expect(computeCashBalance(TRANSACTION_FIXTURE)).toBe(745);

    const summary = summarizePortfolioFlows(TRANSACTION_FIXTURE);
    expect(summary.netContributions.toNumber()).toBe(950);
    expect(summary.netIncome.toNumber()).toBe(-5);

    const derived = deriveDashboardMetrics({
      metrics: METRICS_FIXTURE,
      transactions: TRANSACTION_FIXTURE,
      roiData: ROI_FIXTURE,
    });

    expect(derived.totals.totalNav).toBe(1345);
    expect(derived.totals.positionCost).toBe(500);
    expect(derived.totals.netContributions).toBe(950);
    expect(derived.totals.netStockPurchases).toBe(200);
    expect(derived.totals.historicalChange).toBe(100);
    expect(derived.totals.netIncome).toBe(-5);
    expect(derived.totals.totalRoiPct).toBeCloseTo(41.5789, 4);
    expect(Math.round(derived.percentages.returnPct)).toBe(15);
    expect(derived.percentages.cashDragPct).toBe(1.5);
    expect(derived.percentages.spyDeltaPct).toBe(-0.5);
    expect(derived.percentages.qqqDeltaPct).toBe(-2.5);
    expect(derived.percentages.blendedDeltaPct).toBe(1);
  });

  it('renders consolidated metric cards (Total NAV, Total Return, Net Contributions, Equity Price Gain)', () => {
    renderWithProviders(
      <DashboardTab
        metrics={METRICS_FIXTURE}
        roiData={ROI_FIXTURE}
        transactions={TRANSACTION_FIXTURE}
        loadingRoi={false}
        onRefreshRoi={() => {}}
      />
    );

    expect(screen.getByText('Performance context')).toBeInTheDocument();
    expect(screen.getByText('Gap vs Nasdaq-100')).toBeInTheDocument();

    // Total NAV card with equity/cash/cashPct subtitle
    expect(screen.getByText('Total NAV')).toBeInTheDocument();
    expect(screen.getByText('Equities $600.00 · Cash $745.00 (55.4%)')).toBeInTheDocument();

    // Net Contributions card with buys/sells/income subtitle
    expect(screen.getByText('Net Contributions')).toBeInTheDocument();
    expect(screen.getByText('$950.00')).toBeInTheDocument();
    expect(
      screen.getByText('Gross buys $400.00 · Gross sells $200.00 · Net income -$5.00')
    ).toBeInTheDocument();

    // Equity Price Gain card
    expect(screen.getByText('Equity Price Gain')).toBeInTheDocument();
    expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0);
  });

  it('shows pricing unavailable states on NAV and return cards when holdings are unpriced', () => {
    renderWithProviders(
      <DashboardTab
        metrics={{
          totalValue: 0,
          totalCost: 500,
          totalRealised: 0,
          totalUnrealised: 0,
          holdingsCount: 1,
          pricedHoldingsCount: 0,
          unpricedHoldingsCount: 1,
        }}
        roiData={ROI_FIXTURE}
        transactions={TRANSACTION_FIXTURE}
        loadingRoi={false}
        onRefreshRoi={() => {}}
      />
    );

    // NAV card shows cash-only fallback
    expect(screen.getByText('Cash balance $745.00 · awaiting market prices')).toBeInTheDocument();
    // Return card shows pricing unavailable
    expect(
      screen.getByText('Waiting for current market prices before computing return and ROI')
    ).toBeInTheDocument();
  });

  it('shows approximate valuation when all holdings are priced from fallback quotes', () => {
    renderWithProviders(
      <DashboardTab
        metrics={{
          totalValue: 500,
          totalCost: 500,
          valuedCostBasis: 500,
          totalRealised: 0,
          totalUnrealised: 0,
          holdingsCount: 1,
          pricedHoldingsCount: 1,
          unpricedHoldingsCount: 0,
          estimatedHoldingsCount: 1,
          valuationStatus: 'complete_estimated',
        }}
        roiData={ROI_FIXTURE}
        transactions={TRANSACTION_FIXTURE}
        loadingRoi={false}
        onRefreshRoi={() => {}}
      />
    );

    expect(screen.getAllByText('≈ Approximate').length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        'Equities $500.00 · Cash $745.00 (59.8%) · Estimated from latest usable prices for 1/1 holdings'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('$1,245.00')).toBeInTheDocument();
  });

  it('shows partial coverage when only some holdings have usable prices', () => {
    renderWithProviders(
      <DashboardTab
        metrics={{
          totalValue: 400,
          totalCost: 500,
          valuedCostBasis: 350,
          totalRealised: 50,
          totalUnrealised: 50,
          holdingsCount: 2,
          pricedHoldingsCount: 1,
          unpricedHoldingsCount: 1,
          estimatedHoldingsCount: 1,
          valuationStatus: 'partial_estimated',
          missingTickers: ['MSFT'],
        }}
        roiData={ROI_FIXTURE}
        transactions={TRANSACTION_FIXTURE}
        loadingRoi={false}
        onRefreshRoi={() => {}}
      />
    );

    expect(screen.getAllByText('Partial coverage').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Equities $400.00 · Cash $745.00 · Partial coverage 1/2 holdings (MSFT)')
    ).toBeInTheDocument();
    expect(screen.getByText('$1,145.00')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Realised $50.00 · Unrealised $50.00 · Net income -$5.00 · Partial coverage 1/2 holdings'
      )
    ).toBeInTheDocument();
  });
});
