import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
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

  const forms = screen.getAllByRole('form', { name: /add transaction/i });
  const form = forms.at(-1);
  if (!form) {
    throw new Error('Transaction form not found');
  }
  const initialSubmitButton = within(form).getByRole('button', { name: /add transaction/i });
  await userEvent.click(initialSubmitButton);

  expect(screen.getByTestId('error-form')).toHaveTextContent(/please fill in all fields/i);
  expect(screen.getByTestId('error-date')).toBeInTheDocument();
  expect(screen.getByTestId('error-ticker')).toBeInTheDocument();
  expect(screen.getByTestId('error-amount')).toBeInTheDocument();
  expect(screen.getByTestId('error-shares')).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText(/date/i), '2024-01-01');
  await userEvent.type(screen.getByLabelText(/ticker/i), 'aapl');
  await userEvent.type(
    screen.getByRole('spinbutton', { name: /^Amount$/i }),
    '1500',
  );
  await userEvent.type(
    within(form).getByPlaceholderText(/0\.349861261/i),
    '10',
  );

  const finalSubmitButton = within(form).getByRole('button', { name: /add transaction/i });
  await userEvent.click(finalSubmitButton);

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

test('derives price from amount and 9-decimal shares for manual equity trades', async () => {
  const onSubmit = vi.fn();
  renderWithProviders(
    <TransactionsTab
      transactions={[]}
      onAddTransaction={onSubmit}
      onDeleteTransaction={vi.fn()}
    />,
  );

  const forms = screen.getAllByRole('form', { name: /add transaction/i });
  const form = forms.at(-1);
  if (!form) {
    throw new Error('Transaction form not found');
  }
  const dateInput = within(form).getByLabelText(/date/i);
  const tickerInput = within(form).getByLabelText(/ticker/i);
  const amountInput = within(form).getByRole('spinbutton', { name: /^Amount$/i });
  const priceInput = within(form).getByPlaceholderText(/calculated automatically/i);
  const sharesInput = within(form).getByPlaceholderText(/0\.349861261/i);

  await userEvent.type(dateInput, '2026-03-20');
  await userEvent.type(tickerInput, 'DELL');
  await userEvent.type(amountInput, '58.12');
  await userEvent.type(sharesInput, '0.349861261');

  expect(priceInput).toHaveValue(166.122993537);

  await userEvent.click(within(form).getByRole('button', { name: /add transaction/i }));

  await waitFor(() => {
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  expect(onSubmit).toHaveBeenCalledWith({
    date: '2026-03-20',
    ticker: 'DELL',
    type: 'BUY',
    amount: -58.12,
    price: 166.122993537,
    shares: 0.349861261,
  });
});

test('allows cash-only transactions without price information', async () => {
  const onSubmit = vi.fn();
  renderWithProviders(
    <TransactionsTab
      transactions={[]}
      onAddTransaction={onSubmit}
      onDeleteTransaction={vi.fn()}
    />,
  );

  const forms = screen.getAllByRole('form', { name: /add transaction/i });
  const form = forms.at(-1);
  if (!form) {
    throw new Error('Transaction form not found');
  }
  const typeSelect = within(form).getByLabelText(/type/i);
  await userEvent.selectOptions(typeSelect, 'DEPOSIT');
  const dateInput = within(form).getByLabelText(/date/i);
  const amountInput = within(form).getByRole('spinbutton', { name: /^Amount$/i });
  await userEvent.type(dateInput, '2024-03-15');
  await userEvent.type(amountInput, '2500');

  const cashSubmitButton = within(form).getByRole('button', { name: /add transaction/i });
  await userEvent.click(cashSubmitButton);

  await waitFor(() => {
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  const payload = onSubmit.mock.calls[0][0];
  expect(payload).toEqual({
    date: '2024-03-15',
    type: 'DEPOSIT',
    amount: 2500,
  });
});
