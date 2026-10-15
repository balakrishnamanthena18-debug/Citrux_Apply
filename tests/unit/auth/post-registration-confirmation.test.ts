import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  signUpCandidateAction,
  resendVerificationEmailAction,
} from "@/lib/auth/actions";
import { POST as signupRouteHandler } from "@/app/api/auth/signup/route";
import { NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import { withRlsContext } from "@/lib/db/rls";
import { checkRateLimit, recordFailedAttempt } from "@/lib/auth/rate-limiter";

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(),
}));

vi.mock("@/lib/auth/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
  recordFailedAttempt: vi.fn(),
  recordSuccessfulAttempt: vi.fn(),
  extractClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logSystemAuditEvent: vi.fn(),
  logUserAuditEvent: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

describe("Post-Registration Confirmation & Resend Experience", () => {
  const mockOrgId = "00000000-0000-0000-0000-000000000001";
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPERATING_ORGANIZATION_ID = mockOrgId;

    vi.spyOn(logger, "warn").mockImplementation(() => {});
    vi.spyOn(logger, "error").mockImplementation(() => {});

    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      id: mockOrgId,
      status: "ACTIVE",
    } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    mockSupabase = {
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "new-user-123",
              email: "applicant@example.com",
              email_confirmed_at: null,
              identities: [{ id: "identity-1" }],
            },
            session: null, // Email confirmation required -> no active session
          },
          error: null,
        }),
        resend: vi.fn().mockResolvedValue({
          data: {},
          error: null,
        }),
      },
    };
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase);

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        user: { create: vi.fn().mockResolvedValue({}) },
        membership: { create: vi.fn().mockResolvedValue({}) },
      };
      return callback(tx as any);
    });
  });

  describe("1. Registration Success & Confirmation Signal", () => {
    it("returns emailConfirmationRequired: true when Supabase session is null and email is unconfirmed", async () => {
      const formData = new FormData();
      formData.set("firstName", "John");
      formData.set("lastName", "Smith");
      formData.set("email", "applicant@example.com");
      formData.set("password", "SecurePassword123!");

      const result = await signUpCandidateAction(formData);

      expect(result.success).toBe(true);
      expect(result.data?.emailConfirmationRequired).toBe(true);
      expect(result.data?.email).toBe("applicant@example.com");
      expect(result.data?.redirectUrl).toBe("/candidate");
    });

    it("POST /api/auth/signup includes emailConfirmationRequired and email in response data", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: "John",
          lastName: "Smith",
          email: "applicant@example.com",
          password: "SecurePassword123!",
        }),
      });

      const res = await signupRouteHandler(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data?.emailConfirmationRequired).toBe(true);
      expect(body.data?.email).toBe("applicant@example.com");
    });

    it("does NOT signal email confirmation success when registration is rate-limited", async () => {
      mockSupabase.auth.signUp.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: {
          message: "email rate limit exceeded",
          status: 429,
          code: "over_email_send_rate_limit",
        },
      });

      const formData = new FormData();
      formData.set("firstName", "John");
      formData.set("lastName", "Smith");
      formData.set("email", "applicant@example.com");
      formData.set("password", "SecurePassword123!");

      const result = await signUpCandidateAction(formData);

      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.error).toContain("Too many registration or verification email requests");
    });
  });

  describe("2. Resend Verification Email Action", () => {
    it("successfully requests verification email resend via Supabase Auth with callback redirect", async () => {
      const formData = new FormData();
      formData.set("email", "applicant@example.com");

      const result = await resendVerificationEmailAction(formData);

      expect(result.success).toBe(true);
      expect(result.data?.resent).toBe(true);

      expect(mockSupabase.auth.resend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "signup",
          email: "applicant@example.com",
          options: expect.objectContaining({
            emailRedirectTo: expect.stringContaining("/api/auth/callback"),
          }),
        })
      );
    });

    it("validates and rejects invalid email inputs before contacting Supabase", async () => {
      const formData = new FormData();
      formData.set("email", "invalid-email-address");

      const result = await resendVerificationEmailAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Please provide a valid email address.");
      expect(mockSupabase.auth.resend).not.toHaveBeenCalled();
    });

    it("enforces application-level rate limiting on resend requests", async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 60,
        error: "Rate limit exceeded",
      });

      const formData = new FormData();
      formData.set("email", "applicant@example.com");

      const result = await resendVerificationEmailAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Too many email requests. Please wait a few minutes before trying again.");
      expect(mockSupabase.auth.resend).not.toHaveBeenCalled();
    });

    it("handles Supabase 429 rate limit errors on resend with clear user guidance", async () => {
      mockSupabase.auth.resend.mockResolvedValueOnce({
        data: {},
        error: {
          message: "email rate limit exceeded",
          status: 429,
          code: "over_email_send_rate_limit",
        },
      });

      const formData = new FormData();
      formData.set("email", "applicant@example.com");

      const result = await resendVerificationEmailAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        "Too many verification email attempts. Please wait a few minutes before trying again."
      );

      // Verify safe logging occurred without leaking secrets
      expect(logger.warn).toHaveBeenCalledWith(
        "[AUTH_FLOW] Supabase Auth rate limit on verification resend",
        expect.objectContaining({
          status: 429,
          code: "over_email_send_rate_limit",
        })
      );
    });

    it("handles unexpected network exceptions gracefully without throwing", async () => {
      mockSupabase.auth.resend.mockRejectedValueOnce(new Error("Network timeout contacting auth server"));

      const formData = new FormData();
      formData.set("email", "applicant@example.com");

      const result = await resendVerificationEmailAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unable to resend verification email right now. Please try again later.");
    });

    it("returns neutral success and does not expose account enumeration", async () => {
      // Even if Supabase resend silently ignores unknown emails or succeeds
      mockSupabase.auth.resend.mockResolvedValueOnce({
        data: {},
        error: null,
      });

      const formData = new FormData();
      formData.set("email", "nonexistent@example.com");

      const result = await resendVerificationEmailAction(formData);

      expect(result.success).toBe(true);
      expect(result.data?.resent).toBe(true);
    });
  });
});
