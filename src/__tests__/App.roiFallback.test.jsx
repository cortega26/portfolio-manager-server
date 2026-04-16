import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import App from '../App.jsx';

vi.mock('../utils/api.js', async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    __esModule: true,
    evaluateSignals: vi.fn(async () => ({
      data: {
        rows: [],
        prices: {},
        errors: {},
        market: {
          isOpen: true,
          isBeforeOpen: false,
          lastTradingDate: '2024-01-02',
          nextTradingDate: '2024-01-02',
        },
      },
      requestId: 'signals-none',
    })),
    fetchBenchmarkCatalog: vi.fn(async () => ({ data: {} })),
    fetchBulkPrices: vi.fn(async (symbols) => {
      const list = Array.isArray(symbols) ? symbols : [];
      const series = new Map(
        list.map((symbol) => [
          String(symbol ?? '').toUpperCase(),
          [
            { date: '2024-01-01', close: 100 },
            { date: '2024-01-02', close: 105 },
          ],
        ])
      );
      if (!series.has('SPY')) {
        series.set('SPY', [
          { date: '2024-01-01', close: 100 },
          { date: '2024-01-02', close: 105 },
        ]);
      }
      return { series, errors: {} };
    }),
    fetchPrices: vi.fn(async () => ({
      data: [
        { date: '2024-01-01', close: 100 },
        { date: '2024-01-02', close: 105 },
      ],
      requestId: 'price-fallback-001',
    })),
    fetchDailyRoi: vi.fn(async () => ({
      data: {
        series: {
          portfolio: [
            { date: '2024-01-01', value: 0 },
            { date: '2024-01-02', value: 1 },
          ],
          portfolioTwr: [
            { date: '2024-01-01', value: 0 },
            { date: '2024-01-02', value: 0.5 },
          ],
          spy: [],
          bench: [],
          exCash: [],
          cash: [],
        },
      },
      requestId: 'roi-success-001',
    })),
    persistPortfolio: vi.fn(async () => ({ requestId: 'persist-001' })),
    retrievePortfolio: vi.fn(async () => ({
      data: { transactions: [], signals: {}, settings: null },
      requestId: 'retrieve-001',
    })),
  };
});

await import('../utils/api.js');

describe('App ROI degradations', () => {
  let dom;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.navigator = dom.window.navigator;
    global.HTMLElement = dom.window.HTMLElement;
    global.Node = dom.window.Node;
    global.localStorage = dom.window.localStorage;
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    cleanup();
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.HTMLElement;
    delete global.Node;
    delete global.localStorage;
    delete global.ResizeObserver;
  });

  it('keeps the last valid ROI snapshot when the ROI API temporarily fails', async () => {
    const api = await import('../utils/api.js');
    api.fetchDailyRoi
      .mockResolvedValueOnce({
        data: {
          series: {
            portfolio: [
              { date: '2024-01-01', value: 0 },
              { date: '2024-01-02', value: 1 },
            ],
            portfolioTwr: [
              { date: '2024-01-01', value: 0 },
              { date: '2024-01-02', value: 0.5 },
            ],
            spy: [],
            bench: [],
            exCash: [],
            cash: [],
          },
        },
        requestId: 'roi-success-001',
      })
      .mockRejectedValueOnce(
        Object.assign(new Error('ROI service unavailable'), {
          name: 'ApiError',
          requestId: 'roi-fail-001',
        })
      );

    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /transactions/i }));

    await userEvent.type(screen.getByLabelText(/date/i), '2024-02-01');
    await userEvent.type(screen.getByLabelText(/ticker/i), 'msft');
    await userEvent.type(screen.getByLabelText(/amount/i), '1000');
    await userEvent.type(screen.getByLabelText(/price/i), '100');
    await userEvent.click(screen.getByRole('button', { name: /add transaction/i }));

    await userEvent.click(screen.getByRole('button', { name: /dashboard/i }));
    await userEvent.click(await screen.findByRole('button', { name: /refresh roi/i }));

    const alert = await screen.findByText(
      'The ROI service is temporarily unavailable. Showing the latest valid ROI snapshot.'
    );
    assert.ok(alert, 'shows ROI fallback banner');
    assert.ok(
      await screen.findByText(/Request ID: roi-fail-001/i),
      'surfaces request ID for degraded ROI mode'
    );
    assert.ok(await screen.findByText(/Stale ROI/i), 'labels ROI status as stale');

    await waitFor(() => {
      const summary = screen.getByRole('status', { name: /Stale ROI/i });
      assert.ok(summary);
    });
  });

  it('shows ROI unavailable when the API fails before any valid snapshot exists', async () => {
    const api = await import('../utils/api.js');
    api.fetchDailyRoi.mockRejectedValueOnce(
      Object.assign(new Error('ROI service unavailable'), {
        name: 'ApiError',
        requestId: 'roi-fail-hard-001',
      })
    );

    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /transactions/i }));

    await userEvent.type(screen.getByLabelText(/date/i), '2024-02-01');
    await userEvent.type(screen.getByLabelText(/ticker/i), 'msft');
    await userEvent.type(screen.getByLabelText(/amount/i), '1000');
    await userEvent.type(screen.getByLabelText(/price/i), '100');
    await userEvent.click(screen.getByRole('button', { name: /add transaction/i }));

    await userEvent.click(screen.getByRole('button', { name: /dashboard/i }));

    assert.ok(
      await screen.findByText(
        'ROI service and fallback computation failed. Try again after reloading the page.'
      ),
      'shows unavailable banner when no valid ROI snapshot exists yet'
    );
    assert.equal(
      screen.queryByRole('status', { name: /Stale ROI/i }),
      null,
      'does not keep the dashboard in stale mode without prior data'
    );
  });
});
