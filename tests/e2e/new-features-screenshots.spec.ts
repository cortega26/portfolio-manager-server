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
  {
    id: 'tx-buy-aapl',
    date: '2024-02-15',
    type: 'BUY',
    ticker: 'AAPL',
    shares: 5,
    amount: 1000,
    price: 200,
  },
  {
    id: 'tx-buy-jpm',
    date: '2024-03-10',
    type: 'BUY',
    ticker: 'JPM',
    shares: 15,
    amount: 2250,
    price: 150,
  },
  {
    id: 'tx-sell-spy',
    date: '2024-06-01',
    type: 'SELL',
    ticker: 'SPY',
    shares: 3,
    amount: 1350,
    price: 450,
  },
  { id: 'tx-dividend-aapl', date: '2024-05-15', type: 'DIVIDEND', ticker: 'AAPL', amount: 5 },
  { id: 'tx-dividend-jpm', date: '2024-06-15', type: 'DIVIDEND', ticker: 'JPM', amount: 12 },
  { id: 'tx-dividend-aapl-2', date: '2024-08-15', type: 'DIVIDEND', ticker: 'AAPL', amount: 5.5 },
  { id: 'tx-dividend-jpm-2', date: '2024-09-15', type: 'DIVIDEND', ticker: 'JPM', amount: 13 },
  {
    id: 'tx-sell-aapl',
    date: '2024-10-01',
    type: 'SELL',
    ticker: 'AAPL',
    shares: 2,
    amount: 500,
    price: 250,
  },
  { id: 'tx-interest', date: '2024-01-03', type: 'INTEREST', ticker: 'CASH', amount: 1.25 },
] as const;

const portfolioResponse = {
  transactions,
  signals: {},
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
    AAPL: [
      { date: '2024-01-02', close: 200 },
      { date: '2024-01-03', close: 210 },
    ],
    JPM: [
      { date: '2024-01-02', close: 150 },
      { date: '2024-01-03', close: 155 },
    ],
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
    benchmarks: { spy: 0.1012, qqq: 0.0987 },
    start_date: '2024-01-02',
    end_date: '2025-01-02',
    method: 'xirr',
    basis: 'matched_external_flows',
    partial: false,
  },
  summary: { portfolio: 0.0125, spy: 0.02, qqq: 0.018, blended: 0.017 },
  max_drawdown: { portfolio: -0.05, spy: -0.04, qqq: -0.045 },
};

const dividendsResponse = {
  ytdGross: '35.5',
  ytdNet: '35.5',
  ytdTax: '0',
  trailing12mGross: '35.5',
  trailing12mNet: '35.5',
  trailing12mTax: '0',
  byTicker: [
    { ticker: 'AAPL', gross: '10.5', tax: '0', net: '10.5', count: 2 },
    { ticker: 'JPM', gross: '25', tax: '0', net: '25', count: 2 },
  ],
  byYear: [{ period: '2024', gross: '35.5', net: '35.5', count: 4, topTicker: 'JPM' }],
  byMonth: [
    { period: '2024-05', gross: '5', net: '5', count: 1, topTicker: 'AAPL' },
    { period: '2024-06', gross: '12', net: '12', count: 1, topTicker: 'JPM' },
    { period: '2024-08', gross: '5.5', net: '5.5', count: 1, topTicker: 'AAPL' },
    { period: '2024-09', gross: '13', net: '13', count: 1, topTicker: 'JPM' },
  ],
  totalCount: 4,
};

const tradeStatsResponse = {
  totalLots: 2,
  winCount: 2,
  lossCount: 0,
  winRate: '100',
  avgWinDollars: '200',
  avgLossDollars: '0',
  avgWinPct: '20',
  avgLossPct: '0',
  profitFactor: '∞',
  expectancy: '200',
  largestWin: '250',
  largestLoss: '0',
  bestTicker: 'AAPL',
  worstTicker: '',
  avgHoldingDaysWinners: 120,
  avgHoldingDaysLosers: 0,
  byYear: [
    {
      year: '2024',
      lots: 2,
      wins: 2,
      losses: 0,
      winRate: '100',
      totalGain: '400',
      bestTicker: 'AAPL',
      worstTicker: '',
    },
  ],
  byTicker: [
    {
      ticker: 'AAPL',
      lots: 1,
      wins: 1,
      losses: 0,
      winRate: '100',
      totalGain: '250',
      avgWin: '250',
      avgLoss: '0',
      profitFactor: '∞',
    },
    {
      ticker: 'SPY',
      lots: 1,
      wins: 1,
      losses: 0,
      winRate: '100',
      totalGain: '150',
      avgWin: '150',
      avgLoss: '0',
      profitFactor: '∞',
    },
  ],
};

