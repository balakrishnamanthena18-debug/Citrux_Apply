import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  candidateApproveApplicationAction,
  candidateRequestRevisionAction,
} from "@/lib/qa/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import {
  ApplicationStatus,
  ApplicationApprovalStatus,
  AuditAction,
  JobStatus,
} from "@/generated/prisma";
import { ValidationError, AuthorizationError } from "@/lib/errors";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireCandidate: vi.fn(),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

describe("Candidate Approval Workflow Integration (tests/integration/candidate-approval-workflow.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockCandidateUserId = "33333333-3333-4333-8333-333333333333";
  const mockCandidateId = "44444444-4444-4444-8444-444444444444";
  const mockJobId = "55555555-5555-4555-8555-555555555555";
  const mockAppId = "66666666-6666-4666-8666-666666666666";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "candidate@test.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });
  });

  it("1. Candidate explicitly approves application in AWAITING_APPROVAL -> moves to READY", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockCandidateUserId,
            status: "ACTIVE",
          }),
        },
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            candidateId: mockCandidateId,
            jobId: mockJobId,
            status: ApplicationStatus.AWAITING_APPROVAL,
            job: { id: mockJobId, status: JobStatus.OPEN },
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppId,
            status: ApplicationStatus.READY,
            approvalStatus: ApplicationApprovalStatus.APPROVED,
            approvedBy: mockCandidateUserId,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "history-1" }),
        },
      };
      return callback(tx as any);
    });

    const result = await candidateApproveApplicationAction({ applicationId: mockAppId });
    expect(result.success).toBe(true);
    expect(result.application.status).toBe(ApplicationStatus.READY);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.APPLICATION_APPROVED_BY_CANDIDATE,
        entityId: mockAppId,
      })
    );
  });

  it("2. Candidate requests revision in AWAITING_APPROVAL -> moves to PREPARING with notes", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockCandidateUserId,
            status: "ACTIVE",
          }),
        },
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            candidateId: mockCandidateId,
            status: ApplicationStatus.AWAITING_APPROVAL,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppId,
            status: ApplicationStatus.PREPARING,
            approvalStatus: ApplicationApprovalStatus.REVISION_REQUESTED,
            approvalNotes: "Please emphasize AWS experience more prominently.",
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "history-2" }),
        },
      };
      return callback(tx as any);
    });

    const result = await candidateRequestRevisionAction({
      applicationId: mockAppId,
      revisionNotes: "Please emphasize AWS experience more prominently.",
    });

    expect(result.success).toBe(true);
    expect(result.application.status).toBe(ApplicationStatus.PREPARING);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.APPLICATION_REVISION_REQUESTED_BY_CANDIDATE,
        entityId: mockAppId,
      })
    );
  });

  it("3. Rejects candidate approval when underlying Job status is CLOSED (Job Status Guard)", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockCandidateUserId,
            status: "ACTIVE",
          }),
        },
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            candidateId: mockCandidateId,
            jobId: mockJobId,
            status: ApplicationStatus.AWAITING_APPROVAL,
            job: { id: mockJobId, status: JobStatus.CLOSED },
          }),
        },
      };
      return callback(tx as any);
    });

    await expect(
      candidateApproveApplicationAction({ applicationId: mockAppId })
    ).rejects.toThrow(ValidationError);
  });

  it("4. Rejects candidate approval when candidate is not owner of application", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: "different-candidate-id",
            userId: mockCandidateUserId,
            status: "ACTIVE",
          }),
        },
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            candidateId: mockCandidateId, // different candidate ID
            jobId: mockJobId,
            status: ApplicationStatus.AWAITING_APPROVAL,
            job: { id: mockJobId, status: JobStatus.OPEN },
          }),
        },
      };
      return callback(tx as any);
    });

    await expect(
      candidateApproveApplicationAction({ applicationId: mockAppId })
    ).rejects.toThrow(AuthorizationError);
  });
});
