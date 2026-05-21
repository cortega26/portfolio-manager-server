import React from 'react';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App.jsx';
import { renderWithProviders } from './test-utils';

const {
  evaluateSignalsMock,
  fetchBenchmarkCatalogMock,
  fetchBulkPricesMock,
  fetchPricesMock,
  fetchDailyRoiMock,
  fetchDailyReturnsMock,
  persistPortfolioMock,
  retrievePortfolioMock,
} = vi.hoisted(() => ({
  evaluateSignalsMock: vi.fn(),
  fetchBenchmarkCatalogMock: vi.fn(),
  fetchBulkPricesMock: vi.fn(),
  fetchPricesMock: vi.fn(),
  fetchDailyRoiMock: vi.fn(),
  fetchDailyReturnsMock: vi.fn(),
  persistPortfolioMock: vi.fn(),
  retrievePortfolioMock: vi.fn(),
}));

vi.mock('../utils/api.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    evaluateSignals: evaluateSignalsMock,
    fetchBenchmarkCatalog: fetchBenchmarkCatalogMock,
    fetchBulkPrices: fetchBulkPricesMock,
    fetchPrices: fetchPricesMock,
    fetchDailyRoi: fetchDailyRoiMock,
    fetchDailyReturns: fetchDailyReturnsMock,
    persistPortfolio: persistPortfolioMock,
    retrievePortfolio: retrievePortfolioMock,
  };
});

describe('App portfolio settings persistence', () => {
  let retrieveResponse: Record<string, unknown>;

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.localStorage.clear();
    delete (window as unknown as Record<string, unknown>).__APP_CONFIG__;

    retrieveResponse = {
      data: { transactions: [], signals: {}, settings: null },
      requestId: 'retrieve-initial',
    };

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
    fetchBulkPricesMock.mockResolvedValue({ series: new Map(), errors: {} });
    fetchPricesMock.mockResolvedValue({ data: [], requestId: 'price-none' });
    fetchDailyRoiMock.mockResolvedValue({
      data: {
        series: { portfolio: [], portfolioTwr: [], spy: [], bench: [], exCash: [], cash: [] },
      },
      requestId: 'roi-none',
    });
    fetchDailyReturnsMock.mockResolvedValue({
      data: { series: { port: [], spy: [] } },
      requestId: 'returns-none',
    });
    persistPortfolioMock.mockResolvedValue({ requestId: 'persist-123' });
    retrievePortfolioMock.mockImplementation(async () => retrieveResponse);
  });

  afterEach(() => {
    cleanup();
  });

  it('saves preferences (including email alerts) with the portfolio payload and hydrates them on load', async () => {
    renderWithProviders(<App />);

    await userEvent.type(screen.getByLabelText(/Portfolio ID/i), 'client-123');

    await userEvent.click(screen.getByRole('tab', { name: /settings/i }));

    const emailAlerts = screen.getByLabelText(/Email alerts/i) as HTMLInputElement;
    const maskBalances = screen.getByLabelText(/Mask balances by default/i) as HTMLInputElement;
    const compactTables = screen.getByLabelText(/Compact table spacing/i) as HTMLInputElement;
    const rebalanceReminders = screen.getByLabelText(
      /Monthly rebalance reminders/i
    ) as HTMLInputElement;
    const signalTransitions = screen.getByLabelText(
      /Signal transition toasts/i
    ) as HTMLInputElement;
    const marketStatusBanners = screen.getByLabelText(/Market status banners/i) as HTMLInputElement;
    const roiFallbackBanners = screen.getByLabelText(/ROI fallback banners/i) as HTMLInputElement;
    const currencySelect = screen.getByLabelText(/Display currency/i) as HTMLSelectElement;
    const autoClipToggle = screen.getByLabelText(/Auto-clip oversell orders/i) as HTMLInputElement;

    // Toggle them all (including email alerts)
    await userEvent.click(emailAlerts);
    await userEvent.click(maskBalances);
    await userEvent.click(compactTables);
    await userEvent.click(rebalanceReminders);
    await userEvent.click(signalTransitions);
    await userEvent.click(marketStatusBanners);
    await userEvent.click(roiFallbackBanners);
    await userEvent.selectOptions(currencySelect, 'EUR');
    await userEvent.click(autoClipToggle);

    await userEvent.click(screen.getByRole('button', { name: /save portfolio/i }));

    await waitFor(() => {
      expect(persistPortfolioMock).toHaveBeenCalledTimes(1);
    });

    const [savedId, payload] = persistPortfolioMock.mock.calls[0];
    expect(savedId).toBe('client-123');
    expect(payload.settings.autoClip).toBe(true);
    expect(payload.settings.display.currency).toBe('EUR');
    expect(payload.settings.display.compactTables).toBe(true);
    expect(payload.settings.privacy.hideBalances).toBe(true);
    expect(payload.settings.alerts.rebalance).toBe(false);
    expect(payload.settings.notifications.email).toBe(true);
    expect(payload.settings.notifications.signalTransitions).toBe(false);
    expect(payload.settings.alerts.marketStatus).toBe(false);
    expect(payload.settings.alerts.roiFallback).toBe(false);

    // Now change retrieve response to simulate loading a saved portfolio
    retrieveResponse = {
      data: {
        transactions: [],
        signals: {},
        settings: {
          autoClip: false,
          display: { currency: 'GBP', compactTables: false, refreshInterval: 10 },
          privacy: { hideBalances: false },
          alerts: {
            rebalance: true,
            drawdownThreshold: 12,
            marketStatus: true,
            roiFallback: true,
          },
          notifications: { email: true, push: false, signalTransitions: true },
        },
      },
      requestId: 'retrieve-portfolio',
    };

    await userEvent.click(screen.getByRole('button', { name: /load portfolio/i }));

    await waitFor(() => {
      expect(retrievePortfolioMock).toHaveBeenCalledTimes(1); // Load portfolio retrieve
      expect(emailAlerts.checked).toBe(true);
      expect(maskBalances.checked).toBe(false);
      expect(compactTables.checked).toBe(false);
      expect(rebalanceReminders.checked).toBe(true);
      expect(signalTransitions.checked).toBe(true);
      expect(marketStatusBanners.checked).toBe(true);
      expect(roiFallbackBanners.checked).toBe(true);
      expect(currencySelect.value).toBe('GBP');
      expect(autoClipToggle.checked).toBe(false);
    });
  });
});
