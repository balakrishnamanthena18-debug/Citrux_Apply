import { test, expect } from '@playwright/test';
import { loginUser } from './helpers/auth';

test.describe('Candidate Workflows and Self-Service Portal', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('Candidate home dashboard renders pipeline and quick actions', async ({ page }) => {
    await loginUser(page, 'candidate');
    await page.goto('/candidate');
    await page.waitForLoadState('domcontentloaded');

    // Candidate greeting and hero
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Candidate desk/i)).toBeVisible();

    // Verified action links
    await expect(page.locator('a[href="/candidate/applications"]').first()).toBeVisible();
    await expect(page.locator('a[href="/candidate/messages"]').first()).toBeVisible();
  });

  test('Candidate career 360 overview loads synthesis snapshot', async ({ page }) => {
    await loginUser(page, 'candidate');
    await page.goto('/candidate/career');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { level: 1, name: /Candidate 360 Overview/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('link', { name: /Edit Career Profile/i })).toBeVisible();
  });

  test('Candidate personal profile loads career boundaries and editor tabs', async ({ page }) => {
    await loginUser(page, 'candidate');
    await page.goto('/candidate/profile');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { level: 1, name: /Career Profile/i })).toBeVisible({ timeout: 15000 });
    // Section tabs exist
    await expect(page.getByRole('button', { name: 'Overview' }).first()).toBeVisible();
  });

  test('Candidate recommended jobs board renders available opportunities', async ({ page }) => {
    await loginUser(page, 'candidate');
    await page.goto('/candidate/jobs');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { level: 1, name: /Jobs worth your attention/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator('[data-testid="job-intelligence-workbench"]')).toBeVisible();
  });

  test('Candidate applications tracking queue renders submission history', async ({ page }) => {
    await loginUser(page, 'candidate');
    await page.goto('/candidate/applications');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('tab', { name: /All Applications/i })).toBeVisible({ timeout: 15000 });
  });

  test('Candidate privacy management loads DPDP rights actions', async ({ page }) => {
    await loginUser(page, 'candidate');
    await page.goto('/candidate/privacy');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { level: 1, name: /Privacy Requests/i })).toBeVisible({ timeout: 15000 });
  });
});
