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
  Pie: ({ children }: { children: React.ReactNode }) => <div data-testid="pie">{children}</div>,
  Cell: () => <span data-testid="pie-cell" />,
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
import SectorAllocationChart from '../components/dashboard/SectorAllocationChart.jsx';
import { computeSectorAllocationSlices } from '../utils/sectors.js';
import { renderWithProviders } from './test-utils';

afterEach(() => {
  cleanup();
});

// --- Unit tests for computeSectorAllocationSlices ---

describe('computeSectorAllocationSlices', () => {
  test('groups holdings by sector', () => {
    const openHoldings = [
      { ticker: 'AAPL', shares: '10' },
      { ticker: 'MSFT', shares: '5' },
      { ticker: 'JPM', shares: '20' },
    ];
    const currentPrices = { AAPL: 200, MSFT: 400, JPM: 150 };
    const { slices, totalNav } = computeSectorAllocationSlices(openHoldings, currentPrices, 0);

    // totalNav = 10*200 + 5*400 + 20*150 = 2000 + 2000 + 3000 = 7000
    expect(totalNav).toBe(7000);
    const tech = slices.find((s) => s.sector === 'Technology')!;
    expect(tech.value).toBe(4000);
    const fin = slices.find((s) => s.sector === 'Financials')!;
    expect(fin.value).toBe(3000);
  });

  test('includes Cash slice when cash balance > 0', () => {
    const slices = computeSectorAllocationSlices(
      [{ ticker: 'AAPL', shares: '1' }],
      { AAPL: 100 },
      50
    ).slices;
    expect(slices.find((s) => s.sector === 'Cash')).toBeDefined();
  });

  test('no Cash when cash balance is zero', () => {
    const slices = computeSectorAllocationSlices(
      [{ ticker: 'AAPL', shares: '1' }],
      { AAPL: 100 },
      0
    ).slices;
    expect(slices.find((s) => s.sector === 'Cash')).toBeUndefined();
  });

  test('returns empty when no holdings', () => {
    const { slices, totalNav } = computeSectorAllocationSlices([], {}, 0);
    expect(slices).toHaveLength(0);
    expect(totalNav).toBe(0);
  });

  test('each slice has a color', () => {
    const slices = computeSectorAllocationSlices(
      [{ ticker: 'AAPL', shares: '1' }],
      { AAPL: 100 },
      0
    ).slices;
    expect(slices[0].color).toMatch(/^#/);
  });
});

// --- Render tests ---

const holdingsFixture = [
  { ticker: 'AAPL', shares: '10' },
  { ticker: 'JPM', shares: '20' },
];
const pricesFixture = { AAPL: 200, JPM: 150 };

describe('SectorAllocationChart render', () => {
  test('renders chart when holdings and prices are provided', () => {
    renderWithProviders(
      <SectorAllocationChart
        openHoldings={holdingsFixture}
        currentPrices={pricesFixture}
        cashBalance={0}
      />
    );

    expect(screen.getByTestId('sector-allocation-chart')).toBeDefined();
    expect(screen.getByTestId('sector-allocation-chart-content')).toBeDefined();
    expect(screen.queryByTestId('sector-allocation-chart-empty')).toBeNull();
  });

  test('renders empty state when no holdings', () => {
    renderWithProviders(
      <SectorAllocationChart openHoldings={[]} currentPrices={{}} cashBalance={0} />
    );

    expect(screen.getByTestId('sector-allocation-chart-empty')).toBeDefined();
    expect(screen.queryByTestId('sector-allocation-chart-content')).toBeNull();
  });
});
