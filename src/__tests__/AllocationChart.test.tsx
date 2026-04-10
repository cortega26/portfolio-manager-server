import React from 'react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie">{children}</div>
  ),
  Cell: ({ fill }: { fill?: string }) => <span data-testid="pie-cell" style={{ background: fill }} />,
  Tooltip: () => null,
  Legend: ({ payload }: { payload?: Array<{ value?: string }> }) => (
    <div data-testid="pie-legend">
      {(payload ?? []).map((entry, i) => (
        <span key={i}>{entry.value}</span>
      ))}
    </div>
  ),
}));

import { vi } from 'vitest';
import AllocationChart, { computeAllocationSlices } from '../components/AllocationChart.jsx';
import { renderWithProviders } from './test-utils';

afterEach(() => {
  cleanup();
});

// --- Unit tests for computeAllocationSlices ---

describe('computeAllocationSlices', () => {
  test('computes slices for open holdings with prices', () => {
    const openHoldings = [
      { ticker: 'AAPL', shares: '2', cost: 200 },
      { ticker: 'MSFT', shares: '1', cost: 100 },
    ];
    const currentPrices = { AAPL: 150, MSFT: 300 };
    const { slices, totalNav } = computeAllocationSlices(openHoldings, currentPrices, 50);

    // totalNav = 2*150 + 1*300 + 50 = 650
    expect(totalNav).toBe(650);
    expect(slices).toHaveLength(3); // AAPL, MSFT, Cash
    const aapl = slices.find((s) => s.ticker === 'AAPL')!;
    expect(aapl.value).toBe(300);
    expect(aapl.percentage).toBeCloseTo((300 / 650) * 100, 4);

    const cash = slices.find((s) => s.ticker === 'Cash')!;
    expect(cash.value).toBe(50);
    expect(cash.percentage).toBeCloseTo((50 / 650) * 100, 4);
  });

  test('omits Cash slice when cash balance is zero', () => {
    const openHoldings = [{ ticker: 'AAPL', shares: '1', cost: 100 }];
    const currentPrices = { AAPL: 150 };
    const { slices } = computeAllocationSlices(openHoldings, currentPrices, 0);
    expect(slices.find((s) => s.ticker === 'Cash')).toBeUndefined();
  });

  test('returns empty slices when no holdings and no cash', () => {
    const { slices, totalNav } = computeAllocationSlices([], {}, 0);
    expect(slices).toHaveLength(0);
    expect(totalNav).toBe(0);
  });

  test('skips holdings without a price', () => {
    const openHoldings = [
      { ticker: 'AAPL', shares: '1', cost: 100 },
      { ticker: 'UNKNOWN', shares: '5', cost: 50 },
    ];
    const currentPrices = { AAPL: 200 };
    const { slices } = computeAllocationSlices(openHoldings, currentPrices, 0);
    expect(slices).toHaveLength(1);
    expect(slices[0].ticker).toBe('AAPL');
  });
});

// --- Render tests ---

const holdingsFixture = [
  { ticker: 'AAPL', shares: '2', cost: 200 },
  { ticker: 'MSFT', shares: '1', cost: 100 },
];
const pricesFixture = { AAPL: 150, MSFT: 300 };

describe('AllocationChart render', () => {
  test('renders chart when holdings and prices are provided', () => {
    renderWithProviders(
      <AllocationChart
        openHoldings={holdingsFixture}
        currentPrices={pricesFixture}
        cashBalance={50}
      />,
    );

    expect(screen.getByTestId('allocation-chart')).toBeDefined();
    expect(screen.getByTestId('allocation-chart-content')).toBeDefined();
    expect(screen.queryByTestId('allocation-chart-empty')).toBeNull();
  });

  test('renders empty state when no holdings are provided', () => {
    renderWithProviders(
      <AllocationChart
        openHoldings={[]}
        currentPrices={{}}
        cashBalance={0}
      />,
    );

    expect(screen.getByTestId('allocation-chart-empty')).toBeDefined();
    expect(screen.queryByTestId('allocation-chart-content')).toBeNull();
  });

  test('renders empty state when holdings have no matching prices', () => {
    renderWithProviders(
      <AllocationChart
        openHoldings={[{ ticker: 'NOPRICE', shares: '10', cost: 100 }]}
        currentPrices={{}}
        cashBalance={0}
      />,
    );

    expect(screen.getByTestId('allocation-chart-empty')).toBeDefined();
  });
});
