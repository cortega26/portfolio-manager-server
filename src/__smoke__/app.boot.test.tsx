import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import App from '../App.jsx';
import { I18nProvider } from '../i18n/I18nProvider.jsx';
import { createTestQueryClient } from '../__tests__/test-utils';

vi.mock('../utils/api.js', () => ({
  fetchBulkPrices: vi.fn(async () => ({ series: new Map(), errors: {} })),
  fetchBenchmarkCatalog: vi.fn(async () => ({ data: {} })),
  fetchDailyRoi: vi.fn(async () => ({
    data: { series: { portfolio: [], portfolioTwr: [], spy: [], bench: [], exCash: [], cash: [] } },
  })),
  retrievePortfolio: vi.fn(async () => ({ data: { transactions: [], signals: {} } })),
  evaluateSignals: vi.fn(async () => ({
    data: { rows: [], prices: {}, errors: {}, market: { isOpen: true } },
  })),
}));

vi.mock('../components/DashboardTab.jsx', () => ({
  __esModule: true,
  default: () => <div data-testid="stub-dashboard-tab" />,
}));

function renderWithProviders(initialEntries: string[]) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <MemoryRouter
          initialEntries={initialEntries}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <App />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('app smoke', () => {
  it('renders the Today tab by default', async () => {
    renderWithProviders(['/']);

    expect(await screen.findByText(/Portfolio Manager/i)).toBeInTheDocument();
    expect(await screen.findByTestId('panel-today')).toBeVisible();
  });
});
