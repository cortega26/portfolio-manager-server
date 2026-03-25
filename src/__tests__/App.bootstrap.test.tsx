import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import App from '../App.jsx';
import { renderWithProviders } from './test-utils';

const {
  evaluateSignalsMock,
  fetchDailyReturnsMock,
  fetchBenchmarkCatalogMock,
  fetchBulkPricesMock,
  fetchPricesMock,
  retrievePortfolioMock,
  setupPinMock,
  unlockSessionMock,
  listPortfoliosMock,
} = vi.hoisted(() => ({
  evaluateSignalsMock: vi.fn(),
  fetchDailyReturnsMock: vi.fn(),
  fetchBenchmarkCatalogMock: vi.fn(),
  fetchBulkPricesMock: vi.fn(),
  fetchPricesMock: vi.fn(),
  retrievePortfolioMock: vi.fn(),
  setupPinMock: vi.fn(),
  unlockSessionMock: vi.fn(),
  listPortfoliosMock: vi.fn(),
}));

vi.mock('../utils/api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    evaluateSignals: evaluateSignalsMock,
    fetchBenchmarkCatalog: fetchBenchmarkCatalogMock,
    fetchBulkPrices: fetchBulkPricesMock,
    fetchDailyReturns: fetchDailyReturnsMock,
    fetchPrices: fetchPricesMock,
    persistPortfolio: vi.fn(async () => ({ requestId: 'persist-001' })),
    retrievePortfolio: retrievePortfolioMock,
  };
});

describe('App desktop bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    delete (window as typeof window & { __APP_CONFIG__?: unknown }).__APP_CONFIG__;
    delete (
      window as typeof window & {
        portfolioDesktop?: unknown;
      }
    ).portfolioDesktop;

    fetchBenchmarkCatalogMock.mockResolvedValue({ data: {} });
    fetchBulkPricesMock.mockResolvedValue({ series: new Map(), errors: {} });
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
    fetchPricesMock.mockResolvedValue({ data: [], requestId: 'price-none' });
    fetchDailyReturnsMock.mockResolvedValue({
      data: { series: { port: [], spy: [] } },
      requestId: 'returns-none',
    });
    retrievePortfolioMock.mockResolvedValue({
      data: {
        transactions: [
          {
            date: '2024-01-02',
            ticker: 'NVDA',
            type: 'BUY',
            amount: -200,
            shares: 1,
            quantity: 1,
            price: 200,
            uid: 'desktop-bootstrap-1',
            seq: 1,
            createdAt: 1,
          },
        ],
        signals: {},
        settings: null,
      },
      requestId: 'retrieve-desktop',
    });
    listPortfoliosMock.mockResolvedValue({
      portfolios: [{ id: 'desktop', hasPin: false }],
      defaultPortfolioId: 'desktop',
    });
    setupPinMock.mockResolvedValue({
      portfolioId: 'desktop',
      runtimeConfig: {
        API_BASE_URL: 'http://desktop.local',
        API_SESSION_TOKEN: 'desktop-session-token',
        ACTIVE_PORTFOLIO_ID: 'desktop',
        SESSION_AUTH_HEADER: 'X-Session-Token',
      },
    });
    unlockSessionMock.mockResolvedValue({
      portfolioId: 'desktop',
      runtimeConfig: {
        API_BASE_URL: 'http://desktop.local',
        API_SESSION_TOKEN: 'desktop-session-token',
        ACTIVE_PORTFOLIO_ID: 'desktop',
        SESSION_AUTH_HEADER: 'X-Session-Token',
      },
    });
  });

  test('bootstraps the active desktop portfolio from runtime config', async () => {
    (window as typeof window & { __APP_CONFIG__?: unknown }).__APP_CONFIG__ = {
      ACTIVE_PORTFOLIO_ID: 'desktop',
    };

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(retrievePortfolioMock).toHaveBeenCalledWith('desktop');
    });
    expect(screen.getByLabelText(/portfolio id/i)).toHaveValue('desktop');

    await userEvent.click(screen.getByRole('tab', { name: /holdings/i }));
    expect((await screen.findAllByText('NVDA')).length).toBeGreaterThan(0);
  });

  test('requires a desktop PIN before unlocking an Electron portfolio session', async () => {
    (window as typeof window & {
      __APP_CONFIG__?: unknown;
      portfolioDesktop?: unknown;
    }).__APP_CONFIG__ = {
      API_BASE_URL: 'http://desktop.local',
      SESSION_AUTH_HEADER: 'X-Session-Token',
    };
    (
      window as typeof window & {
        portfolioDesktop?: {
          isAvailable: boolean;
          listPortfolios: typeof listPortfoliosMock;
          setupPin: typeof setupPinMock;
          unlockSession: typeof unlockSessionMock;
        };
      }
    ).portfolioDesktop = {
      isAvailable: true,
      listPortfolios: listPortfoliosMock,
      setupPin: setupPinMock,
      unlockSession: unlockSessionMock,
    };

    renderWithProviders(<App />);

    expect(await screen.findByText(/unlock local portfolio/i)).toBeVisible();
    expect(listPortfoliosMock).toHaveBeenCalledTimes(1);

    await userEvent.type(screen.getByLabelText(/^PIN$/i), '2468');
    await userEvent.type(screen.getByLabelText(/confirm pin/i), '2468');
    await userEvent.click(screen.getByRole('button', { name: /create pin and unlock/i }));

    await waitFor(() => {
      expect(setupPinMock).toHaveBeenCalledWith({
        portfolioId: 'desktop',
        pin: '2468',
      });
    });
    await waitFor(() => {
      expect(retrievePortfolioMock).toHaveBeenCalledWith('desktop');
    });
    expect(screen.getByLabelText(/portfolio id/i)).toHaveValue('desktop');
  });
});
