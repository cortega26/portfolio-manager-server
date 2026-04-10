import React from 'react';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: ({ name }: { name?: string }) => <span data-testid="area-series">{name}</span>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: ({ formatter }: { formatter?: (value: number) => React.ReactNode }) => (
    <div data-testid="chart-tooltip">{formatter ? formatter(77.94444) : null}</div>
  ),
  Legend: ({ payload }: { payload?: Array<{ id?: string; value?: string }> }) => (
    <div data-testid="chart-legend">
      {(payload ?? []).map((entry) => (
        <span key={entry.id ?? entry.value}>{entry.value}</span>
      ))}
    </div>
  ),
  Line: ({ name }: { name?: string }) => <span>{name}</span>,
}));

import DashboardTab, { formatShortDate } from '../components/DashboardTab.jsx';
import { BENCHMARK_SERIES_META } from '../utils/roi.js';
import { getBenchmarkStorageKey } from '../hooks/usePersistentBenchmarkSelection.js';
import { renderWithProviders } from './test-utils';

// --- PM-AUD-015: formatShortDate unit tests ---
describe('formatShortDate', () => {
  test('converts ISO date to abbreviated format', () => {
    expect(formatShortDate('2024-01-15')).toBe("Jan '24");
    expect(formatShortDate('2024-02-01')).toBe("Feb '24");
    expect(formatShortDate('2024-12-31')).toBe("Dec '24");
  });

  test('returns input for invalid dates', () => {
    expect(formatShortDate('bad')).toBe('bad');
    expect(formatShortDate('')).toBe('');
  });

  test('handles null/undefined gracefully', () => {
    expect(formatShortDate(null as any)).toBe('');
    expect(formatShortDate(undefined as any)).toBe('');
  });
});

const metricsFixture = {
  totalValue: 1000,
  totalCost: 800,
  totalUnrealised: 200,
  totalRealised: 0,
  holdingsCount: 4,
};

const roiFixture = [
  {
    date: '2024-01-01',
    portfolio: -2,
    portfolioTwr: 0,
    spy: 0,
    qqq: 0,
    blended: 0,
    exCash: 0,
    cash: 0,
  },
  {
    date: '2024-01-02',
    portfolio: 1.23,
    portfolioTwr: 3.21,
    spy: 1.1,
    qqq: 1.4,
    blended: 0.9,
    exCash: 1.5,
    cash: 0.05,
  },
];

const benchmarkCatalogFixture = {
  available: [
    { id: 'spy', ticker: 'SPY', label: '100% SPY benchmark', kind: 'market' },
    { id: 'qqq', ticker: 'QQQ', label: 'Nasdaq-100 (QQQ)', kind: 'market' },
  ],
  derived: [{ id: 'blended', label: 'Blended benchmark', kind: 'derived' }],
  defaults: ['spy', 'qqq'],
  priceSymbols: ['SPY', 'QQQ'],
};

const benchmarkSummaryFixture = {
  portfolio: 0.1234,
  benchmarks: {
    spy: 0.1012,
    qqq: 0.0987,
  },
  start_date: '2024-01-02',
  end_date: '2025-01-02',
  method: 'xirr',
  basis: 'matched_external_flows',
  partial: false,
};

