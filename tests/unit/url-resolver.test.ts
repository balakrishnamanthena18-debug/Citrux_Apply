import { describe, expect, it } from "vitest";
import {
  resolveAppUrl,
  buildAppUrl,
  validateAppUrl,
  isAllowedRedirectUrl,
  sanitizeRedirectDestination,
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
    it("falls back to DEFAULT_PRODUCTION_APP_URL when production URL is missing", () => {
      const url = resolveAppUrl({
        env: {},
        nodeEnv: "production",
      });
      expect(url).toBe(DEFAULT_PRODUCTION_APP_URL);
      expect(url).not.toContain("localhost");
    });

    it("falls back to DEFAULT_PRODUCTION_APP_URL when production URL is empty or whitespace", () => {
      const url = resolveAppUrl({
        env: { NEXT_PUBLIC_APP_URL: "   " },
        nodeEnv: "production",
      });
      expect(url).toBe(DEFAULT_PRODUCTION_APP_URL);
      expect(url).not.toContain("localhost");
    });

    it("safely falls back to DEFAULT_PRODUCTION_APP_URL when localhost is passed in production", () => {
      const url1 = resolveAppUrl({
        env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
        nodeEnv: "production",
      });
      expect(url1).toBe(DEFAULT_PRODUCTION_APP_URL);
      expect(url1).not.toContain("localhost");

      const url2 = resolveAppUrl({
        env: { NEXT_PUBLIC_APP_URL: "https://127.0.0.1:3000" },
        nodeEnv: "production",
      });
      expect(url2).toBe(DEFAULT_PRODUCTION_APP_URL);
      expect(url2).not.toContain("127.0.0.1");
    });

    it("safely falls back when private IPv4 hostnames are passed in production", () => {
      const url = resolveAppUrl({
        env: { NEXT_PUBLIC_APP_URL: "https://10.0.1.5" },
        nodeEnv: "production",
      });
      expect(url).toBe(DEFAULT_PRODUCTION_APP_URL);
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
      expect(fullUrl).toBe("https://citrux-apply-mrgx.vercel.app/login?confirmed=true");
      expect(fullUrl).not.toContain("localhost");
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
});
