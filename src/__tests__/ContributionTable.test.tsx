import React from 'react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { computeAssetContributions } from '../utils/allocation.js';
import ContributionTable from '../components/ContributionTable.jsx';
import { renderWithProviders } from './test-utils';

afterEach(() => {
  cleanup();
});

// --- Unit tests for computeAssetContributions ---

describe('computeAssetContributions', () => {
  test('calculates weight × individualReturn → contribution pp', () => {
    // AAPL: value=200, cost=100 → return=100%, weight=200/250=0.8
    // contribution = 0.8 × 1.0 × 100 = 80 pp
    const openHoldings = [{ ticker: 'AAPL', shares: '2', cost: 100 }];
    const currentPrices = { AAPL: 100 }; // value = 2×100 = 200
    const rows = computeAssetContributions(openHoldings, currentPrices, 50);

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.ticker).toBe('AAPL');
    // totalNav = 200 + 50 = 250
    expect(row.weight).toBeCloseTo(200 / 250, 6);
    // individualReturn = (200-100)/100 = 1.0
    expect(row.individualReturn).toBeCloseTo(1.0, 6);
    // contribution_pp = (200/250) × 1.0 × 100 = 80
    expect(row.contributionPp).toBeCloseTo(80, 4);
  });

  test('returns null contribution for holding with zero cost', () => {
    const openHoldings = [{ ticker: 'FREE', shares: '1', cost: 0 }];
    const currentPrices = { FREE: 100 };
    const rows = computeAssetContributions(openHoldings, currentPrices, 0);
    expect(rows[0].individualReturn).toBeNull();
    expect(rows[0].contributionPp).toBeNull();
  });

  test('returns empty array when no open holdings', () => {
    const rows = computeAssetContributions([], {}, 100);
    expect(rows).toHaveLength(0);
  });

  test('skips holdings without price', () => {
    const openHoldings = [
      { ticker: 'AAPL', shares: '1', cost: 100 },
      { ticker: 'NOPRICE', shares: '5', cost: 50 },
    ];
    const rows = computeAssetContributions(openHoldings, { AAPL: 150 }, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0].ticker).toBe('AAPL');
  });

  test('sorts rows by contribution descending, nulls last', () => {
    const openHoldings = [
      { ticker: 'LOW', shares: '1', cost: 100 },   // return = (110-100)/100 = 10%
      { ticker: 'HIGH', shares: '1', cost: 100 },  // return = (200-100)/100 = 100%
      { ticker: 'ZERO', shares: '1', cost: 0 },    // individualReturn = null
    ];
    const currentPrices = { LOW: 110, HIGH: 200, ZERO: 50 };
    const rows = computeAssetContributions(openHoldings, currentPrices, 0);
    expect(rows[0].ticker).toBe('HIGH');
    expect(rows[1].ticker).toBe('LOW');
    expect(rows[2].ticker).toBe('ZERO');
    expect(rows[2].contributionPp).toBeNull();
  });

  test('handles negative individual return correctly', () => {
    // value=50, cost=100 → return = (50-100)/100 = -0.5 = -50%
    const openHoldings = [{ ticker: 'DOWN', shares: '1', cost: 100 }];
    const currentPrices = { DOWN: 50 };
    const rows = computeAssetContributions(openHoldings, currentPrices, 0);
    expect(rows[0].individualReturn).toBeCloseTo(-0.5, 6);
    expect(rows[0].contributionPp).toBeCloseTo(-50, 4);
  });
});

// --- Render tests ---

const holdingsFixture = [
  { ticker: 'AAPL', shares: '2', cost: 200 },
  { ticker: 'MSFT', shares: '1', cost: 100 },
];
const pricesFixture = { AAPL: 150, MSFT: 300 };

describe('ContributionTable render', () => {
  test('renders table with holdings and prices', () => {
    renderWithProviders(
      <ContributionTable
        openHoldings={holdingsFixture}
        currentPrices={pricesFixture}
        cashBalance={0}
      />,
    );

    expect(screen.getByTestId('contribution-table')).toBeDefined();
    expect(screen.getByTestId('contribution-table-content')).toBeDefined();
    expect(screen.getByTestId('contribution-row-AAPL')).toBeDefined();
    expect(screen.getByTestId('contribution-row-MSFT')).toBeDefined();
    expect(screen.queryByTestId('contribution-table-empty')).toBeNull();
  });

  test('renders empty state when no holdings', () => {
    renderWithProviders(
      <ContributionTable
        openHoldings={[]}
        currentPrices={{}}
        cashBalance={0}
      />,
    );

    expect(screen.getByTestId('contribution-table-empty')).toBeDefined();
    expect(screen.queryByTestId('contribution-table-content')).toBeNull();
  });

  test('renders empty state when holdings have no prices', () => {
    renderWithProviders(
      <ContributionTable
        openHoldings={[{ ticker: 'NOPRICE', shares: '1', cost: 100 }]}
        currentPrices={{}}
        cashBalance={0}
      />,
    );

    expect(screen.getByTestId('contribution-table-empty')).toBeDefined();
  });
});
