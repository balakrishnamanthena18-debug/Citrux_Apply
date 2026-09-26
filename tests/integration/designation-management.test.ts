import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createDesignationAction,
  updateDesignationAction,
  setDesignationStatusAction,
  listDesignationsAction,
} from "@/lib/admin/actions";
import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { DesignationStatus, Role, AuditAction } from "@/generated/prisma";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireAdmin: vi.fn(),
  requireEmployeeOrAdmin: vi.fn(),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

describe("Designation Management Integration Tests (tests/integration/designation-management.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockAdminUserId = "22222222-2222-4222-8222-222222222222";
  const mockDesignationId = "55555555-5555-5555-8555-555555555555";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockAdminUserId,
      email: "admin@citrux.com",
      role: Role.ADMIN,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });
  });

  it("1. Admin creates a new active designation with audit logging", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        designation: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: mockDesignationId,
            organizationId: mockOrgId,
            name: "Application Specialist",
            code: "APP_SPEC",
            description: "Handles candidate application filings",
            status: DesignationStatus.ACTIVE,
            createdAt: new Date(),
          }),
        },
      };
      return callback(tx as any);
    });

    const res = await createDesignationAction({
      name: "Application Specialist",
      code: "APP_SPEC",
      description: "Handles candidate application filings",
    });

    expect(res.success).toBe(true);
    expect(res.data?.id).toBe(mockDesignationId);
    expect(res.data?.name).toBe("Application Specialist");
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.DESIGNATION_CREATED,
        entityType: "Designation",
        entityId: mockDesignationId,
      })
    );
  });

  it("2. Duplicate designation name in same tenant is rejected", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        designation: {
          findFirst: vi.fn().mockResolvedValue({
            id: "existing-id",
            name: "Application Specialist",
          }),
        },
      };
      return callback(tx as any);
    });

    const res = await createDesignationAction({
      name: "Application Specialist",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("already exists");
  });

  it("3. Admin archives designation -> status changes to ARCHIVED and logs DESIGNATION_ARCHIVED", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        designation: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockDesignationId,
            organizationId: mockOrgId,
            status: DesignationStatus.ACTIVE,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockDesignationId,
            status: DesignationStatus.ARCHIVED,
          }),
        },
      };
      return callback(tx as any);
    });

    const res = await setDesignationStatusAction({
      designationId: mockDesignationId,
      status: "ARCHIVED",
    });

    expect(res.success).toBe(true);
    expect(res.data?.status).toBe(DesignationStatus.ARCHIVED);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.DESIGNATION_ARCHIVED,
        entityId: mockDesignationId,
      })
    );
  });

  it("4. Admin reactivates archived designation -> status changes to ACTIVE and logs DESIGNATION_REACTIVATED", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        designation: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockDesignationId,
            organizationId: mockOrgId,
            status: DesignationStatus.ARCHIVED,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockDesignationId,
            status: DesignationStatus.ACTIVE,
          }),
        },
      };
      return callback(tx as any);
    });

    const res = await setDesignationStatusAction({
      designationId: mockDesignationId,
      status: "ACTIVE",
    });

    expect(res.success).toBe(true);
    expect(res.data?.status).toBe(DesignationStatus.ACTIVE);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.DESIGNATION_REACTIVATED,
        entityId: mockDesignationId,
      })
    );
  });

  it("5. Cross-tenant access is prohibited by tenant check", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        designation: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockDesignationId,
            organizationId: "other-tenant-org-id",
          }),
        },
      };
      return callback(tx as any);
    });

    const res = await updateDesignationAction({
      designationId: mockDesignationId,
      name: "Attempted Cross Tenant Update",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("not found");
  });
});
