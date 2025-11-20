// @ts-nocheck
import { expect, test } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'https://www.tooltician.com';

const routes = ['/admin', '/admin/users/seed-check'];

test.describe('production routing', () => {
  for (const route of routes) {
    test(`loads ${route} without a server-side 404`, async ({ page }) => {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
      await expect(page).toHaveURL(new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
      await expect(page.locator('#root')).toBeVisible();
    });
  }
});
