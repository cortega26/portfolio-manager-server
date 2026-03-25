import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { renderWithProviders } from './test-utils';
import App from '../App.jsx';

const {
  evaluateSignalsMock,
  fetchDailyReturnsMock,
  fetchBenchmarkCatalogMock,
  fetchBulkPricesMock,
  fetchPricesMock,
  buildRoiSeriesMock,
  mergeReturnSeriesMock,
  createInitialLedgerStateMock,
} = vi.hoisted(() => ({
  evaluateSignalsMock: vi.fn(),
  fetchDailyReturnsMock: vi.fn(),
  fetchBenchmarkCatalogMock: vi.fn(),
  fetchBulkPricesMock: vi.fn(),
  fetchPricesMock: vi.fn(),
  buildRoiSeriesMock: vi.fn(),
  mergeReturnSeriesMock: vi.fn(),
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
vi.mock('../components/AdminTab.jsx', () => ({
  default: () => <div data-testid="stub-admin" />,
}));

vi.mock('../utils/api.js', () => ({
  evaluateSignals: evaluateSignalsMock,
  fetchDailyReturns: fetchDailyReturnsMock,
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
    buildRoiSeries: buildRoiSeriesMock,
    mergeReturnSeries: mergeReturnSeriesMock,
  };
});

vi.mock('../utils/holdingsLedger.js', async (original) => {
  const mod = await original();
  return {
    ...mod,
    createInitialLedgerState: createInitialLedgerStateMock,
  };
});

describe('ROI fallback alerts', () => {
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
    buildRoiSeriesMock.mockResolvedValue([
      { date: '2024-01-02', value: 0 },
    ]);
    mergeReturnSeriesMock.mockReturnValue([]);
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

  test('surfaces cash benchmark disablement as an informational alert', async () => {
    const disabledError = new Error('cash benchmarks disabled');
    disabledError.name = 'ApiError';
    disabledError.body = { error: 'CASH_BENCHMARKS_DISABLED' };
    disabledError.requestId = 'req-123';
    fetchDailyReturnsMock.mockRejectedValueOnce(disabledError);

    renderWithProviders(<App />);

    const alert = await screen.findByText(/cash benchmark service is disabled/i);
    expect(alert).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchDailyReturnsMock).toHaveBeenCalledTimes(1);
    });
    expect(buildRoiSeriesMock).toHaveBeenCalled();
  });
});
