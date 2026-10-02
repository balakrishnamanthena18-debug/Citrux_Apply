/**
 * Client-only helpers for password-reset UX continuity.
 * Stores only the normalized email in sessionStorage — never OTP or passwords.
 */

export const PASSWORD_RESET_EMAIL_STORAGE_KEY = "oos_password_reset_email";

export function readPasswordResetEmailFromSession(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(PASSWORD_RESET_EMAIL_STORAGE_KEY);
    return value?.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

export function clearPasswordResetEmailSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PASSWORD_RESET_EMAIL_STORAGE_KEY);
  } catch {
    // ignore
  }
}
