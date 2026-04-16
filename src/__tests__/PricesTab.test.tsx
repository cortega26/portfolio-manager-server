import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import PricesTab from '../components/PricesTab.jsx';
import { renderWithProviders } from './test-utils';

test('renders tracked holding and benchmark prices and supports manual refresh', async () => {
  const onRefresh = vi.fn();

  renderWithProviders(
    <PricesTab
      rows={[
        {
          symbol: 'AAPL',
          scope: 'holding',
          scopeLabel: 'Holding',
          description: 'Open portfolio position',
          price: 182.34,
          asOf: '2024-03-01',
          shares: 2.5,
          avgCost: 150,
          totalCost: 375,
          marketValue: 455.85,
          unrealised: 80.85,
          realised: 32.1,
          totalReturnPct: 30.12,
          status: 'live',
          statusLabel: 'Live',
          errorMessage: null,
        },
        {
          symbol: 'QQQ',
          scope: 'benchmark',
          scopeLabel: 'Benchmark',
          description: 'Nasdaq-100 (QQQ)',
          price: 441.2,
          asOf: '2024-03-01',
          shares: null,
          marketValue: null,
          status: 'error',
          statusLabel: 'Error',
          errorMessage: 'Pricing temporarily unavailable',
        },
      ]}
      summary={{
        totals: {
          totalCost: 375,
          totalRealised: 32.1,
          totalUnrealised: 80.85,
          totalNav: 612.34,
        },
      }}
      loading={false}
      onRefresh={onRefresh}
      lastUpdatedAt="2024-03-01T15:30:00.000Z"
      requestId="req-prices-001"
      version="v1"
    />
  );

  expect(screen.getByRole('heading', { name: /tracked prices/i })).toBeVisible();
  expect(screen.getByRole('table', { name: /tracked prices table/i })).toBeVisible();
  expect(screen.getByText('AAPL')).toBeVisible();
  expect(screen.getByText('QQQ')).toBeVisible();
  expect(screen.getByText('Holding')).toBeVisible();
  expect(screen.getByText('Benchmark')).toBeVisible();
  expect(screen.getByText('Pricing temporarily unavailable')).toBeVisible();
  expect(screen.getByText('req-prices-001')).toBeVisible();
  expect(screen.getByText('Avg. cost')).toBeVisible();
  expect(screen.getAllByText('$375.00').length).toBeGreaterThan(0);
  expect(screen.getAllByText('$80.85').length).toBeGreaterThan(0);
  expect(screen.getAllByText('$32.10').length).toBeGreaterThan(0);
  expect(screen.getByText('+30.12%')).toBeVisible();
  expect(screen.getByText('$612.34')).toBeVisible();

  await userEvent.click(screen.getByRole('button', { name: /refresh prices/i }));
  expect(onRefresh).toHaveBeenCalledTimes(1);
});
