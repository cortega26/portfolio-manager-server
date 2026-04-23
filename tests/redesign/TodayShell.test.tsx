import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import TodayTab from '../../src/components/review/TodayTab.jsx';
import NeedsAttentionSection from '../../src/components/review/NeedsAttentionSection.jsx';
import { requestJson } from '../../src/lib/apiClient.js';

vi.mock('../../src/lib/apiClient.js', () => ({
  requestJson: vi.fn(),
}));

const mockedRequestJson = vi.mocked(requestJson);

describe('SR-021/SR-024 Today shell health states', () => {
  beforeEach(() => {
    mockedRequestJson.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  test('marks Today healthy when portfolio health is fresh and high confidence', async () => {
    mockedRequestJson.mockResolvedValueOnce({
      data: {
        portfolio_id: 'demo',
        freshness_state: 'fresh',
        confidence_state: 'high',
        degraded_reasons: [],
        unresolved_exception_count: 0,
        action_count: 0,
        as_of: '2026-04-23T12:00:00Z',
      },
      requestId: undefined,
      version: 'v1',
    });

    render(<TodayTab portfolioId="demo" />);

    await waitFor(() => {
      expect(screen.getByTestId('today-tab')).toHaveAttribute('data-today-status', 'healthy');
    });
    expect(screen.getByTestId('portfolio-health-bar')).toHaveAttribute(
      'data-health-status',
      'healthy'
    );
  });

  test('passes health degraded_reasons into DataBlockersSection', async () => {
    mockedRequestJson.mockResolvedValueOnce({
      data: {
        portfolio_id: 'demo',
        freshness_state: 'expired',
        confidence_state: 'low',
        degraded_reasons: ['stale_price'],
        unresolved_exception_count: 0,
        action_count: 0,
        as_of: '2026-04-23T12:00:00Z',
      },
      requestId: undefined,
      version: 'v1',
    });

    render(<TodayTab portfolioId="demo" />);

    await waitFor(() => {
      expect(screen.getByTestId('today-tab')).toHaveAttribute('data-today-status', 'blocked');
    });
    expect(
      within(screen.getByTestId('data-blockers-section')).getByText('stale_price')
    ).toBeVisible();
  });
});

describe('SR-022 NeedsAttentionSection populated state', () => {
  afterEach(() => {
    cleanup();
  });

  test('shows a descriptive empty state when there are no HIGH urgency items', () => {
    render(
      <NeedsAttentionSection
        items={[
          { eventKey: 'medium', ticker: 'MMM', urgency: 'MEDIUM', description: 'Medium item' },
        ]}
      />
    );

    expect(screen.getByText('No action needed — your portfolio is on track.')).toBeVisible();
    expect(screen.queryByTestId('needs-attention-item')).not.toBeInTheDocument();
  });

  test('shows only the top five HIGH urgency items', () => {
    const items = [
      { eventKey: 'low', ticker: 'ZZZ', urgency: 'LOW', description: 'Low item' },
      { eventKey: 'high-6', ticker: 'FFF', urgency: 'HIGH', description: 'Sixth high item' },
      { eventKey: 'high-1', ticker: 'AAA', urgency: 'HIGH', description: 'First high item' },
      { eventKey: 'high-2', ticker: 'BBB', urgency: 'HIGH', description: 'Second high item' },
      { eventKey: 'medium', ticker: 'MMM', urgency: 'MEDIUM', description: 'Medium item' },
      { eventKey: 'high-3', ticker: 'CCC', urgency: 'HIGH', description: 'Third high item' },
      { eventKey: 'high-4', ticker: 'DDD', urgency: 'HIGH', description: 'Fourth high item' },
      { eventKey: 'high-5', ticker: 'EEE', urgency: 'HIGH', description: 'Fifth high item' },
    ];

    render(<NeedsAttentionSection items={items} />);

    const renderedItems = screen.getAllByTestId('needs-attention-item');
    expect(renderedItems).toHaveLength(5);
    expect(screen.getByText('AAA')).toBeVisible();
    expect(screen.getByText('EEE')).toBeVisible();
    expect(screen.queryByText('FFF')).not.toBeInTheDocument();
    expect(screen.queryByText('MMM')).not.toBeInTheDocument();
    expect(screen.queryByText('ZZZ')).not.toBeInTheDocument();
  });
});
