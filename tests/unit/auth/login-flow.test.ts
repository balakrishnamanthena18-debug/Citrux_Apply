import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(),
}));

vi.mock("@/lib/auth/rate-limiter", () => ({
  checkRateLimit: vi.fn(),
  recordFailedAttempt: vi.fn(),
  recordSuccessfulAttempt: vi.fn(),
  extractClientIp: vi.fn().mockReturnValue("127.0.0.1"),
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

import { signInAction } from "@/lib/auth/actions";
import { createServerClient } from "@/lib/supabase/server";
import { checkRateLimit, recordFailedAttempt, recordSuccessfulAttempt } from "@/lib/auth/rate-limiter";
import { withRlsContext } from "@/lib/db/rls";

describe("Login Flow (signInAction) Invariants", () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = {
      auth: {
        signInWithPassword: vi.fn(),
        signOut: vi.fn().mockResolvedValue({}),
      },
    };
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 5 });
  });

  it("should fail cleanly when validation fails on invalid email format", async () => {
    const formData = new FormData();
    formData.append("email", "invalid-email");
    formData.append("password", "validPass123!");

    const res = await signInAction(formData);
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
    expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("should fail cleanly when rate limit is exceeded without hanging", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 300,
    });

    const formData = new FormData();
    formData.append("email", "user@example.com");
    formData.append("password", "validPass123!");

    const res = await signInAction(formData);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Too many failed login attempts");
    expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("should gracefully proceed with authentication if rate limiter throws an unexpected database error", async () => {
    vi.mocked(checkRateLimit).mockRejectedValue(new Error("PostgreSQL connection timeout"));
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    vi.mocked(withRlsContext).mockImplementation(async (_userId: string, fn: any) => {
      return fn({
        membership: {
          findFirst: vi.fn().mockResolvedValue({
            organizationId: "org-1",
            role: "CANDIDATE",
            status: "ACTIVE",
          }),
        },
      });
    });

    const formData = new FormData();
    formData.append("email", "candidate@example.com");
    formData.append("password", "validPass123!");

    const res = await signInAction(formData);
    expect(res.success).toBe(true);
    expect(res.data?.redirectUrl).toBe("/candidate");
  });

  it("should return controlled error and record failed attempt on invalid password", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    });

    const formData = new FormData();
    formData.append("email", "candidate@example.com");
    formData.append("password", "wrongPassword");

    const res = await signInAction(formData);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid email or password");
    expect(recordFailedAttempt).toHaveBeenCalledWith("LOGIN", expect.any(Object));
  });

  it("should catch unexpected Supabase network exceptions and return a safe error without throwing", async () => {
    mockSupabase.auth.signInWithPassword.mockRejectedValue(new Error("Supabase Auth service unreachable"));

    const formData = new FormData();
    formData.append("email", "candidate@example.com");
    formData.append("password", "validPass123!");

    const res = await signInAction(formData);
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });

  it("should reject login if active membership is not found and cleanly sign out", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    vi.mocked(withRlsContext).mockImplementation(async (_userId: string, fn: any) => {
      return fn({
        membership: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      });
    });

    const formData = new FormData();
    formData.append("email", "inactive@example.com");
    formData.append("password", "validPass123!");

    const res = await signInAction(formData);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Account is inactive or pending organization approval");
    expect(mockSupabase.auth.signOut).toHaveBeenCalled();
  });

  it("should successfully authenticate an Admin and return /admin redirect", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "admin-user-id" } },
      error: null,
    });
    vi.mocked(withRlsContext).mockImplementation(async (_userId: string, fn: any) => {
      return fn({
        membership: {
          findFirst: vi.fn().mockResolvedValue({
            organizationId: "org-1",
            role: "ADMIN",
            status: "ACTIVE",
          }),
        },
      });
    });

    const formData = new FormData();
    formData.append("email", "admin@company.com");
    formData.append("password", "AdminPass123!");

    const res = await signInAction(formData);
    expect(res.success).toBe(true);
    expect(res.data?.redirectUrl).toBe("/admin");
    expect(recordSuccessfulAttempt).toHaveBeenCalledWith("LOGIN", expect.any(Object));
  });

  it("should successfully authenticate an Employee and return /employee redirect", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "employee-user-id" } },
      error: null,
    });
    vi.mocked(withRlsContext).mockImplementation(async (_userId: string, fn: any) => {
      return fn({
        membership: {
          findFirst: vi.fn().mockResolvedValue({
            organizationId: "org-1",
            role: "EMPLOYEE",
            status: "ACTIVE",
          }),
        },
      });
    });

    const formData = new FormData();
    formData.append("email", "employee@company.com");
    formData.append("password", "EmployeePass123!");

    const res = await signInAction(formData);
    expect(res.success).toBe(true);
    expect(res.data?.redirectUrl).toBe("/employee");
  });
});
