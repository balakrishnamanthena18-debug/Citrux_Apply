import { describe, it, expect, vi } from "vitest";
import { logger, sanitizeObject } from "@/lib/logger";

describe("Structured Logger & Sanitization (src/lib/logger/index.ts)", () => {
  it("automatically redacts sensitive keys in flat and nested objects", () => {
    const input = {
      username: "operator",
      password: "SuperSecretPassword123!",
      apiKey: "sk_live_123456789",
      SUPABASE_SERVICE_ROLE_KEY: "eyPrivilegedServiceRoleKey...",
      DATABASE_URL: "postgresql://user:pass@host:6543/db",
      nested: {
        token: "jwt-token-string",
        refreshToken: "refresh-token-string",
        safeField: "safe value",
      },
      tags: ["alpha", "beta"],
    };

    const sanitized = sanitizeObject(input) as Record<string, unknown>;

    expect(sanitized.username).toBe("operator");
    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.apiKey).toBe("[REDACTED]");
    expect(sanitized.SUPABASE_SERVICE_ROLE_KEY).toBe("[REDACTED]");
    expect(sanitized.DATABASE_URL).toBe("[REDACTED]");
    expect((sanitized.nested as Record<string, unknown>).token).toBe("[REDACTED]");
    expect((sanitized.nested as Record<string, unknown>).refreshToken).toBe("[REDACTED]");
    expect((sanitized.nested as Record<string, unknown>).safeField).toBe("safe value");
  });

  it("formats log entries as valid single-line JSON with ISO timestamps", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    logger.info("System startup initialized", { module: "bootstrap", secretKey: "leaked-secret" });

    expect(stdoutSpy).toHaveBeenCalled();
    const lastCallArg = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(lastCallArg.trim());

    expect(parsed.level).toBe("INFO");
    expect(parsed.message).toBe("System startup initialized");
    expect(parsed.timestamp).toBeDefined();
    expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
    expect(parsed.context.module).toBe("bootstrap");
    expect(parsed.context.secretKey).toBe("[REDACTED]");

    stdoutSpy.mockRestore();
  });
});
