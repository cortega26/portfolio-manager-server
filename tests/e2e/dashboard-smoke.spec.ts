import { expect, test } from '@playwright/test';

type Json = Record<string, unknown> | unknown[];

const transactions = [
  {
    id: 'tx-deposit',
    date: '2024-01-02',
    type: 'DEPOSIT',
    amount: 10000,
  },
  {
    id: 'tx-buy-spy',
    date: '2024-01-02',
    type: 'BUY',
    ticker: 'SPY',
    shares: 10,
    amount: 4000,
    price: 400,
  },
  {
    id: 'tx-dividend',
    date: '2024-01-03',
    type: 'DIVIDEND',
    ticker: 'SPY',
    amount: 15,
  },
  {
    id: 'tx-interest',
    date: '2024-01-03',
    type: 'INTEREST',
    ticker: 'CASH',
    amount: 1.25,
  },
] as const;

const portfolioResponse = {
  transactions,
  signals: { SPY: { pct: 10 } },
  settings: { autoClip: true },
};

const returnsResponse = {
  series: {
    portfolio: [
      { date: '2024-01-02', value: 0.01 },
      { date: '2024-01-03', value: 0.0125 },
    ],
    portfolioTwr: [
      { date: '2024-01-02', value: 0.01 },
      { date: '2024-01-03', value: 0.0125 },
    ],
    exCash: [
      { date: '2024-01-02', value: 0.009 },
      { date: '2024-01-03', value: 0.0105 },
    ],
    spy: [
      { date: '2024-01-02', value: 0.015 },
      { date: '2024-01-03', value: 0.02 },
    ],
    qqq: [
      { date: '2024-01-02', value: 0.017 },
      { date: '2024-01-03', value: 0.021 },
    ],
    bench: [
      { date: '2024-01-02', value: 0.013 },
      { date: '2024-01-03', value: 0.017 },
    ],
    cash: [
      { date: '2024-01-02', value: 0.0002 },
      { date: '2024-01-03', value: 0.0004 },
    ],
  },
  meta: { page: 1, per_page: 100, total_pages: 1, total_items: 2 },
};

const priceSeries = [
  { date: '2024-01-02', close: 400 },
  { date: '2024-01-03', close: 405 },
];

const bulkPriceResponse = {
  series: {
    SPY: priceSeries,
    QQQ: [
      { date: '2024-01-02', close: 350 },
      { date: '2024-01-03', close: 355 },
    ],
  },
  errors: {},
  metadata: {},
};

const benchmarkCatalogResponse = {
  available: [
    { id: 'spy', ticker: 'SPY', label: 'S&P 500', kind: 'market' },
    { id: 'qqq', ticker: 'QQQ', label: 'Nasdaq-100', kind: 'market' },
  ],
  derived: [{ id: 'blended', label: 'Cash-Matched S&P 500', kind: 'derived' }],
  defaults: ['spy', 'qqq'],
  priceSymbols: ['SPY', 'QQQ'],
};

const benchmarkSummaryResponse = {
  money_weighted: {
    portfolio: 0.1234,
    benchmarks: {
      spy: 0.1012,
      qqq: 0.0987,
    },
    start_date: '2024-01-02',
    end_date: '2025-01-02',
    method: 'xirr',
    basis: 'matched_external_flows',
    partial: false,
  },
  summary: {
    portfolio: 0.0125,
    spy: 0.02,
    qqq: 0.018,
    blended: 0.017,
  },
  max_drawdown: {
    portfolio: -0.05,
    spy: -0.04,
    qqq: -0.045,
  },
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

test.describe('dashboard smoke flows', () => {
  test.beforeEach(async ({ page }) => {
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

      if (method === 'POST' && url.pathname.endsWith('/api/v1/portfolio/demo-e2e')) {
        await route.fulfill(jsonResponse({ data: { ok: true } }));
        return;
      }

      if (method === 'GET' && url.pathname.endsWith('/api/v1/benchmarks')) {
        await route.fulfill(jsonResponse(benchmarkCatalogResponse));
        return;
      }

      if (method === 'GET' && url.pathname.endsWith('/api/v1/roi/daily')) {
        await route.fulfill(jsonResponse(returnsResponse));
        return;
      }

      if (method === 'GET' && url.pathname.endsWith('/api/v1/benchmarks/summary')) {
        await route.fulfill(jsonResponse(benchmarkSummaryResponse));
        return;
      }

      if (method === 'GET' && url.pathname.endsWith('/api/v1/nav/daily')) {
        await route.fulfill(jsonResponse([]));
        return;
      }

      if (method === 'GET' && url.pathname.endsWith('/api/v1/prices/bulk')) {
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
                currentPrice: 405,
                referencePrice: 400,
                lowerBound: 380,
                upperBound: 420,
              },
            ],
            prices: { SPY: 405 },
            errors: {},
            pricing: { summary: { status: 'ok', degradedSymbols: [] } },
            market: { isOpen: true },
          })
        );
        return;
      }

      await route.fulfill(jsonResponse({}));
    });
  });

  test('authenticates and renders KPI + benchmark controls', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Portfolio ID').fill('demo-e2e');
    await page.getByRole('button', { name: 'Load Portfolio' }).click();

    await expect(page.getByText('Operation completed successfully.')).toBeVisible();

    const spyToggle = page.getByRole('button', { name: /s&p 500/i });
    const qqqToggle = page.getByRole('button', { name: /nasdaq-100/i });
    const resetButton = page.getByRole('button', { name: /reset/i });

    await spyToggle.waitFor({ state: 'attached' });
    await qqqToggle.waitFor({ state: 'attached' });
    await resetButton.waitFor({ state: 'attached' });

    await expect(spyToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(qqqToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Failed to fetch')).toHaveCount(0);

    const kpiLabels = [
      'Total NAV',
      'Total Return',
      'Net Contributions',
      'Equity Price Gain',
      'Performance context',
      'TWR vs Benchmarks',
    ];

    for (const label of kpiLabels) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    await expect(page.getByText('Equities $4,050.00 · Cash $6,016.25 (59.8%)')).toBeVisible();
    await expect(
      page.getByText('Realised $0.00 · Unrealised $50.00 · Net income $16.25 · Simple ROI +0.66%')
    ).toBeVisible();
    await expect(
      page.getByText('Gross buys $4,000.00 · Gross sells $0.00 · Net income $16.25')
    ).toBeVisible();

    await expect(resetButton).toBeDisabled();

    await spyToggle.click();
    await expect(spyToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(resetButton).toBeEnabled();

    await resetButton.click();
    await expect(spyToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(qqqToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(resetButton).toBeDisabled();
  });
});
