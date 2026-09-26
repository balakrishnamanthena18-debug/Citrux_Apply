import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createEmployeeAction,
  setEmployeeStatusAction,
  updateEmployeeRoleAction,
  reassignOperationalWorkAction,
  listAuditLogsAction,
} from "@/lib/admin/actions";
import {
  verifyPrivacyRequestAction,
  completePrivacyRequestAction,
  rejectPrivacyRequestAction,
  listPrivacyRequestsAction,
  getCandidateExportDataAction,
} from "@/lib/privacy/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { Role, MembershipStatus, PrivacyRequestStatus, PrivacyRequestType } from "@/generated/prisma";
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

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

describe("Phase 8 Admin Authorization & Security Boundaries (tests/integration/admin-authorization.test.ts)", () => {
  const mockOrgA = "11111111-1111-4111-8111-111111111111";
  const mockOrgB = "22222222-2222-4222-8222-222222222222";
  const mockCandidateAUserId = "33333333-3333-4333-8333-333333333333";
  const mockCandidateAId = "33333333-aaaa-4333-8333-333333333333";
  const mockCandidateBUserId = "44444444-4444-4444-8444-444444444444";
  const mockCandidateBId = "44444444-bbbb-4444-8444-444444444444";
  const mockEmployeeUserId = "55555555-5555-4555-8555-555555555555";
  const mockAdminUserId = "66666666-6666-4666-8666-666666666666";
  const mockTargetStaffId = "77777777-7777-4777-8777-777777777777";
  const mockRequestId = "88888888-8888-4888-8888-888888888888";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. CANDIDATE Role Restrictions & Negative Security", () => {
    beforeEach(() => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockCandidateAUserId,
        email: "candA@example.com",
        role: Role.CANDIDATE,
        organizationId: mockOrgA,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });
    });

    it("1.1 Candidate A cannot read Candidate B's PrivacyRequest in list query", async () => {
      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          candidate: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockCandidateAId,
              userId: mockCandidateAUserId,
              organizationId: mockOrgA,
            }),
          },
          privacyRequest: {
            findMany: vi.fn().mockImplementation((args) => {
              // Enforces candidateId = mockCandidateAId
              expect(args.where.candidateId).toBe(mockCandidateAId);
              return [{ id: "req-cand-a", candidateId: mockCandidateAId }];
            }),
          },
        };
        return callback(tx as any);
      });

      const res = await listPrivacyRequestsAction({});
      expect(res.success).toBe(true);
      expect(res.data?.requests).toHaveLength(1);
    });

    it("1.2 Candidate cannot modify PrivacyRequest status / complete identity verification", async () => {
      const res = await verifyPrivacyRequestAction({
        requestId: mockRequestId,
        verificationNotes: "Trying to self-verify",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Operation requires EMPLOYEE or ADMIN role/i);
    });

    it("1.3 Candidate cannot execute DATA_EXPORT workflow", async () => {
      const res = await completePrivacyRequestAction({
        requestId: mockRequestId,
        resolutionNotes: "Candidate executing export",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Operation requires ADMIN role/i);

      const exportRes = await getCandidateExportDataAction(mockCandidateAId);
      expect(exportRes.success).toBe(false);
      expect(exportRes.error).toMatch(/Operation requires ADMIN role/i);
    });

    it("1.4 Candidate cannot execute DATA_DELETION or DATA_CORRECTION resolution", async () => {
      const res = await completePrivacyRequestAction({
        requestId: mockRequestId,
        resolutionNotes: "Candidate executing deletion",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Operation requires ADMIN role/i);
    });

    it("1.5 Candidate cannot reject privacy requests", async () => {
      const res = await rejectPrivacyRequestAction({
        requestId: mockRequestId,
        rejectionReason: "Candidate rejecting",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Operation requires ADMIN role/i);
    });

    it("1.6 Candidate cannot access raw administrative audit logs", async () => {
      const res = await listAuditLogsAction({});
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Operation requires ADMIN role/i);
    });

    it("1.7 Candidate cannot provision staff, change roles, or reassign work", async () => {
      const pRes = await createEmployeeAction({
        email: "test@company.com",
        firstName: "Test",
        lastName: "User",
        role: "EMPLOYEE",
      });
      expect(pRes.success).toBe(false);

      const rRes = await updateEmployeeRoleAction({
        employeeUserId: mockTargetStaffId,
        role: "ADMIN",
      });
      expect(rRes.success).toBe(false);

      const aRes = await reassignOperationalWorkAction({
        targetEmployeeId: mockTargetStaffId,
        applicationIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      });
      expect(aRes.success).toBe(false);
    });
  });

  describe("2. EMPLOYEE Role Restrictions vs Capabilities", () => {
    beforeEach(() => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockEmployeeUserId,
        email: "employee@example.com",
        role: Role.EMPLOYEE,
        organizationId: mockOrgA,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });
    });

    it("2.1 EMPLOYEE can verify candidate identity", async () => {
      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          privacyRequest: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockRequestId,
              organizationId: mockOrgA,
              status: PrivacyRequestStatus.PENDING,
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return callback(tx as any);
      });

      const res = await verifyPrivacyRequestAction({
        requestId: mockRequestId,
        verificationNotes: "Identity verified with staff badge",
      });
      expect(res.success).toBe(true);
      expect(res.data?.status).toBe(PrivacyRequestStatus.IDENTITY_VERIFIED);
    });

    it("2.2 EMPLOYEE cannot complete or reject privacy requests (Admin only)", async () => {
      const cRes = await completePrivacyRequestAction({
        requestId: mockRequestId,
        resolutionNotes: "Employee completing",
      });
      expect(cRes.success).toBe(false);
      expect(cRes.error).toMatch(/Operation requires ADMIN role/i);

      const rRes = await rejectPrivacyRequestAction({
        requestId: mockRequestId,
        rejectionReason: "Employee rejecting",
      });
      expect(rRes.success).toBe(false);
      expect(rRes.error).toMatch(/Operation requires ADMIN role/i);
    });

    it("2.3 EMPLOYEE cannot provision staff or update roles", async () => {
      const res = await createEmployeeAction({
        email: "new@example.com",
        firstName: "New",
        lastName: "Staff",
        role: "EMPLOYEE",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Operation requires ADMIN role/i);
    });
  });

  describe("3. ADMIN Role Capabilities & Multi-Tenant Isolation", () => {
    beforeEach(() => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockAdminUserId,
        email: "admin@orga.com",
        role: Role.ADMIN,
        organizationId: mockOrgA,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });
    });

    it("3.1 ADMIN can perform authorized privacy resolution", async () => {
      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          privacyRequest: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockRequestId,
              organizationId: mockOrgA,
              requestType: PrivacyRequestType.DATA_EXPORT,
              status: PrivacyRequestStatus.IDENTITY_VERIFIED,
              candidate: { id: mockCandidateAId, userId: mockCandidateAUserId },
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return callback(tx as any);
      });

      const res = await completePrivacyRequestAction({
        requestId: mockRequestId,
        resolutionNotes: "Admin verified and processed",
      });
      expect(res.success).toBe(true);
      expect(res.data?.status).toBe(PrivacyRequestStatus.COMPLETED);
    });

    it("3.2 Admin in Org A cannot access or resolve PrivacyRequests in Org B", async () => {
      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          privacyRequest: {
            findUnique: vi.fn().mockResolvedValue(null), // Org filter prevents lookup
          },
        };
        return callback(tx as any);
      });

      const res = await completePrivacyRequestAction({
        requestId: "99999999-9999-4999-8999-999999999999",
        resolutionNotes: "Admin attempting cross-tenant resolution",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Privacy request not found/i);
    });

    it("3.3 Server-derived actor identity and organizationId cannot be spoofed by client inputs", async () => {
      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          auditEvent: {
            findMany: vi.fn().mockImplementation((args) => {
              expect(args.where.organizationId).toBe(mockOrgA); // Forced from server context
              return [];
            }),
            count: vi.fn().mockResolvedValue(0),
          },
        };
        return callback(tx as any);
      });

      const res = await listAuditLogsAction({});
      expect(res.success).toBe(true);
    });
  });
});
