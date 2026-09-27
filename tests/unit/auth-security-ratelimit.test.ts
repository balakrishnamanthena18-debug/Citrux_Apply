import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkRateLimit,
  recordFailedAttempt,
  recordSuccessfulAttempt,
  resetRateLimitStore,
  deriveRateLimitKeyHash,
  extractClientIp,
} from "@/lib/auth/rate-limiter";
import { prisma } from "@/lib/db/prisma";
import {
  LoginSchema,
  CandidateRegisterSchema,
  ResetPasswordSchema,
  ActivateStaffAccountSchema,
} from "@/lib/validation/auth.schemas";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    rateLimitBucket: {
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

describe("OOS Distributed Authentication Security & Rate Limiting (tests/unit/auth-security-ratelimit.test.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Key Derivation & Privacy Protection", () => {
    it("generates deterministic SHA-256 key hashes without exposing raw IP or email in keyHash", () => {
      const hash1 = deriveRateLimitKeyHash("LOGIN", { email: "user@example.com", ip: "192.168.1.1" });
      const hash2 = deriveRateLimitKeyHash("LOGIN", { email: "USER@EXAMPLE.COM", ip: "192.168.1.1" });
      const hashDiffIp = deriveRateLimitKeyHash("LOGIN", { email: "user@example.com", ip: "10.0.0.1" });

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2); // Case insensitive normalization
      expect(hash1).not.toBe(hashDiffIp); // Different IP yields different hash
      expect(hash1).not.toContain("user@example.com");
      expect(hash1).not.toContain("192.168.1.1");
    });
  });

  describe("2. Login Rate Limiting (Brute-Force Protection)", () => {
    it("allows initial login attempts when no previous failures exist", async () => {
      vi.mocked(prisma.rateLimitBucket.findUnique).mockResolvedValue(null);

      const params = { email: "user@example.com", ip: "192.168.1.1" };
      const checkInitial = await checkRateLimit("LOGIN", params);

      expect(checkInitial.allowed).toBe(true);
      expect(checkInitial.remaining).toBe(5);
    });

    it("tracks remaining attempts when bucket exists within window", async () => {
      vi.mocked(prisma.rateLimitBucket.findUnique).mockResolvedValue({
        id: "bucket-1",
        keyHash: "hash-1",
        action: "LOGIN",
        windowStart: new Date(),
        attemptCount: 2,
        lockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const params = { email: "user@example.com", ip: "192.168.1.1" };
      const check = await checkRateLimit("LOGIN", params);

      expect(check.allowed).toBe(true);
      expect(check.remaining).toBe(3);
    });

    it("locks out user when lockedUntil timestamp is in the future", async () => {
      const futureLock = new Date(Date.now() + 10 * 60 * 1000);
      vi.mocked(prisma.rateLimitBucket.findUnique).mockResolvedValue({
        id: "bucket-2",
        keyHash: "hash-2",
        action: "LOGIN",
        windowStart: new Date(),
        attemptCount: 5,
        lockedUntil: futureLock,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const params = { email: "target@example.com", ip: "192.168.1.100" };
      const check = await checkRateLimit("LOGIN", params);

      expect(check.allowed).toBe(false);
      expect(check.remaining).toBe(0);
      expect(check.retryAfterSeconds).toBeGreaterThan(0);
      expect(check.error).toContain("Rate limit exceeded");
    });

    it("records atomic failed attempt and locks out after reaching 5 attempts", async () => {
      const futureLock = new Date(Date.now() + 15 * 60 * 1000);
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          attemptCount: 5,
          windowStart: new Date(),
          lockedUntil: futureLock,
        },
      ] as any);

      const params = { email: "target@example.com", ip: "192.168.1.100" };
      const record = await recordFailedAttempt("LOGIN", params);

      expect(record.allowed).toBe(false);
      expect(record.remaining).toBe(0);
      expect(record.retryAfterSeconds).toBeGreaterThan(0);
      expect(record.error).toContain("Rate limit exceeded");
    });

    it("resets rate limit counter upon successful authentication by deleting bucket", async () => {
      vi.mocked(prisma.rateLimitBucket.deleteMany).mockResolvedValue({ count: 1 });

      const params = { email: "admin@example.com", ip: "192.168.1.2" };
      await recordSuccessfulAttempt("LOGIN", params);

      expect(prisma.rateLimitBucket.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            keyHash: expect.any(String),
          }),
        })
      );
    });
  });

  describe("3. Password Reset Rate Limiting (Spam & Email Flooding Defense)", () => {
    it("enforces 3-attempt limit for password reset requests", async () => {
      const futureLock = new Date(Date.now() + 15 * 60 * 1000);
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          attemptCount: 3,
          windowStart: new Date(),
          lockedUntil: futureLock,
        },
      ] as any);

      const params = { email: "reset@example.com", ip: "10.0.0.1" };
      const record = await recordFailedAttempt("PASSWORD_RESET", params);

      expect(record.allowed).toBe(false);
      expect(record.error).toContain("Rate limit exceeded");
    });
  });

  describe("4. Registration & Staff Activation Rate Limits", () => {
    it("rate limits registration attempts per IP", async () => {
      const futureLock = new Date(Date.now() + 60 * 60 * 1000);
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          attemptCount: 10,
          windowStart: new Date(),
          lockedUntil: futureLock,
        },
      ] as any);

      const params = { ip: "172.16.0.5" };
      const record = await recordFailedAttempt("REGISTER", params);

      expect(record.allowed).toBe(false);
    });

    it("locks out activation attempts after 5 consecutive failures", async () => {
      const futureLock = new Date(Date.now() + 15 * 60 * 1000);
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          attemptCount: 5,
          windowStart: new Date(),
          lockedUntil: futureLock,
        },
      ] as any);

      const params = { token: "token-xyz-123", ip: "10.0.0.50" };
      const record = await recordFailedAttempt("ACTIVATION", params);

      expect(record.allowed).toBe(false);
    });
  });

  describe("5. Client IP Extraction & Anti-Spoofing", () => {
    it("extracts primary client IP from x-forwarded-for header with multiple proxies", () => {
      const headers = new Headers({
        "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178",
      });
      expect(extractClientIp(headers)).toBe("203.0.113.195");
    });

    it("extracts valid IPv6 address from x-real-ip header", () => {
      const headers = new Headers({
        "x-real-ip": "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
      });
      expect(extractClientIp(headers)).toBe("2001:0db8:85a3:0000:0000:8a2e:0370:7334");
    });

    it("prioritizes cf-connecting-ip over x-forwarded-for to prevent proxy spoofing", () => {
      const headers = new Headers({
        "cf-connecting-ip": "198.51.100.22",
        "x-forwarded-for": "10.0.0.1, 10.0.0.2",
      });
      expect(extractClientIp(headers)).toBe("198.51.100.22");
    });

    it("rejects malformed and spoofed header values and safely falls back to 127.0.0.1", () => {
      const headers = new Headers({
        "x-forwarded-for": "invalid-ip-injection; DROP TABLE rate_limits",
      });
      expect(extractClientIp(headers)).toBe("127.0.0.1");
    });

    it("falls back to 127.0.0.1 when no IP headers are present", () => {
      const headers = new Headers({});
      expect(extractClientIp(headers)).toBe("127.0.0.1");
    });
  });

  describe("6. Fail-Safe & DB Error Degradation", () => {
    it("gracefully handles read-check database errors without throwing uncaught exceptions", async () => {
      vi.mocked(prisma.rateLimitBucket.findUnique).mockRejectedValue(new Error("DB connection timeout"));

      const result = await checkRateLimit("LOGIN", { email: "user@test.com", ip: "1.2.3.4" });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5);
    });

    it("gracefully handles failed attempt recording errors without throwing uncaught exceptions", async () => {
      vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("DB connection pool exhausted"));

      const result = await recordFailedAttempt("LOGIN", { email: "user@test.com", ip: "1.2.3.4" });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });
  });

  describe("7. Password Security & Length Validation", () => {
    it("accepts valid passwords between 8 and 128 characters", () => {
      expect(LoginSchema.safeParse({ email: "user@test.com", password: "ValidPassword123!" }).success).toBe(true);
      expect(CandidateRegisterSchema.safeParse({
        email: "cand@test.com",
        password: "ValidPassword123!",
        firstName: "Jane",
        lastName: "Doe",
      }).success).toBe(true);
      expect(ResetPasswordSchema.safeParse({
        password: "NewPassword123!",
        confirmPassword: "NewPassword123!",
      }).success).toBe(true);
      expect(ActivateStaffAccountSchema.safeParse({
        token: "valid-token-string",
        password: "StaffPassword123!",
        confirmPassword: "StaffPassword123!",
      }).success).toBe(true);
    });

    it("rejects passwords shorter than 8 characters", () => {
      expect(LoginSchema.safeParse({ email: "user@test.com", password: "short" }).success).toBe(false);
    });

    it("rejects oversized passwords exceeding 128 characters to prevent DoS", () => {
      const oversized = "A".repeat(129);
      expect(LoginSchema.safeParse({ email: "user@test.com", password: oversized }).success).toBe(false);
    });
  });
});
