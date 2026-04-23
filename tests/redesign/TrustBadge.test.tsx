import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import TrustBadge from '../../src/components/shared/TrustBadge.jsx';
import TrustTooltip from '../../src/components/shared/TrustTooltip.jsx';

describe('SR-004 TrustBadge', () => {
  afterEach(() => {
    cleanup();
  });

  test('renders fresh high-confidence data with an accessible label', () => {
    render(
      <TrustBadge
        trust={{
          source_type: 'live',
          freshness_state: 'fresh',
          confidence_state: 'high',
          as_of: '2026-04-22T16:00:00Z',
        }}
      />
    );

    const badge = screen.getByLabelText('Data trust: Live');
    expect(badge).toBeVisible();
    expect(badge).toHaveTextContent('Live');
    expect(badge).toHaveAttribute('title', 'As of 2026-04-22T16:00:00Z');
  });

  test('renders degraded data as an unavailable state', () => {
    render(
      <TrustBadge
        trust={{
          source_type: 'unknown',
          freshness_state: 'unknown',
          confidence_state: 'degraded',
          degraded_reason: 'missing_price',
        }}
      />
    );

    const badge = screen.getByLabelText('Data trust: Unknown');
    expect(badge).toBeVisible();
    expect(badge).toHaveTextContent('Unknown');
  });
});

describe('SR-004 TrustTooltip', () => {
  afterEach(() => {
    cleanup();
  });

  test('shows source timing and degraded reason on hover', async () => {
    render(
      <TrustTooltip
        trust={{
          source_type: 'cached',
          freshness_state: 'stale',
          confidence_state: 'low',
          degraded_reason: 'stale_price',
          as_of: '2026-04-20T16:00:00Z',
        }}
      >
        <span>NAV</span>
      </TrustTooltip>
    );

    fireEvent.mouseEnter(screen.getByText('NAV'));

    expect(await screen.findByRole('tooltip')).toBeVisible();
    expect(screen.getByText('Price data is stale')).toBeVisible();
  });
});
