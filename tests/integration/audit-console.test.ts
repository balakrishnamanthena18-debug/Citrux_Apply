import { describe, it, expect, vi, beforeEach } from "vitest";
import { listAuditLogsAction, exportAuditLogsAction } from "@/lib/admin/actions";
import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { Role, MembershipStatus, AuditAction } from "@/generated/prisma";
import { AuthorizationError } from "@/lib/errors";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireAdmin: vi.fn((ctx) => {
    if (ctx.role !== "ADMIN") {
      throw new AuthorizationError("Operation requires ADMIN role");
    }
  }),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

describe("Enterprise Audit Investigation Console (tests/integration/audit-console.test.ts)", () => {
  const mockOrgAId = "11111111-1111-4111-8111-111111111111";
  const mockOrgBId = "99999999-9999-4999-8999-999999999999";
  const mockAdminUserId = "22222222-2222-4222-8222-222222222222";
  const mockStaffUserId = "33333333-3333-4333-8333-333333333333";
  const mockCandidateUserId = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Tenant Isolation & Server-Side Authorization", () => {
    it("enforces ADMIN authorization; rejects CANDIDATE user", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockCandidateUserId,
        email: "cand@test.com",
        role: Role.CANDIDATE,
        organizationId: mockOrgAId,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      const res = await listAuditLogsAction({});
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Operation requires ADMIN role/i);
    });

    it("enforces ADMIN authorization; rejects EMPLOYEE user", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockStaffUserId,
        email: "staff@test.com",
        role: Role.EMPLOYEE,
        organizationId: mockOrgAId,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      const res = await listAuditLogsAction({});
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Operation requires ADMIN role/i);
    });

    it("strictly isolates queries to authenticated organizationId (cannot query Org B)", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockAdminUserId,
        email: "admin@test.com",
        role: Role.ADMIN,
        organizationId: mockOrgAId,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      let capturedWhere: any = null;

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          auditEvent: {
            findMany: vi.fn().mockImplementation(({ where }) => {
              capturedWhere = where;
              return Promise.resolve([]);
            }),
            count: vi.fn().mockResolvedValue(0),
          },
        };
        return callback(tx as any);
      });

      const res = await listAuditLogsAction({ page: 1, limit: 25 });
      expect(res.success).toBe(true);
      expect(capturedWhere).toBeDefined();
      expect(capturedWhere.organizationId).toBe(mockOrgAId);
      expect(capturedWhere.organizationId).not.toBe(mockOrgBId);
    });
  });

  describe("2. Multi-Criteria Filtering, Search, and Pagination", () => {
    beforeEach(() => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockAdminUserId,
        email: "admin@test.com",
        role: Role.ADMIN,
        organizationId: mockOrgAId,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });
    });

    it("filters by category using actions from the catalog", async () => {
      let capturedWhere: any = null;

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          auditEvent: {
            findMany: vi.fn().mockImplementation(({ where }) => {
              capturedWhere = where;
              return Promise.resolve([]);
            }),
            count: vi.fn().mockResolvedValue(0),
          },
        };
        return callback(tx as any);
      });

      const res = await listAuditLogsAction({ category: "SECURITY_IDENTITY" });
      expect(res.success).toBe(true);
      expect(capturedWhere.action).toBeDefined();
      expect(capturedWhere.action.in).toContain(AuditAction.USER_LOGIN);
      expect(capturedWhere.action.in).toContain(AuditAction.SECURITY_ALERT);
      expect(capturedWhere.action.in).not.toContain(AuditAction.APPLICATION_SUBMITTED);
    });

    it("filters by explicit action, actorUserId, entityType, and flexible entityId", async () => {
      let capturedWhere: any = null;

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          auditEvent: {
            findMany: vi.fn().mockImplementation(({ where }) => {
              capturedWhere = where;
              return Promise.resolve([]);
            }),
            count: vi.fn().mockResolvedValue(0),
          },
        };
        return callback(tx as any);
      });

      const res = await listAuditLogsAction({
        action: AuditAction.APPLICATION_QA_PASSED,
        actorUserId: mockStaffUserId,
        entityType: "Application",
        entityId: "app-custom-123", // Non-UUID supported
      });

      expect(res.success).toBe(true);
      expect(capturedWhere.action).toBe(AuditAction.APPLICATION_QA_PASSED);
      expect(capturedWhere.actorId).toBe(mockStaffUserId);
      expect(capturedWhere.entityType).toEqual({ contains: "Application", mode: "insensitive" });
      expect(capturedWhere.entityId).toEqual({ contains: "app-custom-123", mode: "insensitive" });
    });

    it("filters by date range with full day boundary coverage", async () => {
      let capturedWhere: any = null;

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          auditEvent: {
            findMany: vi.fn().mockImplementation(({ where }) => {
              capturedWhere = where;
              return Promise.resolve([]);
            }),
            count: vi.fn().mockResolvedValue(0),
          },
        };
        return callback(tx as any);
      });

      const res = await listAuditLogsAction({
        startDate: "2026-10-01",
        endDate: "2026-10-15",
      });

      expect(res.success).toBe(true);
      expect(capturedWhere.createdAt).toBeDefined();
      expect(capturedWhere.createdAt.gte).toEqual(new Date("2026-10-01T00:00:00.000Z"));
      expect(capturedWhere.createdAt.lte).toEqual(new Date("2026-10-15T23:59:59.999Z"));
    });

    it("executes multi-field text search across actions, entities, actors, and IP addresses", async () => {
      let capturedWhere: any = null;

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          auditEvent: {
            findMany: vi.fn().mockImplementation(({ where }) => {
              capturedWhere = where;
              return Promise.resolve([]);
            }),
            count: vi.fn().mockResolvedValue(0),
          },
        };
        return callback(tx as any);
      });

      const res = await listAuditLogsAction({ search: "login" });
      expect(res.success).toBe(true);
      expect(capturedWhere.OR).toBeDefined();
      expect(capturedWhere.OR.length).toBeGreaterThan(0);
      const actionClause = capturedWhere.OR.find((c: any) => c.action);
      expect(actionClause).toBeDefined();
      expect(actionClause.action.in).toContain(AuditAction.USER_LOGIN);
    });

    it("applies deterministic pagination and bounds limit", async () => {
      let capturedSkip = -1;
      let capturedTake = -1;
      let capturedOrder: any = null;

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          auditEvent: {
            findMany: vi.fn().mockImplementation(({ skip, take, orderBy }) => {
              capturedSkip = skip;
              capturedTake = take;
              capturedOrder = orderBy;
              return Promise.resolve([]);
            }),
            count: vi.fn().mockResolvedValue(120),
          },
        };
        return callback(tx as any);
      });

      const res = await listAuditLogsAction({ page: 3, limit: 50, sortOrder: "asc" });
      expect(res.success).toBe(true);
      expect(capturedSkip).toBe(100);
      expect(capturedTake).toBe(50);
      expect(capturedOrder).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
      expect(res.data?.totalPages).toBe(3);
    });
  });

  describe("3. Sensitive Data Redaction in Event Details", () => {
    it("redacts sensitive keys like password, token, and secret before returning to client", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockAdminUserId,
        email: "admin@test.com",
        role: Role.ADMIN,
        organizationId: mockOrgAId,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      const rawLogs = [
        {
          id: "evt-sensitive-1",
          organizationId: mockOrgAId,
          action: AuditAction.USER_LOGIN,
          actorId: mockAdminUserId,
          actorType: "USER",
          entityType: "User",
          entityId: mockAdminUserId,
          details: {
            loginMethod: "password",
            password: "super-secret-password-123",
            token: "jwt-bearer-token-abc",
            apiKey: "citrux_live_key_999",
            safeKey: "audited_browser_session",
          },
          ipAddress: "192.168.1.1",
          userAgent: "Mozilla/5.0",
          createdAt: new Date(),
          actor: { id: mockAdminUserId, firstName: "Admin", lastName: "User", email: "admin@test.com" },
        },
      ];

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          auditEvent: {
            findMany: vi.fn().mockResolvedValue(rawLogs),
            count: vi.fn().mockResolvedValue(1),
          },
        };
        return callback(tx as any);
      });

      const res = await listAuditLogsAction({});
      expect(res.success).toBe(true);
      const log = res.data?.logs[0];
      expect(log.details.password).toBe("[REDACTED]");
      expect(log.details.token).toBe("[REDACTED]");
      expect(log.details.apiKey).toBe("[REDACTED]");
      expect(log.details.safeKey).toBe("audited_browser_session");
    });
  });

  describe("4. Authorized Audit Export & Bounding", () => {
    beforeEach(() => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockAdminUserId,
        email: "admin@test.com",
        role: Role.ADMIN,
        organizationId: mockOrgAId,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });
    });

    it("exports filtered audit logs in JSON format with sensitive data redacted", async () => {
      const mockLogs = [
        {
          id: "evt-export-1",
          organizationId: mockOrgAId,
          action: AuditAction.APPLICATION_QA_PASSED,
          actorId: mockStaffUserId,
          actorType: "USER",
          entityType: "Application",
          entityId: "app-100",
          details: { secret: "exposed-string", qaNotes: "All criteria met" },
          ipAddress: "10.0.0.1",
          userAgent: "TestAgent",
          createdAt: new Date("2026-10-15T05:00:00.000Z"),
          actor: { id: mockStaffUserId, firstName: "QA", lastName: "Reviewer", email: "qa@test.com" },
        },
      ];

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          auditEvent: {
            findMany: vi.fn().mockResolvedValue(mockLogs),
          },
        };
        return callback(tx as any);
      });

      const res = await exportAuditLogsAction({ format: "json", limit: 50 });
      expect(res.success).toBe(true);
      expect(res.data?.format).toBe("json");
      expect(res.data?.count).toBe(1);

      const parsedJson = JSON.parse(res.data?.data || "[]");
      expect(parsedJson).toHaveLength(1);
      expect(parsedJson[0].details.secret).toBe("[REDACTED]");
      expect(parsedJson[0].details.qaNotes).toBe("All criteria met");
    });

    it("exports filtered audit logs in valid CSV format with proper quoting", async () => {
      const mockLogs = [
        {
          id: "evt-export-2",
          organizationId: mockOrgAId,
          action: AuditAction.TASK_ESCALATED,
          actorId: mockStaffUserId,
          actorType: "USER",
          entityType: "Task",
          entityId: "task-200",
          details: { reason: "Requires manager approval, urgent!" },
          ipAddress: "10.0.0.2",
          userAgent: "Chrome, Version 120",
          createdAt: new Date("2026-10-15T06:00:00.000Z"),
          actor: { id: mockStaffUserId, firstName: "Alice", lastName: "Smith", email: "alice@test.com" },
        },
      ];

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          auditEvent: {
            findMany: vi.fn().mockResolvedValue(mockLogs),
          },
        };
        return callback(tx as any);
      });

      const res = await exportAuditLogsAction({ format: "csv", limit: 100 });
      expect(res.success).toBe(true);
      expect(res.data?.format).toBe("csv");
      const lines = (res.data?.data || "").split("\n");
      expect(lines.length).toBe(2); // Header + 1 row
      expect(lines[0]).toContain("Timestamp_UTC,Action,Category");
      expect(lines[1]).toContain("TASK_ESCALATED");
      expect(lines[1]).toContain('"Requires manager approval, urgent!"');
    });

    it("rejects unauthorized non-ADMIN export attempts", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockCandidateUserId,
        email: "cand@test.com",
        role: Role.CANDIDATE,
        organizationId: mockOrgAId,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      const res = await exportAuditLogsAction({ format: "json" });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Operation requires ADMIN role/i);
    });
  });

  describe("5. Append-Only Audit Invariant Verification", () => {
    it("confirms there is no update or delete server action exported in admin actions", async () => {
      const adminActions = await import("@/lib/admin/actions");
      expect((adminActions as any).updateAuditLogAction).toBeUndefined();
      expect((adminActions as any).deleteAuditLogAction).toBeUndefined();
      expect((adminActions as any).removeAuditEventAction).toBeUndefined();
      expect((adminActions as any).modifyAuditEventAction).toBeUndefined();
    });
  });
});
