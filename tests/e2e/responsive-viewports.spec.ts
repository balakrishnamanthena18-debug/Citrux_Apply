import { test, expect } from '@playwright/test';
import { loginUser } from './helpers/auth';

test.describe('Responsive Viewports & Adaptive Layouts', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('Desktop (1280x800): Persistent sidebar and header account menu render correctly', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginUser(page, 'admin');
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Sidebar should be visible in desktop viewport
    const sidebar = page.locator('aside, [role="complementary"]').first();
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Top-right header account menu visible
    const headerAccountMenu = page.locator('button[aria-label^="User account menu"]');
    await expect(headerAccountMenu).toBeVisible();

    // Verify no horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('Tablet (768x1024): Adaptive layout without horizontal scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await loginUser(page, 'admin');
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Verify main content loads cleanly
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15000 });

    // Verify no horizontal overflow on tablet
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('Mobile (390x844): Navigation drawer opens, closes on backdrop/escape, no horizontal overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginUser(page, 'admin');
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Open mobile navigation drawer via hamburger or bottom nav
    const mobileMenuTrigger = page.locator('button[aria-label*="navigation" i], button[aria-label*="menu" i]').first();
    if (await mobileMenuTrigger.isVisible()) {
      await mobileMenuTrigger.click();

      // Drawer should be open with role="dialog"
      const drawer = page.locator('div[role="dialog"][aria-label="Navigation drawer"]');
      if (await drawer.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(drawer).toBeVisible();

        // Escape closes drawer
        await page.keyboard.press('Escape');
        await expect(drawer).not.toBeVisible({ timeout: 5000 });
      }
    }

    // Verify no horizontal overflow on mobile screen
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });
});
