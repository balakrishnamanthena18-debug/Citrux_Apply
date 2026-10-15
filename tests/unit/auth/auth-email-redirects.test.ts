import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(),
}));

vi.mock("@/lib/auth/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
  recordFailedAttempt: vi.fn(),
  recordSuccessfulAttempt: vi.fn(),
  extractClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
  logSystemAuditEvent: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn().mockResolvedValue({
        id: "00000000-0000-0000-0000-000000000001",
        status: "ACTIVE",
      }),
    },
  },
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(async (_userId, callback) => {
    const tx = {
      user: { create: vi.fn().mockResolvedValue({}) },
      membership: { create: vi.fn().mockResolvedValue({}) },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    return callback(tx as any);
  }),
}));

import { createServerClient } from "@/lib/supabase/server";
import { requestPasswordResetAction, signUpCandidateAction } from "@/lib/auth/actions";
import {
  verifyRecoveryOtpAction,
  resetPasswordAction,
} from "@/lib/auth/password-reset-actions";
import {
  buildRecoveryEmailHtml,
  buildConfirmationEmailHtml,
  SUPABASE_AUTH_EMAIL_SUBJECTS,
} from "@/lib/email/supabase-auth/templates";
import {
  buildAppUrl,
  isAllowedRedirectUrl,
  DEFAULT_PRODUCTION_APP_URL,
} from "@/lib/url";

describe("Production Authentication Email Flow & Redirect Hardening (Phase 4)", () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPERATING_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001";
    mockSupabase = {
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { user: { id: "user-candidate-1", email: "candidate@example.com" } },
          error: null,
        }),
        resetPasswordForEmail: vi.fn().mockResolvedValue({
          data: {},
          error: null,
        }),
        verifyOtp: vi.fn().mockResolvedValue({
          data: {
            session: { access_token: "mock-access-token" },
            user: { id: "user-1", email: "candidate@example.com" },
          },
          error: null,
        }),
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1", email: "candidate@example.com" } },
          error: null,
        }),
        updateUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
        signOut: vi.fn().mockResolvedValue({}),
      },
    };
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase);
  });

  it("1. Password-reset requests trigger the recovery flow (resetPasswordForEmail)", async () => {
    const formData = new FormData();
    formData.set("email", "candidate@example.com");

    const result = await requestPasswordResetAction(formData);

    expect(result.success).toBe(true);
    expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "candidate@example.com",
      expect.objectContaining({
        redirectTo: expect.stringMatching(/reset-password/),
      })
    );
  });

  it("2. Recovery email configuration uses the OTP token template without ConfirmationURL link", () => {
    expect(SUPABASE_AUTH_EMAIL_SUBJECTS.recovery).toBe("Your OOS password reset code");
    const recoveryHtml = buildRecoveryEmailHtml();

    expect(recoveryHtml).toContain("{{ .Token }}");
    expect(recoveryHtml).toContain("Reset your password");
    expect(recoveryHtml).not.toContain("{{ .ConfirmationURL }}");
    expect(recoveryHtml).not.toContain("Confirm email address");
  });

  it("3. Eight-digit recovery OTP verification uses type: 'recovery'", async () => {
    const formData = new FormData();
    formData.set("email", "candidate@example.com");
    formData.set("token", "12345678");

    const result = await verifyRecoveryOtpAction(formData);

    expect(result.success).toBe(true);
    expect(result.data?.redirectUrl).toBe("/reset-password");
    expect(mockSupabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: "candidate@example.com",
      token: "12345678",
      type: "recovery",
    });
  });

  it("4. Successful verification leads to the password update flow", async () => {
    const formData = new FormData();
    formData.set("password", "NewStrongPassword123!");
    formData.set("confirmPassword", "NewStrongPassword123!");

    const result = await resetPasswordAction(formData);

    expect(result.success).toBe(true);
    expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
      password: "NewStrongPassword123!",
    });
    expect(mockSupabase.auth.signOut).toHaveBeenCalled();
  });

  it("5. Production redirects never point to localhost", () => {
    const urlFromMissing = buildAppUrl("/login", {
      env: {},
      nodeEnv: "production",
    });
    expect(urlFromMissing).toBe("https://portal.careerbutton.in/login");
    expect(urlFromMissing).not.toContain("localhost");

    const urlFromLocalhost = buildAppUrl("/login", {
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      nodeEnv: "production",
    });
    expect(urlFromLocalhost).toBe("https://portal.careerbutton.in/login");
    expect(urlFromLocalhost).not.toContain("localhost");
  });

  it("6. Local development can still use localhost", () => {
    const devUrl = buildAppUrl("/login", {
      env: {},
      nodeEnv: "development",
    });
    expect(devUrl).toBe("http://localhost:3000/login");
  });

  it("7. Signup confirmation remains separate from password recovery", async () => {
    // 7A: Signup uses confirmation template and emailRedirectTo callback targeting portal.careerbutton.in
    const confirmationHtml = buildConfirmationEmailHtml();
    expect(SUPABASE_AUTH_EMAIL_SUBJECTS.confirmation).toBe("Confirm your OOS email address");
    expect(confirmationHtml).toContain("{{ .ConfirmationURL }}");
    expect(confirmationHtml).toContain("Confirm email address");

    const signupData = new FormData();
    signupData.set("email", "candidate@example.com");
    signupData.set("password", "Password123!");
    signupData.set("firstName", "Jane");
    signupData.set("lastName", "Doe");

    const origNodeEnv = process.env.NODE_ENV;
    const origAppUrl = process.env.NEXT_PUBLIC_APP_URL;

    try {
      (process.env as any).NODE_ENV = "production";
      process.env.NEXT_PUBLIC_APP_URL = "https://portal.careerbutton.in";

      const signupResult = await signUpCandidateAction(signupData);
      expect(signupResult.success).toBe(true);
      expect(mockSupabase.auth.signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "candidate@example.com",
          options: expect.objectContaining({
            emailRedirectTo: expect.stringMatching(
              /^https:\/\/portal\.careerbutton\.in\/api\/auth\/callback\?next=/
            ),
          }),
        })
      );
    } finally {
      (process.env as any).NODE_ENV = origNodeEnv;
      process.env.NEXT_PUBLIC_APP_URL = origAppUrl;
    }

    // 7B: Recovery uses OTP template and resetPasswordForEmail
    const resetData = new FormData();
    resetData.set("email", "candidate@example.com");
    const resetResult = await requestPasswordResetAction(resetData);
    expect(resetResult.success).toBe(true);
    expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "candidate@example.com",
      expect.objectContaining({
        redirectTo: expect.stringMatching(/reset-password/),
      })
    );
  });

  it("8. Invalid and untrusted redirect URLs are rejected", () => {
    expect(isAllowedRedirectUrl("https://attacker-site.com", "production")).toBe(false);
    expect(isAllowedRedirectUrl("//attacker-site.com", "production")).toBe(false);
    expect(isAllowedRedirectUrl("javascript:alert(1)", "production")).toBe(false);
    expect(isAllowedRedirectUrl("http://localhost:3000/login", "production")).toBe(false);

    expect(isAllowedRedirectUrl("/login?confirmed=true", "production")).toBe(true);
    expect(isAllowedRedirectUrl("https://citrux-apply-mrgx.vercel.app/candidate", "production")).toBe(true);
    expect(isAllowedRedirectUrl("https://portal.careerbutton.in/candidate", "production")).toBe(true);
  });
});
