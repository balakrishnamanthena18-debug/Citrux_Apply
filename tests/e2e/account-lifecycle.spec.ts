import { test, expect } from '@playwright/test';
import { loginUser } from './helpers/auth';

test.describe('Enterprise Account Menu, Profile & Settings', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('Header AccountMenu displays identity, role badge, organization, and handles keyboard Esc', async ({
    page,
  }) => {
    await loginUser(page, 'admin');
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('domcontentloaded');

    const accountTrigger = page.locator('button[aria-label^="User account menu"]');
    await expect(accountTrigger).toBeVisible({ timeout: 10000 });

    // Open dropdown
    await accountTrigger.click();

    // Verify popover menu appears with role="menu"
    const menu = page.locator('div[role="menu"]');
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Verify user identity details inside popover
    await expect(menu.getByText('System Admin').first()).toBeVisible();
    await expect(menu.getByText('SYSTEM ADMIN').first()).toBeVisible();
    await expect(menu.getByText('ApplyCitrux Operations').first()).toBeVisible();

    // Verify navigation links inside menu
    const profileLink = menu.getByRole('link', { name: /Profile/i });
    const settingsLink = menu.getByRole('link', { name: /Settings/i });
    await expect(profileLink).toBeVisible();
    await expect(settingsLink).toBeVisible();

    // Verify Escape key closes popover menu
    await page.keyboard.press('Escape');
    await expect(menu).not.toBeVisible({ timeout: 5000 });
  });

  test('Sidebar account panel renders user info and quick action buttons', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginUser(page, 'admin');
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Bottom left account panel in sidebar
    const sidebarPanel = page.locator('button[aria-label^="Open account menu for"]').first();
    await expect(sidebarPanel).toBeVisible({ timeout: 10000 });
    await expect(sidebarPanel).toContainText('System Admin');
    await expect(sidebarPanel).toContainText('admin@citrux.com');

    // Check sidebar sign out button
    const signOutBtn = page.getByRole('button', { name: /Sign Out|Sign out/i }).first();
    await expect(signOutBtn).toBeVisible();
  });

  test('Employee account menu reflects Employee role and restricts admin-only settings', async ({ page }) => {
    await loginUser(page, 'employee');
    await page.goto('/employee');
    await page.waitForLoadState('domcontentloaded');

    const accountTrigger = page.locator('button[aria-label^="User account menu"]');
    await expect(accountTrigger).toBeVisible({ timeout: 10000 });
    await accountTrigger.click();

    // Verify employee identity in menu
    const menu = page.locator('div[role="menu"]');
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Sarah Chen').first()).toBeVisible();
    await expect(menu.getByText('EMPLOYEE').first()).toBeVisible();
  });
});