describe('DashboardTab benchmark controls', () => {
  beforeEach(() => {
    window.localStorage.clear();
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    cleanup();
  });

  test('toggles benchmark visibility and persists the choice', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <DashboardTab
        metrics={metricsFixture}
        roiData={roiFixture}
        loadingRoi={false}
        onRefreshRoi={() => {}}
        benchmarkCatalog={benchmarkCatalogFixture}
      />,
    );

    const storageKey = getBenchmarkStorageKey();

    const spyToggle = screen.getByRole('button', {
      name: /s&p 500/i,
    });
    const qqqToggle = screen.getByRole('button', {
      name: /nasdaq-100/i,
    });
    const resetButton = screen.getByRole('button', { name: /reset/i });

    expect(spyToggle).toHaveAttribute('aria-pressed', 'true');
    expect(qqqToggle).toHaveAttribute('aria-pressed', 'true');
    expect(resetButton).toBeDisabled();

    await user.click(spyToggle);
    expect(spyToggle).toHaveAttribute('aria-pressed', 'false');
    expect(qqqToggle).toHaveAttribute('aria-pressed', 'true');
    expect(resetButton).not.toBeDisabled();
    expect(JSON.parse(window.localStorage.getItem(storageKey) ?? '[]')).toEqual(['qqq']);

    await user.click(resetButton);
    expect(spyToggle).toHaveAttribute('aria-pressed', 'true');
    expect(qqqToggle).toHaveAttribute('aria-pressed', 'true');
    expect(resetButton).toBeDisabled();
    expect(JSON.parse(window.localStorage.getItem(storageKey) ?? '[]')).toEqual(['spy', 'qqq']);
  });

  test('renders the comparative chart as TWR vs benchmarks with explicit labels', () => {
    renderWithProviders(
      <DashboardTab
        metrics={metricsFixture}
        roiData={roiFixture}
        loadingRoi={false}
        onRefreshRoi={() => {}}
        benchmarkCatalog={benchmarkCatalogFixture}
      />,
    );

    expect(screen.getAllByText(/TWR vs Benchmarks/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/^Portfolio TWR$/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/^S&P 500 TWR$/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/^Nasdaq-100 TWR$/i).length).toBeGreaterThanOrEqual(1);
  });

  test('formats principal ROI with 2 decimals and chart detail with 4 decimals', () => {
    renderWithProviders(
      <DashboardTab
        metrics={metricsFixture}
        roiData={[
          {
            date: '2024-01-01',
            portfolio: 77.94444,
            portfolioTwr: 0,
            spy: 77.12345,
            qqq: 78.12345,
            blended: 76.98765,
            exCash: 78.45678,
            cash: 0.05,
          },
        ]}
        loadingRoi={false}
        onRefreshRoi={() => {}}
        benchmarkCatalog={benchmarkCatalogFixture}
      />,
    );

    expect(screen.getByText('+77.94%')).toBeInTheDocument();
    expect(screen.getAllByTestId('chart-tooltip')[0]).toHaveTextContent('77.9444%');
  });

  test('replaces the cash drag card with the investor MWR card', () => {
    window.localStorage.setItem('portfolio-manager-language', 'es');

    renderWithProviders(
      <DashboardTab
        metrics={metricsFixture}
        roiData={roiFixture}
        benchmarkSummary={benchmarkSummaryFixture}
        loadingRoi={false}
        onRefreshRoi={() => {}}
        benchmarkCatalog={benchmarkCatalogFixture}
      />,
    );

    expect(screen.queryByText(/Arrastre por caja/i)).not.toBeInTheDocument();
    expect(screen.getByText(/MWR inversionista/i)).toBeInTheDocument();
    expect(screen.getByText(/MWR 1A \+12[.,]34%/i)).toBeInTheDocument();
    expect(
      screen.getByText(/SPY \+10[.,]12% · QQQ \+9[.,]87% con tus mismos flujos/i),
    ).toBeInTheDocument();
  });

  test('shows the partial window detail when there is not a full year of history', () => {
    window.localStorage.setItem('portfolio-manager-language', 'es');

    renderWithProviders(
      <DashboardTab
        metrics={metricsFixture}
        roiData={roiFixture}
        benchmarkSummary={{
          ...benchmarkSummaryFixture,
          partial: true,
          start_date: '2024-08-15',
        }}
        loadingRoi={false}
        onRefreshRoi={() => {}}
        benchmarkCatalog={benchmarkCatalogFixture}
      />,
    );

    expect(screen.queryByText(/MWR 1A/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Ventana parcial desde/i),
    ).toBeInTheDocument();
  });

  test('keeps rendering the dashboard context when benchmark summary data is missing', () => {
    window.localStorage.setItem('portfolio-manager-language', 'es');

    renderWithProviders(
      <DashboardTab
        metrics={metricsFixture}
        roiData={roiFixture}
        benchmarkSummary={{
          portfolio: null,
          benchmarks: { spy: null, qqq: null },
          start_date: null,
          end_date: null,
          method: 'xirr',
          basis: 'matched_external_flows',
          partial: false,
        }}
        loadingRoi={false}
        onRefreshRoi={() => {}}
        benchmarkCatalog={benchmarkCatalogFixture}
      />,
    );

    expect(screen.getByText(/MWR inversionista/i)).toBeInTheDocument();
    expect(screen.getByText(/Brecha vs Nasdaq-100/i)).toBeInTheDocument();
    expect(screen.getByText(/Drawdown máximo/i)).toBeInTheDocument();
  });

  test('shows annualized TWR suffix when returnsSummary has annualized_r_port', () => {
    renderWithProviders(
      <DashboardTab
        metrics={metricsFixture}
        roiData={roiFixture}
        benchmarkSummary={benchmarkSummaryFixture}
        returnsSummary={{ r_port: 0.50, annualized_r_port: 0.2247 }}
        loadingRoi={false}
        onRefreshRoi={() => {}}
        benchmarkCatalog={benchmarkCatalogFixture}
      />,
    );

    expect(screen.getByText(/ann\./i)).toBeInTheDocument();
    expect(screen.getByText(/\+22[.,]47%/)).toBeInTheDocument();
  });

  test('does NOT show annualized suffix when returnsSummary has no annualized_r_port', () => {
    renderWithProviders(
      <DashboardTab
        metrics={metricsFixture}
        roiData={roiFixture}
        benchmarkSummary={benchmarkSummaryFixture}
        returnsSummary={{ r_port: 0.10 }}
        loadingRoi={false}
        onRefreshRoi={() => {}}
        benchmarkCatalog={benchmarkCatalogFixture}
      />,
    );

    expect(screen.queryByText(/ann\./i)).not.toBeInTheDocument();
  });

  test('does NOT show annualized suffix when returnsSummary is null', () => {
    renderWithProviders(
      <DashboardTab
        metrics={metricsFixture}
        roiData={roiFixture}
        benchmarkSummary={benchmarkSummaryFixture}
        loadingRoi={false}
        onRefreshRoi={() => {}}
        benchmarkCatalog={benchmarkCatalogFixture}
      />,
    );

    expect(screen.queryByText(/ann\./i)).not.toBeInTheDocument();
  });

  // --- PM-AUD-012: Max Drawdown card ---

  test('shows Max Drawdown context card when returnsSummary has max_drawdown', () => {
    renderWithProviders(
      <DashboardTab
        metrics={metricsFixture}
        roiData={roiFixture}
        benchmarkSummary={benchmarkSummaryFixture}
        returnsSummary={{
          r_port: 0.50,
          max_drawdown: { value: -0.12, peak_date: '2024-03-15', trough_date: '2024-06-20' },
        }}
        loadingRoi={false}
        onRefreshRoi={() => {}}
        benchmarkCatalog={benchmarkCatalogFixture}
      />,
    );

    expect(screen.getByText(/Max Drawdown/i)).toBeInTheDocument();
    expect(screen.getByText(/-12[.,]00%/)).toBeInTheDocument();
    expect(screen.getByText(/Mar 2024 – Jun 2024/)).toBeInTheDocument();
  });

  test('shows "—" for Max Drawdown when data is insufficient', () => {
    renderWithProviders(
      <DashboardTab
        metrics={metricsFixture}
        roiData={roiFixture}
        benchmarkSummary={benchmarkSummaryFixture}
        returnsSummary={{ r_port: 0.10, max_drawdown: null }}
        loadingRoi={false}
        onRefreshRoi={() => {}}
        benchmarkCatalog={benchmarkCatalogFixture}
      />,
    );

    expect(screen.getByText(/Max Drawdown/i)).toBeInTheDocument();
    expect(screen.getByText(/Insufficient data/i)).toBeInTheDocument();
  });

  // --- PM-AUD-013: Dashboard renders exactly 4 metric cards ---

  test('renders exactly 4 metric cards', () => {
    renderWithProviders(
      <DashboardTab
        metrics={metricsFixture}
        roiData={roiFixture}
        loadingRoi={false}
        onRefreshRoi={() => {}}
        benchmarkCatalog={benchmarkCatalogFixture}
      />,
    );

    expect(screen.getByText(/Total NAV/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Return/i)).toBeInTheDocument();
    expect(screen.getByText(/Net Contributions/i)).toBeInTheDocument();
    expect(screen.getByText(/Equity Price Gain/i)).toBeInTheDocument();
    // These cards should NOT appear as standalone anymore
    expect(screen.queryByText(/^Equity Balance$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Net Stock Purchases$/i)).not.toBeInTheDocument();
  });

  // --- PM-AUD-014: 5 context cards rendered ---

  test('renders 5 context cards with Max Drawdown replacing Cash Allocation', () => {
    renderWithProviders(
      <DashboardTab
        metrics={metricsFixture}
        roiData={roiFixture}
        benchmarkSummary={benchmarkSummaryFixture}
        returnsSummary={{
          r_port: 0.20,
          max_drawdown: { value: -0.05, peak_date: '2024-02-01', trough_date: '2024-03-01' },
        }}
        loadingRoi={false}
        onRefreshRoi={() => {}}
        benchmarkCatalog={benchmarkCatalogFixture}
      />,
    );

    expect(screen.getAllByText(/Portfolio ROI/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Portfolio TWR/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Gap vs S&P 500/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Gap vs Nasdaq-100/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Max Drawdown/i).length).toBeGreaterThanOrEqual(1);
    // Cash Allocation is no longer a standalone context card
    expect(screen.queryByText(/^Cash allocation$/i)).not.toBeInTheDocument();
  });

  // --- PM-AUD-016: NAV growth chart ---

  test('renders NAV growth chart with mock data', () => {
    const navDailyFixture = [
      { date: '2024-01-01', portfolio_nav: 10000, cash_balance: 2000, risk_assets_value: 8000 },
      { date: '2024-01-02', portfolio_nav: 10500, cash_balance: 2000, risk_assets_value: 8500 },
    ];

    renderWithProviders(
      <DashboardTab
        metrics={metricsFixture}
        roiData={roiFixture}
        navDaily={navDailyFixture}
        loadingRoi={false}
        onRefreshRoi={() => {}}
        benchmarkCatalog={benchmarkCatalogFixture}
      />,
    );

    expect(screen.getByText(/NAV Growth/i)).toBeInTheDocument();
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
  });

  test('shows empty state for NAV chart when no data', () => {
    renderWithProviders(
      <DashboardTab
        metrics={metricsFixture}
        roiData={roiFixture}
        navDaily={[]}
        loadingRoi={false}
        onRefreshRoi={() => {}}
        benchmarkCatalog={benchmarkCatalogFixture}
      />,
    );

    expect(screen.getByText(/NAV Growth/i)).toBeInTheDocument();
    expect(screen.getByText(/NAV data becomes available/i)).toBeInTheDocument();
  });

  // --- PM-AUD-017: Approximate badge for fallback ROI ---

  test('shows "≈ Approximate" badge when roiSource is "fallback"', () => {
    renderWithProviders(
      <DashboardTab
        metrics={metricsFixture}
        roiData={roiFixture}
        loadingRoi={false}
        onRefreshRoi={() => {}}
        roiSource="fallback"
        benchmarkCatalog={benchmarkCatalogFixture}
      />,
    );

    const badge = screen.getByTestId('approximate-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent(/Approximate/i);
  });

  test('does NOT show "≈ Approximate" badge when roiSource is "api"', () => {
    renderWithProviders(
      <DashboardTab
        metrics={metricsFixture}
        roiData={roiFixture}
        loadingRoi={false}
        onRefreshRoi={() => {}}
        roiSource="api"
        benchmarkCatalog={benchmarkCatalogFixture}
      />,
    );

    expect(screen.queryByTestId('approximate-badge')).not.toBeInTheDocument();
  });

  // --- PM-AUD-021: Unique-color assertion for benchmark series ---

  test('all benchmark series in SERIES_META_FALLBACK have distinct color values', () => {
    const colors = BENCHMARK_SERIES_META.map((entry: { color: string }) => entry.color);
    const uniqueColors = new Set(colors);
    expect(uniqueColors.size).toBe(colors.length);
  });
});
