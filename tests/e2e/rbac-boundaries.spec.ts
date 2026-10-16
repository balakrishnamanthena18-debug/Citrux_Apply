import { test, expect } from '@playwright/test';
import { loginUser } from './helpers/auth';

test.describe('Role-Based Access Control and Tenant Isolation', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('Unauthenticated user cannot access protected admin routes', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 15000 });
    expect(page.url()).toContain('/login');
    expect(page.url()).toContain('redirectTo');
  });

  test('Unauthenticated user cannot access protected employee routes', async ({ page }) => {
    await page.goto('/employee/applications');
    await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 15000 });
    expect(page.url()).toContain('/login');
  });

  test('Unauthenticated user cannot access protected candidate routes', async ({ page }) => {
    await page.goto('/candidate/profile');
    await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 15000 });
    expect(page.url()).toContain('/login');
  });

  test('Candidate is restricted from accessing Admin Dashboard', async ({ page }) => {
    await loginUser(page, 'candidate');
    expect(page.url()).toContain('/candidate');

    // Attempt direct navigation to /admin/dashboard
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Server error boundary must enforce RBAC and display Access Denied inside main content
    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { name: /Access Denied/i })).toBeVisible({ timeout: 10000 });
    await expect(main.getByText(/requires one of/i)).toBeVisible();
    await expect(main.getByRole('link', { name: /Go to Candidate Portal/i })).toBeVisible();
  });

  test('Candidate is restricted from accessing Employee workspace', async ({ page }) => {
    await loginUser(page, 'candidate');
    expect(page.url()).toContain('/candidate');

    // Attempt direct navigation to /employee/applications
    await page.goto('/employee/applications');
    await page.waitForLoadState('domcontentloaded');

    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { name: /Access Denied/i })).toBeVisible({ timeout: 10000 });
    await expect(main.getByText(/requires one of \[EMPLOYEE, ADMIN\]/i)).toBeVisible();
  });

  test('Employee is restricted from accessing Admin Audit Trail', async ({ page }) => {
    await loginUser(page, 'employee');
    expect(page.url()).toContain('/employee');

    // Attempt direct navigation to /admin/audit
    await page.goto('/admin/audit');
    await page.waitForLoadState('domcontentloaded');

    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { name: /Access Denied/i })).toBeVisible({ timeout: 10000 });
    await expect(main.getByText(/requires one of \[ADMIN\]/i)).toBeVisible();
  });

  test('Employee is restricted from accessing Admin Designations settings', async ({ page }) => {
    await loginUser(page, 'employee');
    expect(page.url()).toContain('/employee');

    await page.goto('/admin/settings/designations');
    await page.waitForLoadState('domcontentloaded');

    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { name: /Access Denied/i })).toBeVisible({ timeout: 10000 });
    await expect(main.getByText(/requires one of \[ADMIN\]/i)).toBeVisible();
  });
});
