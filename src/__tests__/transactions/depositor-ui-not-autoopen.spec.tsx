import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import TransactionsTab from '../../components/TransactionsTab.jsx';
import { renderWithProviders } from '../test-utils';

describe('Depositor modal behaviour', () => {
  test('opens only on demand and closes after successful create', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      throw new Error('Unexpected console.warn in test');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('Unexpected console.error in test');
    });

    try {
      const props = {
        transactions: [],
        onAddTransaction: vi.fn(),
        onDeleteTransaction: vi.fn(),
      };

      const { rerender } = renderWithProviders(<TransactionsTab {...props} />);

      expect(screen.queryByTestId('depositor-modal')).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', { name: /add depositor/i }),
      );

      const modal = await screen.findByTestId('depositor-modal');
      const nameInput = within(modal).getByLabelText(/depositor name/i);
      await userEvent.type(nameInput, 'Family Trust');
      await userEvent.click(
        within(modal).getByRole('button', { name: /save depositor/i }),
      );

      await waitFor(() => {
        expect(screen.queryByTestId('depositor-modal')).not.toBeInTheDocument();
      });

      rerender(<TransactionsTab {...props} />);
      expect(screen.queryByTestId('depositor-modal')).not.toBeInTheDocument();
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
