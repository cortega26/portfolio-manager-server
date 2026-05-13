import React from 'react';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import App from '../App.jsx';
import { renderWithProviders } from './test-utils';

// ── Mocks ───────────────────────────────────────────────────────────────────

const {
  evaluateSignalsMock,
  fetchDailyRoiMock,
  fetchBenchmarkCatalogMock,
  fetchBulkPricesMock,
  retrievePortfolioMock,
} = vi.hoisted(() => ({
  evaluateSignalsMock: vi.fn(),
  fetchDailyRoiMock: vi.fn(),
  fetchBenchmarkCatalogMock: vi.fn(),
  fetchBulkPricesMock: vi.fn(),
  retrievePortfolioMock: vi.fn(),
}));

// Mock all lazy-loaded tab components so they resolve synchronously in tests
// (they're inside <Suspense> — without mocking, the section wrappers won't render
// until the dynamic import resolves, causing findByTestId timeouts)
vi.mock('../components/DashboardTab.jsx', () => ({ default: () => null }));
vi.mock('../components/HoldingsTab.jsx', () => ({ default: () => <div>No holdings yet</div> }));
vi.mock('../components/HistoryTab.jsx', () => ({ default: () => null }));
vi.mock('../components/MetricsTab.jsx', () => ({ default: () => null }));
vi.mock('../components/PricesTab.jsx', () => ({ default: () => null }));
vi.mock('../components/RealizedGainsView.jsx', () => ({ default: () => null }));
vi.mock('../components/ReportsTab.jsx', () => ({ default: () => null }));
vi.mock('../components/SettingsTab.jsx', () => ({ default: () => null }));
vi.mock('../components/InboxTab.jsx', () => ({ default: () => <div>No alerts</div> }));
vi.mock('../components/TransactionsTab.jsx', () => ({ default: () => null }));

