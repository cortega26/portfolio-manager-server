import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import App from '../App.jsx';
import { renderWithProviders } from './test-utils';

const {
  evaluateSignalsMock,
  fetchBenchmarkCatalogMock,
  fetchBulkPricesMock,
  fetchDailyRoiMock,
  retrievePortfolioMock,
} = vi.hoisted(() => ({
  evaluateSignalsMock: vi.fn(),
  fetchBenchmarkCatalogMock: vi.fn(),
  fetchBulkPricesMock: vi.fn(),
  fetchDailyRoiMock: vi.fn(),
  retrievePortfolioMock: vi.fn(),
}));

vi.mock('../utils/api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    evaluateSignals: evaluateSignalsMock,
    fetchBenchmarkCatalog: fetchBenchmarkCatalogMock,
    fetchBulkPrices: fetchBulkPricesMock,
    fetchDailyRoi: fetchDailyRoiMock,
    persistPortfolio: vi.fn(async () => ({ requestId: 'persist-001' })),
    retrievePortfolio: retrievePortfolioMock,
  };
});

describe('App pricing status UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    (
      window as typeof window & {
        __APP_CONFIG__?: unknown;
      }
    ).__APP_CONFIG__ = {
      ACTIVE_PORTFOLIO_ID: 'desktop',
    };

    fetchBenchmarkCatalogMock.mockResolvedValue({ data: {} });
    fetchBulkPricesMock.mockResolvedValue({
      series: new Map(),
      errors: {},
      metadata: {},
      requestId: 'bulk-001',
      version: 'v1',
    });
    retrievePortfolioMock.mockResolvedValue({
      data: {
        transactions: [
          {
            date: '2024-01-01',
            type: 'DEPOSIT',
            amount: 1000,
            uid: 'tx-1',
            seq: 1,
            createdAt: 1,
          },
          {
            date: '2024-01-02',
            ticker: 'MSFT',
            type: 'BUY',
            amount: -500,
            price: 100,
            shares: 5,
            quantity: 5,
            uid: 'tx-2',
            seq: 2,
            createdAt: 2,
          },
        ],
        signals: {
          MSFT: { pct: 5 },
        },
        settings: null,
      },
      requestId: 'retrieve-001',
    });
    fetchDailyRoiMock.mockResolvedValue({
      data: {
        series: {
          portfolio: [{ date: '2024-01-02', value: 0 }],
          portfolioTwr: [{ date: '2024-01-02', value: 0 }],
          spy: [{ date: '2024-01-02', value: 0 }],
          bench: [{ date: '2024-01-02', value: 0 }],
          exCash: [{ date: '2024-01-02', value: 0 }],
          cash: [{ date: '2024-01-02', value: 0 }],
        },
        meta: {
          benchmarkHealth: {
            unavailable: [],
          },
        },
      },
      requestId: 'roi-001',
    });
  });

  test('shows a degraded pricing warning instead of a hard error when EOD data is available', async () => {
    evaluateSignalsMock.mockResolvedValue({
      data: {
        rows: [
          {
            ticker: 'MSFT',
            pctWindow: 5,
            status: 'HOLD',
            currentPrice: 250,
            currentPriceAsOf: '2024-02-02',
            lowerBound: 95,
            upperBound: 105,
            referencePrice: 100,
            referenceDate: '2024-01-02',
            referenceType: 'BUY',
            sanityRejected: false,
          },
        ],
        prices: { MSFT: 250 },
        errors: {},
        pricing: {
          symbols: {
            MSFT: {
              status: 'degraded',
              source: 'historical',
              provider: 'stooq',
              warnings: ['LATEST_QUOTE_UNAVAILABLE'],
              asOf: '2024-02-02',
            },
          },
          summary: {
            status: 'degraded',
            liveSymbols: [],
            eodSymbols: [],
            cacheSymbols: [],
            degradedSymbols: ['MSFT'],
            unavailableSymbols: [],
          },
        },
        market: {
          isOpen: true,
          isBeforeOpen: false,
          lastTradingDate: '2024-02-02',
          nextTradingDate: '2024-02-05',
        },
      },
      requestId: 'signals-degraded-001',
    });

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(retrievePortfolioMock).toHaveBeenCalledWith('desktop');
    });

    expect(await screen.findByText(/Live quotes temporarily unavailable/i)).toBeVisible();
    expect(
      screen.getByText(
        /Showing the latest official close for MSFT while the live pricing provider recovers/i
      )
    ).toBeVisible();
    expect(screen.queryByText(/Price refresh failed/i)).not.toBeInTheDocument();
  });

  test('bootstraps dashboard valuation from the latest official close when the market is closed', async () => {
    evaluateSignalsMock.mockResolvedValue({
      data: {
        rows: [
          {
            ticker: 'MSFT',
            pctWindow: 5,
            status: 'HOLD',
            currentPrice: 250,
            currentPriceAsOf: '2024-02-02',
            lowerBound: 95,
            upperBound: 105,
            referencePrice: 100,
            referenceDate: '2024-01-02',
            referenceType: 'BUY',
            sanityRejected: false,
          },
        ],
        prices: { MSFT: 250 },
        errors: {},
        pricing: {
          symbols: {
            MSFT: {
              status: 'eod_fresh',
              source: 'persisted',
              provider: 'storage',
              warnings: ['LAST_CLOSE_FALLBACK_USED'],
              asOf: '2024-02-02',
            },
          },
          summary: {
            status: 'eod_fresh',
            liveSymbols: [],
            eodSymbols: ['MSFT'],
            cacheSymbols: [],
            degradedSymbols: [],
            unavailableSymbols: [],
          },
        },
        market: {
          isOpen: false,
          isBeforeOpen: false,
          lastTradingDate: '2024-02-02',
          nextTradingDate: '2024-02-05',
        },
      },
      requestId: 'signals-eod-001',
    });

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(retrievePortfolioMock).toHaveBeenCalledWith('desktop');
    });

    expect(await screen.findByText(/Market is closed/i)).toBeVisible();
    expect(screen.queryByText(/Price refresh failed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Awaiting market prices for open holdings/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('$1,750.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$1,250\.00/).length).toBeGreaterThan(0);
  });
});
