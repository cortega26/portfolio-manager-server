import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import TransactionsTab from '../../components/TransactionsTab.jsx';
import { renderWithProviders } from '../test-utils';

function createTransaction(index: number) {
  const type = index % 2 === 0 ? 'BUY' : 'SELL';
  const amount = type === 'BUY' ? -(100 + index * 5) : 100 + index * 5;
  const price = 25 + (index % 4);
  const shares = Math.abs(amount) / price;
  const ticker = index % 3 === 0 ? 'AAPL' : index % 3 === 1 ? 'MSFT' : 'GOOG';
  const date = `2024-02-${String((index % 27) + 1).padStart(2, '0')}`;

  return {
    date,
    ticker,
    type,
    amount,
    price,
    shares,
  };
}

describe('TransactionsTab interactions', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      throw new Error('console.warn should not be called during tests');
    });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('console.error should not be called during tests');
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('supports search, pagination, and deletion in the non-virtualized table', async () => {
    const onDelete = vi.fn();
    const transactions = Array.from({ length: 60 }, (_, index) => createTransaction(index));

    renderWithProviders(
      <TransactionsTab
        transactions={transactions}
        onAddTransaction={vi.fn()}
        onDeleteTransaction={onDelete}
      />,
    );

    const table = await screen.findByRole('table', { name: /transactions/i });
    expect(table).toBeInTheDocument();

    const searchInput = screen.getByLabelText(/search transactions/i);
    await userEvent.type(searchInput, 'AAPL');
    await waitFor(() => {
      expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
    });

    await userEvent.clear(searchInput);

    const rowsPerPage = screen.getByLabelText(/rows per page/i);
    await userEvent.selectOptions(rowsPerPage, '25');

    const nextButton = screen.getByRole('button', { name: /next page/i });
    await userEvent.click(nextButton);
    expect(screen.getByText(/Page 2 of/i)).toBeInTheDocument();

    const previousButton = screen.getByRole('button', { name: /previous page/i });
    await userEvent.click(previousButton);
    expect(screen.getByText(/Page 1 of/i)).toBeInTheDocument();

    const firstUndo = within(table).getAllByRole('button', { name: /undo transaction/i })[0];
    await userEvent.click(firstUndo);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  test('renders the virtualized list when transactions exceed the threshold', async () => {
    const onDelete = vi.fn();
    const transactions = Array.from({ length: 210 }, (_, index) => createTransaction(index));

    renderWithProviders(
      <TransactionsTab
        transactions={transactions}
        onAddTransaction={vi.fn()}
        onDeleteTransaction={onDelete}
      />,
    );

    const virtualList = await screen.findByTestId('transactions-virtual-list');
    expect(virtualList).toBeInTheDocument();

    const undoButtons = within(virtualList).getAllByRole('button', { name: /undo transaction/i });
    await userEvent.click(undoButtons[0]);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