vi.mock('../utils/api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    evaluateSignals: evaluateSignalsMock,
    fetchDailyRoi: fetchDailyRoiMock,
    fetchBenchmarkCatalog: fetchBenchmarkCatalogMock,
    fetchBulkPrices: fetchBulkPricesMock,
    retrievePortfolio: retrievePortfolioMock,
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function setupDefaults() {
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
  fetchDailyRoiMock.mockResolvedValue({
    data: { series: { portfolio: [], portfolioTwr: [], spy: [], bench: [], exCash: [], cash: [] } },
    requestId: 'roi-none',
  });
  retrievePortfolioMock.mockResolvedValue({
    data: { transactions: [], signals: {} },
    requestId: 'portfolio-none',
  });
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('PortfolioManagerApp shell', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.localStorage.clear();
    delete (window as typeof window & { __APP_CONFIG__?: unknown }).__APP_CONFIG__;
    delete (window as typeof window & { portfolioDesktop?: unknown }).portfolioDesktop;

    setupDefaults();
  });

  // ── Header ──────────────────────────────────────────────────────────────────

  test('renders app header with title and subtitle', async () => {
    renderWithProviders(<App />);

    expect(await screen.findByText('Portfolio Manager')).toBeVisible();
    expect(
      await screen.findByText(
        'Monitor your assets, manage trades, and benchmark performance across dedicated views.'
      )
    ).toBeVisible();
  });

  test('renders language selector with English and Spanish options', async () => {
    renderWithProviders(<App />);

    const selector = screen.getByRole('combobox', { name: /language/i });
    expect(selector).toBeVisible();

    const options = within(selector).getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveValue('en');
    expect(options[1]).toHaveValue('es');
  });

  test('language switch changes the UI language', async () => {
    renderWithProviders(<App />);

    const selector = screen.getByRole('combobox', { name: /language/i });
    await userEvent.selectOptions(selector, 'es');

    expect(await screen.findByText('Gestor de Portafolios')).toBeVisible();
  });

  // ── PortfolioControls ───────────────────────────────────────────────────────

  test('renders PortfolioControls with portfolio ID input', async () => {
    renderWithProviders(<App />);

    const input = screen.getByLabelText(/portfolio id/i);
    expect(input).toBeVisible();
  });

  // ── TabBar ──────────────────────────────────────────────────────────────────

  test('renders navigation tabs', async () => {
    renderWithProviders(<App />);

    // Tab buttons have role="tab", not role="button"
    const tablist = screen.getByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');

    const tabNames = tabs.map((tab) => tab.textContent);
    expect(tabNames).toContain('Dashboard');
    expect(tabNames).toContain('Holdings');
    expect(tabNames).toContain('Prices');
    expect(tabNames).toContain('Inbox');
    expect(tabNames).toContain('Transactions');
    expect(tabNames).toContain('History');
    expect(tabNames).toContain('Metrics');
    expect(tabNames).toContain('Reports');
    expect(tabNames).toContain('Settings');
  });

  // ── Default tab ─────────────────────────────────────────────────────────────

  test('Dashboard tab is active by default', async () => {
    renderWithProviders(<App />);

    expect(await screen.findByTestId('panel-dashboard')).toBeVisible();
  });

  // ── Tab switching ───────────────────────────────────────────────────────────

  test('clicking Holdings tab shows Holdings panel', async () => {
    renderWithProviders(<App />);

    await userEvent.click(screen.getByRole('tab', { name: /holdings/i }));

    expect(await screen.findByTestId('panel-holdings')).toBeVisible();
  });

  test('clicking Transactions tab shows Transactions panel', async () => {
    renderWithProviders(<App />);

    await userEvent.click(screen.getByRole('tab', { name: /transactions/i }));

    expect(await screen.findByTestId('panel-transactions')).toBeVisible();
  });

  test('clicking Prices tab shows Prices panel', async () => {
    renderWithProviders(<App />);

    await userEvent.click(screen.getByRole('tab', { name: /prices/i }));

    expect(await screen.findByTestId('panel-prices')).toBeVisible();
  });

  test('clicking History tab shows History panel', async () => {
    renderWithProviders(<App />);

    await userEvent.click(screen.getByRole('tab', { name: /history/i }));

    expect(await screen.findByTestId('panel-history')).toBeVisible();
  });

  test('clicking Metrics tab shows Metrics panel', async () => {
    renderWithProviders(<App />);

    await userEvent.click(screen.getByRole('tab', { name: /metrics/i }));

    expect(await screen.findByTestId('panel-metrics')).toBeVisible();
  });

  test('clicking Reports tab shows Reports panel', async () => {
    renderWithProviders(<App />);

    await userEvent.click(screen.getByRole('tab', { name: /reports/i }));

    expect(await screen.findByTestId('panel-reports')).toBeVisible();
  });

  test('clicking Settings tab shows Settings panel', async () => {
    renderWithProviders(<App />);

    await userEvent.click(screen.getByRole('tab', { name: /settings/i }));

    expect(await screen.findByTestId('panel-settings')).toBeVisible();
  });

  // ── Tab panel aria attributes ───────────────────────────────────────────────

  test('each tab panel has correct aria attributes', async () => {
    renderWithProviders(<App />);

    const dashboardPanel = screen.getByTestId('panel-dashboard');
    expect(dashboardPanel).toHaveAttribute('role', 'tabpanel');
    expect(dashboardPanel).toHaveAttribute('aria-labelledby', 'tab-dashboard');
    expect(dashboardPanel).toHaveAttribute('id', 'panel-dashboard');

    await userEvent.click(screen.getByRole('tab', { name: /settings/i }));

    const settingsPanel = await screen.findByTestId('panel-settings');
    expect(settingsPanel).toHaveAttribute('role', 'tabpanel');
    expect(settingsPanel).toHaveAttribute('aria-labelledby', 'tab-settings');
    expect(settingsPanel).toHaveAttribute('id', 'panel-settings');
  });

  // ── Save validation ─────────────────────────────────────────────────────────

  test('save without portfolio ID shows validation message', async () => {
    renderWithProviders(<App />);

    const saveButton = screen.getByRole('button', { name: /save portfolio/i });
    await userEvent.click(saveButton);

    expect(await screen.findByText(/provide a portfolio ID/i)).toBeVisible();
  });

  // ── Empty states ────────────────────────────────────────────────────────────

  test('Holdings tab shows empty state when no holdings', async () => {
    renderWithProviders(<App />);

    await userEvent.click(screen.getByRole('tab', { name: /holdings/i }));

    expect(await screen.findByText(/No holdings yet/i)).toBeVisible();
  });

  test('Inbox tab shows empty state when no signals', async () => {
    renderWithProviders(<App />);

    await userEvent.click(screen.getByRole('tab', { name: /inbox/i }));

    expect(await screen.findByText(/No alerts/i)).toBeVisible();
  });

  // ── Session-locked state ────────────────────────────────────────────────────

  test('renders DesktopSessionGate when session is locked', async () => {
    window.portfolioDesktop = {
      isAvailable: true,
      listPortfolios: vi.fn().mockResolvedValue([]),
      unlockSession: vi.fn(),
    };

    renderWithProviders(<App />);

    expect(await screen.findByText(/Unlock local portfolio/i)).toBeVisible();
  });
});
