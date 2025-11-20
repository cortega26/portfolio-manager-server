// @ts-nocheck
import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import HoldingsTab from '../components/HoldingsTab.jsx';
import { renderWithProviders } from './test-utils';
import * as holdingsUtils from '../utils/holdings.js';

const defaultHoldings = [
  { ticker: 'AAPL', shares: 10, cost: 1000, realised: 0 },
  { ticker: 'MSFT', shares: 5, cost: 800, realised: 12 },
];

describe('HoldingsTab', () => {
  test('renders holdings and derived metrics with currency formatting', () => {
    renderWithProviders(
      <HoldingsTab
        holdings={defaultHoldings}
        currentPrices={{ AAPL: 150, MSFT: 160 }}
        signals={{}}
        onSignalChange={vi.fn()}
      />,
    );

    const holdingsTable = screen.getByRole('table', { name: /holdings/i });
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
        currentPrices={{}}
        signals={{}}
        onSignalChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/no holdings yet/i)).toBeVisible();
    expect(screen.getByText(/add transactions to configure signals/i)).toBeVisible();
  });
});
