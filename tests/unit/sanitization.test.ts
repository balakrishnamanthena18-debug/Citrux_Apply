import { describe, it, expect } from "vitest";
import {
  sanitizeHtml,
  sanitizeString,
  sanitizeFilename,
  sanitizeRedirectUrl,
  sanitizePaginationLimit,
  sanitizeObject,
} from "@/lib/utils/sanitization";

describe("Input Validation & Sanitization (tests/unit/sanitization.test.ts)", () => {
  describe("1. Script Injection & XSS Prevention (sanitizeHtml)", () => {
    it("escapes dangerous HTML characters", () => {
      const payload = `<script>alert('XSS')</script><img src="x" onerror="steal()"/>`;
      const sanitized = sanitizeHtml(payload);

      expect(sanitized).not.toContain("<script>");
      expect(sanitized).not.toContain("</script>");
      expect(sanitized).toContain("&lt;script&gt;");
      expect(sanitized).toContain("&lt;img src=&quot;x&quot;");
      expect(sanitized).toContain("&#x27;XSS&#x27;");
    });

    it("handles null, undefined, and non-string inputs safely", () => {
      expect(sanitizeHtml(null)).toBe("");
      expect(sanitizeHtml(undefined)).toBe("");
      expect(sanitizeHtml("" as any)).toBe("");
    });
  });

  describe("2. String Sanitization & Control Character Stripping (sanitizeString)", () => {
    it("strips null bytes and non-printable control characters", () => {
      const input = "clean text\0with null bytes\x07and bell\x1B[31mcolors";
      const cleaned = sanitizeString(input, 100);

      expect(cleaned).not.toContain("\0");
      expect(cleaned).not.toContain("\x07");
      expect(cleaned).toBe("clean textwith null bytesand bell[31mcolors");
    });

    it("enforces maximum length bounds", () => {
      const longInput = "a".repeat(100);
      const bounded = sanitizeString(longInput, 10);
      expect(bounded).toHaveLength(10);
    });
  });

  describe("3. Path Traversal & Unsafe Upload Defense (sanitizeFilename)", () => {
    it("strips directory separators, parent traversal sequences, and null bytes", () => {
      expect(sanitizeFilename("../../../etc/passwd")).toBe("passwd");
      expect(sanitizeFilename("..\\..\\windows\\system32\\cmd.exe")).toBe("cmd.exe");
      expect(sanitizeFilename("resume.pdf\0.exe")).toBe("resume.pdf.exe");
      expect(sanitizeFilename("/var/log/app.log")).toBe("app.log");
    });

    it("replaces special/unsafe characters with underscores", () => {
      expect(sanitizeFilename("my resume (v1) [final] <copy> & test.pdf")).toBe(
        "my_resume__v1___final___copy____test.pdf"
      );
    });

    it("ensures dotfiles or empty strings receive a safe default filename", () => {
      expect(sanitizeFilename(".env")).toBe("file_env");
      expect(sanitizeFilename("..")).toBe("file_doc");
      expect(sanitizeFilename("")).toBe("document");
      expect(sanitizeFilename(null)).toBe("document");
    });
  });

  describe("4. Open Redirect Prevention (sanitizeRedirectUrl)", () => {
    it("allows safe relative application paths", () => {
      expect(sanitizeRedirectUrl("/candidate")).toBe("/candidate");
      expect(sanitizeRedirectUrl("/employee/applications/123")).toBe("/employee/applications/123");
      expect(sanitizeRedirectUrl("/admin/dashboard?tab=security")).toBe("/admin/dashboard?tab=security");
    });

    it("rejects protocol-relative and external domain URLs", () => {
      expect(sanitizeRedirectUrl("//evil.com")).toBe("/");
      expect(sanitizeRedirectUrl("https://evil.com/phishing")).toBe("/");
      expect(sanitizeRedirectUrl("http://malicious.org")).toBe("/");
      expect(sanitizeRedirectUrl("/\\evil.com")).toBe("/");
    });

    it("rejects javascript: and data: schemes", () => {
      expect(sanitizeRedirectUrl("javascript:alert(1)")).toBe("/");
      expect(sanitizeRedirectUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe("/");
    });

    it("falls back to custom default when provided", () => {
      expect(sanitizeRedirectUrl("https://attacker.com", "/dashboard")).toBe("/dashboard");
      expect(sanitizeRedirectUrl(null, "/login")).toBe("/login");
    });
  });

  describe("5. Query Parameter & Pagination Bounding (sanitizePaginationLimit)", () => {
    it("bounds pagination limits within safe ranges [1, maxLimit]", () => {
      expect(sanitizePaginationLimit("25", 15, 100)).toBe(25);
      expect(sanitizePaginationLimit("999999", 15, 100)).toBe(100);
      expect(sanitizePaginationLimit("-10", 15, 100)).toBe(15);
      expect(sanitizePaginationLimit("invalid_string", 15, 100)).toBe(15);
      expect(sanitizePaginationLimit(null, 15, 100)).toBe(15);
    });
  });

  describe("6. Metadata & Secret Redaction (sanitizeObject)", () => {
    it("redacts sensitive keys in deeply nested objects", () => {
      const payload = {
        name: "test",
        password: "secret_password",
        nested: {
          apiKey: "sk_live_12345",
          token: "jwt-token",
          publicData: "visible",
        },
      };

      const result = sanitizeObject(payload);
      expect(result?.name).toBe("test");
      expect(result?.password).toBe("[REDACTED]");
      expect((result?.nested as any)?.apiKey).toBe("[REDACTED]");
      expect((result?.nested as any)?.token).toBe("[REDACTED]");
      expect((result?.nested as any)?.publicData).toBe("visible");
    });
  });
});
