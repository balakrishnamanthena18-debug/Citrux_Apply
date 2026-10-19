import { test, expect } from '@playwright/test';
import { loginUser } from './helpers/auth';

test.describe('Role-Aware Workspace Branding & Separation (Phase 3B)', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('Candidate authenticated session renders Career Button branding throughout workspace', async ({ page }) => {
    await loginUser(page, 'candidate');
    await page.goto('/candidate');
    await page.waitForLoadState('domcontentloaded');

    // 1. Sidebar Brand Header (Desktop)
    const candidateBrandHeader = page.locator('[data-testid="sidebar-brand-candidate"]');
    await expect(candidateBrandHeader).toBeVisible({ timeout: 15000 });
    await expect(candidateBrandHeader).toContainText('Career Button');
    await expect(candidateBrandHeader).toContainText('Candidate Portal');

    // Internal OOS brand header must NOT be rendered in candidate sidebar
    await expect(page.locator('[data-testid="sidebar-brand-internal"]')).not.toBeVisible();

    // 2. Desktop Breadcrumb Root in AppHeader
    const breadcrumbRoot = page.locator('[data-testid="header-breadcrumb-root"]');
    await expect(breadcrumbRoot).toBeVisible();
    await expect(breadcrumbRoot).toHaveText('Career Button');

    // 3. Candidate Navigation Items Active Color / Palette
    // Dashboard item is active on /candidate
    const dashboardNavLink = page.locator('aside a[href="/candidate"]');
    await expect(dashboardNavLink).toBeVisible();
    await expect(dashboardNavLink).toHaveClass(/bg-\[#EBF2ED\]/);
    await expect(dashboardNavLink).toHaveClass(/text-\[#082F26\]/);

    // 4. Role Badge in Account Identity
    const roleBadge = page.locator('aside').getByText('CANDIDATE', { exact: true }).first();
    await expect(roleBadge).toBeVisible();

    // 5. Open Help Modal via Account Options
    const accountTrigger = page.locator('aside button[aria-label^="Open account menu"]');
    await accountTrigger.click();

    // Click "Help & Candidate Support"
    const helpAction = page.getByRole('button', { name: /help & candidate support/i });
    await expect(helpAction).toBeVisible();
    await helpAction.click();

    // Verify Candidate Support Routing & Monogram in Help Dialog
    const supportEmail = page.locator('[data-testid="modal-support-email"]');
    await expect(supportEmail).toBeVisible();
    await expect(supportEmail).toHaveText('support@careerbutton.in');
    await expect(supportEmail).toHaveAttribute('href', 'mailto:support@careerbutton.in');

    const dispatcherEmail = page.locator('[data-testid="modal-dispatcher-email"]');
    await expect(dispatcherEmail).toBeVisible();
    await expect(dispatcherEmail).toHaveText('notifications@careerbutton.in');

    const helpDescription = page.locator('[data-testid="modal-help-description"]');
    await expect(helpDescription).toContainText('Career Button Client Portal');
    await expect(helpDescription).not.toContainText('Operations Operating System (OOS)');
  });

  test('Employee authenticated session preserves internal OOS branding and operational support', async ({ page }) => {
    await loginUser(page, 'employee');
    await page.goto('/employee');
    await page.waitForLoadState('domcontentloaded');

    // 1. Sidebar Brand Header (Desktop)
    const internalBrandHeader = page.locator('[data-testid="sidebar-brand-internal"]');
    await expect(internalBrandHeader).toBeVisible({ timeout: 15000 });
    await expect(internalBrandHeader).toContainText('Operations OS');
    await expect(internalBrandHeader).toContainText('OOS');

    // Candidate Career Button header must NOT be rendered in employee sidebar
    await expect(page.locator('[data-testid="sidebar-brand-candidate"]')).not.toBeVisible();

    // 2. Desktop Breadcrumb Root
    const breadcrumbRoot = page.locator('[data-testid="header-breadcrumb-root"]');
    await expect(breadcrumbRoot).toBeVisible();
    await expect(breadcrumbRoot).toHaveText('OOS');

    // 3. Open Help Modal via Account Options
    const accountTrigger = page.locator('aside button[aria-label^="Open account menu"]');
    await accountTrigger.click();

    const helpAction = page.getByRole('button', { name: /help & (platform )?support/i });
    await expect(helpAction).toBeVisible();
    await helpAction.click();

    // Verify Enterprise Support Routing for internal employee
    const supportEmail = page.locator('[data-testid="modal-support-email"]');
    await expect(supportEmail).toBeVisible();
    await expect(supportEmail).toHaveText('support@citrux.in');
    await expect(supportEmail).toHaveAttribute('href', 'mailto:support@citrux.in');

    const dispatcherEmail = page.locator('[data-testid="modal-dispatcher-email"]');
    await expect(dispatcherEmail).toBeVisible();
    await expect(dispatcherEmail).toHaveText('notifications@citrux.in');

    const helpDescription = page.locator('[data-testid="modal-help-description"]');
    await expect(helpDescription).toContainText('Operations Operating System (OOS)');
  });

  test('Administrator authenticated session preserves internal OOS branding and operational support', async ({ page }) => {
    await loginUser(page, 'admin');
    await page.goto('/admin');
    await page.waitForLoadState('domcontentloaded');

    // 1. Sidebar Brand Header (Desktop)
    const internalBrandHeader = page.locator('[data-testid="sidebar-brand-internal"]');
    await expect(internalBrandHeader).toBeVisible({ timeout: 15000 });
    await expect(internalBrandHeader).toContainText('Operations OS');

    // 2. Desktop Breadcrumb Root
    const breadcrumbRoot = page.locator('[data-testid="header-breadcrumb-root"]');
    await expect(breadcrumbRoot).toBeVisible();
    await expect(breadcrumbRoot).toHaveText('OOS');

    // 3. Role Badge
    const roleBadge = page.locator('aside').getByText('SYSTEM ADMIN', { exact: true }).first();
    await expect(roleBadge).toBeVisible();
  });
});
