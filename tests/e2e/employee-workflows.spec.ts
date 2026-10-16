import { test, expect } from '@playwright/test';
import { loginUser } from './helpers/auth';

test.describe('Employee Workflows and Operational Queues', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('Employee dashboard renders command center and work queues', async ({ page }) => {
    await loginUser(page, 'employee');
    await page.goto('/employee');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15000 });
    // Check navigation links in sidebar
    await expect(page.locator('a[href="/employee/applications"]').first()).toBeVisible();
    await expect(page.locator('a[href="/employee/tasks"]').first()).toBeVisible();
  });

  test('Employee applications triage loads with pipeline status', async ({ page }) => {
    await loginUser(page, 'employee');
    await page.goto('/employee/applications');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('tab', { name: /All Applications/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: /Managed Application/i })).toBeVisible();
  });

  test('Employee task queue renders active operational tasks', async ({ page }) => {
    await loginUser(page, 'employee');
    await page.goto('/employee/tasks');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { level: 1, name: /Task Command/i })).toBeVisible({ timeout: 15000 });
  });

  test('Employee job catalog and candidate talent directory load', async ({ page }) => {
    await loginUser(page, 'employee');

    // Jobs catalog
    await page.goto('/employee/jobs');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { level: 1, name: /Job Opportunities/i })).toBeVisible({ timeout: 15000 });

    // Candidates directory
    await page.goto('/employee/candidates');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { level: 1, name: /Candidate Directory/i })).toBeVisible({ timeout: 15000 });
  });

  test('Employee team messaging interface loads', async ({ page }) => {
    await loginUser(page, 'employee');
    await page.goto('/employee/messages');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: /Message|Chat|Communication/i })).toBeVisible({ timeout: 15000 });
  });
});
