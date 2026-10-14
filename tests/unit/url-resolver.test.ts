import { describe, expect, it, vi } from "vitest";
import {
  resolveAppUrl,
  buildAppUrl,
  validateAppUrl,
  AppUrlConfigurationError,
} from "@/lib/url";

describe("Canonical Application URL Resolver (src/lib/url.ts)", () => {
  describe("1. Local Development & Test Environments", () => {
    it("defaults to http://localhost:3000 when no URL is configured in development", () => {
      const url = resolveAppUrl({
        env: {},
        nodeEnv: "development",
      });
      expect(url).toBe("http://localhost:3000");
    });

    it("defaults to http://localhost:3000 when no URL is configured in test", () => {
      const url = resolveAppUrl({
        env: {},
        nodeEnv: "test",
      });
      expect(url).toBe("http://localhost:3000");
    });

    it("respects explicitly configured NEXT_PUBLIC_APP_URL in development", () => {
      const url = resolveAppUrl({
        env: { NEXT_PUBLIC_APP_URL: "http://localhost:4000" },
        nodeEnv: "development",
      });
      expect(url).toBe("http://localhost:4000");
    });

    it("normalizes trailing slashes in development URL", () => {
      const url = resolveAppUrl({
        env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000/" },
        nodeEnv: "development",
      });
      expect(url).toBe("http://localhost:3000");
    });
  });

  describe("2. Production Resolution & Normalization", () => {
    const PROD_URL = "https://portal.careerbutton.in";

    it("resolves explicitly configured NEXT_PUBLIC_APP_URL in production", () => {
      const url = resolveAppUrl({
        env: { NEXT_PUBLIC_APP_URL: PROD_URL },
        nodeEnv: "production",
      });
      expect(url).toBe(PROD_URL);
    });

    it("resolves explicitly configured server-canonical APP_URL in production", () => {
      const url = resolveAppUrl({
        env: { APP_URL: PROD_URL },
        nodeEnv: "production",
      });
      expect(url).toBe(PROD_URL);
    });

    it("prefers server APP_URL over NEXT_PUBLIC_APP_URL when both are present", () => {
      const url = resolveAppUrl({
        env: {
          APP_URL: "https://portal.careerbutton.in",
          NEXT_PUBLIC_APP_URL: "https://secondary.careerbutton.in",
        },
        nodeEnv: "production",
      });
      expect(url).toBe("https://portal.careerbutton.in");
    });

    it("normalizes trailing slashes on production URL", () => {
      const withSingleSlash = resolveAppUrl({
        env: { NEXT_PUBLIC_APP_URL: "https://portal.careerbutton.in/" },
        nodeEnv: "production",
      });
      expect(withSingleSlash).toBe(PROD_URL);

      const withMultipleSlashes = resolveAppUrl({
        env: { NEXT_PUBLIC_APP_URL: "https://portal.careerbutton.in///" },
        nodeEnv: "production",
      });
      expect(withMultipleSlashes).toBe(PROD_URL);
    });
  });

  describe("3. Production Fail-Safe Enforcement & Hostname/Protocol Validation", () => {
    it("fails safely and throws AppUrlConfigurationError when production URL is missing", () => {
      expect(() =>
        resolveAppUrl({
          env: {},
          nodeEnv: "production",
        })
      ).toThrow(AppUrlConfigurationError);

      // Verify it does NOT silently return localhost
      try {
        resolveAppUrl({ env: {}, nodeEnv: "production" });
      } catch (err: any) {
        expect(err.message).toContain("Production application URL is not configured");
        expect(err.message).not.toContain("localhost:3000");
      }
    });

    it("fails safely when production URL is empty or whitespace", () => {
      expect(() =>
        resolveAppUrl({
          env: { NEXT_PUBLIC_APP_URL: "   " },
          nodeEnv: "production",
        })
      ).toThrow(AppUrlConfigurationError);
    });

    it("rejects non-HTTPS protocol in production", () => {
      expect(() =>
        resolveAppUrl({
          env: { NEXT_PUBLIC_APP_URL: "http://portal.careerbutton.in" },
          nodeEnv: "production",
        })
      ).toThrow(AppUrlConfigurationError);
    });

    it("rejects localhost in production", () => {
      expect(() =>
        resolveAppUrl({
          env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
          nodeEnv: "production",
        })
      ).toThrow(AppUrlConfigurationError);

      expect(() =>
        resolveAppUrl({
          env: { NEXT_PUBLIC_APP_URL: "https://localhost" },
          nodeEnv: "production",
        })
      ).toThrow(AppUrlConfigurationError);

      expect(() =>
        resolveAppUrl({
          env: { NEXT_PUBLIC_APP_URL: "https://127.0.0.1:3000" },
          nodeEnv: "production",
        })
      ).toThrow(AppUrlConfigurationError);
    });

    it("rejects private and link-local IPv4 hostnames in production", () => {
      expect(() =>
        resolveAppUrl({
          env: { NEXT_PUBLIC_APP_URL: "https://10.0.1.5" },
          nodeEnv: "production",
        })
      ).toThrow(AppUrlConfigurationError);

      expect(() =>
        resolveAppUrl({
          env: { NEXT_PUBLIC_APP_URL: "https://192.168.1.100" },
          nodeEnv: "production",
        })
      ).toThrow(AppUrlConfigurationError);

      expect(() =>
        resolveAppUrl({
          env: { NEXT_PUBLIC_APP_URL: "https://172.20.0.1" },
          nodeEnv: "production",
        })
      ).toThrow(AppUrlConfigurationError);
    });

    it("rejects invalid URL syntax", () => {
      expect(() =>
        resolveAppUrl({
          env: { NEXT_PUBLIC_APP_URL: "not-a-valid-url" },
          nodeEnv: "production",
        })
      ).toThrow(AppUrlConfigurationError);
    });
  });

  describe("4. buildAppUrl Path Construction", () => {
    it("builds candidate activation URL in production correctly", () => {
      const token = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
      const fullUrl = buildAppUrl(`/auth/activate?token=${token}`, {
        env: { NEXT_PUBLIC_APP_URL: "https://portal.careerbutton.in" },
        nodeEnv: "production",
      });
      expect(fullUrl).toBe(`https://portal.careerbutton.in/auth/activate?token=${token}`);
    });

    it("builds candidate activation URL in development correctly", () => {
      const token = "devtoken123";
      const fullUrl = buildAppUrl(`/auth/activate?token=${token}`, {
        env: {},
        nodeEnv: "development",
      });
      expect(fullUrl).toBe(`http://localhost:3000/auth/activate?token=${token}`);
    });

    it("normalizes paths lacking a leading slash", () => {
      const fullUrl = buildAppUrl("reset-password", {
        env: { NEXT_PUBLIC_APP_URL: "https://portal.careerbutton.in" },
        nodeEnv: "production",
      });
      expect(fullUrl).toBe("https://portal.careerbutton.in/reset-password");
    });

    it("normalizes paths with multiple leading slashes", () => {
      const fullUrl = buildAppUrl("///candidate/messages/conv-123", {
        env: { NEXT_PUBLIC_APP_URL: "https://portal.careerbutton.in" },
        nodeEnv: "production",
      });
      expect(fullUrl).toBe("https://portal.careerbutton.in/candidate/messages/conv-123");
    });

    it("preserves query strings and hashes without escaping or duplication", () => {
      const fullUrl = buildAppUrl("/login?next=/candidate/applications#section", {
        env: { NEXT_PUBLIC_APP_URL: "https://portal.careerbutton.in" },
        nodeEnv: "production",
      });
      expect(fullUrl).toBe(
        "https://portal.careerbutton.in/login?next=/candidate/applications#section"
      );
    });
  });

  describe("5. validateAppUrl helper function", () => {
    it("returns valid result for production HTTPS url", () => {
      const res = validateAppUrl("https://portal.careerbutton.in", "production");
      expect(res.isValid).toBe(true);
      expect(res.normalizedUrl).toBe("https://portal.careerbutton.in");
    });

    it("returns invalid result with explanation for HTTP in production", () => {
      const res = validateAppUrl("http://portal.careerbutton.in", "production");
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("must use HTTPS");
    });

    it("returns invalid result with explanation for localhost in production", () => {
      const res = validateAppUrl("https://localhost:3000", "production");
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("cannot resolve to localhost");
    });
  });
});
