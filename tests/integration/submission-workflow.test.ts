import { describe, it, expect, vi, beforeEach } from "vitest";
import { recordApplicationSubmissionAction } from "@/lib/submission/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import {
  ApplicationStatus,
  ApplicationApprovalStatus,
  CandidateStatus,
  JobStatus,
  AuditAction,
} from "@/generated/prisma";

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

describe("Phase 6 Initial Submission Workflow (tests/integration/submission-workflow.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockEmployeeId = "22222222-2222-4222-8222-222222222222";
  const mockAppId = "33333333-3333-4333-8333-333333333333";
  const mockSubmissionId = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@citrux.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });
  });

  it("records initial external manual submission with attemptNumber 1 and confirmation storage path", async () => {
    const mockApp = {
      id: mockAppId,
      organizationId: mockOrgId,
      status: ApplicationStatus.READY,
      approvalStatus: ApplicationApprovalStatus.APPROVED,
      candidate: { status: CandidateStatus.ACTIVE },
      job: { status: JobStatus.OPEN },
    };

    const mockCreatedSubmission = {
      id: mockSubmissionId,
      applicationId: mockAppId,
      attemptNumber: 1,
      submittedById: mockEmployeeId,
      externalReference: "LEVER-CONFIRM-9901",
      externalUrl: "https://jobs.lever.co/stripe/apply/123",
      confirmationEvidence: "Application successfully received.",
      storagePath: "tenants/mockOrg/applications/mockApp/submissions/evidence.png",
      submissionNotes: "Submitted during business hours.",
    };

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue(mockApp),
          update: vi.fn().mockResolvedValue({
            ...mockApp,
            status: ApplicationStatus.SUBMITTED,
          }),
        },
        applicationSubmission: {
          create: vi.fn().mockResolvedValue(mockCreatedSubmission),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const result = await recordApplicationSubmissionAction({
      applicationId: mockAppId,
      externalReference: "LEVER-CONFIRM-9901",
      externalUrl: "https://jobs.lever.co/stripe/apply/123",
      confirmationEvidence: "Application successfully received.",
      storagePath: "tenants/mockOrg/applications/mockApp/submissions/evidence.png",
      submissionNotes: "Submitted during business hours.",
    });

    expect(result.success).toBe(true);
    expect(result.submission.attemptNumber).toBe(1);
    expect(result.application.status).toBe(ApplicationStatus.SUBMITTED);

    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tx: expect.anything(),
        userId: mockEmployeeId,
        organizationId: mockOrgId,
        action: AuditAction.APPLICATION_SUBMITTED,
        entityType: "Application",
        entityId: mockAppId,
        details: expect.objectContaining({
          submissionId: mockSubmissionId,
          attemptNumber: 1,
          externalReference: "LEVER-CONFIRM-9901",
        }),
      })
    );
  });

  it("atomic submission passes tx to logUserAuditEvent to prevent nested transaction timeout", async () => {
    const mockApp = {
      id: mockAppId,
      organizationId: mockOrgId,
      status: ApplicationStatus.READY,
      approvalStatus: ApplicationApprovalStatus.APPROVED,
      candidate: { status: CandidateStatus.ACTIVE, userId: "cand-user-1" },
      job: { status: JobStatus.OPEN, title: "Software Engineer", companyName: "Stripe" },
    };

    const mockCreatedSubmission = {
      id: mockSubmissionId,
      applicationId: mockAppId,
      attemptNumber: 1,
      submittedById: mockEmployeeId,
      confirmationEvidence: "Direct receipt confirmed",
    };

    let passedTx: any = null;
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue(mockApp),
          update: vi.fn().mockResolvedValue({ ...mockApp, status: ApplicationStatus.SUBMITTED }),
        },
        applicationSubmission: {
          create: vi.fn().mockResolvedValue(mockCreatedSubmission),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
        notification: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      passedTx = tx;
      return callback(tx as any);
    });

    const result = await recordApplicationSubmissionAction({
      applicationId: mockAppId,
      confirmationEvidence: "Direct receipt confirmed",
    });

    expect(result.success).toBe(true);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tx: passedTx,
        action: AuditAction.APPLICATION_SUBMITTED,
      })
    );
  });

  it("subsequent submission attempt fails safely because status is no longer READY (idempotency)", async () => {
    const mockSubmittedApp = {
      id: mockAppId,
      organizationId: mockOrgId,
      status: ApplicationStatus.SUBMITTED,
      approvalStatus: ApplicationApprovalStatus.APPROVED,
      candidate: { status: CandidateStatus.ACTIVE },
      job: { status: JobStatus.OPEN },
    };

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue(mockSubmittedApp),
        },
      };
      return callback(tx as any);
    });

    await expect(
      recordApplicationSubmissionAction({
        applicationId: mockAppId,
        confirmationEvidence: "Duplicate attempt",
      })
    ).rejects.toThrow(/Cannot record submission for application in status: SUBMITTED/);
  });
});
