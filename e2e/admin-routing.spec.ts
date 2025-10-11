import { expect, test } from '@playwright/test';

const routes = ['/admin', '/admin/users/seed-check'];

const resolveBaseUrl = (baseURL?: string) => {
  if (baseURL) {
    return baseURL.replace(/\/$/, '');
  }
  const override = process.env.TOOLTICIAN_BASE_URL ?? '';
  if (override) {
    return override.replace(/\/$/, '');
  }
  return 'https://www.tooltician.com';
};

test.describe('admin routing', () => {
  for (const route of routes) {
    test(`loads ${route} without a server-side 404`, async ({ baseURL, page }) => {
      const origin = resolveBaseUrl(baseURL);
      if (baseURL) {
        await page.goto(route, { waitUntil: 'networkidle' });
      } else {
        await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' });
      }
      await expect(page).toHaveURL(new RegExp(`${route.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`));
      await expect(page.locator('#root')).toBeVisible();
    });
  }
});
