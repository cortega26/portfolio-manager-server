import { afterEach, beforeEach, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { JSDOM } from 'jsdom';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';

import DashboardTab from '../components/DashboardTab.jsx';
import {
  computeCashBalance,
  deriveDashboardMetrics,
  summarizePortfolioFlows,
} from '../hooks/usePortfolioMetrics.js';
import { BENCHMARK_SERIES_META } from '../utils/roi.js';

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

describe('DashboardTab metrics derivation', () => {
  let dom;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.navigator = dom.window.navigator;
    global.HTMLElement = dom.window.HTMLElement;
    global.SVGElement = dom.window.SVGElement;
    global.Node = dom.window.Node;
    global.localStorage = dom.window.localStorage;
  });

  afterEach(() => {
    cleanup();
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.HTMLElement;
    delete global.SVGElement;
    delete global.Node;
    delete global.localStorage;
  });

  it('computes cash balance from mixed transactions', () => {
    const balance = computeCashBalance(TRANSACTION_FIXTURE);
    assert.equal(balance, 745);
  });

  it('summarizes net contributions and income separately', () => {
    const summary = summarizePortfolioFlows(TRANSACTION_FIXTURE);

    assert.equal(summary.netContributions.toNumber(), 950);
    assert.equal(summary.netIncome.toNumber(), -5);
  });

  it('derives cash allocation and benchmark deltas', () => {
    const derived = deriveDashboardMetrics({
      metrics: METRICS_FIXTURE,
      transactions: TRANSACTION_FIXTURE,
      roiData: ROI_FIXTURE,
    });

    assert.equal(Math.round(derived.totals.totalNav), 1345);
    assert.equal(derived.totals.netContributions, 950);
    assert.equal(derived.totals.netStockPurchases, 200);
    assert.equal(derived.totals.historicalChange, 100);
    assert.equal(derived.totals.positionCost, 500);
    assert.equal(derived.totals.netIncome, -5);
    assert.equal(Math.round(derived.percentages.returnPct), 15);
    assert.ok(Math.abs(derived.percentages.cashAllocationPct - 55.35) < 0.1);
    assert.equal(derived.percentages.cashDragPct, 1.5);
    assert.equal(derived.percentages.spyDeltaPct, -0.5);
    assert.equal(derived.percentages.qqqDeltaPct, -2.5);
    assert.equal(derived.percentages.blendedDeltaPct, 1.0);
  });

  it('sets gap deltas to null when portfolioTwr is unavailable (PM-AUD-007)', () => {
    const roiWithoutTwr = [
      { date: '2024-01-01', portfolio: 0, spy: 0, qqq: 0, blended: 0, exCash: 0, cash: 0 },
      { date: '2024-01-10', portfolio: 15, spy: 12, qqq: 8, blended: 10, exCash: 7, cash: 0.5 },
    ];
    const derived = deriveDashboardMetrics({
      metrics: METRICS_FIXTURE,
      transactions: TRANSACTION_FIXTURE,
      roiData: roiWithoutTwr,
    });
    assert.strictEqual(derived.percentages.spyDeltaPct, null);
    assert.strictEqual(derived.percentages.qqqDeltaPct, null);
    assert.strictEqual(derived.percentages.blendedDeltaPct, null);
  });

  it('computes gap deltas from TWR when portfolioTwr is available (PM-AUD-007)', () => {
    const derived = deriveDashboardMetrics({
      metrics: METRICS_FIXTURE,
      transactions: TRANSACTION_FIXTURE,
      roiData: ROI_FIXTURE,
    });
    assert.strictEqual(derived.percentages.spyDeltaPct, -0.5);
    assert.strictEqual(derived.percentages.qqqDeltaPct, -2.5);
    assert.strictEqual(derived.percentages.blendedDeltaPct, 1.0);
  });

  // --- PM-AUD-019: Methodology-guard tests for gap cards ---

  it('PM-AUD-019: portfolioTwr=null, portfolio=0.15, spy=0.12 → spyDeltaPct === null', () => {
    const roiData = [
      { date: '2024-01-01', portfolio: 0, spy: 0, qqq: 0, blended: 0, exCash: 0, cash: 0 },
      {
        date: '2024-06-30',
        portfolio: 0.15,
        spy: 0.12,
        qqq: 0.1,
        blended: 0.08,
        exCash: 0.14,
        cash: 0.01,
      },
    ];
    const derived = deriveDashboardMetrics({
      metrics: METRICS_FIXTURE,
      transactions: TRANSACTION_FIXTURE,
      roiData,
    });
    assert.strictEqual(derived.percentages.spyDeltaPct, null);
    assert.strictEqual(derived.percentages.qqqDeltaPct, null);
    assert.strictEqual(derived.percentages.blendedDeltaPct, null);
  });

  it('PM-AUD-019: portfolioTwr=0.15, spy=0.12 → spyDeltaPct === 0.03', () => {
    const roiData = [
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
        date: '2024-06-30',
        portfolio: 0.15,
        portfolioTwr: 0.15,
        spy: 0.12,
        qqq: 0.1,
        blended: 0.08,
        exCash: 0.14,
        cash: 0.01,
      },
    ];
    const derived = deriveDashboardMetrics({
      metrics: METRICS_FIXTURE,
      transactions: TRANSACTION_FIXTURE,
      roiData,
    });
    assert.ok(Math.abs(derived.percentages.spyDeltaPct - 0.03) < 1e-10);
    assert.ok(Math.abs(derived.percentages.qqqDeltaPct - 0.05) < 1e-10);
  });

  it('renders dashboard cards with derived KPI values', () => {
    render(
      <DashboardTab
        metrics={METRICS_FIXTURE}
        roiData={ROI_FIXTURE}
        transactions={TRANSACTION_FIXTURE}
        loadingRoi={false}
        onRefreshRoi={() => {}}
      />
    );

    assert.ok(screen.getByText('Equity Balance'));
    assert.ok(screen.getByText('3 open holdings priced'));
    assert.ok(screen.getByText('Net Stock Purchases'));
    assert.ok(screen.getAllByText('$200.00').length >= 1);
    assert.ok(screen.getByText('Gross buys $400.00 minus sells $200.00'));
    assert.ok(screen.getByText('Performance context'));
    assert.ok(screen.getByText('Gap vs Nasdaq-100'));
    assert.ok(screen.getByText('-2.50%'));
    assert.ok(screen.getByText('Equity Price Gain'));
    assert.ok(screen.getAllByText('$100.00').length >= 1);
    assert.ok(screen.getByText('Total NAV'));
    assert.ok(screen.getByText('Cash balance $745.00'));
    assert.ok(screen.getByText('Net External Contributions'));
    assert.ok(screen.getByText('$950.00'));
    assert.ok(screen.getByText('Funding flows only · net income -$5.00'));
    assert.ok(screen.getByText('Total Return'));
    assert.ok(screen.getByText('$145.00'));
    assert.ok(
      screen.getByText(
        'Realised $50.00 · Unrealised $100.00 · Net income -$5.00 · Simple ROI +41.58%'
      )
    );
  });

  it('all benchmark series have unique colors (PM-AUD-005)', () => {
    const colors = BENCHMARK_SERIES_META.map((entry) => entry.color);
    const uniqueColors = new Set(colors);
    assert.strictEqual(
      uniqueColors.size,
      colors.length,
      `Duplicate colors found: ${colors.join(', ')}`
    );
  });
});
