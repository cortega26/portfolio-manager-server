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
vi.mock('../components/AdminTab.jsx', () => ({
  default: () => <div data-testid="stub-admin" />
}));

vi.mock('../utils/api.js', () => ({
  fetchDailyReturns: vi.fn(async () => ({ data: { series: [] } })),
  fetchPrices: vi.fn(async () => ({ data: [] })),
  persistPortfolio: vi.fn(),
  retrievePortfolio: vi.fn(async () => null)
}));

vi.mock('../utils/roi.js', async (original) => {
  const mod = await original();
  return {
    ...mod,
    buildRoiSeries: vi.fn(async () => []),
    mergeReturnSeries: vi.fn(() => [])
  };
});

test('switches tabs and shows expected panels', async () => {
  renderWithProviders(<App />);

  await screen.findByTestId('panel-dashboard');

  await userEvent.click(screen.getByRole('tab', { name: /holdings/i }));
  await screen.findByTestId('panel-holdings');

  await userEvent.click(screen.getByRole('tab', { name: /transactions/i }));
  await screen.findByTestId('panel-transactions');
});
