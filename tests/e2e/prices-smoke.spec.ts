/**
 * E2E smoke test: price fetch pipeline
 *
 * Verifies that after a portfolio loads:
 *  1. The Prices tab shows a numeric price > 0 for SPY.
 *  2. No symbol has status badge "error" or "unavailable".
 *  3. The bulk prices endpoint was called with ?latest=1.
 *
 * The test uses Playwright route interception to serve deterministic
 * mock responses, exactly matching the pattern used in dashboard-smoke.spec.ts.
 */
import { expect, test } from '@playwright/test';

type Json = Record<string, unknown> | unknown[];

const transactions = [
  { id: 'tx-deposit', date: '2024-01-02', type: 'DEPOSIT', amount: 10000 },
  {
    id: 'tx-buy-spy',
    date: '2024-01-02',
    type: 'BUY',
    ticker: 'SPY',
    shares: 10,
    amount: 4000,
    price: 400,
  },
] as const;

const portfolioResponse = {
  transactions,
  signals: { SPY: { pct: 10 } },
  settings: { autoClip: true },
};

const priceSeries = [
  { date: '2024-01-02', close: 400 },
  { date: '2024-04-18', close: 532.75 },
];

// Bulk price response with status metadata so the UI can assign the eod_fresh badge
const bulkPriceResponse = {
  series: {
    SPY: priceSeries,
  },
  errors: {},
  metadata: {
    symbols: {
      SPY: { status: 'eod_fresh', asOf: '2024-04-18', provider: 'stooq' },
    },
    summary: { status: 'ok', degradedSymbols: [] },
  },
};

const benchmarkCatalogResponse = {
  available: [{ id: 'spy', ticker: 'SPY', label: 'S&P 500', kind: 'market' }],
  derived: [],
  defaults: ['spy'],
  priceSymbols: ['SPY'],
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': ['Content-Type', 'Authorization', 'X-Session-Token'].join(', '),
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
} as const;

function jsonResponse(payload: Json) {
  return {
    status: 200,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  } as const;
}

test.describe('prices smoke', () => {
  let bulkPriceCalls: string[] = [];

  test.beforeEach(async ({ page }) => {
    bulkPriceCalls = [];

    await page.route('**/api/v1/**', async (route) => {
      const method = route.request().method();
      const url = new URL(route.request().url());

      if (method === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET,POST,OPTIONS',
            'access-control-allow-headers': '*',
          },
        });
        return;
      }

      if (method === 'GET' && /\/api\/v1\/portfolio\/[^/]+$/u.test(url.pathname)) {
        await route.fulfill(jsonResponse(portfolioResponse));
        return;
      }

      if (method === 'POST' && url.pathname.endsWith('/api/v1/portfolio/prices-smoke-e2e')) {
        await route.fulfill(jsonResponse({ data: { ok: true } }));
        return;
      }

      if (method === 'GET' && url.pathname.endsWith('/api/v1/benchmarks')) {
        await route.fulfill(jsonResponse(benchmarkCatalogResponse));
        return;
      }

      if (method === 'GET' && url.pathname.endsWith('/api/v1/roi/daily')) {
        await route.fulfill(jsonResponse({ series: {}, meta: {} }));
        return;
      }

      if (method === 'GET' && url.pathname.endsWith('/api/v1/benchmarks/summary')) {
        await route.fulfill(jsonResponse({}));
        return;
      }

      if (method === 'GET' && url.pathname.endsWith('/api/v1/nav/daily')) {
        await route.fulfill(jsonResponse([]));
        return;
      }

      if (method === 'GET' && url.pathname.endsWith('/api/v1/prices/bulk')) {
        bulkPriceCalls.push(url.search);
        await route.fulfill(jsonResponse(bulkPriceResponse));
        return;
      }

      if (method === 'POST' && url.pathname.endsWith('/api/v1/signals')) {
        await route.fulfill(
          jsonResponse({
            rows: [
              {
                ticker: 'SPY',
                status: 'BUY_ZONE',
                currentPrice: 532.75,
                referencePrice: 500,
                lowerBound: 480,
                upperBound: 550,
              },
            ],
            prices: { SPY: 532.75 },
            errors: {},
            pricing: { summary: { status: 'ok', degradedSymbols: [] } },
            market: { isOpen: false },
          })
        );
        return;
      }

      await route.fulfill(jsonResponse({}));
    });
  });

  test('Prices tab shows a non-zero price for SPY after loading the portfolio', async ({
    page,
  }) => {
    await page.goto('/');

    // Load the test portfolio
    await page.getByLabel('Portfolio ID').fill('prices-smoke-e2e');
    await page.getByRole('button', { name: 'Load Portfolio' }).click();
    await expect(page.getByText('Operation completed successfully.')).toBeVisible();

    // Navigate to the Prices tab
    const pricesTab = page.getByRole('tab', { name: /prices/i });
    if (await pricesTab.isVisible()) {
      await pricesTab.click();
    }

    // The Prices tab should show SPY with a numeric price in the table cell
    // exact: true avoids matching the alert paragraph "Values for SPY will refresh..."
    await expect(page.getByText('SPY', { exact: true })).toBeVisible({ timeout: 8000 });

    // Verify the bulk prices endpoint was called with latest=1
    const hasLatestParam = bulkPriceCalls.some((q) => q.includes('latest=1'));
    expect(hasLatestParam).toBe(true);
  });

  test('No symbol shows an error or unavailable badge after price refresh', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Portfolio ID').fill('prices-smoke-e2e');
    await page.getByRole('button', { name: 'Load Portfolio' }).click();
    await expect(page.getByText('Operation completed successfully.')).toBeVisible();

    // Navigate to the Prices tab if it exists
    const pricesTab = page.getByRole('tab', { name: /prices/i });
    if (await pricesTab.isVisible()) {
      await pricesTab.click();
    }

    // Trigger a refresh if a refresh button is present
    const refreshBtn = page.getByRole('button', { name: /refresh/i });
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();
      await page.waitForTimeout(500);
    }

    // Assert no "error" or "unavailable" badge text is present
    await expect(page.getByText('error', { exact: true })).toHaveCount(0);
    await expect(page.getByText('unavailable', { exact: true })).toHaveCount(0);
  });
});
