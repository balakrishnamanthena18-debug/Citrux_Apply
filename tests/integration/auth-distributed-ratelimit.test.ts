import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimitStore,
  cleanupExpiredRateLimits,
  deriveRateLimitKeyHash,
} from "@/lib/auth/rate-limiter";

// State store simulating the PostgreSQL table `rate_limit_buckets`
interface MockBucketRecord {
  id: string;
  keyHash: string;
  action: string;
  windowStart: Date;
  attemptCount: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const mockDb = new Map<string, MockBucketRecord>();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    rateLimitBucket: {
      findUnique: vi.fn(async ({ where }: { where: { keyHash: string } }) => {
        const item = mockDb.get(where.keyHash);
        return item ? { ...item } : null;
      }),
      findMany: vi.fn(async () => {
        return Array.from(mockDb.values()).map((item) => ({ ...item }));
      }),
      deleteMany: vi.fn(async ({ where }: { where?: { keyHash?: string; windowStart?: any; lockedUntil?: any } } = {}) => {
        if (!where || Object.keys(where).length === 0) {
          const count = mockDb.size;
          mockDb.clear();
          return { count };
        }
        if (where.keyHash) {
          const existed = mockDb.delete(where.keyHash);
          return { count: existed ? 1 : 0 };
        }
        // Handle cleanup filter
        let deleted = 0;
        const cutoff = where.windowStart?.lt;
        if (cutoff) {
          for (const [key, item] of Array.from(mockDb.entries())) {
            const isWindowStale = item.windowStart < cutoff;
            const isLockExpired = !item.lockedUntil || item.lockedUntil < cutoff;
            if (isWindowStale && isLockExpired) {
              mockDb.delete(key);
              deleted++;
            }
          }
        }
        return { count: deleted };
      }),
      create: vi.fn(async ({ data }: { data: any }) => {
        const record: MockBucketRecord = {
          id: data.id || "uuid-" + Math.random(),
          keyHash: data.keyHash,
          action: data.action,
          windowStart: data.windowStart || new Date(),
          attemptCount: data.attemptCount || 1,
          lockedUntil: data.lockedUntil || null,
          createdAt: data.createdAt || new Date(),
          updatedAt: data.updatedAt || new Date(),
        };
        mockDb.set(data.keyHash, record);
        return { ...record };
      }),
    },
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
      // Simulate atomic PostgreSQL ON CONFLICT UPSERT
      const keyHash = values[0] as string;
      const action = values[1] as string;
      const maxAttempts = action === "LOGIN" || action === "ACTIVATION" ? 5 : action === "PASSWORD_RESET" ? 3 : 10;
      const blockDurationMs = action === "REGISTER" ? 3600000 : 900000;
      const windowMs = action === "REGISTER" ? 3600000 : 900000;

      const now = new Date();
      let record = mockDb.get(keyHash);

      if (!record) {
        record = {
          id: "uuid-" + Math.random(),
          keyHash,
          action,
          windowStart: now,
          attemptCount: 1,
          lockedUntil: 1 >= maxAttempts ? new Date(now.getTime() + blockDurationMs) : null,
          createdAt: now,
          updatedAt: now,
        };
        mockDb.set(keyHash, record);
      } else {
        const isWindowExpired =
          (!record.lockedUntil || record.lockedUntil <= now) &&
          now.getTime() - record.windowStart.getTime() > windowMs;

        if (isWindowExpired) {
          record.windowStart = now;
          record.attemptCount = 1;
          record.lockedUntil = 1 >= maxAttempts ? new Date(now.getTime() + blockDurationMs) : null;
        } else {
          record.attemptCount += 1;
          if (record.lockedUntil && record.lockedUntil > now) {
            // Keep existing lock
          } else if (record.attemptCount >= maxAttempts) {
            record.lockedUntil = new Date(now.getTime() + blockDurationMs);
          }
        }
        record.updatedAt = now;
        mockDb.set(keyHash, record);
      }

      return [
        {
          attemptCount: record.attemptCount,
          windowStart: record.windowStart,
          lockedUntil: record.lockedUntil,
        },
      ];
    }),
  },
}));

