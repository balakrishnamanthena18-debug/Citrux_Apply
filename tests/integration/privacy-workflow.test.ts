import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createPrivacyRequestAction,
  verifyPrivacyRequestAction,
  completePrivacyRequestAction,
  rejectPrivacyRequestAction,
  listPrivacyRequestsAction,
  getCandidateExportDataAction,
} from "@/lib/privacy/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import {
  Role,
  MembershipStatus,
  PrivacyRequestType,
  PrivacyRequestStatus,
  AuditAction,
} from "@/generated/prisma";
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

describe("Phase 8 Privacy Governance Workflows (tests/integration/privacy-workflow.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockCandidateUserId = "22222222-2222-4222-8222-222222222222";
  const mockCandidateId = "33333333-3333-4333-8333-333333333333";
  const mockStaffUserId = "66666666-6666-4666-8666-666666666666";
  const mockAdminUserId = "77777777-7777-4777-8777-777777777777";
  const mockRequestId = "88888888-8888-4888-8888-888888888888";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Request Creation", () => {
    it("Candidate creates DATA_EXPORT request -> success and audit logged", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockCandidateUserId,
        email: "cand@example.com",
        role: Role.CANDIDATE,
        organizationId: mockOrgId,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          candidate: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockCandidateId,
              userId: mockCandidateUserId,
              organizationId: mockOrgId,
            }),
          },
          privacyRequest: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({
              id: mockRequestId,
              organizationId: mockOrgId,
              candidateId: mockCandidateId,
              requestType: PrivacyRequestType.DATA_EXPORT,
              status: PrivacyRequestStatus.PENDING,
            }),
          },
        };
        return callback(tx as any);
      });

      const res = await createPrivacyRequestAction({
        requestType: "DATA_EXPORT",
        scopeDetails: "Export everything",
      });

      expect(res.success).toBe(true);
      expect(res.data?.requestId).toBe(mockRequestId);
      expect(logUserAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.PRIVACY_REQUEST_CREATED,
          entityId: mockRequestId,
          details: expect.objectContaining({
            requestType: "DATA_EXPORT",
          }),
        })
      );
    });

    it("Candidate cannot create duplicate pending request of the same type", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockCandidateUserId,
        email: "cand@example.com",
        role: Role.CANDIDATE,
        organizationId: mockOrgId,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          candidate: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockCandidateId,
              userId: mockCandidateUserId,
              organizationId: mockOrgId,
            }),
          },
          privacyRequest: {
            findFirst: vi.fn().mockResolvedValue({
              id: "existing-req",
              status: PrivacyRequestStatus.PENDING,
            }),
          },
        };
        return callback(tx as any);
      });

      const res = await createPrivacyRequestAction({
        requestType: "DATA_EXPORT",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already have an active DATA EXPORT request/i);
    });
  });

  describe("2. Identity Verification Stage", () => {
    it("Staff member verifies candidate identity -> status changes to IDENTITY_VERIFIED and audit logged", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockStaffUserId,
        email: "staff@company.com",
        role: Role.EMPLOYEE,
        organizationId: mockOrgId,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          privacyRequest: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockRequestId,
              organizationId: mockOrgId,
              status: PrivacyRequestStatus.PENDING,
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return callback(tx as any);
      });

      const res = await verifyPrivacyRequestAction({
        requestId: mockRequestId,
        verificationNotes: "Identity verified against official photo ID",
      });

      expect(res.success).toBe(true);
      expect(res.data?.status).toBe(PrivacyRequestStatus.IDENTITY_VERIFIED);
      expect(logUserAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.PRIVACY_REQUEST_VERIFIED,
          entityId: mockRequestId,
        })
      );
    });
  });

  describe("3. Admin Execution & Record Preservation", () => {
    it("Admin executes DATA_EXPORT completion -> writes CANDIDATE_DATA_EXPORTED audit log", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockAdminUserId,
        email: "admin@company.com",
        role: Role.ADMIN,
        organizationId: mockOrgId,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          privacyRequest: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockRequestId,
              organizationId: mockOrgId,
              requestType: PrivacyRequestType.DATA_EXPORT,
              status: PrivacyRequestStatus.IDENTITY_VERIFIED,
              candidate: { id: mockCandidateId, userId: mockCandidateUserId },
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return callback(tx as any);
      });

      const res = await completePrivacyRequestAction({
        requestId: mockRequestId,
        resolutionNotes: "Export JSON package assembled and delivered",
      });

      expect(res.success).toBe(true);
      expect(res.data?.status).toBe(PrivacyRequestStatus.COMPLETED);
      expect(logUserAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.CANDIDATE_DATA_EXPORTED,
          entityId: mockRequestId,
        })
      );
    });

    it("Admin executes DATA_DELETION -> records resolution, preserves historical records & writes CANDIDATE_DATA_DELETED audit log without hardcoded field-level wipes", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockAdminUserId,
        email: "admin@company.com",
        role: Role.ADMIN,
        organizationId: mockOrgId,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          privacyRequest: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockRequestId,
              organizationId: mockOrgId,
              requestType: PrivacyRequestType.DATA_DELETION,
              status: PrivacyRequestStatus.IDENTITY_VERIFIED,
              candidate: { id: mockCandidateId, userId: mockCandidateUserId },
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return callback(tx as any);
      });

      const res = await completePrivacyRequestAction({
        requestId: mockRequestId,
        resolutionNotes: "Admin verified permissible data minimization while preserving required application, submission, and audit records.",
      });

      expect(res.success).toBe(true);
      expect(res.data?.status).toBe(PrivacyRequestStatus.COMPLETED);
      expect(logUserAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.CANDIDATE_DATA_DELETED,
          entityId: mockRequestId,
          details: expect.objectContaining({
            requestType: PrivacyRequestType.DATA_DELETION,
            resolutionNotes: expect.stringMatching(/preserving required application/),
          }),
        })
      );
    });
  });

  describe("4. Admin-Assisted Export Assembly Boundary", () => {
    it("Admin can assemble machine-readable export bundle", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockAdminUserId,
        email: "admin@company.com",
        role: Role.ADMIN,
        organizationId: mockOrgId,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          candidate: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockCandidateId,
              userId: mockCandidateUserId,
              organizationId: mockOrgId,
              user: { id: mockCandidateUserId, email: "cand@example.com", firstName: "Jane", lastName: "Doe", createdAt: new Date() },
              experiences: [],
              educations: [],
              skills: [],
              projects: [],
              certifications: [],
              documents: [],
              applications: [],
              conversations: [],
            }),
          },
        };
        return callback(tx as any);
      });

      const res = await getCandidateExportDataAction(mockCandidateId);
      expect(res.success).toBe(true);
      expect(res.data?.exportBundle?.profile?.email).toBe("cand@example.com");
    });

    it("Candidate cannot self-serve export bundle directly via getCandidateExportDataAction", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockCandidateUserId,
        email: "cand@example.com",
        role: Role.CANDIDATE,
        organizationId: mockOrgId,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      const res = await getCandidateExportDataAction(mockCandidateId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Operation requires ADMIN role/i);
    });
  });

  describe("5. State Machine Transition & Concurrency Enforcement", () => {
    it("Rejects completion if request is still PENDING (not yet identity verified)", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockAdminUserId,
        email: "admin@company.com",
        role: Role.ADMIN,
        organizationId: mockOrgId,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          privacyRequest: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockRequestId,
              organizationId: mockOrgId,
              requestType: PrivacyRequestType.DATA_EXPORT,
              status: PrivacyRequestStatus.PENDING, // Not verified!
            }),
          },
        };
        return callback(tx as any);
      });

      const res = await completePrivacyRequestAction({
        requestId: mockRequestId,
        resolutionNotes: "Attempting early completion",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/identity must be verified before completion/i);
    });

    it("Rejects rejection if request is already COMPLETED or REJECTED (terminal state)", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockAdminUserId,
        email: "admin@company.com",
        role: Role.ADMIN,
        organizationId: mockOrgId,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          privacyRequest: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockRequestId,
              organizationId: mockOrgId,
              status: PrivacyRequestStatus.COMPLETED,
            }),
          },
        };
        return callback(tx as any);
      });

      const res = await rejectPrivacyRequestAction({
        requestId: mockRequestId,
        rejectionReason: "Too late",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Cannot reject privacy request already in COMPLETED status/i);
    });

    it("Concurrency guard: Second simultaneous admin update fails if status changed concurrently", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockAdminUserId,
        email: "admin@company.com",
        role: Role.ADMIN,
        organizationId: mockOrgId,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          privacyRequest: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockRequestId,
              organizationId: mockOrgId,
              requestType: PrivacyRequestType.DATA_EXPORT,
              status: PrivacyRequestStatus.IDENTITY_VERIFIED,
              candidate: { id: mockCandidateId, userId: mockCandidateUserId },
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }), // 0 updated due to concurrent execution
          },
        };
        return callback(tx as any);
      });

      const res = await completePrivacyRequestAction({
        requestId: mockRequestId,
        resolutionNotes: "Concurrent resolution attempt",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already completed or modified by another administrator/i);
    });
  });
});
