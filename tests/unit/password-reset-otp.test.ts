import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(),
}));

vi.mock("@/lib/auth/rate-limiter", () => ({
  checkRateLimit: vi.fn(),
  recordFailedAttempt: vi.fn(),
  recordSuccessfulAttempt: vi.fn(),
  extractClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
  logSystemAuditEvent: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: () => "127.0.0.1",
  }),
}));

import { createServerClient } from "@/lib/supabase/server";
import {
  checkRateLimit,
  recordFailedAttempt,
  recordSuccessfulAttempt,
} from "@/lib/auth/rate-limiter";
import {
  requestPasswordResetAction,
} from "@/lib/auth/actions";
import {
  verifyRecoveryOtpAction,
  verifyRecoveryOtpFormAction,
  resetPasswordAction,
  getPasswordResetSessionAction,
} from "@/lib/auth/password-reset-actions";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluatePasswordStrength,
  maskEmailAddress,
  normalizeRecoveryOtpInput,
  RECOVERY_OTP_LENGTH,
  ResetPasswordSchema,
  VerifyRecoveryOtpSchema,
} from "@/lib/validation/auth.schemas";
import {
  buildRecoveryEmailHtml,
  SUPABASE_AUTH_EMAIL_SUBJECTS,
} from "@/lib/email/supabase-auth/templates";

/** Fixture OTP — 8 digits matching production Supabase recovery token length. */
const VALID_OTP = "12345678";

