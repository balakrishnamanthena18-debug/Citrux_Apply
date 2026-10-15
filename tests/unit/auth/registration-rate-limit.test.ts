import { describe, it, expect, vi, beforeEach } from "vitest";
import { signUpCandidateAction } from "@/lib/auth/actions";
import { POST as signupRouteHandler } from "@/app/api/auth/signup/route";
import { POST as registerRouteHandler } from "@/app/api/auth/register/route";
import { NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import { withRlsContext } from "@/lib/db/rls";

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

describe("Registration Rate Limiting, Idempotency & Error Handling", () => {
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
              id: "test-user-id",
              email: "newcandidate@example.com",
              identities: [{ id: "identity-1" }],
            },
          },
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

  describe("1. Supabase Auth Rate Limit Handling (HTTP 429 & 'email rate limit exceeded')", () => {
    it("translates Supabase Auth 'email rate limit exceeded' to a clear user-facing message", async () => {
      mockSupabase.auth.signUp.mockResolvedValueOnce({
        data: { user: null },
        error: {
          message: "email rate limit exceeded",
          status: 429,
          code: "over_email_send_rate_limit",
        },
      });

      const formData = new FormData();
      formData.set("email", "candidate@example.com");
      formData.set("password", "SecurePassword123!");
      formData.set("firstName", "Jane");
      formData.set("lastName", "Doe");

      const result = await signUpCandidateAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        "Too many registration or verification email requests. Please wait a few minutes before trying again, or contact support if the issue persists."
      );
      // Raw tech string must not be leaked
      expect(result.error).not.toBe("email rate limit exceeded");
    });

    it("safely logs rate limit warning without exposing password or sensitive tokens", async () => {
      const sensitivePassword = "SuperSecretPassword123!";
      mockSupabase.auth.signUp.mockResolvedValueOnce({
        data: { user: null },
        error: {
          message: "email rate limit exceeded",
          status: 429,
          code: "over_email_send_rate_limit",
        },
      });

      const formData = new FormData();
      formData.set("email", "candidate@example.com");
      formData.set("password", sensitivePassword);
      formData.set("firstName", "Jane");
      formData.set("lastName", "Doe");

      await signUpCandidateAction(formData);

      expect(logger.warn).toHaveBeenCalledWith(
        "[AUTH_FLOW] Supabase Auth email rate limit exceeded during registration",
        expect.objectContaining({
          endpoint: "signUpCandidateAction",
          status: 429,
          code: "over_email_send_rate_limit",
        })
      );

      const logCalls = vi.mocked(logger.warn).mock.calls;
      const allLogsString = JSON.stringify(logCalls);
      expect(allLogsString).not.toContain(sensitivePassword);
    });

    it("POST /api/auth/signup returns HTTP 429 with translated message on Supabase rate limit", async () => {
      mockSupabase.auth.signUp.mockResolvedValueOnce({
        data: { user: null },
        error: {
          message: "email rate limit exceeded",
          status: 429,
          code: "over_email_send_rate_limit",
        },
      });

      const req = new NextRequest("http://localhost:3000/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "candidate@example.com",
          password: "SecurePassword123!",
          firstName: "Jane",
          lastName: "Doe",
        }),
      });

      const res = await signupRouteHandler(req);
      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe(
        "Too many registration or verification email requests. Please wait a few minutes before trying again, or contact support if the issue persists."
      );
    });

    it("POST /api/auth/register delegates to signup and also returns HTTP 429 on rate limit", async () => {
      mockSupabase.auth.signUp.mockResolvedValueOnce({
        data: { user: null },
        error: {
          message: "email rate limit exceeded",
          status: 429,
        },
      });

      const req = new NextRequest("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "candidate@example.com",
          password: "SecurePassword123!",
          firstName: "Jane",
          lastName: "Doe",
        }),
      });

      const res = await registerRouteHandler(req);
      expect(res.status).toBe(429);
    });
  });

  describe("2. Idempotency & Redundant Email Send Prevention", () => {
    it("pre-checks database for existing user and rejects BEFORE calling Supabase signUp()", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "existing-db-user-id",
        email: "candidate@example.com",
      } as any);

      const formData = new FormData();
      formData.set("email", "candidate@example.com");
      formData.set("password", "SecurePassword123!");
      formData.set("firstName", "Jane");
      formData.set("lastName", "Doe");

      const result = await signUpCandidateAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe("A user with this email address already exists");

      // Supabase signUp MUST NOT have been called, preventing any email quota burn
      expect(mockSupabase.auth.signUp).not.toHaveBeenCalled();
    });

    it("handles Supabase email enumeration protection where user.identities is empty", async () => {
      mockSupabase.auth.signUp.mockResolvedValueOnce({
        data: {
          user: {
            id: "existing-supa-user-id",
            email: "candidate@example.com",
            identities: [], // Empty identities array signals existing account in GoTrue
          },
        },
        error: null,
      });

      const formData = new FormData();
      formData.set("email", "candidate@example.com");
      formData.set("password", "SecurePassword123!");
      formData.set("firstName", "Jane");
      formData.set("lastName", "Doe");

      const result = await signUpCandidateAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe("A user with this email address already exists");
      expect(withRlsContext).not.toHaveBeenCalled();
    });

    it("catches Prisma P2002 unique constraint violations and returns clear existing user error", async () => {
      vi.mocked(withRlsContext).mockRejectedValueOnce({
        code: "P2002",
        message: "Unique constraint failed on the fields: (`email`)",
      });

      const formData = new FormData();
      formData.set("email", "candidate@example.com");
      formData.set("password", "SecurePassword123!");
      formData.set("firstName", "Jane");
      formData.set("lastName", "Doe");

      const result = await signUpCandidateAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe("A user with this email address already exists");
    });
  });
});
