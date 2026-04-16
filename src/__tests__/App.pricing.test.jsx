import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { afterEach, beforeEach, describe, it } from 'node:test';

import App from '../App.jsx';

function renderApp() {
  return render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  );
}

vi.mock('../utils/api.js', async (importOriginal) => {
  const actual = await importOriginal();
  const priceCalls = [];
  const priceBatches = [];
  const bulkPriceCalls = [];
  const signalBodies = [];
  let shouldFailNextPrice = false;
  let latestOnlyPriceOverride = null;
  const queuedSignalResponses = [];

  function normalizeTicker(ticker) {
    return String(ticker ?? '')
      .trim()
      .toUpperCase();
  }

  function deriveOpenHoldings(transactions) {
    const positions = new Map();
    for (const transaction of Array.isArray(transactions) ? transactions : []) {
      const ticker = normalizeTicker(transaction?.ticker);
      const type = normalizeTicker(transaction?.type);
      if (!ticker || (type !== 'BUY' && type !== 'SELL')) {
        continue;
      }
      const quantityCandidate = Number.isFinite(transaction?.quantity)
        ? Number(transaction.quantity)
        : Number.isFinite(transaction?.shares)
          ? Number(transaction.shares)
          : Number.isFinite(transaction?.amount) &&
              Number.isFinite(transaction?.price) &&
              transaction.price !== 0
            ? Math.abs(Number(transaction.amount) / Number(transaction.price))
            : 0;
      const signedQuantity = type === 'BUY' ? quantityCandidate : -quantityCandidate;
      positions.set(ticker, (positions.get(ticker) ?? 0) + signedQuantity);
    }
    return Array.from(positions.entries())
      .filter(([, quantity]) => quantity > 0)
      .map(([ticker]) => ticker)
      .sort();
  }

  function buildDefaultSignalResponse(body) {
    const openHoldings = deriveOpenHoldings(body?.transactions);
    const prices = Object.fromEntries(
      openHoldings.map((ticker) => [ticker, ticker === 'MSFT' ? 250 : 125])
    );
    const rows = openHoldings.map((ticker) => {
      const pctWindow = Number(body?.signals?.[ticker]?.pct ?? 3);
      const referencePrice = ticker === 'MSFT' ? 250 : 125;
      const currentPrice = prices[ticker];
      const lowerBound = referencePrice * (1 - pctWindow / 100);
      const upperBound = referencePrice * (1 + pctWindow / 100);
      return {
        ticker,
        pctWindow,
        status: 'HOLD',
        currentPrice,
        currentPriceAsOf: '2024-02-02',
        lowerBound,
        upperBound,
        referencePrice,
        referenceDate: '2024-02-01',
        referenceType: 'BUY',
        sanityRejected: false,
      };
    });
    return {
      data: {
        rows,
        prices,
        errors: {},
        market: {
          isOpen: true,
          isBeforeOpen: false,
          lastTradingDate: '2024-02-02',
          nextTradingDate: '2024-02-05',
        },
      },
      requestId: 'signals-success-001',
    };
  }

  return {
    ...actual,
    __esModule: true,
    evaluateSignals: vi.fn(async (body) => {
      const payload = JSON.parse(JSON.stringify(body ?? {}));
      signalBodies.push(payload);
      const openHoldings = deriveOpenHoldings(payload.transactions);
      priceBatches.push([...openHoldings]);
      for (const ticker of openHoldings) {
        priceCalls.push(ticker);
      }
      if (queuedSignalResponses.length > 0) {
        const nextResponse = queuedSignalResponses.shift();
        return typeof nextResponse === 'function' ? nextResponse(payload) : nextResponse;
      }
      if (shouldFailNextPrice) {
        shouldFailNextPrice = false;
        return {
          data: {
            rows: [],
            prices: {},
            errors: Object.fromEntries(
              openHoldings.map((ticker) => [
                ticker,
                {
                  code: 'PRICE_FETCH_FAILED',
                  message: 'Pricing temporarily unavailable',
                  requestId: 'price-fail-001',
                },
              ])
            ),
            market: {
              isOpen: true,
              isBeforeOpen: false,
              lastTradingDate: '2024-02-02',
              nextTradingDate: '2024-02-05',
            },
          },
          requestId: 'price-fail-001',
        };
      }
      return buildDefaultSignalResponse(payload);
    }),
    fetchBenchmarkCatalog: vi.fn(async () => ({ data: {} })),
    fetchBulkPrices: vi.fn(async (symbols, options = {}) => {
      const list = Array.isArray(symbols) ? symbols : [];
      const normalized = list
        .map((ticker) => String(ticker ?? '').toUpperCase())
        .filter((ticker) => ticker && ticker !== 'SPY');
      bulkPriceCalls.push({
        symbols: [...normalized],
        options: { ...options },
      });
      priceBatches.push([...normalized]);
      for (const ticker of normalized) {
        priceCalls.push(ticker);
      }
      if (shouldFailNextPrice) {
        shouldFailNextPrice = false;
        return {
          series: new Map(),
          errors: Object.fromEntries(
            normalized.map((ticker) => [
              ticker,
              {
                code: 'PRICE_FETCH_FAILED',
                message: 'Pricing temporarily unavailable',
                requestId: 'price-fail-001',
              },
            ])
          ),
          metadata: {},
          requestId: 'price-fail-001',
        };
      }
      return {
        series: new Map(
          normalized.map((ticker) => [
            ticker,
            [
              {
                date: '2024-01-01',
                close:
                  options?.latestOnly && Number.isFinite(latestOnlyPriceOverride)
                    ? latestOnlyPriceOverride
                    : 120,
              },
              {
                date: '2024-01-02',
                close:
                  options?.latestOnly && Number.isFinite(latestOnlyPriceOverride)
                    ? latestOnlyPriceOverride
                    : 125,
              },
            ],
          ])
        ),
        errors: {},
        metadata: {},
        requestId: 'price-success-001',
      };
    }),
    fetchDailyReturns: vi.fn(async () => ({
      data: {
        series: {
          port: [
            { date: '2024-01-01', value: 0 },
            { date: '2024-01-02', value: 0.01 },
          ],
          spy: [],
        },
      },
      requestId: 'returns-success-001',
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
    __setNextPriceFailure(flag) {
      shouldFailNextPrice = flag;
    },
    __getPriceCalls() {
      return priceCalls
        .filter((ticker) => typeof ticker === 'string' && ticker.toUpperCase() !== 'SPY')
        .map((ticker) => ticker.toUpperCase());
    },
    __getLastPriceBatch() {
      return priceBatches.at(-1) ?? [];
    },
    __getSignalBodies() {
      return signalBodies.slice();
    },
    __getBulkPriceCalls() {
      return bulkPriceCalls.slice();
    },
    __queueSignalResponse(response) {
      queuedSignalResponses.push(response);
    },
    __setLatestOnlyPriceOverride(price) {
      latestOnlyPriceOverride = Number.isFinite(price) ? price : null;
    },
    __resetPriceTracking() {
      priceCalls.length = 0;
      priceBatches.length = 0;
      bulkPriceCalls.length = 0;
      signalBodies.length = 0;
      queuedSignalResponses.length = 0;
      shouldFailNextPrice = false;
      latestOnlyPriceOverride = null;
    },
  };
});

const api = await import('../utils/api.js');

describe('App price refresh degradations', () => {
  let dom;

  beforeEach(() => {
    api.__resetPriceTracking();
    api.fetchBulkPrices.mockClear();
    api.retrievePortfolio.mockClear();
    api.evaluateSignals.mockClear();
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

  it('retains previous prices and surfaces an alert when refresh fails', async () => {
    renderApp();

    await userEvent.click(screen.getByRole('button', { name: /transactions/i }));

    await userEvent.type(screen.getByLabelText(/date/i), '2024-02-01');
    await userEvent.type(screen.getByLabelText(/ticker/i), 'aapl');
    await userEvent.type(screen.getByLabelText(/amount/i), '1250');
    await userEvent.type(screen.getByLabelText(/price/i), '125');
    await userEvent.click(screen.getByRole('button', { name: /add transaction/i }));

    await waitFor(() => {
      assert.deepEqual(api.__getPriceCalls(), ['AAPL']);
    });

    await userEvent.click(screen.getByRole('button', { name: /holdings/i }));

    assert.ok(await screen.findByText('$125.00'));

    api.__setNextPriceFailure(true);

    await userEvent.click(screen.getByRole('button', { name: /transactions/i }));
    await userEvent.type(screen.getByLabelText(/date/i), '2024-02-02');
    await userEvent.clear(screen.getByLabelText(/ticker/i));
    await userEvent.type(screen.getByLabelText(/ticker/i), 'aapl');
    await userEvent.type(screen.getByLabelText(/amount/i), '250');
    await userEvent.type(screen.getByLabelText(/price/i), '125');
    await userEvent.click(screen.getByRole('button', { name: /add transaction/i }));

    await userEvent.click(screen.getByRole('button', { name: /dashboard/i }));

    assert.ok(await screen.findByText('Price refresh failed'), 'alerts when pricing request fails');
    assert.ok(screen.getByText(/Unable to update prices for AAPL. Showing last known values/));
    assert.ok(screen.getByText(/Request IDs?: price-fail-001/i));

    await userEvent.click(screen.getByRole('button', { name: /holdings/i }));

    assert.ok(await screen.findByText('$125.00'));
  });

  it('preloads latest-only quotes on app open when the market is closed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-02-03T15:00:00Z'));
    api.__setLatestOnlyPriceOverride(333);
    api.retrievePortfolio.mockResolvedValueOnce({
      data: {
        transactions: [
          { date: '2024-02-01', ticker: 'AAPL', type: 'BUY', shares: 2, amount: -250 },
        ],
        signals: {},
        settings: null,
      },
      requestId: 'retrieve-closed-001',
    });
    api.evaluateSignals.mockResolvedValueOnce({
      data: {
        rows: [],
        prices: {},
        errors: {},
        market: {
          isOpen: false,
          isBeforeOpen: false,
          lastTradingDate: '2024-02-02',
          nextTradingDate: '2024-02-05',
        },
      },
      requestId: 'signals-closed-001',
    });

    try {
      renderApp();

      await waitFor(() => {
        const latestOnlyCall = api
          .__getBulkPriceCalls()
          .find(
            (entry) =>
              entry.options?.latestOnly === true &&
              Array.isArray(entry.symbols) &&
              entry.symbols.includes('AAPL')
          );
        assert.ok(latestOnlyCall);
      });

      await userEvent.click(screen.getByRole('button', { name: /holdings/i }));
      assert.ok(await screen.findByText('$333.00'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows market-closed guidance instead of an error on weekend failures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-02-03T15:00:00Z'));

    try {
      renderApp();

      await userEvent.click(screen.getByRole('button', { name: /transactions/i }));

      await userEvent.type(screen.getByLabelText(/date/i), '2024-02-01');
      await userEvent.type(screen.getByLabelText(/ticker/i), 'msft');
      await userEvent.type(screen.getByLabelText(/amount/i), '2500');
      await userEvent.type(screen.getByLabelText(/price/i), '250');
      await userEvent.click(screen.getByRole('button', { name: /add transaction/i }));

      await waitFor(() => {
        assert.deepEqual(api.__getPriceCalls(), ['MSFT']);
      });

      api.__queueSignalResponse({
        data: {
          rows: [],
          prices: {},
          errors: {
            MSFT: {
              code: 'PRICE_FETCH_FAILED',
              message: 'Pricing temporarily unavailable',
              requestId: 'price-fail-001',
            },
          },
          market: {
            isOpen: false,
            isBeforeOpen: false,
            lastTradingDate: '2024-02-02',
            nextTradingDate: '2024-02-05',
          },
        },
        requestId: 'price-fail-001',
      });

      await userEvent.type(screen.getByLabelText(/date/i), '2024-02-02');
      await userEvent.clear(screen.getByLabelText(/ticker/i));
      await userEvent.type(screen.getByLabelText(/ticker/i), 'msft');
      await userEvent.type(screen.getByLabelText(/amount/i), '250');
      await userEvent.type(screen.getByLabelText(/price/i), '250');
      await userEvent.click(screen.getByRole('button', { name: /add transaction/i }));

      await userEvent.click(screen.getByRole('button', { name: /dashboard/i }));

      assert.ok(await screen.findByText(/Market is closed/i));
      assert.equal(screen.queryByText(/Price refresh failed/i), null);
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to market-closed guidance when the signal preview request fails on a weekend', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-02-03T15:00:00Z'));

    try {
      renderApp();

      await userEvent.click(screen.getByRole('button', { name: /transactions/i }));

      await userEvent.type(screen.getByLabelText(/date/i), '2024-02-01');
      await userEvent.type(screen.getByLabelText(/ticker/i), 'msft');
      await userEvent.type(screen.getByLabelText(/amount/i), '2500');
      await userEvent.type(screen.getByLabelText(/price/i), '250');
      await userEvent.click(screen.getByRole('button', { name: /add transaction/i }));

      await waitFor(() => {
        assert.deepEqual(api.__getPriceCalls(), ['MSFT']);
      });

      await userEvent.click(screen.getByRole('button', { name: /holdings/i }));
      assert.ok(await screen.findByText('$250.00'));

      api.__queueSignalResponse(() => {
        const error = new Error('Signals preview failed');
        error.requestId = 'price-fail-001';
        throw error;
      });

      await userEvent.click(screen.getByRole('button', { name: /transactions/i }));
      await userEvent.type(screen.getByLabelText(/date/i), '2024-02-02');
      await userEvent.clear(screen.getByLabelText(/ticker/i));
      await userEvent.type(screen.getByLabelText(/ticker/i), 'msft');
      await userEvent.type(screen.getByLabelText(/amount/i), '250');
      await userEvent.type(screen.getByLabelText(/price/i), '250');
      await userEvent.click(screen.getByRole('button', { name: /add transaction/i }));

      await userEvent.click(screen.getByRole('button', { name: /dashboard/i }));

      assert.ok(await screen.findByText(/Market is closed/i));
      assert.equal(screen.queryByText(/Price refresh failed/i), null);
      assert.ok(screen.getByText(/Request IDs?: price-fail-001/i));
    } finally {
      vi.useRealTimers();
    }
  });

  it('requests live prices only for open holdings', async () => {
    renderApp();

    await userEvent.click(screen.getByRole('button', { name: /transactions/i }));

    await userEvent.type(screen.getByLabelText(/date/i), '2024-02-01');
    await userEvent.type(screen.getByLabelText(/ticker/i), 'aapl');
    await userEvent.type(screen.getByLabelText(/amount/i), '1250');
    await userEvent.type(screen.getByLabelText(/price/i), '125');
    await userEvent.click(screen.getByRole('button', { name: /add transaction/i }));

    const typeSelect = screen.getByLabelText(/type/i);
    await userEvent.selectOptions(typeSelect, 'SELL');
    await userEvent.clear(screen.getByLabelText(/date/i));
    await userEvent.type(screen.getByLabelText(/date/i), '2024-02-02');
    await userEvent.clear(screen.getByLabelText(/ticker/i));
    await userEvent.type(screen.getByLabelText(/ticker/i), 'aapl');
    await userEvent.clear(screen.getByLabelText(/amount/i));
    await userEvent.type(screen.getByLabelText(/amount/i), '1250');
    await userEvent.clear(screen.getByLabelText(/price/i));
    await userEvent.type(screen.getByLabelText(/price/i), '125');
    await userEvent.click(screen.getByRole('button', { name: /add transaction/i }));

    await userEvent.selectOptions(typeSelect, 'DEPOSIT');
    await userEvent.clear(screen.getByLabelText(/date/i));
    await userEvent.type(screen.getByLabelText(/date/i), '2024-02-03');
    await userEvent.clear(screen.getByLabelText(/amount/i));
    await userEvent.type(screen.getByLabelText(/amount/i), '500');
    await userEvent.click(screen.getByRole('button', { name: /add transaction/i }));

    await userEvent.selectOptions(typeSelect, 'BUY');
    await userEvent.clear(screen.getByLabelText(/date/i));
    await userEvent.type(screen.getByLabelText(/date/i), '2024-02-04');
    await userEvent.clear(screen.getByLabelText(/ticker/i));
    await userEvent.type(screen.getByLabelText(/ticker/i), 'msft');
    await userEvent.clear(screen.getByLabelText(/amount/i));
    await userEvent.type(screen.getByLabelText(/amount/i), '250');
    await userEvent.clear(screen.getByLabelText(/price/i));
    await userEvent.type(screen.getByLabelText(/price/i), '250');
    await userEvent.click(screen.getByRole('button', { name: /add transaction/i }));

    await waitFor(() => {
      assert.deepEqual(api.__getLastPriceBatch(), ['MSFT']);
    });
  });

  it('re-evaluates signals when the percent window changes', async () => {
    renderApp();

    await userEvent.click(screen.getByRole('button', { name: /transactions/i }));

    await userEvent.type(screen.getByLabelText(/date/i), '2024-02-01');
    await userEvent.type(screen.getByLabelText(/ticker/i), 'aapl');
    await userEvent.type(screen.getByLabelText(/amount/i), '1250');
    await userEvent.type(screen.getByLabelText(/price/i), '125');
    await userEvent.click(screen.getByRole('button', { name: /add transaction/i }));

    await waitFor(() => {
      const calls = api.__getSignalBodies();
      assert.ok(calls.length >= 1);
      assert.deepEqual(calls.at(-1).signals, {});
    });

    await userEvent.click(screen.getByRole('button', { name: /holdings/i }));

    const windowInput = await screen.findByLabelText(/aapl percent window/i);
    await userEvent.clear(windowInput);
    await userEvent.type(windowInput, '5');

    await waitFor(() => {
      const calls = api.__getSignalBodies();
      const latest = calls.at(-1);
      assert.equal(latest.signals.AAPL.pct, 5);
    });
  });

  it('triggers signal toasts from backend status transitions', async () => {
    api.__queueSignalResponse({
      data: {
        rows: [
          {
            ticker: 'AAPL',
            pctWindow: 3,
            status: 'HOLD',
            currentPrice: 125,
            currentPriceAsOf: '2024-02-01',
            lowerBound: 121.25,
            upperBound: 128.75,
            referencePrice: 125,
            referenceDate: '2024-02-01',
            referenceType: 'BUY',
            sanityRejected: false,
          },
        ],
        prices: { AAPL: 125 },
        errors: {},
        market: {
          isOpen: true,
          isBeforeOpen: false,
          lastTradingDate: '2024-02-01',
          nextTradingDate: '2024-02-02',
        },
      },
      requestId: 'signals-hold-001',
    });

    renderApp();

    await userEvent.click(screen.getByRole('button', { name: /transactions/i }));

    await userEvent.type(screen.getByLabelText(/date/i), '2024-02-01');
    await userEvent.type(screen.getByLabelText(/ticker/i), 'aapl');
    await userEvent.type(screen.getByLabelText(/amount/i), '1250');
    await userEvent.type(screen.getByLabelText(/price/i), '125');
    await userEvent.click(screen.getByRole('button', { name: /add transaction/i }));

    await waitFor(() => {
      assert.deepEqual(api.__getLastPriceBatch(), ['AAPL']);
    });

    api.__queueSignalResponse({
      data: {
        rows: [
          {
            ticker: 'AAPL',
            pctWindow: 5,
            status: 'BUY_ZONE',
            currentPrice: 115,
            currentPriceAsOf: '2024-02-02',
            lowerBound: 118.75,
            upperBound: 131.25,
            referencePrice: 125,
            referenceDate: '2024-02-01',
            referenceType: 'BUY',
            sanityRejected: false,
          },
        ],
        prices: { AAPL: 115 },
        errors: {},
        market: {
          isOpen: true,
          isBeforeOpen: false,
          lastTradingDate: '2024-02-02',
          nextTradingDate: '2024-02-05',
        },
      },
      requestId: 'signals-buy-001',
    });

    await userEvent.click(screen.getByRole('button', { name: /holdings/i }));
    const windowInput = await screen.findByLabelText(/aapl percent window/i);
    await userEvent.clear(windowInput);
    await userEvent.type(windowInput, '5');

    assert.ok(await screen.findByText('AAPL entered BUY zone'));
    assert.ok(await screen.findByText(/\$115\.00/));
  });

  it('suppresses signal transition toasts when the preference is disabled', async () => {
    api.__queueSignalResponse({
      data: {
        rows: [
          {
            ticker: 'AAPL',
            pctWindow: 3,
            status: 'HOLD',
            currentPrice: 125,
            currentPriceAsOf: '2024-02-01',
            lowerBound: 121.25,
            upperBound: 128.75,
            referencePrice: 125,
            referenceDate: '2024-02-01',
            referenceType: 'BUY',
            sanityRejected: false,
          },
        ],
        prices: { AAPL: 125 },
        errors: {},
        market: {
          isOpen: true,
          isBeforeOpen: false,
          lastTradingDate: '2024-02-01',
          nextTradingDate: '2024-02-02',
        },
      },
      requestId: 'signals-hold-001',
    });

    renderApp();

    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    await userEvent.click(screen.getByLabelText(/Signal transition toasts/i));

    await userEvent.click(screen.getByRole('button', { name: /transactions/i }));
    await userEvent.type(screen.getByLabelText(/date/i), '2024-02-01');
    await userEvent.type(screen.getByLabelText(/ticker/i), 'aapl');
    await userEvent.type(screen.getByLabelText(/amount/i), '1250');
    await userEvent.type(screen.getByLabelText(/price/i), '125');
    await userEvent.click(screen.getByRole('button', { name: /add transaction/i }));

    await waitFor(() => {
      assert.deepEqual(api.__getLastPriceBatch(), ['AAPL']);
    });

    api.__queueSignalResponse({
      data: {
        rows: [
          {
            ticker: 'AAPL',
            pctWindow: 5,
            status: 'BUY_ZONE',
            currentPrice: 115,
            currentPriceAsOf: '2024-02-02',
            lowerBound: 118.75,
            upperBound: 131.25,
            referencePrice: 125,
            referenceDate: '2024-02-01',
            referenceType: 'BUY',
            sanityRejected: false,
          },
        ],
        prices: { AAPL: 115 },
        errors: {},
        market: {
          isOpen: true,
          isBeforeOpen: false,
          lastTradingDate: '2024-02-02',
          nextTradingDate: '2024-02-05',
        },
      },
      requestId: 'signals-buy-001',
    });

    await userEvent.click(screen.getByRole('button', { name: /holdings/i }));
    const windowInput = await screen.findByLabelText(/aapl percent window/i);
    await userEvent.clear(windowInput);
    await userEvent.type(windowInput, '5');

    await waitFor(() => {
      assert.equal(screen.queryByText('AAPL entered BUY zone'), null);
    });
  });
});