const realizedGainsResponse = {
  method: 'FIFO',
  years: [
    {
      year: 2024,
      closedLots: [
        {
          ticker: 'SPY',
          buyDate: '2024-01-02',
          sellDate: '2024-06-01',
          buyPrice: '400',
          sellPrice: '450',
          shares: '3',
          costBasis: '1200',
          proceeds: '1350',
          gainLoss: '150',
          holdingDays: 151,
        },
        {
          ticker: 'AAPL',
          buyDate: '2024-02-15',
          sellDate: '2024-10-01',
          buyPrice: '200',
          sellPrice: '250',
          shares: '2',
          costBasis: '400',
          proceeds: '500',
          gainLoss: '100',
          holdingDays: 229,
        },
      ],
      totalGain: '250',
      totalLoss: '0',
      netRealized: '250',
      lotCount: 2,
    },
  ],
  unrealizedToday: { holdings: [], totalUnrealized: null },
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

test.describe('new features screenshots', () => {
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

      if (method === 'GET' && /\/api\/v1\/portfolio\/[^/]+\/dividends$/u.test(url.pathname)) {
        await route.fulfill(jsonResponse(dividendsResponse));
        return;
      }

      if (method === 'GET' && /\/api\/v1\/portfolio\/[^/]+\/trade-stats$/u.test(url.pathname)) {
        await route.fulfill(jsonResponse(tradeStatsResponse));
        return;
      }

      if (method === 'GET' && /\/api\/v1\/portfolio\/[^/]+\/realized-gains$/u.test(url.pathname)) {
        await route.fulfill(jsonResponse(realizedGainsResponse));
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
                status: 'HOLD',
                currentPrice: 405,
                referencePrice: 400,
                lowerBound: 380,
                upperBound: 420,
              },
              {
                ticker: 'AAPL',
                status: 'BUY_ZONE',
                currentPrice: 210,
                referencePrice: 250,
                lowerBound: 200,
                upperBound: 240,
              },
              {
                ticker: 'JPM',
                status: 'HOLD',
                currentPrice: 155,
                referencePrice: 150,
                lowerBound: 140,
                upperBound: 160,
              },
            ],
            prices: { SPY: 405, AAPL: 210, JPM: 155 },
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

  test('screenshot: dashboard with sector allocation and dividend card', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Portfolio ID').fill('demo-e2e');
    await page.getByRole('button', { name: 'Load Portfolio' }).click();

    await expect(page.getByText('Operation completed successfully.')).toBeVisible({
      timeout: 10000,
    });

    // Wait for key dashboard elements
    await expect(page.getByText('Total NAV')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Dividend Income')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Asset Allocation')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Sector Allocation')).toBeVisible({ timeout: 5000 });

    // Scroll to show allocation charts + dividend card
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'test-results/screenshots/dashboard-sectors-dividends.png',
      fullPage: false,
    });
  });

  test('screenshot: realized gains with trade statistics', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Portfolio ID').fill('demo-e2e');
    await page.getByRole('button', { name: 'Load Portfolio' }).click();

    await expect(page.getByText('Operation completed successfully.')).toBeVisible({
      timeout: 10000,
    });

    // Navigate to Realized Gains tab
    const gainsTab = page.getByRole('tab', { name: /realized gains|ganancias realizadas/i });
    await gainsTab.click({ timeout: 5000 });
    await page.waitForTimeout(800);

    // Verify trade stats panel rendered
    await expect(page.getByTestId('trade-stats-panel')).toBeVisible({ timeout: 5000 });

    await page.screenshot({
      path: 'test-results/screenshots/realized-gains-trade-stats.png',
      fullPage: false,
    });

    // Also check for the stat cards
    await expect(page.getByText('Trade Statistics')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Win Rate')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Profit Factor')).toBeVisible({ timeout: 3000 });
  });

  test('screenshot: dashboard full page with new features', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Portfolio ID').fill('demo-e2e');
    await page.getByRole('button', { name: 'Load Portfolio' }).click();

    await expect(page.getByText('Operation completed successfully.')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('Dividend Income')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Sector Allocation')).toBeVisible({ timeout: 5000 });

    await page.screenshot({
      path: 'test-results/screenshots/full-dashboard.png',
      fullPage: true,
    });
  });
});
