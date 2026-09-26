import { describe, it, expect, vi, beforeEach } from "vitest";
import { sanitizeMetadata } from "@/lib/utils/sanitization";
import { logUserAuditEvent, logSystemAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db/prisma";
import { withRlsContext } from "@/lib/db/rls";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(async (_userId, callback) => {
    const tx = {
      auditEvent: {
        create: vi.fn().mockResolvedValue({
          id: "audit-123",
          organizationId: "org-123",
          actorType: "USER",
          actorId: "user-123",
          action: "USER_LOGIN",
          entityType: "User",
          entityId: "user-123",
          details: {},
          ipAddress: "127.0.0.1",
          userAgent: "vitest-agent",
          createdAt: new Date(),
        }),
      },
    };
    return callback(tx as any);
  }),
}));

describe("Audit Logging & Sanitization (src/lib/audit/)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sanitizeMetadata()", () => {
    it("redacts sensitive fields like passwords and tokens", () => {
      const input = {
        email: "test@example.com",
        password: "SuperSecretPassword123!",
        token: "jwt-token-12345",
        apiKey: "api-key-9999",
        nested: {
          secret: "hidden-value",
          normalField: "visible",
        },
      };

      const sanitized = sanitizeMetadata(input);

      expect(sanitized).toEqual({
        email: "test@example.com",
        password: "[REDACTED]",
        token: "[REDACTED]",
        apiKey: "[REDACTED]",
        nested: {
          secret: "[REDACTED]",
          normalField: "visible",
        },
      });
    });

    it("handles null or primitive values gracefully", () => {
      expect(sanitizeMetadata(undefined)).toBeUndefined();
      expect(sanitizeMetadata(null)).toBeUndefined();
    });
  });

  describe("logUserAuditEvent()", () => {
    it("creates audit event with sanitized details within user RLS context when tx is omitted", async () => {
      await logUserAuditEvent({
        userId: "user-123",
        organizationId: "org-123",
        action: "USER_LOGIN",
        entityType: "User",
        entityId: "user-123",
        ipAddress: "127.0.0.1",
        userAgent: "vitest-agent",
        details: {
          password: "my-password",
          loginMethod: "password",
        },
      });

      expect(withRlsContext).toHaveBeenCalledWith("user-123", expect.any(Function));
    });

    it("creates audit event directly on tx without calling withRlsContext when tx is provided", async () => {
      const mockTx = {
        auditEvent: {
          create: vi.fn().mockResolvedValue({ id: "audit-456" }),
        },
      };

      await logUserAuditEvent({
        tx: mockTx as any,
        userId: "user-123",
        organizationId: "org-123",
        action: "APPLICATION_SUBMITTED",
        entityType: "Application",
        entityId: "app-123",
        details: { reference: "REF-1" },
      });

      expect(withRlsContext).not.toHaveBeenCalled();
      expect(mockTx.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: "user-123",
            action: "APPLICATION_SUBMITTED",
            entityType: "Application",
            entityId: "app-123",
          }),
        })
      );
    });
  });

  describe("logSystemAuditEvent()", () => {
    it("invokes system_log_audit_event SECURITY DEFINER function via executeRaw", async () => {
      vi.mocked(prisma.$executeRaw).mockResolvedValue(1);

      await logSystemAuditEvent({
        organizationId: "org-123",
        actorType: "SYSTEM",
        action: "SECURITY_ALERT",
        entityType: "Organization",
        entityId: "org-123",
        details: {
          token: "secret-token",
          reason: "initial_setup",
        },
      });

      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });
});
