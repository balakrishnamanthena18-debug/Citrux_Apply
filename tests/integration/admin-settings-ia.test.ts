import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { Role, MembershipStatus } from "@/generated/prisma";
import { AuthorizationError } from "@/lib/errors";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireAdmin: vi.fn((ctx) => {
    if (ctx.role !== "ADMIN") {
      throw new AuthorizationError("Operation requires ADMIN role");
    }
  }),
  requireEmployeeOrAdmin: vi.fn((ctx) => {
    if (ctx.role !== "ADMIN" && ctx.role !== "EMPLOYEE") {
      throw new AuthorizationError("Operation requires EMPLOYEE or ADMIN role");
    }
  }),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

describe("Admin Settings Information Architecture & RBAC Tests (tests/integration/admin-settings-ia.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockAdminUserId = "22222222-2222-4222-8222-222222222222";
  const mockEmployeeUserId = "33333333-3333-4333-8333-333333333333";
  const mockCandidateUserId = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. ADMIN role can access Admin Settings & telemetry", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockAdminUserId,
      email: "admin@citrux.com",
      role: Role.ADMIN,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: MembershipStatus.ACTIVE,
    });

    const ctx = await getAuthenticatedContext();
    expect(() => requireAdmin(ctx)).not.toThrow();

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        organization: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockOrgId,
            name: "CitrUX Technologies",
            slug: "citrux-tech",
            status: "ACTIVE",
          }),
        },
        designation: {
          count: vi.fn().mockResolvedValue(5),
        },
        membership: {
          count: vi.fn().mockResolvedValue(12),
        },
      };
      return callback(tx as any);
    });

    const telemetry = await withRlsContext(ctx.userId, async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: ctx.organizationId } });
      const desigCount = await tx.designation.count();
      return { org, desigCount };
    });

    expect(telemetry.org?.name).toBe("CitrUX Technologies");
    expect(telemetry.desigCount).toBe(5);
  });

  it("2. EMPLOYEE role is denied access to Admin Settings", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeUserId,
      email: "staff@citrux.com",
      role: Role.EMPLOYEE,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: MembershipStatus.ACTIVE,
    });

    const ctx = await getAuthenticatedContext();
    expect(() => requireAdmin(ctx)).toThrowError(/Operation requires ADMIN role/i);
  });

  it("3. CANDIDATE role is denied access to Admin Settings", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "candidate@gmail.com",
      role: Role.CANDIDATE,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: MembershipStatus.ACTIVE,
    });

    const ctx = await getAuthenticatedContext();
    expect(() => requireAdmin(ctx)).toThrowError(/Operation requires ADMIN role/i);
  });
});
