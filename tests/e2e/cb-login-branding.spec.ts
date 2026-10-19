import { test, expect } from '@playwright/test';

test.describe('Career Button Client Portal Branding & Responsive Remediation', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('Login page has correct document title and Career Button branding', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    // 1. Verify Document Title & Robots Directives
    await expect(page).toHaveTitle('Career Button Client Portal | Candidate Login');
    const robotsMeta = page.locator('meta[name="robots"]');
    await expect(robotsMeta).toHaveAttribute('content', /noindex.*nofollow/i);

    // 2. Verify Canonical Favicon
    const svgIcon = page.locator('link[rel="icon"][type="image/svg+xml"]');
    await expect(svgIcon).toHaveAttribute('href', '/favicon.svg');

    // 3. Verify Career Button Logo / Emblem
    const logo = page.locator('svg[role="img"], svg[aria-label*="Career Button" i]').first();
    await expect(logo).toBeVisible({ timeout: 15000 });

    // 4. Verify Candidate Portal Pill & Subtitle
    await expect(page.getByText('Candidate Portal', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible();

    // 5. Verify Form Controls
    await expect(page.locator('input#email')).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

    // 6. Verify Navigation & Support Links
    const supportLink = page.locator('a[href="mailto:support@careerbutton.in"]').first();
    await expect(supportLink).toBeVisible();

    const mainSiteLink = page.locator('a[href="https://www.careerbutton.in"]').first();
    await expect(mainSiteLink).toBeVisible();

    // 7. Verify Absence of OOS branding on login page
    const pageText = await page.innerText('body');
    expect(pageText).not.toMatch(/Operations Operating System/i);
    expect(pageText).not.toMatch(/\bOOS\b/);
  });

  test('Staff activation page (/auth/activate) renders correct title and noindex robots directive', async ({
    page,
  }) => {
    await page.goto('/auth/activate');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveTitle('Career Button Client Portal | Staff Account Activation');
    const robotsMeta = page.locator('meta[name="robots"]');
    await expect(robotsMeta).toHaveAttribute('content', /noindex.*nofollow/i);
  });

  test('robots.txt disallows sensitive namespaces and does not expose private auth routes in allow list', async ({
    request,
  }) => {
    const res = await request.get('/robots.txt');
    expect(res.ok()).toBe(true);
    const body = await res.text();
    expect(body).not.toContain('Allow: /verify-reset-otp');
    expect(body).not.toContain('Allow: /activate');
    expect(body).toContain('Disallow: /admin/');
    expect(body).toContain('Disallow: /candidate/');
    expect(body).toContain('Disallow: /employee/');
  });

  test('Invalid credentials render accessible error alert with preserved contracts', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input#email', 'candidate.invalid@example.com');
    await page.fill('input#password', 'WrongSecret123!');
    await page.click('button[type="submit"]');

    // Verify error alert
    const alert = page.locator('div.text-rose-700');
    await expect(alert).toBeVisible({ timeout: 15000 });
    await expect(alert).toContainText(/invalid/i);
  });

  const viewports = [
    { name: 'Mobile 320px', width: 320, height: 640 },
    { name: 'Mobile 375px', width: 375, height: 667 },
    { name: 'Tablet 768px', width: 768, height: 1024 },
    { name: 'Desktop 1024px', width: 1024, height: 768 },
    { name: 'Desktop 1440px', width: 1440, height: 900 },
  ];

  for (const vp of viewports) {
    test(`Responsive check on ${vp.name} (${vp.width}x${vp.height}): zero horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      // Form inputs should be visible and interactive
      await expect(page.locator('input#email')).toBeVisible();
      await expect(page.locator('input#password')).toBeVisible();
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

      // Check no horizontal scrollbar / overflow
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasOverflow).toBe(false);
    });
  }
});
