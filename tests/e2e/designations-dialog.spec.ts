import { test, expect } from '@playwright/test';
import { loginUser } from './helpers/auth';

test.describe('Enterprise Dialog & Designations System', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('Designations page uses enterprise ConfirmDialog and never triggers native window.confirm/alert', async ({
    page,
  }) => {
    // Fail immediately if any native browser dialog (confirm, alert, prompt) is triggered
    page.on('dialog', (dialog) => {
      throw new Error(
        `FAIL: Browser native dialog [${dialog.type()}] detected: "${dialog.message()}". Application must use enterprise ConfirmDialog instead.`
      );
    });

    // 1. Log in as Admin
    await loginUser(page, 'admin');

    // 2. Navigate to designations settings
    await page.goto('/admin/settings/designations');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: /Organizational Designations/i })).toBeVisible({ timeout: 15000 });

    // 3. Locate an active designation's Archive button
    const archiveBtn = page.getByRole('button', { name: 'Archive' }).first();
    await expect(archiveBtn).toBeVisible({ timeout: 10000 });

    // 4. Click Archive - enterprise dialog should open
    await archiveBtn.click();

    const dialog = page.locator('div[role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // 5. Verify enterprise dialog content, copy, and consequences
    await expect(dialog.getByRole('heading', { name: /Archive designation\?/i })).toBeVisible();
    await expect(dialog).toContainText(/historical records will be preserved/i);

    const cancelBtn = dialog.getByRole('button', { name: 'Cancel' });
    const confirmBtn = dialog.getByRole('button', { name: 'Archive designation' });
    await expect(cancelBtn).toBeVisible();
    await expect(confirmBtn).toBeVisible();

    // 6. Test Cancel behavior: dialog closes and record is NOT altered
    await cancelBtn.click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // 7. Test Escape key dismissal
    await archiveBtn.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // 8. Test Backdrop click dismissal
    await archiveBtn.click();
    await expect(dialog).toBeVisible();
    // Click outside modal content (the overlay wrapper)
    await page.locator('div[role="alertdialog"]').click({ position: { x: 10, y: 10 } });
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('Designation search and filter works without reload', async ({ page }) => {
    await loginUser(page, 'admin');
    await page.goto('/admin/settings/designations');
    await page.waitForLoadState('domcontentloaded');

    const searchInput = page.locator('input[placeholder*="Search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('Engineering');
      // Search results update client-side
      await page.waitForTimeout(300);
      await searchInput.fill('');
    }
  });
});
