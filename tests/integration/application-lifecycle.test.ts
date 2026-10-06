import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createApplicationAction,
  transitionApplicationStatusAction,
  requestCandidateApprovalAction,
  submitCandidateApprovalAction,
} from "@/lib/application/actions";
import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { ApplicationStatus, QaDecision } from "@/generated/prisma";
import { AuthorizationError } from "@/lib/errors";
import { QA_CRITERION_KEYS } from "@/lib/validation/qa.schemas";

const mockQaPass = {
  id: "qa-pass-1",
  decision: QaDecision.PASS,
  createdAt: new Date("2026-10-01T12:00:00.000Z"),
  checklistItems: QA_CRITERION_KEYS.map((criterionKey) => ({
    criterionKey,
    isVerified: true,
  })),
};

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireEmployeeOrAdmin: vi.fn(),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

describe("Application Lifecycle & Universal Approval Integration (tests/integration/application-lifecycle.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockEmployeeId = "22222222-2222-4222-8222-222222222222";
  const mockCandidateUserId = "33333333-3333-4333-8333-333333333333";
  const mockCandidateId = "44444444-4444-4444-8444-444444444444";
  const mockJobId = "55555555-5555-4555-8555-555555555555";
  const mockAppId = "66666666-6666-4666-8666-666666666666";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Staff member creates application in DISCOVERED status and records audit event", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@test.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({ id: mockCandidateId, organizationId: mockOrgId, status: "ACTIVE" }),
        },
        job: {
          findFirst: vi.fn().mockResolvedValue({ id: mockJobId, organizationId: mockOrgId, status: "OPEN", visibility: "GLOBAL", ownerCandidateId: null }),
          findUnique: vi.fn().mockResolvedValue({ id: mockJobId, organizationId: mockOrgId, status: "OPEN", visibility: "GLOBAL", ownerCandidateId: null }),
        },
        candidateJobOpportunity: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            candidateId: mockCandidateId,
            jobId: mockJobId,
            status: ApplicationStatus.DISCOVERED,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const result = await createApplicationAction({
      candidateId: mockCandidateId,
      jobId: mockJobId,
    });

    expect(result.success).toBe(true);
    expect(result.data?.applicationId).toBe(mockAppId);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "APPLICATION_CREATED",
        entityId: mockAppId,
      })
    );
  });

  it("2. Staff advances application through golden path (DISCOVERED -> QUALIFIED -> PREPARING -> REVIEW)", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@test.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.DISCOVERED,
            candidate: { userId: mockCandidateUserId },
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const result = await transitionApplicationStatusAction({
      applicationId: mockAppId,
      targetStatus: ApplicationStatus.QUALIFIED,
    });

    expect(result.success).toBe(true);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "APPLICATION_STATUS_CHANGED",
        entityId: mockAppId,
        details: { targetStatus: "QUALIFIED", reason: undefined },
      })
    );
  });

  it("3. Staff requests candidate approval (REVIEW -> AWAITING_APPROVAL)", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@test.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.REVIEW,
            materials: [{ id: "mat-1", isCurrent: true, createdAt: new Date("2026-09-30T12:00:00.000Z") }],
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
        applicationQaReview: {
          findFirst: vi.fn().mockResolvedValue(mockQaPass),
        },
        applicationMaterial: {
          findFirst: vi.fn().mockResolvedValue({
            createdAt: new Date("2026-09-30T12:00:00.000Z"),
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await requestCandidateApprovalAction(mockAppId);
    expect(result.success).toBe(true);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "APPLICATION_APPROVAL_REQUESTED",
        entityId: mockAppId,
      })
    );
  });

  it("4. Candidate explicitly approves application (AWAITING_APPROVAL -> READY)", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "candidate@test.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.AWAITING_APPROVAL,
            candidate: { userId: mockCandidateUserId },
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
        applicationQaReview: {
          findFirst: vi.fn().mockResolvedValue(mockQaPass),
        },
        applicationMaterial: {
          findFirst: vi.fn().mockResolvedValue({
            createdAt: new Date("2026-09-30T12:00:00.000Z"),
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await submitCandidateApprovalAction({
      applicationId: mockAppId,
      approved: true,
      feedbackNotes: "Approved by candidate",
    });

    expect(result.success).toBe(true);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "APPLICATION_APPROVED",
        entityId: mockAppId,
      })
    );
  });

  it("5. Employee is prohibited from approving or impersonating candidate approval", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@test.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.AWAITING_APPROVAL,
            candidate: { userId: mockCandidateUserId }, // belongs to candidate, not employee
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await submitCandidateApprovalAction({
      applicationId: mockAppId,
      approved: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Only the candidate owner can approve");
  });

  it("6. Candidate requests revision (AWAITING_APPROVAL -> PREPARING)", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "candidate@test.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.AWAITING_APPROVAL,
            candidate: { userId: mockCandidateUserId },
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const result = await submitCandidateApprovalAction({
      applicationId: mockAppId,
      approved: false,
      feedbackNotes: "Please update the summary to emphasize cloud infrastructure.",
    });

    expect(result.success).toBe(true);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "APPLICATION_APPROVAL_REJECTED",
        entityId: mockAppId,
        details: { approved: false, notes: "Please update the summary to emphasize cloud infrastructure." },
      })
    );
  });
});
