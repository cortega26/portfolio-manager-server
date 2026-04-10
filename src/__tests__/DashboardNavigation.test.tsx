import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderWithProviders } from './test-utils';
import App from '../App.jsx';

vi.mock('../components/DashboardTab.jsx', () => ({
  default: () => <div data-testid="stub-dashboard" />
}));
vi.mock('../components/HoldingsTab.jsx', () => ({
  __esModule: true,
  default: () => <div data-testid="stub-holdings" />
}));
vi.mock('../components/PricesTab.jsx', () => ({
  __esModule: true,
  default: () => <div data-testid="stub-prices" />
}));
vi.mock('../components/SignalsTab.jsx', () => ({
  __esModule: true,
  default: () => <div data-testid="stub-signals" />
}));
vi.mock('../components/TransactionsTab.jsx', () => ({
  __esModule: true,
  default: () => <div data-testid="stub-transactions" />
}));
vi.mock('../components/HistoryTab.jsx', () => ({
  default: () => <div data-testid="stub-history" />
}));
vi.mock('../components/MetricsTab.jsx', () => ({
  default: () => <div data-testid="stub-metrics" />
}));
vi.mock('../components/ReportsTab.jsx', () => ({
  default: () => <div data-testid="stub-reports" />
}));
vi.mock('../components/SettingsTab.jsx', () => ({
  default: () => <div data-testid="stub-settings" />
}));


vi.mock('../utils/api.js', () => ({
  evaluateSignals: vi.fn(async () => ({
    data: {
      rows: [],
      prices: {},
      errors: {},
      market: {
        isOpen: true,
        isBeforeOpen: false,
        lastTradingDate: '2024-01-02',
        nextTradingDate: '2024-01-02',
      },
    },
    requestId: 'signals-none',
  })),
  fetchBenchmarkCatalog: vi.fn(async () => ({ data: {} })),
  fetchBulkPrices: vi.fn(async () => ({ series: new Map(), errors: {} })),
  fetchDailyRoi: vi.fn(async () => ({ data: { series: { portfolio: [] } } })),
  fetchDailyReturns: vi.fn(async () => ({ data: { series: [] } })),
  fetchPrices: vi.fn(async () => ({ data: [] })),
  persistPortfolio: vi.fn(),
  retrievePortfolio: vi.fn(async () => null)
}));

vi.mock('../utils/roi.js', async (original) => {
  const mod = await original();
  return {
    ...mod,
    mergeDailyRoiSeries: vi.fn(() => [])
  };
});

test('switches tabs and shows expected panels', async () => {
  renderWithProviders(<App />);

  const dashboardPanel = await screen.findByTestId('panel-dashboard');
  expect(dashboardPanel).toBeVisible();

  await userEvent.click(screen.getByRole('tab', { name: /holdings/i }));
  const holdingsPanel = await screen.findByTestId('panel-holdings');
  expect(holdingsPanel).toBeVisible();

  await userEvent.click(screen.getByRole('tab', { name: /prices/i }));
  const pricesPanel = await screen.findByTestId('panel-prices');
  expect(pricesPanel).toBeVisible();

  await userEvent.click(screen.getByRole('tab', { name: /signals/i }));
  const signalsPanel = await screen.findByTestId('panel-signals');
  expect(signalsPanel).toBeVisible();

  await userEvent.click(screen.getByRole('tab', { name: /transactions/i }));
  const transactionsPanel = await screen.findByTestId('panel-transactions');
  expect(transactionsPanel).toBeVisible();
});
