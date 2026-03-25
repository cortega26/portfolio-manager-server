import React from 'react';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import HoldingsTab from '../components/HoldingsTab.jsx';
import { renderWithProviders } from './test-utils';
import * as holdingsUtils from '../utils/holdings.js';

const defaultHoldings = [
  { ticker: 'AAPL', shares: 10, cost: 1000, realised: 0 },
  { ticker: 'MSFT', shares: 5, cost: 800, realised: 12 },
];

describe('HoldingsTab', () => {
  afterEach(() => {
    cleanup();
  });

  test('renders holdings and derived metrics with currency formatting', () => {
    renderWithProviders(
      <HoldingsTab
        holdings={defaultHoldings}
        transactions={[]}
        currentPrices={{ AAPL: 150, MSFT: 160 }}
        signals={{}}
        onSignalChange={vi.fn()}
      />,
    );

    const holdingsTable = screen.getAllByRole('table', { name: /holdings/i })[0];
    expect(holdingsTable).toBeInTheDocument();

    const body = within(holdingsTable).getByTestId('holdings-tbody');
    const rows = within(body).getAllByRole('row');
    expect(rows).toHaveLength(2);

    const shareFormatter = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    });

    const appleRow = within(rows[0]);
    expect(appleRow.getByText('AAPL')).toBeVisible();
    expect(appleRow.getByText(shareFormatter.format(10))).toBeVisible();
    expect(appleRow.getByText('$100.00')).toBeVisible();
    expect(appleRow.getByText('$150.00')).toBeVisible();
    expect(appleRow.getByText('$1,500.00')).toBeVisible();
    expect(appleRow.getByText('$500.00')).toBeVisible();
    expect(appleRow.getByText('$0.00')).toBeVisible();

    const msftRow = within(rows[1]);
    expect(msftRow.getByText('MSFT')).toBeVisible();
    expect(msftRow.getByText(shareFormatter.format(5))).toBeVisible();
    expect(msftRow.getAllByText('$160.00')).toHaveLength(2);
    expect(msftRow.getByText('$800.00')).toBeVisible();
    expect(msftRow.getByText('$12.00')).toBeVisible();
  });

  test('exposes signal configuration inputs and bubbles changes', async () => {
    const onSignalChange = vi.fn();
    renderWithProviders(
      <HoldingsTab
        holdings={defaultHoldings}
        transactions={[]}
        currentPrices={{ AAPL: 150, MSFT: 160 }}
        signals={{ AAPL: { pct: 8 } }}
        onSignalChange={onSignalChange}
      />,
    );

    const tables = screen.getAllByRole('table', { name: /signals/i });
    const signalsTable = tables.at(-1);
    expect(signalsTable).toBeTruthy();
    const [aaplInput, msftInput] = within(signalsTable).getAllByRole('spinbutton');

    expect([aaplInput.value, msftInput.value]).toEqual(['8', '3']);

    fireEvent.change(aaplInput, { target: { value: '12.5' } });
    expect(onSignalChange).toHaveBeenLastCalledWith('AAPL', '12.5');
  });

  test('normalizes signal configs and renders state-specific badges', () => {
    const deriveSignalRowSpy = vi.spyOn(holdingsUtils, 'deriveSignalRow').mockImplementation(
      (holding) => {
        if (holding.ticker === 'SPY') {
          return {
            price: '$40.00',
            lower: '$35.00',
            upper: '$45.00',
            signal: 'BUY zone',
          };
        }
        if (holding.ticker === 'IWM') {
          return {
            price: '$230.00',
            lower: '$225.40',
            upper: '$234.60',
            signal: 'TRIM zone',
          };
        }
        return {
          price: '—',
          lower: '—',
          upper: '—',
          signal: 'NO DATA',
        };
      },
    );

    try {
      renderWithProviders(
        <HoldingsTab
          holdings={[
            { ticker: 'SPY', shares: 2, cost: 180, realised: 0 },
            { ticker: 'IWM', shares: 1, cost: 90, realised: 0 },
            { ticker: 'GLD', shares: 1, cost: 100, realised: 0 },
          ]}
          transactions={[]}
          currentPrices={{ SPY: 40, IWM: 230 }}
          signals={{ spy: { percent: '5.5' }, IWM: 2 }}
          onSignalChange={vi.fn()}
        />,
      );
    } finally {
      deriveSignalRowSpy.mockRestore();
    }

    const tables = screen.getAllByRole('table', { name: /signals/i });
    const signalsTable = tables.at(-1);
    const rows = within(signalsTable).getAllByRole('row');

    const spyRow = within(rows[1]);
    expect(spyRow.getByRole('spinbutton')).toHaveValue(5.5);
    expect(spyRow.getByText('BUY zone')).toBeInTheDocument();

    const iwmRow = within(rows[2]);
    expect(iwmRow.getByRole('spinbutton')).toHaveValue(2);
    expect(iwmRow.getByText('TRIM zone')).toBeInTheDocument();

    const gldRow = within(rows[3]);
    expect(gldRow.getByRole('spinbutton')).toHaveValue(3);
    expect(gldRow.getByText('NO DATA')).toBeInTheDocument();
  });

  test('shows friendly empty states for holdings and signals', () => {
    renderWithProviders(
      <HoldingsTab
        holdings={[]}
        transactions={[]}
        currentPrices={{}}
        signals={{}}
        onSignalChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/no holdings yet/i)).toBeVisible();
    expect(screen.getByText(/add transactions to configure signals/i)).toBeVisible();
  });

  test('shows unavailable market values when no live price exists yet', () => {
    const view = renderWithProviders(
      <HoldingsTab
        holdings={[{ ticker: 'AAPL', shares: '3.392359240', cost: 1000, realised: 0 }]}
        transactions={[]}
        currentPrices={{}}
        signals={{}}
        onSignalChange={vi.fn()}
      />,
    );

    const holdingsTable = view.getAllByRole('table', { name: /holdings/i })[0];
    const body = within(holdingsTable).getByTestId('holdings-tbody');
    const row = within(body).getByText('AAPL').closest('tr');
    expect(row).toBeTruthy();
    const cells = within(row).getAllByRole('cell');

    expect(cells[1]).toHaveTextContent('3.39235924');
    expect(cells[3]).toHaveTextContent('—');
    expect(cells[4]).toHaveTextContent('—');
    expect(cells[5]).toHaveTextContent('—');
  });

  test('uses the latest BUY or SELL as the signal reference price', () => {
    renderWithProviders(
      <HoldingsTab
        holdings={[{ ticker: 'AAPL', shares: 10, cost: 1000, realised: 0 }]}
        transactions={[
          { ticker: 'AAPL', type: 'BUY', shares: 10, amount: -1000, price: 100, date: '2024-01-01' },
          { ticker: 'AAPL', type: 'SELL', shares: 2, amount: 230, price: 115, date: '2024-01-05' },
        ]}
        currentPrices={{ AAPL: 121 }}
        signals={{ AAPL: { pct: 5 } }}
        onSignalChange={vi.fn()}
      />,
    );

    const tables = screen.getAllByRole('table', { name: /signals/i });
    const signalsTable = tables.at(-1);
    const rows = within(signalsTable).getAllByRole('row');
    const aaplRow = within(rows[1]);

    expect(aaplRow.getByText('$121.00')).toBeVisible();
    expect(aaplRow.getByText('$109.25')).toBeVisible();
    expect(aaplRow.getByText('$120.75')).toBeVisible();
    expect(aaplRow.getByText('TRIM zone')).toBeVisible();
  });

  test('suppresses signals when the live price fails the sanity guard', () => {
    renderWithProviders(
      <HoldingsTab
        holdings={[{ ticker: 'NVDA', shares: 1, cost: 100, realised: 0 }]}
        transactions={[
          { ticker: 'NVDA', type: 'BUY', shares: 1, amount: -100, price: 100, date: '2024-01-01' },
        ]}
        currentPrices={{ NVDA: 140 }}
        signals={{ NVDA: { pct: 5 } }}
        onSignalChange={vi.fn()}
      />,
    );

    const tables = screen.getAllByRole('table', { name: /signals/i });
    const signalsTable = tables.at(-1);
    const rows = within(signalsTable).getAllByRole('row');
    const nvdaRow = within(rows[1]);

    expect(nvdaRow.getByText('$140.00')).toBeVisible();
    expect(nvdaRow.getAllByText('—')).not.toHaveLength(0);
    expect(nvdaRow.getByText('NO DATA')).toBeVisible();
  });

  test('renders the corrected NVDA holding after the pre-split sell adjustment', () => {
    renderWithProviders(
      <HoldingsTab
        holdings={[{ ticker: 'NVDA', shares: '0.815097910', cost: 147.90260276740557, realised: 62.89260276740556 }]}
        transactions={[]}
        currentPrices={{ NVDA: 180.36 }}
        signals={{}}
        onSignalChange={vi.fn()}
      />,
    );

    const holdingsTable = screen.getAllByRole('table', { name: /holdings/i })[0];
    const body = within(holdingsTable).getByTestId('holdings-tbody');
    const row = within(body).getByText('NVDA').closest('tr');
    expect(row).toBeTruthy();
    const cells = within(row).getAllByRole('cell');

    expect(cells[1]).toHaveTextContent('0.81509791');
    expect(cells[2]).toHaveTextContent('$181.45');
    expect(cells[3]).toHaveTextContent('$180.36');
    expect(cells[4]).toHaveTextContent('$147.01');
    expect(cells[5]).toHaveTextContent('-$0.89');
    expect(cells[6]).toHaveTextContent('$62.89');
  });
});
