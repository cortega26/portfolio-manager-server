import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { renderWithProviders } from './test-utils';
import App from '../App.jsx';

const {
  evaluateSignalsMock,
  fetchDailyRoiMock,
  fetchBenchmarkCatalogMock,
  fetchBulkPricesMock,
  fetchPricesMock,
  mergeDailyRoiSeriesMock,
  createInitialLedgerStateMock,
} = vi.hoisted(() => ({
  evaluateSignalsMock: vi.fn(),
  fetchDailyRoiMock: vi.fn(),
  fetchBenchmarkCatalogMock: vi.fn(),
  fetchBulkPricesMock: vi.fn(),
  fetchPricesMock: vi.fn(),
  mergeDailyRoiSeriesMock: vi.fn(),
  createInitialLedgerStateMock: vi.fn(),
}));

vi.mock('../components/DashboardTab.jsx', () => ({
  default: () => <div data-testid="stub-dashboard" />,
}));
vi.mock('../components/HoldingsTab.jsx', () => ({
  __esModule: true,
  default: () => <div data-testid="stub-holdings" />,
}));
vi.mock('../components/TransactionsTab.jsx', () => ({
  __esModule: true,
  default: () => <div data-testid="stub-transactions" />,
}));
vi.mock('../components/HistoryTab.jsx', () => ({
  default: () => <div data-testid="stub-history" />,
}));
vi.mock('../components/MetricsTab.jsx', () => ({
  default: () => <div data-testid="stub-metrics" />,
}));
vi.mock('../components/ReportsTab.jsx', () => ({
  default: () => <div data-testid="stub-reports" />,
}));
vi.mock('../components/SettingsTab.jsx', () => ({
  default: () => <div data-testid="stub-settings" />,
}));


vi.mock('../utils/api.js', () => ({
  evaluateSignals: evaluateSignalsMock,
  fetchDailyRoi: fetchDailyRoiMock,
  fetchBenchmarkCatalog: fetchBenchmarkCatalogMock,
  fetchBulkPrices: fetchBulkPricesMock,
  fetchPrices: fetchPricesMock,
  persistPortfolio: vi.fn(),
  retrievePortfolio: vi.fn(async () => null),
}));

vi.mock('../utils/roi.js', async (original) => {
  const mod = await original();
  return {
    ...mod,
    mergeDailyRoiSeries: mergeDailyRoiSeriesMock,
  };
});

vi.mock('../utils/holdingsLedger.js', async (original) => {
  const mod = await original();
  return {
    ...mod,
    createInitialLedgerState: createInitialLedgerStateMock,
  };
});

describe('ROI availability alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    evaluateSignalsMock.mockResolvedValue({
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
    });
    fetchBenchmarkCatalogMock.mockResolvedValue({ data: {} });
    fetchPricesMock.mockResolvedValue({ data: [] });
    fetchBulkPricesMock.mockResolvedValue({ series: new Map(), errors: {} });
    fetchDailyRoiMock.mockResolvedValue({
      data: {
        series: {
          portfolio: [{ date: '2024-01-03', value: 5 }],
          portfolioTwr: [{ date: '2024-01-03', value: 3 }],
          spy: [],
          bench: [],
          exCash: [],
          cash: [],
        },
      },
      requestId: 'roi-ok-001',
    });
    mergeDailyRoiSeriesMock.mockReturnValue([{ date: '2024-01-03', portfolio: 5, portfolioTwr: 3 }]);
    createInitialLedgerStateMock.mockReturnValue({
      transactions: [
        { date: '2024-01-02', type: 'DEPOSIT', amount: 1000 },
        {
          date: '2024-01-03',
          type: 'BUY',
          ticker: 'AAPL',
          amount: -950,
          shares: 5,
        },
      ],
      holdingsMap: new Map(),
      holdings: [],
      history: [],
    });
  });

  test('loads canonical ROI data without showing an alert when the API succeeds', async () => {

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(fetchDailyRoiMock).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.queryByText(/latest valid roi snapshot/i),
    ).not.toBeInTheDocument();
  });

  test('shows ROI unavailable when the first ROI request fails', async () => {
    fetchDailyRoiMock.mockRejectedValue(Object.assign(new Error('ROI service unavailable'), {
      name: 'ApiError',
      requestId: 'roi-fail-002',
    }));

    createInitialLedgerStateMock.mockReturnValue({
      transactions: [
        { date: '2024-01-02', type: 'DEPOSIT', amount: 1000 },
        {
          date: '2024-01-03',
          type: 'BUY',
          ticker: 'MSFT',
          amount: -950,
          shares: 5,
        },
      ],
      holdingsMap: new Map(),
      holdings: [],
      history: [],
    });

    renderWithProviders(<App />);

    expect(
      await screen.findByText(
        /roi service and fallback computation failed\. try again after reloading the page\./i,
      ),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchDailyRoiMock.mock.calls.length).toBeGreaterThan(0);
    });
  });
});
