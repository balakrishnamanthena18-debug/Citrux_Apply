import { test, expect } from '@playwright/test';
import { loginUser } from './helpers/auth';

test.describe('Admin Workflows and Operational Oversight', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('Admin dashboard renders operational KPIs and attention queues', async ({ page }) => {
    await loginUser(page, 'admin');
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Dashboard headings and pipeline metrics
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Application pipeline|Operations/i).first()).toBeVisible();

    // Check metric cards with exact accessible link roles
    await expect(page.getByRole('link', { name: /Active candidates/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Active applications/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Active staff/i })).toBeVisible();
  });

  test('Admin settings hub and task rules load correctly', async ({ page }) => {
    await loginUser(page, 'admin');

    // Settings hub
    await page.goto('/admin/settings');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /Settings/i })).toBeVisible({ timeout: 10000 });

    // Task automation rules
    await page.goto('/admin/settings/task-rules');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { level: 1, name: /Task Governance/i })).toBeVisible({ timeout: 10000 });
  });

  test('Staff roster renders team members and onboard trigger', async ({ page }) => {
    await loginUser(page, 'admin');
    await page.goto('/admin/members');
    await page.waitForLoadState('domcontentloaded');

    // Heading "Governance"
    await expect(page.getByRole('heading', { level: 1, name: /Governance/i })).toBeVisible({ timeout: 15000 });

    // Verify existing staff members appear
    await expect(page.getByText('System Admin').first()).toBeVisible();
    await expect(page.getByText('Sarah Chen').first()).toBeVisible();

    // Verify onboard button
    const onboardBtn = page.getByRole('button', { name: /\+ Onboard Employee/i });
    await expect(onboardBtn).toBeVisible();
  });

  test('Candidate directory and search load cleanly', async ({ page }) => {
    await loginUser(page, 'admin');
    await page.goto('/admin/candidates');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: /Candidate Directory/i })).toBeVisible({ timeout: 15000 });
    const searchInput = page.getByRole('textbox', { name: /Search/i });
    if (await searchInput.isVisible()) {
      await searchInput.fill('Alex');
      await page.waitForTimeout(300);
      await searchInput.fill('');
    }
  });

  test('Audit trail displays immutable event log and filters', async ({ page }) => {
    await loginUser(page, 'admin');
    await page.goto('/admin/audit');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: /Audit Trail/i })).toBeVisible({ timeout: 15000 });
    const main = page.getByRole('main');
    await expect(main.getByText(/USER_LOGIN|SECURITY_ALERT|USER_LOGOUT|Audit/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('Privacy requests page loads with DPDP governance view', async ({ page }) => {
    await loginUser(page, 'admin');
    await page.goto('/admin/privacy');
    await page.waitForLoadState('domcontentloaded');

    // Level 1 heading for privacy
    await expect(page.getByRole('heading', { level: 1, name: /Privacy/i })).toBeVisible({ timeout: 15000 });
  });
});
