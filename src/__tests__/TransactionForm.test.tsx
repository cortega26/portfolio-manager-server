import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderWithProviders } from './test-utils';
import TransactionsTab from '../components/TransactionsTab.jsx';

test('shows validation errors then submits when fixed', async () => {
  const onSubmit = vi.fn();
  renderWithProviders(
    <TransactionsTab
      transactions={[]}
      onAddTransaction={onSubmit}
      onDeleteTransaction={vi.fn()}
    />,
  );

  await userEvent.click(screen.getByRole('button', { name: /add transaction/i }));

  expect(screen.getByTestId('error-form')).toHaveTextContent(/please fill in all fields/i);
  expect(screen.getByTestId('error-date')).toBeInTheDocument();
  expect(screen.getByTestId('error-ticker')).toBeInTheDocument();
  expect(screen.getByTestId('error-amount')).toBeInTheDocument();
  expect(screen.getByTestId('error-price')).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText(/date/i), '2024-01-01');
  await userEvent.type(screen.getByLabelText(/ticker/i), 'aapl');
  await userEvent.type(screen.getByLabelText(/amount/i), '1500');
  await userEvent.type(screen.getByLabelText(/price/i), '150');

  await userEvent.click(screen.getByRole('button', { name: /add transaction/i }));

  await waitFor(() => {
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  const payload = onSubmit.mock.calls[0][0];
  expect(payload).toMatchObject({
    date: '2024-01-01',
    ticker: 'AAPL',
    type: 'BUY',
    amount: -1500,
    price: 150,
  });
  expect(payload.shares).toBeCloseTo(10);
});
