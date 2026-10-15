import { describe, expect, it } from "vitest";
import {
  resolveAppUrl,
  buildAppUrl,
  validateAppUrl,
  isAllowedRedirectUrl,
  sanitizeRedirectDestination,
  getTrustedOriginFromHost,
  DEFAULT_PRODUCTION_APP_URL,
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

  describe("3. Production Fallback & Localhost Rejection", () => {
    it("falls back to DEFAULT_PRODUCTION_APP_URL (https://portal.careerbutton.in) when production URL is missing", () => {
      const url = resolveAppUrl({
        env: {},
        nodeEnv: "production",
      });
      expect(url).toBe("https://portal.careerbutton.in");
      expect(url).toBe(DEFAULT_PRODUCTION_APP_URL);
      expect(url).not.toContain("localhost");
    });

    it("falls back to DEFAULT_PRODUCTION_APP_URL when production URL is empty or whitespace", () => {
      const url = resolveAppUrl({
        env: { NEXT_PUBLIC_APP_URL: "   " },
        nodeEnv: "production",
      });
      expect(url).toBe("https://portal.careerbutton.in");
      expect(url).toBe(DEFAULT_PRODUCTION_APP_URL);
      expect(url).not.toContain("localhost");
    });

    it("safely falls back to DEFAULT_PRODUCTION_APP_URL when localhost is passed in production", () => {
      const url1 = resolveAppUrl({
        env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
        nodeEnv: "production",
      });
      expect(url1).toBe("https://portal.careerbutton.in");
      expect(url1).toBe(DEFAULT_PRODUCTION_APP_URL);
      expect(url1).not.toContain("localhost");

      const url2 = resolveAppUrl({
        env: { NEXT_PUBLIC_APP_URL: "https://127.0.0.1:3000" },
        nodeEnv: "production",
      });
      expect(url2).toBe("https://portal.careerbutton.in");
      expect(url2).toBe(DEFAULT_PRODUCTION_APP_URL);
      expect(url2).not.toContain("127.0.0.1");
    });

    it("safely falls back when private IPv4 hostnames are passed in production", () => {
      const url = resolveAppUrl({
        env: { NEXT_PUBLIC_APP_URL: "https://10.0.1.5" },
        nodeEnv: "production",
      });
      expect(url).toBe("https://portal.careerbutton.in");
      expect(url).toBe(DEFAULT_PRODUCTION_APP_URL);
    });

    it("detects Vercel deployment (VERCEL=1) as production and prevents localhost fallback even if NODE_ENV is unset", () => {
      const url = resolveAppUrl({
        env: { VERCEL: "1" },
      });
      expect(url).toBe("https://portal.careerbutton.in");
      expect(url).not.toContain("localhost");
    });

    it("detects Vercel deployment (VERCEL=1) with invalid localhost NEXT_PUBLIC_APP_URL and falls back safely", () => {
      const url = resolveAppUrl({
        env: { VERCEL: "1", NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      });
      expect(url).toBe("https://portal.careerbutton.in");
      expect(url).not.toContain("localhost");
    });

    it("resolves approved requestOrigin from incoming request headers", () => {
      const url = resolveAppUrl({
        requestOrigin: "https://portal.careerbutton.in",
        nodeEnv: "production",
      });
      expect(url).toBe("https://portal.careerbutton.in");
    });

    it("ignores untrusted requestOrigin and falls back to production canonical URL", () => {
      const url = resolveAppUrl({
        requestOrigin: "https://malicious-attacker.com",
        nodeEnv: "production",
      });
      expect(url).toBe("https://portal.careerbutton.in");
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

    it("uses DEFAULT_PRODUCTION_APP_URL in production when env is unconfigured", () => {
      const fullUrl = buildAppUrl("/login?confirmed=true", {
        env: {},
        nodeEnv: "production",
      });
      expect(fullUrl).toBe("https://portal.careerbutton.in/login?confirmed=true");
      expect(fullUrl).not.toContain("localhost");
    });

    it("rewrites accidental absolute localhost URLs in production to the canonical production URL", () => {
      const fullUrl = buildAppUrl("http://localhost:3000/login?confirmed=true", {
        nodeEnv: "production",
      });
      expect(fullUrl).toBe("https://portal.careerbutton.in/login?confirmed=true");
      expect(fullUrl).not.toContain("localhost");
    });

    it("preserves valid absolute URLs matching approved origins in production", () => {
      const fullUrl = buildAppUrl("https://portal.careerbutton.in/login?confirmed=true", {
        nodeEnv: "production",
      });
      expect(fullUrl).toBe("https://portal.careerbutton.in/login?confirmed=true");
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

  describe("6. isAllowedRedirectUrl & sanitizeRedirectDestination", () => {
    it("allows relative paths", () => {
      expect(isAllowedRedirectUrl("/login?confirmed=true")).toBe(true);
      expect(isAllowedRedirectUrl("/candidate/applications")).toBe(true);
      expect(isAllowedRedirectUrl("/reset-password")).toBe(true);
    });

    it("allows approved production origins in production", () => {
      expect(isAllowedRedirectUrl("https://citrux-apply-mrgx.vercel.app/login", "production")).toBe(true);
      expect(isAllowedRedirectUrl("https://portal.careerbutton.in/candidate", "production")).toBe(true);
    });

    it("rejects untrusted third-party domains", () => {
      expect(isAllowedRedirectUrl("https://evil-attacker.com", "production")).toBe(false);
      expect(isAllowedRedirectUrl("https://evil-attacker.com/login", "production")).toBe(false);
      expect(isAllowedRedirectUrl("http://evil-attacker.com", "development")).toBe(false);
    });

    it("rejects open-redirect attack vectors (protocol-relative, javascript, backslashes)", () => {
      expect(isAllowedRedirectUrl("//evil.com")).toBe(false);
      expect(isAllowedRedirectUrl("/\\evil.com")).toBe(false);
      expect(isAllowedRedirectUrl("javascript:alert(1)")).toBe(false);
      expect(isAllowedRedirectUrl("/test\0path")).toBe(false);
    });

    it("rejects localhost URLs in production but allows them in development", () => {
      expect(isAllowedRedirectUrl("http://localhost:3000/login", "production")).toBe(false);
      expect(isAllowedRedirectUrl("http://localhost:3000/login", "development")).toBe(true);
      expect(isAllowedRedirectUrl("http://127.0.0.1:3000/login", "development")).toBe(true);
    });

    it("sanitizeRedirectDestination returns safe fallback when untrusted", () => {
      expect(sanitizeRedirectDestination("https://evil.com", "/login")).toBe("/login");
      expect(sanitizeRedirectDestination("//evil.com", "/login")).toBe("/login");
      expect(sanitizeRedirectDestination("/candidate", "/login")).toBe("/candidate");
    });
  });

  describe("7. getTrustedOriginFromHost explicit allowlist enforcement", () => {
    it("accepts valid canonical production domain portal.careerbutton.in", () => {
      const origin = getTrustedOriginFromHost("portal.careerbutton.in", "https", {
        nodeEnv: "production",
      });
      expect(origin).toBe("https://portal.careerbutton.in");
    });

    it("rejects untrusted/arbitrary host headers in production", () => {
      expect(
        getTrustedOriginFromHost("evil-phishing.com", "https", { nodeEnv: "production" })
      ).toBeUndefined();
      expect(
        getTrustedOriginFromHost("attacker.io", "https", { nodeEnv: "production" })
      ).toBeUndefined();
    });

    it("rejects localhost host headers in production", () => {
      expect(
        getTrustedOriginFromHost("localhost:3000", "http", { nodeEnv: "production" })
      ).toBeUndefined();
      expect(
        getTrustedOriginFromHost("127.0.0.1:3000", "http", { nodeEnv: "production" })
      ).toBeUndefined();
    });

    it("handles comma-separated multi-hop x-forwarded-host safely", () => {
      const origin = getTrustedOriginFromHost(
        "portal.careerbutton.in, proxy.internal",
        "https",
        { nodeEnv: "production" }
      );
      expect(origin).toBe("https://portal.careerbutton.in");
    });

    it("allows localhost host headers only in non-production", () => {
      const devOrigin = getTrustedOriginFromHost("localhost:3000", "http", {
        nodeEnv: "development",
      });
      expect(devOrigin).toBe("http://localhost:3000");
    });
  });
});
