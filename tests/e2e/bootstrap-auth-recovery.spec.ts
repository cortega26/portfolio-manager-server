import { expect, test } from '@playwright/test';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': ['Content-Type', 'Authorization', 'X-Session-Token'].join(', '),
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
} as const;

function jsonResponse(payload: unknown, status = 200) {
  return {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  } as const;
}

test.describe('desktop bootstrap auth recovery', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'portfolio-manager-active-portfolio',
        JSON.stringify({ activeId: 'desktop' })
      );
    });

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

      if (method === 'GET' && url.pathname.endsWith('/api/v1/benchmarks')) {
        await route.fulfill(
          jsonResponse({
            available: [],
            derived: [],
            defaults: [],
            priceSymbols: [],
          })
        );
        return;
      }

      if (method === 'GET' && /\/api\/v1\/portfolio\/desktop$/u.test(url.pathname)) {
        await route.fulfill(
          jsonResponse(
            {
              error: 'NO_SESSION_TOKEN',
              message: 'Session token required.',
            },
            401
          )
        );
        return;
      }

      await route.fulfill(jsonResponse({}));
    });
  });

  test('surfaces a visible recovery message and clears the stale desktop selection', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(
      page.getByText(
        'Desktop session credentials are missing. Restart the desktop app and try again.'
      )
    ).toBeVisible();
    await expect(page.getByLabel('Portfolio ID')).toHaveValue('');

    const storedState = await page.evaluate(() =>
      window.localStorage.getItem('portfolio-manager-active-portfolio')
    );
    expect(storedState).toBeNull();
  });
});
