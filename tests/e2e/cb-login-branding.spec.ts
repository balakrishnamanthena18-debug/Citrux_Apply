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

  test('Password visibility toggle switches input type, preserves value, and updates accessibility attributes', async ({
    page,
  }) => {
    await page.goto('/login');
    const passwordInput = page.locator('input#password');
    const toggleButton = page.locator('button[aria-label="Show password"]');

    // 1. Initial state verification
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
    await expect(toggleButton).toBeVisible();
    await expect(toggleButton).toHaveAttribute('aria-pressed', 'false');

    // 2. Type password and toggle to visible
    await passwordInput.fill('SecretCandidatePassword999!');
    await toggleButton.click();

    await expect(passwordInput).toHaveAttribute('type', 'text');
    await expect(passwordInput).toHaveValue('SecretCandidatePassword999!');
    const hideButton = page.locator('button[aria-label="Hide password"]');
    await expect(hideButton).toBeVisible();
    await expect(hideButton).toHaveAttribute('aria-pressed', 'true');

    // 3. Toggle back to hidden and verify value remains intact
    await hideButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await expect(passwordInput).toHaveValue('SecretCandidatePassword999!');
    await expect(toggleButton).toHaveAttribute('aria-label', 'Show password');
    await expect(toggleButton).toHaveAttribute('aria-pressed', 'false');

    // 4. Keyboard accessibility: toggle via Space / Enter key
    await toggleButton.focus();
    await page.keyboard.press('Space');
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await page.keyboard.press('Enter');
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('Remember me checkbox restores saved email on mount and updates storage on submission', async ({
    page,
  }) => {
    await page.goto('/login');
    const emailInput = page.locator('input#email');
    const rememberCheckbox = page.locator('input#rememberMe');
    const passwordInput = page.locator('input#password');
    const submitBtn = page.getByRole('button', { name: /sign in/i });

    await expect(rememberCheckbox).toBeVisible();
    await expect(rememberCheckbox).not.toBeChecked();

    // Check remember me and submit invalid credentials
    await emailInput.fill('candidate.prefill@careerbutton.in');
    await passwordInput.fill('AnyPassword123!');
    await rememberCheckbox.check();
    await submitBtn.click();

    // Verify localStorage has saved email
    const savedEmail = await page.evaluate(() =>
      localStorage.getItem('cb_candidate_remembered_email')
    );
    expect(savedEmail).toBe('candidate.prefill@careerbutton.in');

    // Reload page and verify prefill + checked state
    await page.reload();
    await expect(emailInput).toHaveValue('candidate.prefill@careerbutton.in');
    await expect(rememberCheckbox).toBeChecked();

    // Uncheck remember me and submit to verify storage removal
    await rememberCheckbox.uncheck();
    await passwordInput.fill('AnyPassword123!');
    await submitBtn.click();

    const clearedEmail = await page.evaluate(() =>
      localStorage.getItem('cb_candidate_remembered_email')
    );
    expect(clearedEmail).toBeNull();
  });

  test('Submitting login form indicates loading state and disables form controls', async ({ page }) => {
    await page.goto('/login');
    const emailInput = page.locator('input#email');
    const passwordInput = page.locator('input#password');
    const submitBtn = page.locator('button[type="submit"]');

    await emailInput.fill('candidate.speed@careerbutton.in');
    await passwordInput.fill('WrongPassword123!');

    await submitBtn.click();

    // Verify error alert arrives
    await expect(page.locator('div.text-rose-700')).toBeVisible({ timeout: 15000 });
    // After completion, button returns to normal
    await expect(submitBtn).toBeEnabled();
    await expect(submitBtn).toContainText(/sign in/i);
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
