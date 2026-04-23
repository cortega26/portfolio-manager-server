import React from 'react';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import InboxTab from '../../src/components/InboxTab.jsx';
import { renderWithProviders } from '../../src/__tests__/test-utils';

vi.mock('../../src/utils/api.js', () => ({
  fetchInbox: vi.fn(async () => ({
    items: [
      {
        eventKey: 'threshold:SPY:below:10:2026-04-22',
        eventType: 'THRESHOLD_TRIGGERED',
        ticker: 'SPY',
        urgency: 'HIGH',
        description: 'SPY crossed below the configured buy zone.',
        rationale: 'Price crossed the 10% buy threshold. Review whether to act.',
        currentValue: '4050.00',
        shares: '10',
      },
    ],
  })),
  dismissInboxItem: vi.fn(async () => ({})),
}));

describe('SR-006 Inbox rationale cards', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test('renders rationale text when an inbox item provides it', async () => {
    renderWithProviders(
      <InboxTab
        portfolioId="rationale-test"
        holdings={[]}
        transactions={[]}
        currentPrices={{}}
        signals={{}}
        signalRows={[]}
        onSignalChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('inbox-item')).toBeVisible();
    });

    expect(
      screen.getByText('Price crossed the 10% buy threshold. Review whether to act.')
    ).toBeVisible();
  });
});
