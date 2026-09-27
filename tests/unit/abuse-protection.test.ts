import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isKnownMaliciousBot,
  verifyAbuseProtection,
  checkAiGenerationRateLimit,
  createAbuseProtectionResponse,
} from "@/lib/security/abuse-protection";
import { prisma } from "@/lib/db/prisma";
import robots from "@/app/robots";

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

describe("Abuse Protection & Rate Limiting (tests/unit/abuse-protection.test.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Malicious Bot & Automated Scanner Detection", () => {
    it("detects known malicious scraper and security scanner user agents", () => {
      expect(isKnownMaliciousBot("sqlmap/1.5.2#stable")).toBe(true);
      expect(isKnownMaliciousBot("Mozilla/5.0 (compatible; Nikto/2.1.6)")).toBe(true);
      expect(isKnownMaliciousBot("masscan/1.0")).toBe(true);
      expect(isKnownMaliciousBot("Acunetix-Web-Vulnerability-Scanner")).toBe(true);
      expect(isKnownMaliciousBot("dirbuster 1.0")).toBe(true);
      expect(isKnownMaliciousBot("nmap scripting engine")).toBe(true);
      expect(isKnownMaliciousBot("gobuster v3.1.0")).toBe(true);
      expect(isKnownMaliciousBot("wpscan v3.8.20")).toBe(true);
    });

    it("allows legitimate browser user agents", () => {
      expect(
        isKnownMaliciousBot(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
      ).toBe(false);
      expect(
        isKnownMaliciousBot(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0"
        )
      ).toBe(false);
      expect(isKnownMaliciousBot(null)).toBe(false);
      expect(isKnownMaliciousBot(undefined)).toBe(false);
    });
  });

  describe("2. API Endpoint Rate Limiting", () => {
    it("allows API requests within the allowed threshold and sets X-RateLimit headers", async () => {
      vi.mocked(prisma.rateLimitBucket.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          attemptCount: 1,
          windowStart: new Date(),
          lockedUntil: null,
        },
      ] as any);

      const request = new Request("https://example.com/api/notifications", {
        headers: {
          "x-real-ip": "203.0.113.10",
          "user-agent": "Mozilla/5.0 Chrome/120.0.0.0",
        },
      });

      const result = await verifyAbuseProtection(request, {
        action: "API_REQUEST",
        userId: "user-uuid-1",
        endpoint: "notifications",
      });

      expect(result.allowed).toBe(true);
      expect(result.headers["X-RateLimit-Limit"]).toBe("120");
      expect(result.headers["X-RateLimit-Remaining"]).toBeDefined();
      expect(result.headers["X-RateLimit-Reset"]).toBe("60");
    });

    it("blocks abusive API requests exceeding threshold with 429 and Retry-After header", async () => {
      const futureLock = new Date(Date.now() + 60 * 1000);
      vi.mocked(prisma.rateLimitBucket.findUnique).mockResolvedValue({
        id: "bucket-api",
        keyHash: "key-hash",
        action: "API_REQUEST",
        windowStart: new Date(),
        attemptCount: 120,
        lockedUntil: futureLock,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const request = new Request("https://example.com/api/notifications", {
        headers: {
          "x-real-ip": "203.0.113.10",
          "user-agent": "Mozilla/5.0 Chrome/120.0.0.0",
        },
      });

      const result = await verifyAbuseProtection(request, {
        action: "API_REQUEST",
        userId: "user-uuid-1",
        endpoint: "notifications",
      });

      expect(result.allowed).toBe(false);
      expect(result.status).toBe(429);
      expect(result.headers["Retry-After"]).toBeDefined();
      expect(result.error).toContain("Rate limit exceeded");

      const response = createAbuseProtectionResponse(result);
      expect(response.status).toBe(429);
    });

    it("immediately blocks malicious bot user agents with 403 Forbidden", async () => {
      const request = new Request("https://example.com/api/notifications", {
        headers: {
          "x-real-ip": "203.0.113.50",
          "user-agent": "sqlmap/1.5-dev-xxxx",
        },
      });

      const result = await verifyAbuseProtection(request, {
        action: "API_REQUEST",
        endpoint: "notifications",
      });

      expect(result.allowed).toBe(false);
      expect(result.status).toBe(403);
      expect(result.error).toContain("Access denied");
    });
  });

  describe("3. AI Generation Rate Limiting", () => {
    it("allows AI generation requests under the policy threshold (10 attempts/min)", async () => {
      vi.mocked(prisma.rateLimitBucket.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          attemptCount: 1,
          windowStart: new Date(),
          lockedUntil: null,
        },
      ] as any);

      const result = await checkAiGenerationRateLimit({
        userId: "candidate-123",
        ip: "198.51.100.1",
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it("blocks excessive AI generation attempts once exhausted", async () => {
      const futureLock = new Date(Date.now() + 120 * 1000);
      vi.mocked(prisma.rateLimitBucket.findUnique).mockResolvedValue({
        id: "bucket-ai",
        keyHash: "key-ai-hash",
        action: "AI_GENERATION",
        windowStart: new Date(),
        attemptCount: 10,
        lockedUntil: futureLock,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await checkAiGenerationRateLimit({
        userId: "candidate-123",
        ip: "198.51.100.1",
      });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe("4. Anti-Scraping Robots.txt Policy", () => {
    it("disallows search and AI scraper bots from accessing sensitive internal routes", () => {
      const robotsConfig = robots();
      expect(robotsConfig.rules).toBeDefined();

      const generalRule = Array.isArray(robotsConfig.rules)
        ? robotsConfig.rules.find((r) => r.userAgent === "*")
        : robotsConfig.rules;

      expect(generalRule).toBeDefined();
      expect(generalRule?.disallow).toContain("/admin/");
      expect(generalRule?.disallow).toContain("/employee/");
      expect(generalRule?.disallow).toContain("/candidate/");
      expect(generalRule?.disallow).toContain("/api/");

      // Check aggressive commercial / AI scrapers
      const scraperRule = Array.isArray(robotsConfig.rules)
        ? robotsConfig.rules.find((r) => Array.isArray(r.userAgent) && r.userAgent.includes("GPTBot"))
        : undefined;

      expect(scraperRule).toBeDefined();
      expect(scraperRule?.disallow).toContain("/");
    });
  });
});
