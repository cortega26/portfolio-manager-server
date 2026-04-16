import React, { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PortfolioControls from '../components/PortfolioControls.jsx';
import { I18nProvider } from '../i18n/I18nProvider.jsx';

function Wrapper({
  initialPortfolioId = 'demo',
  onSave = async () => {},
  onLoad = async () => {},
}) {
  const [portfolioId, setPortfolioId] = useState(initialPortfolioId);

  return (
    <I18nProvider>
      <PortfolioControls
        portfolioId={portfolioId}
        onPortfolioIdChange={setPortfolioId}
        onSave={onSave}
        onLoad={onLoad}
      />
    </I18nProvider>
  );
}

describe('PortfolioControls desktop session flow', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('renders portfolio id controls and desktop session guidance', async () => {
    render(<Wrapper />);

    expect(screen.getByLabelText('Portfolio ID')).toBeTruthy();
    expect(screen.getByText('Desktop session')).toBeTruthy();
    expect(
      screen.getByText(
        'Authentication is injected automatically by the Electron shell for this local app.'
      )
    ).toBeTruthy();
    expect(screen.queryByLabelText('API Key')).toBeNull();
    expect(screen.queryByLabelText('Rotate Key (optional)')).toBeNull();
  });

  it('requires a portfolio id before executing actions', async () => {
    const saveSpy = vi.fn();
    render(<Wrapper initialPortfolioId="" onSave={saveSpy} />);

    await userEvent.click(screen.getByRole('button', { name: 'Save Portfolio' }));

    expect(saveSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Please provide a portfolio ID before continuing.')).toBeTruthy();
  });

  it('maps session auth API errors to friendly copy and surfaces request IDs', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const failingLoad = vi.fn().mockRejectedValue(
        Object.assign(new Error('Forbidden'), {
          name: 'ApiError',
          status: 403,
          requestId: 'req-session-403',
          body: { error: 'INVALID_SESSION_TOKEN' },
        })
      );

      render(<Wrapper onLoad={failingLoad} />);

      await userEvent.click(screen.getByRole('button', { name: 'Load Portfolio' }));

      expect(failingLoad).toHaveBeenCalledTimes(1);
      expect(
        screen.getByText(
          'The desktop session token is invalid. Restart the desktop app and try again.'
        )
      ).toBeTruthy();
      expect(screen.getByText(/Request ID: req-session-403/)).toBeTruthy();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('falls back to generic messaging for unexpected failures', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const failingLoad = vi.fn().mockRejectedValue(
        Object.assign(new Error('Teapot'), {
          name: 'ApiError',
          status: 503,
          requestId: 'req-503',
        })
      );

      render(<Wrapper onLoad={failingLoad} />);

      await userEvent.click(screen.getByRole('button', { name: 'Load Portfolio' }));

      expect(failingLoad).toHaveBeenCalledTimes(1);
      expect(
        screen.getByText('Unexpected error occurred while contacting the server. Try again.')
      ).toBeTruthy();
      expect(screen.getByText(/Request ID: req-503/)).toBeTruthy();
    } finally {
      consoleError.mockRestore();
    }
  });
});
