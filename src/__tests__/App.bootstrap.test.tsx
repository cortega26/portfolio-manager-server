import React from 'react';
import { cleanup } from '@testing-library/react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import App from '../App.jsx';
import { ApiClientError } from '../lib/apiClient.js';
import { renderWithProviders } from './test-utils';

function buildApiError({
  status,
  code,
  message,
  requestId = 'req-auth-001',
}: {
  status: number;
  code: string;
  message: string;
  requestId?: string;
}) {
  const error = new ApiClientError(message, {
    status,
    requestId,
  });
  error.body = {
    error: code,
    message,
  };
  return error;
}

const {
  evaluateSignalsMock,
  fetchDailyRoiMock,
  fetchBenchmarkCatalogMock,
  fetchBulkPricesMock,
  fetchPricesMock,
  retrievePortfolioMock,
  setupPinMock,
  unlockSessionMock,
  listPortfoliosMock,
} = vi.hoisted(() => ({
  evaluateSignalsMock: vi.fn(),
  fetchDailyRoiMock: vi.fn(),
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
    fetchDailyRoi: fetchDailyRoiMock,
    fetchPrices: fetchPricesMock,
    persistPortfolio: vi.fn(async () => ({ requestId: 'persist-001' })),
    retrievePortfolio: retrievePortfolioMock,
  };
});

describe('App desktop bootstrap', () => {
  beforeEach(() => {
    cleanup();
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
    fetchDailyRoiMock.mockResolvedValue({
      data: {
        series: { portfolio: [], portfolioTwr: [], spy: [], bench: [], exCash: [], cash: [] },
      },
      requestId: 'roi-none',
    });
    retrievePortfolioMock.mockResolvedValue({
      data: {
        transactions: [
          {
            id: 'desktop-bootstrap-1',
            uid: 'desktop-bootstrap-1',
            date: '2024-01-02',
            ticker: 'NVDA',
            type: 'BUY',
            amount: -200,
            shares: 1,
            quantity: 1,
            price: 200,
            seq: 1,
            createdAt: 1,
            currency: 'USD',
            metadata: {
              system: {
                import: {
                  source: 'csv-bootstrap',
                  original: {
                    line: 1,
                  },
                },
              },
            },
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
    await waitFor(() => {
      expect(evaluateSignalsMock).toHaveBeenCalled();
    });
    expect(screen.getByLabelText(/portfolio id/i)).toHaveValue('desktop');
    expect(screen.queryByText(/error al actualizar precios/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /holdings/i }));
    expect((await screen.findAllByText('NVDA')).length).toBeGreaterThan(0);
  });

  test('requires a desktop PIN before unlocking an Electron portfolio session', async () => {
    (
      window as typeof window & {
        __APP_CONFIG__?: unknown;
        portfolioDesktop?: unknown;
      }
    ).__APP_CONFIG__ = {
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

  test('relocks the desktop session gate when portfolio retrieval fails after unlock', async () => {
    (
      window as typeof window & {
        __APP_CONFIG__?: unknown;
        portfolioDesktop?: unknown;
      }
    ).__APP_CONFIG__ = {
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
    listPortfoliosMock.mockResolvedValue({
      portfolios: [{ id: 'desktop', hasPin: true }],
      defaultPortfolioId: 'desktop',
    });
    retrievePortfolioMock.mockRejectedValue(
      buildApiError({
        status: 401,
        code: 'NO_SESSION_TOKEN',
        message: 'Session token required.',
      })
    );

    renderWithProviders(<App />);

    expect(await screen.findByText(/unlock local portfolio/i)).toBeVisible();

    await userEvent.type(screen.getByLabelText(/^PIN$/i), '2468');
    await userEvent.click(screen.getByRole('button', { name: /unlock portfolio/i }));

    await waitFor(() => {
      expect(listPortfoliosMock).toHaveBeenCalledTimes(2);
    });
    expect(window.localStorage.getItem('portfolio-manager-active-portfolio')).toBeNull();
  });

  test('relocks the desktop session gate when bootstrap starts with a stale desktop token', async () => {
    window.localStorage.setItem(
      'portfolio-manager-active-portfolio',
      JSON.stringify({ activeId: 'desktop' })
    );
    (
      window as typeof window & {
        __APP_CONFIG__?: unknown;
        portfolioDesktop?: unknown;
      }
    ).__APP_CONFIG__ = {
      API_BASE_URL: 'http://desktop.local',
      API_SESSION_TOKEN: 'stale-desktop-token',
      ACTIVE_PORTFOLIO_ID: 'desktop',
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
    listPortfoliosMock.mockResolvedValue({
      portfolios: [{ id: 'desktop', hasPin: true }],
      defaultPortfolioId: 'desktop',
    });
    retrievePortfolioMock.mockRejectedValue(
      buildApiError({
        status: 403,
        code: 'INVALID_SESSION_TOKEN',
        message: 'Invalid session token.',
      })
    );

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(retrievePortfolioMock).toHaveBeenCalledWith('desktop');
    });
    await waitFor(() => {
      expect(listPortfoliosMock).toHaveBeenCalledTimes(1);
    });
    expect(
      (await screen.findAllByRole('button', { name: /unlock portfolio/i })).length
    ).toBeGreaterThan(0);
    expect(
      await screen.findByText(
        /the desktop session token is invalid\. restart the desktop app and try again\./i
      )
    ).toBeVisible();
    expect(window.localStorage.getItem('portfolio-manager-active-portfolio')).toBeNull();
  });

  test('clears stale desktop bootstrap state and shows a recovery error when session auth is missing', async () => {
    window.localStorage.setItem(
      'portfolio-manager-active-portfolio',
      JSON.stringify({ activeId: 'desktop' })
    );
    retrievePortfolioMock.mockRejectedValue(
      buildApiError({
        status: 401,
        code: 'NO_SESSION_TOKEN',
        message: 'Session token required.',
      })
    );

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(retrievePortfolioMock).toHaveBeenCalledWith('desktop');
    });
    expect(
      (
        await screen.findAllByText(
          /desktop session credentials are missing\. restart the desktop app and try again\./i
        )
      ).length
    ).toBeGreaterThan(0);
    expect(window.localStorage.getItem('portfolio-manager-active-portfolio')).toBeNull();
  });

  test('surfaces recovery and clears the manual load input when desktop auth fails without a bridge', async () => {
    retrievePortfolioMock.mockRejectedValue(
      buildApiError({
        status: 401,
        code: 'NO_SESSION_TOKEN',
        message: 'Session token required.',
      })
    );

    renderWithProviders(<App />);

    const portfolioIdInput = screen.getAllByLabelText(/portfolio id/i).at(-1);
    const loadPortfolioButton = screen.getAllByRole('button', { name: /load portfolio/i }).at(-1);
    expect(portfolioIdInput).toBeTruthy();
    expect(loadPortfolioButton).toBeTruthy();

    await userEvent.type(portfolioIdInput!, 'desktop');
    await userEvent.click(loadPortfolioButton!);

    await waitFor(() => {
      expect(retrievePortfolioMock).toHaveBeenCalledWith('desktop');
    });
    expect(
      (
        await screen.findAllByText(
          /desktop session credentials are missing\. restart the desktop app and try again\./i
        )
      ).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/portfolio id/i).at(-1)).toHaveValue('');
    expect(window.localStorage.getItem('portfolio-manager-active-portfolio')).toBeNull();
  });
});