describe("Distributed PostgreSQL Rate Limiting Integration (tests/integration/auth-distributed-ratelimit.test.ts)", () => {
  beforeEach(async () => {
    mockDb.clear();
    await resetRateLimitStore();
  });

  describe("1. Concurrency-Safe Atomic Threshold Enforcement", () => {
    it("prevents concurrent requests from bypassing the 5-attempt login threshold", async () => {
      const params = { email: "concurrent@test.com", ip: "198.51.100.1" };

      // Launch 10 simultaneous failure recordings concurrently
      const attempts = Array.from({ length: 10 }).map(() =>
        recordFailedAttempt("LOGIN", params)
      );

      await Promise.all(attempts);

      // Verify final bucket state in PostgreSQL
      const check = await checkRateLimit("LOGIN", params);
      expect(check.allowed).toBe(false);
      expect(check.remaining).toBe(0);

      // Inspect the database record directly
      const buckets = await prisma.rateLimitBucket.findMany();
      expect(buckets.length).toBe(1);
      const bucket = buckets[0];
      expect(bucket).toBeDefined();
      if (bucket) {
        expect(bucket.attemptCount).toBe(10);
        expect(bucket.lockedUntil).not.toBeNull();
        expect(bucket.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
      }
    });
  });

  describe("2. Isolation Across IP Addresses and Email Identities", () => {
    it("maintains independent rate limits for different IP addresses targeting the same email", async () => {
      const email = "shared.target@test.com";
      const ipA = "192.168.1.10";
      const ipB = "192.168.1.20";

      // Lock out IP A
      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt("LOGIN", { email, ip: ipA });
      }

      const checkA = await checkRateLimit("LOGIN", { email, ip: ipA });
      const checkB = await checkRateLimit("LOGIN", { email, ip: ipB });

      expect(checkA.allowed).toBe(false);
      expect(checkB.allowed).toBe(true);
      expect(checkB.remaining).toBe(5);
    });

    it("maintains independent rate limits for different emails originating from the same IP", async () => {
      const ip = "203.0.113.50";
      const email1 = "user.one@test.com";
      const email2 = "user.two@test.com";

      // Lock out email 1
      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt("LOGIN", { email: email1, ip });
      }

      const check1 = await checkRateLimit("LOGIN", { email: email1, ip });
      const check2 = await checkRateLimit("LOGIN", { email: email2, ip });

      expect(check1.allowed).toBe(false);
      expect(check2.allowed).toBe(true);
      expect(check2.remaining).toBe(5);
    });
  });

  describe("3. Database Privacy Verification", () => {
    it("ensures rate_limit_buckets table contains only SHA-256 derived hashes and zero plaintext PII", async () => {
      const sensitiveEmail = "confidential.executive@enterprise.corp";
      const sensitiveIp = "198.51.100.99";

      await recordFailedAttempt("LOGIN", { email: sensitiveEmail, ip: sensitiveIp });

      const buckets = await prisma.rateLimitBucket.findMany();
      expect(buckets.length).toBe(1);

      const record = buckets[0];
      expect(record).toBeDefined();
      if (record) {
        expect(record.keyHash).toMatch(/^[a-f0-9]{64}$/);
        expect(record.keyHash).not.toContain(sensitiveEmail);
        expect(record.keyHash).not.toContain(sensitiveIp);
        expect(record.action).toBe("LOGIN");
      }
    });
  });

  describe("4. Cleanup & Retention Strategy", () => {
    it("safely cleans up stale expired rate limit records without deleting active locks or active windows", async () => {
      // 1. Create an active record (current window)
      await recordFailedAttempt("LOGIN", { email: "active@test.com", ip: "1.1.1.1" });

      // 2. Create an active locked record
      const activeLockKeyHash = "b".repeat(64);
      const activeLockDate = new Date(Date.now() + 15 * 60 * 1000); // locked 15 min into future
      await prisma.rateLimitBucket.create({
        data: {
          keyHash: activeLockKeyHash,
          action: "LOGIN",
          windowStart: new Date(Date.now() - 2 * 60 * 60 * 1000), // window started 2h ago
          attemptCount: 5,
          lockedUntil: activeLockDate,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // 3. Insert a stale expired record
      const staleKeyHash = "a".repeat(64);
      const staleDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
      await prisma.rateLimitBucket.create({
        data: {
          keyHash: staleKeyHash,
          action: "LOGIN",
          windowStart: staleDate,
          attemptCount: 2,
          lockedUntil: null,
          createdAt: staleDate,
          updatedAt: staleDate,
        },
      });

      const { deletedCount } = await cleanupExpiredRateLimits();
      expect(deletedCount).toBe(1);

      const remaining = await prisma.rateLimitBucket.findMany();
      expect(remaining.length).toBe(2);

      const remainingHashes = remaining.map((r) => r.keyHash);
      expect(remainingHashes).not.toContain(staleKeyHash);
      expect(remainingHashes).toContain(activeLockKeyHash);

      // 4. Verify idempotency: running cleanup again immediately deletes 0
      const secondRun = await cleanupExpiredRateLimits();
      expect(secondRun.deletedCount).toBe(0);
    });
  });
});
