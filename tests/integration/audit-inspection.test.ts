import { describe, it, expect, vi, beforeEach } from "vitest";
import { listAuditLogsAction } from "@/lib/admin/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
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

describe("Phase 8 Authoritative Audit Inspection & Immutability (tests/integration/audit-inspection.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockAdminUserId = "22222222-2222-4222-8222-222222222222";
  const mockCandidateUserId = "33333333-3333-4333-8333-333333333333";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Admin successfully queries paginated and filtered audit logs", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockAdminUserId,
      email: "admin@example.com",
      role: Role.ADMIN,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: MembershipStatus.ACTIVE,
    });

    const mockLogs = [
      {
        id: "evt-1",
        organizationId: mockOrgId,
        action: AuditAction.EMPLOYEE_CREATED,
        actorId: mockAdminUserId,
        entityType: "Membership",
        entityId: "mem-1",
        createdAt: new Date(),
        actor: { id: mockAdminUserId, email: "admin@example.com", firstName: "Admin", lastName: "User" },
      },
    ];

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        auditEvent: {
          findMany: vi.fn().mockResolvedValue(mockLogs),
          count: vi.fn().mockResolvedValue(1),
        },
      };
      return callback(tx as any);
    });

    const res = await listAuditLogsAction({
      page: 1,
      limit: 25,
      action: "EMPLOYEE_CREATED",
    });

    expect(res.success).toBe(true);
    expect(res.data?.logs).toHaveLength(1);
    expect(res.data?.totalCount).toBe(1);
    expect(res.data?.page).toBe(1);
    expect(res.data?.totalPages).toBe(1);
  });

  it("2. CANDIDATE cannot access raw audit log query", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "cand@example.com",
      role: Role.CANDIDATE,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: MembershipStatus.ACTIVE,
    });

    const res = await listAuditLogsAction({});
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Operation requires ADMIN role/i);
  });
});
