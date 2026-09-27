import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/cron/rate-limit-cleanup/route";
import { cleanupExpiredRateLimits } from "@/lib/auth/rate-limiter";
import { prisma } from "@/lib/db/prisma";

vi.mock("@/lib/auth/rate-limiter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/rate-limiter")>();
  return {
    ...actual,
    cleanupExpiredRateLimits: vi.fn(),
  };
});

describe("Rate Limit Cron Scheduled Cleanup Endpoint (src/app/api/cron/rate-limit-cleanup)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: "test-secure-cron-secret-12345" };
  });

  it("1. Rejects request when Authorization header is missing (HTTP 401)", async () => {
    const req = new NextRequest("http://localhost:3000/api/cron/rate-limit-cleanup");
    const response = await GET(req);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ success: false, error: "Unauthorized" });
    expect(cleanupExpiredRateLimits).not.toHaveBeenCalled();
  });

  it("2. Rejects request when Authorization token is invalid (HTTP 401)", async () => {
    const req = new NextRequest("http://localhost:3000/api/cron/rate-limit-cleanup", {
      headers: {
        authorization: "Bearer wrong-secret",
      },
    });
    const response = await GET(req);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ success: false, error: "Unauthorized" });
    expect(cleanupExpiredRateLimits).not.toHaveBeenCalled();
  });

  it("3. Rejects request safely when server CRON_SECRET is not configured (HTTP 401)", async () => {
    delete process.env.CRON_SECRET;

    const req = new NextRequest("http://localhost:3000/api/cron/rate-limit-cleanup", {
      headers: {
        authorization: "Bearer test-secure-cron-secret-12345",
      },
    });
    const response = await GET(req);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ success: false, error: "Unauthorized" });
    expect(cleanupExpiredRateLimits).not.toHaveBeenCalled();
  });

  it("4. Successfully authorizes and executes cleanup with valid CRON_SECRET (HTTP 200)", async () => {
    vi.mocked(cleanupExpiredRateLimits).mockResolvedValue({ deletedCount: 7 });

    const req = new NextRequest("http://localhost:3000/api/cron/rate-limit-cleanup", {
      headers: {
        authorization: "Bearer test-secure-cron-secret-12345",
      },
    });
    const response = await GET(req);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, deletedCount: 7 });
    expect(cleanupExpiredRateLimits).toHaveBeenCalledTimes(1);
    // Verifies response does NOT contain key hashes, emails, IPs, or internal DB ids
    expect(body.keyHash).toBeUndefined();
    expect(body.email).toBeUndefined();
    expect(body.ip).toBeUndefined();
  });

  it("5. Supports POST method identically for platform flexibility", async () => {
    vi.mocked(cleanupExpiredRateLimits).mockResolvedValue({ deletedCount: 3 });

    const req = new NextRequest("http://localhost:3000/api/cron/rate-limit-cleanup", {
      method: "POST",
      headers: {
        authorization: "Bearer test-secure-cron-secret-12345",
      },
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, deletedCount: 3 });
  });

  it("6. Handles unexpected operational errors gracefully (HTTP 500 without leaking details)", async () => {
    vi.mocked(cleanupExpiredRateLimits).mockRejectedValue(new Error("Database connection down"));

    const req = new NextRequest("http://localhost:3000/api/cron/rate-limit-cleanup", {
      headers: {
        authorization: "Bearer test-secure-cron-secret-12345",
      },
    });
    const response = await GET(req);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ success: false, error: "Operational cleanup failure" });
    expect(body.stack).toBeUndefined();
  });
});
