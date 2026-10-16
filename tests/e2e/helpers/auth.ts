import { Page, expect } from '@playwright/test';

export const TEST_USERS = {
  admin: {
    email: 'admin@citrux.com',
    password: 'Password123!',
    role: 'ADMIN',
    expectedRedirect: '/admin',
  },
  employee: {
    email: 'staff@citrux.com',
    password: 'Password123!',
    role: 'EMPLOYEE',
    expectedRedirect: '/employee',
  },
  candidate: {
    email: 'alex.rivera@gmail.com',
    password: 'Password123!',
    role: 'CANDIDATE',
    expectedRedirect: '/candidate',
  },
};

/**
 * Perform login using the UI form at /login (idempotent if already authenticated)
 */
export async function loginUser(page: Page, userKey: 'admin' | 'employee' | 'candidate') {
  const user = TEST_USERS[userKey];
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');

  // If session is already active and redirected away from /login, return
  if (!page.url().includes('/login')) {
    return;
  }

  // Fill credentials
  await page.fill('input#email', user.email);
  await page.fill('input#password', user.password);

  // Click sign in
  await page.click('button[type="submit"]');

  // Wait for post-login navigation away from /login
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 25000,
  });

  await page.waitForLoadState('domcontentloaded');
}

/**
 * Sign out via the top-right account menu dropdown or sidebar
 */
export async function signOutViaAccountMenu(page: Page) {
  // Try header account menu first
  const menuTrigger = page.locator('button[aria-label^="User account menu"]');
  const isHeaderVisible = await menuTrigger.isVisible({ timeout: 3000 }).catch(() => false);

  if (isHeaderVisible) {
    await menuTrigger.click();
    const signOutBtn = page.getByRole('button', { name: /Sign Out|Sign out/i }).first();
    await expect(signOutBtn).toBeVisible({ timeout: 5000 });
    await signOutBtn.click();
  } else {
    // Fallback to sidebar sign out button
    const sidebarSignOut = page.getByRole('button', { name: /Sign Out|Sign out/i }).first();
    await sidebarSignOut.click();
  }

  // Ensure redirected back to /login
  await page.waitForURL((url) => url.pathname.includes('/login'), {
    timeout: 20000,
  });
}
