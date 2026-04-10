import React from 'react';
import { fireEvent } from '@testing-library/react';
import { screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import SignalsTab from '../components/SignalsTab.jsx';
import { renderWithProviders } from './test-utils';

test('renders backend-driven signals in a dedicated tab surface and allows window edits', async () => {
  const onSignalChange = vi.fn();

  renderWithProviders(
    <SignalsTab
      holdings={[{ ticker: 'AAPL', shares: 10, cost: 1000, realised: 0 }]}
      transactions={[
        { ticker: 'AAPL', type: 'BUY', shares: 10, amount: -1000, price: 100, date: '2024-01-01' },
      ]}
      currentPrices={{ AAPL: 97 }}
      signals={{ AAPL: { pct: 4 } }}
      signalRows={[
        {
          ticker: 'AAPL',
          pctWindow: 4,
          status: 'BUY_ZONE',
          currentPrice: 97,
          currentPriceAsOf: '2024-03-01',
          lowerBound: 96,
          upperBound: 104,
          referencePrice: 100,
          referenceDate: '2024-01-01',
          referenceType: 'BUY',
          sanityRejected: false,
        },
      ]}
      onSignalChange={onSignalChange}
    />,
  );

  expect(screen.getByRole('heading', { name: /signals workspace/i })).toBeVisible();
  expect(screen.getByText(/review backend-calculated signal bands/i)).toBeVisible();
  expect(screen.getByRole('table', { name: /signals/i })).toBeVisible();
  expect(screen.getByText('AAPL')).toBeVisible();
  expect(screen.getByText('BUY zone')).toBeVisible();
  expect(screen.getByText('$97.00')).toBeVisible();

  const input = screen.getByRole('spinbutton', { name: /aapl percent window/i });
  fireEvent.change(input, { target: { value: '6' } });

  expect(onSignalChange).toHaveBeenLastCalledWith('AAPL', '6');
});
