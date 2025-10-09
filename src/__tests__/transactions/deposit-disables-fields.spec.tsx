import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import TransactionsTab from '../../components/TransactionsTab.jsx';
import { renderWithProviders } from '../test-utils';

describe('TransactionsTab deposit UX', () => {
  test('disables ticker and shares for deposits and omits them from submission payload', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      throw new Error('Unexpected console.warn in test');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('Unexpected console.error in test');
    });

    try {
      const onSubmit = vi.fn();
      renderWithProviders(
        <TransactionsTab
          transactions={[]}
          onAddTransaction={onSubmit}
          onDeleteTransaction={vi.fn()}
        />,
      );

      const form = screen.getByRole('form', { name: /add transaction/i });
      const typeSelect = within(form).getByLabelText(/type/i);
      await userEvent.selectOptions(typeSelect, 'DEPOSIT');

      const tickerInput = within(form).getByLabelText(/ticker/i);
      expect(tickerInput).toBeDisabled();
      expect(tickerInput).toHaveAttribute('aria-disabled', 'true');
      expect(tickerInput).toHaveValue('');

      const sharesInput = within(form).getByLabelText(/shares/i);
      expect(sharesInput).toBeDisabled();
      expect(sharesInput).toHaveAttribute('aria-disabled', 'true');
      expect(sharesInput).toHaveDisplayValue('');

      await userEvent.type(within(form).getByLabelText(/date/i), '2024-05-01');
      await userEvent.type(within(form).getByLabelText(/amount/i), '5000');

      await userEvent.click(within(form).getByRole('button', { name: /add transaction/i }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });

      const payload = onSubmit.mock.calls[0][0];
      expect(payload).toEqual({ date: '2024-05-01', type: 'DEPOSIT', amount: 5000 });
      expect(payload).not.toHaveProperty('ticker');
      expect(payload).not.toHaveProperty('shares');
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
