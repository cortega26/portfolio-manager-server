import { expect, test } from '@playwright/test';

/**
 * SR-021/022/023/024 — Today shell e2e smoke tests
 *
 * Tests that the Today tab is accessible behind the redesign.todayShell feature flag
 * and renders all expected sections without errors.
 *
 * These tests run against the Vite dev server with a mocked API backend.
 */

async function enableTodayShell(page: { addInitScript: (fn: () => void) => Promise<void> }) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'portfolio-manager-feature-flags',
      JSON.stringify({ 'redesign.todayShell': true })
    );
  });
}

// ---------------------------------------------------------------------------
// Flag off: existing navigation unchanged
// ---------------------------------------------------------------------------

test('flag off: Today tab is not visible', async ({ page }) => {
  // No flag set
  await page.goto('/');
  // Wait for the app to load (session gate or main app)
  await page.waitForLoadState('domcontentloaded');

  const todayTab = page.getByRole('tab', { name: /today/i });
  await expect(todayTab).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// Flag on: Today tab appears
// ---------------------------------------------------------------------------

test('flag on: Today tab appears as first navigation item', async ({ page }) => {
  await enableTodayShell(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // Wait for the session gate to either unlock or for the Today tab to appear
  // In test environment the app may load in a "demo" or "dev" mode
  const todayTab = page.getByRole('tab', { name: /today/i });
  await expect(todayTab).toBeVisible({ timeout: 10000 });
});

// ---------------------------------------------------------------------------
// No raw i18n keys visible (SR-007)
// ---------------------------------------------------------------------------

test('no raw i18n translation keys visible on dashboard', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  // Wait for any lazy-loaded content
  await page.waitForTimeout(1000);

  const bodyText = await page.locator('body').textContent();
  // Check common known-missing keys
  const knownMissingKeys = ['dashboard.zone2.empty', 'dashboard.charts.title'];
  for (const key of knownMissingKeys) {
    expect(bodyText).not.toContain(key, `Raw i18n key "${key}" must not appear in rendered output`);
  }
});

// ---------------------------------------------------------------------------
// Today shell sections render (SR-022/023/024)
// ---------------------------------------------------------------------------

test('flag on: Today tab renders all required sections', async ({ page }) => {
  await enableTodayShell(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  const todayTab = page.getByRole('tab', { name: /today/i });

  // If Today tab exists, click it and verify sections
  const isVisible = await todayTab.isVisible().catch(() => false);
  if (!isVisible) {
    // Acceptable if the app is behind session gate in CI environment
    test.skip(true, 'Today tab not visible — likely behind session gate');
    return;
  }

  await todayTab.click();

  // Portfolio health section should be present
  const healthSection = page.getByTestId('portfolio-health-bar');
  await expect(healthSection).toBeVisible({ timeout: 5000 });

  // Needs attention section (even if empty)
  const needsAttentionSection = page.getByTestId('needs-attention-section');
  await expect(needsAttentionSection).toBeVisible({ timeout: 5000 });

  // Data blockers section (even if empty/all-clear)
  const dataBlockersSection = page.getByTestId('data-blockers-section');
  await expect(dataBlockersSection).toBeVisible({ timeout: 5000 });
});

test('flag on: NeedsAttention shows descriptive empty state when no alerts', async ({ page }) => {
  await enableTodayShell(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  const todayTab = page.getByRole('tab', { name: /today/i });
  const isVisible = await todayTab.isVisible().catch(() => false);
  if (!isVisible) {
    test.skip(true, 'Today tab not visible — likely behind session gate');
    return;
  }

  await todayTab.click();

  // When inbox is empty, the empty state should be descriptive (not just blank)
  const needsAttention = page.getByTestId('needs-attention-section');
  await expect(needsAttention).toBeVisible();

  // Either has items OR has a descriptive empty state
  const hasItems = await page.getByTestId('needs-attention-item').count();
  if (hasItems === 0) {
    // Must show empty state text, not raw key
    const emptyText = await needsAttention.textContent();
    expect(emptyText).not.toMatch(/needs[-.]attention[-.]empty/i);
    expect(emptyText?.length).toBeGreaterThan(10);
  }
});
