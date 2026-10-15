import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  stripHtmlAndScripts,
  sanitizeDisplayName,
  containsHtmlOrScripts,
} from "@/lib/validation/sanitize";
import {
  LoginSchema,
  CandidateRegisterSchema,
  passwordField,
  emailField,
  usernameField,
  firstNameField,
  lastNameField,
  GENERIC_LOGIN_VALIDATION_ERROR,
  GENERIC_SIGNUP_VALIDATION_ERROR,
} from "@/lib/validation/auth.schemas";
import { signInAction, signUpCandidateAction } from "@/lib/auth/actions";
import { POST as loginRouteHandler } from "@/app/api/auth/login/route";
import { POST as signupRouteHandler } from "@/app/api/auth/signup/route";
import { POST as registerRouteHandler } from "@/app/api/auth/register/route";
import { NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { createServerClient } from "@/lib/supabase/server";

// Mock dependencies
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

describe("CareerButton Authentication Input Validation & Security Review", () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(logger, "warn").mockImplementation(() => {});

    mockSupabase = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { user: { id: "test-user-id", email: "user@example.com" } },
          error: null,
        }),
        signUp: vi.fn().mockResolvedValue({
          data: { user: { id: "test-new-user-id", email: "candidate@example.com" } },
          error: null,
        }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    };
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase);
  });

  describe("1. Password Integrity & Preservation", () => {
    it("never strips HTML, whitespace, quotes, braces, backslashes, or symbols from passwords", () => {
      const complexPasswords = [
        "Pass Word 123!", // Contains spaces
        "P@ss<script>123!", // Contains <script> characters
        "P@ss>word123!", // Contains >
        'P@ss"Quote"123!', // Contains double quotes
        "P@ss'Single'123!", // Contains single quotes
        "P@ss\\Backslash\\123!", // Contains backslashes
        "P@ss{Braces}123!", // Contains braces
        "P@ss[Brackets]123!", // Contains brackets
        "P@ss&And&123!", // Contains ampersand
        "P@ss;Semicolon;123!", // Contains semicolon
        "Correct Horse Battery Staple 2026!", // Legitimate passphrase with spaces
      ];

      for (const pass of complexPasswords) {
        const parsed = passwordField.safeParse(pass);
        expect(parsed.success).toBe(true);
        if (parsed.success) {
          // Absolute character-for-character equality: MUST NOT be transformed or stripped
          expect(parsed.data).toBe(pass);
        }
      }
    });

    it("verifies the exact unmodified password reaches Supabase Auth on signInAction", async () => {
      const untransformedPassword = "P@ss<script>\"'{}\\123! with spaces";
      const formData = new FormData();
      formData.append("email", "candidate@example.com");
      formData.append("password", untransformedPassword);

      await signInAction(formData);

      // Verify Supabase Auth received the EXACT string without any characters stripped or altered
      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith(
        expect.objectContaining({
          password: untransformedPassword,
        })
      );
    });

    it("rejects passwords shorter than 8 characters or longer than 128 characters without mutating", () => {
      expect(passwordField.safeParse("1234567").success).toBe(false);
      expect(passwordField.safeParse("a".repeat(129)).success).toBe(false);
    });

    it("rejects passwords containing null bytes to prevent database driver scan crashes", () => {
      expect(passwordField.safeParse("P@ssword123!\0").success).toBe(false);
    });
  });

  describe("2. Input Validation Without Silent Mutation & International Names", () => {
    it("rejects email containing HTML or script tags instead of silently stripping them", () => {
      // If someone types admin<script>@example.com, it must FAIL validation, NOT mutate into admin@example.com
      const maliciousEmail = "admin<script>@example.com";
      const parsed = emailField.safeParse(maliciousEmail);
      expect(parsed.success).toBe(false);
    });

    it("rejects username containing HTML or invalid characters instead of silently mutating", () => {
      const maliciousUsername = "user<script>name";
      const parsed = usernameField.safeParse(maliciousUsername);
      expect(parsed.success).toBe(false);
    });

    it("accepts valid alphanumeric, period, dash, and underscore usernames", () => {
      expect(usernameField.safeParse("john.doe_123-ops").success).toBe(true);
    });

    it("preserves legitimate international names and punctuation", () => {
      const internationalNames = [
        "O'Connor", // Irish apostrophe
        "D'Souza", // Portuguese/Goan apostrophe
        "René", // French acute accent
        "Müller", // German umlaut
        "Sørensen", // Nordic character
        "北京", // CJK characters
        "Al-Mansoor", // Arabic hyphenated transliteration
        "Jean-Luc", // French hyphenated
        "María José", // Spanish multi-word with accent
        "N'Dour", // West African apostrophe
        "St. John", // Period in name
      ];

      for (const name of internationalNames) {
        const parsedFirst = firstNameField.safeParse(name);
        expect(parsedFirst.success).toBe(true);
        if (parsedFirst.success) {
          expect(parsedFirst.data).toBe(name);
        }

        const parsedLast = lastNameField.safeParse(name);
        expect(parsedLast.success).toBe(true);
        if (parsedLast.success) {
          expect(parsedLast.data).toBe(name);
        }
      }
    });

    it("rejects names with HTML tags or angle brackets without corrupting them", () => {
      expect(firstNameField.safeParse("Jane<script>alert(1)</script>").success).toBe(false);
      expect(lastNameField.safeParse("<b>Doe</b>").success).toBe(false);
    });
  });

  describe("3. Generic Error Masking & Monitoring Logs", () => {
    it("signInAction returns generic error without leaking which field failed", async () => {
      const formData = new FormData();
      formData.append("email", "invalid-email");
      formData.append("password", "short");

      const result = await signInAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe(GENERIC_LOGIN_VALIDATION_ERROR);
      expect(result.error).not.toContain("email");
      expect(result.error).not.toContain("password");

      // Verify server-side logging occurred
      expect(logger.warn).toHaveBeenCalledWith(
        "[AUTH_VALIDATION_FAILURE] Login input validation rejected",
        expect.objectContaining({
          endpoint: "signInAction",
          ip: "127.0.0.1",
        })
      );
    });

    it("server logs never contain plaintext passwords or sensitive credentials", async () => {
      const sensitivePassword = "SuperSecretPassword123!";
      const formData = new FormData();
      formData.append("email", "invalid-email-format");
      formData.append("password", sensitivePassword);

      await signInAction(formData);

      const logCalls = vi.mocked(logger.warn).mock.calls;
      const allLogOutput = JSON.stringify(logCalls);

      expect(allLogOutput).not.toContain(sensitivePassword);
    });
  });

  describe("4. Route Handlers: Payload Limits & Malformed Inputs", () => {
    it("POST /api/auth/login rejects payloads exceeding 64KB with 413 Payload Too Large", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "65537", // 64KB + 1
        },
        body: JSON.stringify({ email: "user@example.com", password: "password123" }),
      });

      const res = await loginRouteHandler(req);
      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.error).toBe("Payload too large");
    });

    it("POST /api/auth/signup rejects payloads exceeding 64KB with 413 Payload Too Large", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/signup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "100000",
        },
        body: JSON.stringify({ email: "user@example.com", password: "password123" }),
      });

      const res = await signupRouteHandler(req);
      expect(res.status).toBe(413);
    });

    it("POST /api/auth/login handles malformed JSON cleanly with 400", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "invalid-json{",
      });

      const res = await loginRouteHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe(GENERIC_LOGIN_VALIDATION_ERROR);
    });

    it("POST /api/auth/register delegates directly to signup route handler and processes requests", async () => {
      expect(registerRouteHandler).toBe(signupRouteHandler);

      const req = new NextRequest("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "100000",
        },
        body: JSON.stringify({ email: "user@example.com", password: "password123" }),
      });

      const res = await registerRouteHandler(req);
      expect(res.status).toBe(413);
    });
  });
});
