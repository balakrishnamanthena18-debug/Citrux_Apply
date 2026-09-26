import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  recordSubmissionIssueAction,
  startCorrectionReviewAction,
  approveSubmissionCorrectionAction,
  stageApplicationResubmissionAction,
  recordApplicationResubmissionAction,
} from "@/lib/submission/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import {
  ApplicationStatus,
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

describe("Phase 6 Submission Correction & Resubmission Cycle (tests/integration/submission-correction-workflow.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockEmployeeId = "22222222-2222-4222-8222-222222222222";
  const mockAppId = "33333333-3333-4333-8333-333333333333";
  const mockSubmissionId1 = "44444444-4444-4444-8444-444444444444";
  const mockSubmissionId2 = "55555555-5555-5555-8555-555555555555";

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

  it("completes full correction and resubmission cycle without mutating submission rows", async () => {
    // 1. Report Issue on SUBMITTED application
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.SUBMITTED,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppId,
            status: ApplicationStatus.SUBMISSION_ISSUE,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const issueRes = await recordSubmissionIssueAction({
      applicationId: mockAppId,
      issueDescription: "Application rejected due to missing mandatory authorization checkbox.",
    });

    expect(issueRes.success).toBe(true);
    expect(issueRes.application.status).toBe(ApplicationStatus.SUBMISSION_ISSUE);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.APPLICATION_SUBMISSION_ISSUE_RECORDED,
        entityId: mockAppId,
        details: expect.objectContaining({
          issueDescription: "Application rejected due to missing mandatory authorization checkbox.",
        }),
      })
    );

    // 2. Start Correction Review (SUBMISSION_ISSUE -> REVIEW_REQUIRED)
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.SUBMISSION_ISSUE,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppId,
            status: ApplicationStatus.REVIEW_REQUIRED,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const startReviewRes = await startCorrectionReviewAction(mockAppId);
    expect(startReviewRes.success).toBe(true);
    expect(startReviewRes.application.status).toBe(ApplicationStatus.REVIEW_REQUIRED);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.APPLICATION_CORRECTION_REVIEW_STARTED,
        entityId: mockAppId,
      })
    );

    // 3. Approve Correction Plan (REVIEW_REQUIRED -> CORRECTION_APPROVED)
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.REVIEW_REQUIRED,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppId,
            status: ApplicationStatus.CORRECTION_APPROVED,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const approveRes = await approveSubmissionCorrectionAction({
      applicationId: mockAppId,
      correctionNotes: "Prepared revised submission checklist with explicitly confirmed work authorization.",
    });

    expect(approveRes.success).toBe(true);
    expect(approveRes.application.status).toBe(ApplicationStatus.CORRECTION_APPROVED);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.APPLICATION_CORRECTION_APPROVED,
        entityId: mockAppId,
        details: expect.objectContaining({
          correctionNotes: "Prepared revised submission checklist with explicitly confirmed work authorization.",
        }),
      })
    );

    // 4. Stage Resubmission (CORRECTION_APPROVED -> RESUBMISSION)
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.CORRECTION_APPROVED,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppId,
            status: ApplicationStatus.RESUBMISSION,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const stageRes = await stageApplicationResubmissionAction({
      applicationId: mockAppId,
    });

    expect(stageRes.success).toBe(true);
    expect(stageRes.application.status).toBe(ApplicationStatus.RESUBMISSION);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.APPLICATION_RESUBMISSION_STAGED,
        entityId: mockAppId,
      })
    );

    // 5. Record Resubmission (RESUBMISSION -> SUBMITTED) with attemptNumber = 2
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.RESUBMISSION,
            candidate: { status: CandidateStatus.ACTIVE },
            job: { status: JobStatus.OPEN },
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppId,
            status: ApplicationStatus.SUBMITTED,
          }),
        },
        applicationSubmission: {
          findFirst: vi.fn().mockResolvedValue({
            id: mockSubmissionId1,
            attemptNumber: 1,
          }),
          create: vi.fn().mockResolvedValue({
            id: mockSubmissionId2,
            applicationId: mockAppId,
            attemptNumber: 2,
            submittedById: mockEmployeeId,
            externalReference: "LEVER-CONFIRM-RESUB-9902",
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const resubRes = await recordApplicationResubmissionAction({
      applicationId: mockAppId,
      externalReference: "LEVER-CONFIRM-RESUB-9902",
      confirmationEvidence: "Second submission accepted with reference LEVER-CONFIRM-RESUB-9902.",
      submissionNotes: "Resubmission completed successfully.",
    });

    expect(resubRes.success).toBe(true);
    expect(resubRes.submission.attemptNumber).toBe(2);
    expect(resubRes.application.status).toBe(ApplicationStatus.SUBMITTED);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.APPLICATION_RESUBMITTED,
        entityId: mockAppId,
        details: expect.objectContaining({
          submissionId: mockSubmissionId2,
          attemptNumber: 2,
        }),
      })
    );
  });
});
