import React from 'react';
import { screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { renderWithProviders } from './test-utils';
import HoldingsTab from '../components/HoldingsTab.jsx';

const rows = [
  { ticker: 'AAPL', shares: 10, cost: 1000, realised: 0 },
  { ticker: 'MSFT', shares: 5, cost: 800, realised: 0 }
];

test('renders table headers and rows', () => {
  renderWithProviders(
    <HoldingsTab
      holdings={rows}
      currentPrices={{ AAPL: 150, MSFT: 160 }}
      signals={{}}
      onSignalChange={vi.fn()}
    />,
  );

  expect(screen.getByRole('table', { name: /holdings/i })).toBeInTheDocument();
  const body = screen.getByTestId('holdings-tbody');
  const renderedRows = within(body).getAllByRole('row');
  expect(renderedRows).toHaveLength(2);
  expect(within(body).getByText(/AAPL/i)).toBeInTheDocument();
  expect(within(body).getByText(/MSFT/i)).toBeInTheDocument();
});
