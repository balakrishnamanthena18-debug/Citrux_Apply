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

  it("formats security alert logs with enriched event metadata and sanitization", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    logger.security("SUSPICIOUS_BRUTE_FORCE_ATTEMPT", {
      ip: "198.51.100.99",
      targetEmail: "victim@example.com",
      secretToken: "forbidden-token",
    });

    expect(stderrSpy).toHaveBeenCalled();
    const lastCallArg = stderrSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(lastCallArg.trim());

    expect(parsed.level).toBe("WARN");
    expect(parsed.message).toContain("[SECURITY_ALERT] SUSPICIOUS_BRUTE_FORCE_ATTEMPT");
    expect(parsed.context.event).toBe("SECURITY_ALERT");
    expect(parsed.context.alertType).toBe("SUSPICIOUS_BRUTE_FORCE_ATTEMPT");
    expect(parsed.context.ip).toBe("198.51.100.99");
    expect(parsed.context.secretToken).toBe("[REDACTED]");

    stderrSpy.mockRestore();
  });

  it("formats API error logs with endpoint and error message", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    logger.apiError("/api/notifications", new Error("Database query timeout"), {
      userId: "user-123",
      dbPassword: "secret-password",
    });

    expect(stderrSpy).toHaveBeenCalled();
    const lastCallArg = stderrSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(lastCallArg.trim());

    expect(parsed.level).toBe("ERROR");
    expect(parsed.message).toContain("[API_ERROR] /api/notifications: Database query timeout");
    expect(parsed.context.endpoint).toBe("/api/notifications");
    expect(parsed.context.error).toBe("Database query timeout");
    expect(parsed.context.dbPassword).toBe("[REDACTED]");

    stderrSpy.mockRestore();
  });
});
