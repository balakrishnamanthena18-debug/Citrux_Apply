import { test, expect } from '@playwright/test';
import { loginUser, signOutViaAccountMenu, TEST_USERS } from './helpers/auth';

test.describe('Authentication and Account Lifecycle', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('Public root redirects unauthenticated visitor to /login', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 15000 });
    expect(page.url()).toContain('/login');
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  });

  test('Public root redirects authenticated candidate to /candidate', async ({ page }) => {
    await loginUser(page, 'candidate');
    expect(page.url()).toContain('/candidate');
    await page.goto('/');
    await page.waitForURL((url) => url.pathname.includes('/candidate'), { timeout: 15000 });
    expect(page.url()).toContain('/candidate');
  });

  test('Public root redirects authenticated employee to /employee', async ({ page }) => {
    await loginUser(page, 'employee');
    expect(page.url()).toContain('/employee');
    await page.goto('/');
    await page.waitForURL((url) => url.pathname.includes('/employee'), { timeout: 15000 });
    expect(page.url()).toContain('/employee');
  });

  test('Public root redirects authenticated admin to /admin', async ({ page }) => {
    await loginUser(page, 'admin');
    expect(page.url()).toContain('/admin');
    await page.goto('/');
    await page.waitForURL((url) => url.pathname.includes('/admin'), { timeout: 15000 });
    expect(page.url()).toContain('/admin');
  });

  test('Login form renders required elements and validation', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    await expect(page.locator('input#email')).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await expect(page.locator('a[href="/forgot-password"]')).toBeVisible();
    await expect(page.locator('a[href="/register"]')).toBeVisible();
  });

  test('Rejects invalid credentials with safe error message', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input#email', 'nonexistent.user@example.com');
    await page.fill('input#password', 'WrongPassword123!');
    await page.click('button[type="submit"]');

    // Wait for the specific alert with rose styling
    const alert = page.locator('div.text-rose-700');
    await expect(alert).toBeVisible({ timeout: 15000 });
    await expect(alert).toContainText(/invalid/i);
  });

  test('Admin user logs in successfully and redirects to /admin', async ({ page }) => {
    await loginUser(page, 'admin');
    expect(page.url()).toContain('/admin');

    const accountTrigger = page.locator('button[aria-label^="User account menu"]');
    await expect(accountTrigger).toBeVisible({ timeout: 10000 });
  });

  test('Employee user logs in successfully and redirects to /employee', async ({ page }) => {
    await loginUser(page, 'employee');
    expect(page.url()).toContain('/employee');

    const accountTrigger = page.locator('button[aria-label^="User account menu"]');
    await expect(accountTrigger).toBeVisible({ timeout: 10000 });
  });

  test('Candidate user logs in successfully and redirects to /candidate', async ({ page }) => {
    await loginUser(page, 'candidate');
    expect(page.url()).toContain('/candidate');

    const accountTrigger = page.locator('button[aria-label^="User account menu"]');
    await expect(accountTrigger).toBeVisible({ timeout: 10000 });
  });

  test('Sign out from top-right account menu terminates session cleanly', async ({ page }) => {
    await loginUser(page, 'admin');
    await signOutViaAccountMenu(page);

    // Verify redirected to login
    expect(page.url()).toContain('/login');

    // Direct access to protected dashboard should redirect to login
    await page.goto('/admin/dashboard');
    await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 15000 });
    expect(page.url()).toContain('/login');
  });

  test('Forgot password page renders and accepts email', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('input#email')).toBeVisible();
    await page.fill('input#email', 'test.recovery@example.com');
    const submitBtn = page.getByRole('button', { name: /send|reset/i });
    await expect(submitBtn).toBeVisible();
  });
});