describe("password reset OTP recovery flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 3 });
  });

  it("verify-reset-otp page binds verifyRecoveryOtpFormAction and not requestPasswordResetAction", () => {
    const pageSource = readFileSync(
      join(process.cwd(), "src/app/(auth)/verify-reset-otp/page.tsx"),
      "utf8"
    );
    expect(pageSource).not.toContain("requestPasswordResetAction");
    expect(pageSource).toContain("verifyRecoveryOtpFormAction");
    expect(pageSource).toContain("action={formAction}");
    expect(pageSource).toContain("RECOVERY_OTP_LENGTH");
    expect(pageSource).toContain("normalizeRecoveryOtpInput");
    expect(pageSource).not.toMatch(/token\.length\s*<\s*6/);
    expect(pageSource).not.toContain("slice(0, 6)");
    expect(pageSource).not.toContain("••••••\"");

    const resendSource = readFileSync(
      join(process.cwd(), "src/app/(auth)/verify-reset-otp/ResendRecoveryCodeButton.tsx"),
      "utf8"
    );
    expect(resendSource).toContain("requestPasswordResetAction");
    expect(resendSource).not.toContain("verifyRecoveryOtp");
  });

  it("forgot-password page calls only requestPasswordResetAction", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/(auth)/forgot-password/page.tsx"),
      "utf8"
    );
    expect(source).toContain("requestPasswordResetAction");
    expect(source).not.toContain("verifyRecoveryOtp");
  });

  it("forgot-password always returns success without leaking existence", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(createServerClient).mockResolvedValue({
      auth: { resetPasswordForEmail },
    } as any);

    const formData = new FormData();
    formData.set("email", "person@example.com");
    const result = await requestPasswordResetAction(formData);

    expect(result.success).toBe(true);
    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      "person@example.com",
      expect.objectContaining({
        redirectTo: expect.stringContaining("/reset-password"),
      })
    );
  });

  it("verifyRecoveryOtpAction passes 8-digit token unchanged to verifyOtp type=recovery", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: {
        session: { access_token: "sess" },
        user: { id: "user-1", email: "person@example.com" },
      },
      error: null,
    });
    vi.mocked(createServerClient).mockResolvedValue({
      auth: { verifyOtp },
    } as any);

    const formData = new FormData();
    formData.set("email", "person@example.com");
    formData.set("token", VALID_OTP);
    const result = await verifyRecoveryOtpAction(formData);

    expect(result.success).toBe(true);
    expect(result.data?.redirectUrl).toBe("/reset-password");
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "person@example.com",
      token: VALID_OTP,
      type: "recovery",
    });
    expect(recordSuccessfulAttempt).toHaveBeenCalled();
  });

  it("verifyRecoveryOtpFormAction redirects to /reset-password on success", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: {
        session: { access_token: "sess" },
        user: { id: "user-1", email: "person@example.com" },
      },
      error: null,
    });
    vi.mocked(createServerClient).mockResolvedValue({
      auth: { verifyOtp },
    } as any);

    const formData = new FormData();
    formData.set("email", "person@example.com");
    formData.set("token", VALID_OTP);
    const state = await verifyRecoveryOtpFormAction(
      { error: null, redirectUrl: null },
      formData
    );

    expect(state.error).toBeNull();
    expect(state.redirectUrl).toBe("/reset-password");
  });

  it("maps invalid OTP to a safe user message and never returns raw error", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Invalid OTP" },
    });
    vi.mocked(createServerClient).mockResolvedValue({
      auth: { verifyOtp },
    } as any);

    const formData = new FormData();
    formData.set("email", "person@example.com");
    formData.set("token", "00000000");
    const result = await verifyRecoveryOtpAction(formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("That verification code is incorrect. Please try again.");
    expect(result.error).not.toMatch(/Invalid OTP/);
    expect(result.data?.redirectUrl).toBeUndefined();
    expect(recordFailedAttempt).toHaveBeenCalled();
  });

  it("maps expired OTP to safe message and does not redirect", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Token has expired or is invalid" },
    });
    vi.mocked(createServerClient).mockResolvedValue({
      auth: { verifyOtp },
    } as any);

    const formData = new FormData();
    formData.set("email", "person@example.com");
    formData.set("token", "11111111");
    const result = await verifyRecoveryOtpAction(formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "That verification code has expired. Request a new code."
    );
    expect(result.data?.redirectUrl).toBeUndefined();
  });

  it("maps already-used OTP to safe message", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "OTP already used" },
    });
    vi.mocked(createServerClient).mockResolvedValue({
      auth: { verifyOtp },
    } as any);

    const formData = new FormData();
    formData.set("email", "person@example.com");
    formData.set("token", "22222222");
    const result = await verifyRecoveryOtpAction(formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "That verification code has already been used. Request a new code."
    );
  });

  it("password cannot be changed without recovery session", async () => {
    const updateUser = vi.fn();
    vi.mocked(createServerClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "Auth session missing" },
        }),
        updateUser,
      },
    } as any);

    const formData = new FormData();
    formData.set("password", "StrongPass1!");
    formData.set("confirmPassword", "StrongPass1!");
    const result = await resetPasswordAction(formData);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/verification session/i);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("rejects weak passwords and mismatched confirmation", () => {
    expect(ResetPasswordSchema.safeParse({ password: "weak", confirmPassword: "weak" }).success).toBe(
      false
    );
    expect(
      ResetPasswordSchema.safeParse({
        password: "StrongPass1!",
        confirmPassword: "Different1!",
      }).success
    ).toBe(false);
    expect(
      ResetPasswordSchema.safeParse({
        password: "StrongPass1!",
        confirmPassword: "StrongPass1!",
      }).success
    ).toBe(true);
  });

  it("resetPasswordAction updates password then signs out", async () => {
    const updateUser = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const signOut = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createServerClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u1", email: "person@example.com" } },
          error: null,
        }),
        updateUser,
        signOut,
      },
    } as any);

    const formData = new FormData();
    formData.set("password", "StrongPass1!");
    formData.set("confirmPassword", "StrongPass1!");
    const result = await resetPasswordAction(formData);

    expect(result.success).toBe(true);
    expect(updateUser).toHaveBeenCalledWith({ password: "StrongPass1!" });
    expect(signOut).toHaveBeenCalled();
  });

  it("getPasswordResetSessionAction fails without recovery session", async () => {
    vi.mocked(createServerClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "no" } }),
      },
    } as any);

    const result = await getPasswordResetSessionAction();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/verification session/i);
  });

  it("rate-limits recovery OTP verification", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
    });

    const formData = new FormData();
    formData.set("email", "person@example.com");
    formData.set("token", VALID_OTP);
    const result = await verifyRecoveryOtpAction(formData);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Too many attempts/i);
  });

  it("OTP schema accepts exactly 8 digits and rejects other lengths/content", () => {
    expect(RECOVERY_OTP_LENGTH).toBe(8);
    expect(
      VerifyRecoveryOtpSchema.safeParse({ email: "a@b.com", token: VALID_OTP }).success
    ).toBe(true);
    expect(
      VerifyRecoveryOtpSchema.safeParse({ email: "a@b.com", token: "1234567" }).success
    ).toBe(false);
    expect(
      VerifyRecoveryOtpSchema.safeParse({ email: "a@b.com", token: "123456789" }).success
    ).toBe(false);
    expect(
      VerifyRecoveryOtpSchema.safeParse({ email: "a@b.com", token: "123456" }).success
    ).toBe(false);
    expect(
      VerifyRecoveryOtpSchema.safeParse({ email: "a@b.com", token: "abcdefgh" }).success
    ).toBe(false);
    expect(
      VerifyRecoveryOtpSchema.safeParse({ email: "a@b.com", token: "12ab5678" }).success
    ).toBe(false);
    expect(
      VerifyRecoveryOtpSchema.safeParse({ email: "a@b.com", token: "1234 5678" }).success
    ).toBe(false);
  });

  it("normalizeRecoveryOtpInput accepts paste of 8 digits and refuses silent truncation", () => {
    expect(normalizeRecoveryOtpInput(VALID_OTP)).toBe(VALID_OTP);
    expect(normalizeRecoveryOtpInput(" 1234 5678 ")).toBe(VALID_OTP);
    expect(normalizeRecoveryOtpInput("12-34-56-78")).toBe(VALID_OTP);
    expect(normalizeRecoveryOtpInput("1234567")).toBe("1234567");
    expect(normalizeRecoveryOtpInput("123456789")).toBeNull();
    expect(normalizeRecoveryOtpInput("abc")).toBe("");
  });

  it("masks emails and evaluates password strength", () => {
    expect(maskEmailAddress("jordan@example.com")).toBe("j***@example.com");
    expect(evaluatePasswordStrength("Aa1!aaaa").isValid).toBe(true);
    expect(evaluatePasswordStrength("password").isValid).toBe(false);
  });

  it("recovery email template is OTP-first with Token and no ConfirmationURL CTA", () => {
    expect(SUPABASE_AUTH_EMAIL_SUBJECTS.recovery).toBe("Your OOS password reset code");
    const html = buildRecoveryEmailHtml();
    expect(html).toContain("{{ .Token }}");
    expect(html).toContain("verification code");
    expect(html).not.toContain("{{ .ConfirmationURL }}");
    expect(html).not.toContain("Reset your password →");
  });
});
