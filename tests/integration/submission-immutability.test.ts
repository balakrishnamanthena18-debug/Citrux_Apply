import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  recordApplicationSubmissionAction,
  recordSubmissionIssueAction,
  approveSubmissionCorrectionAction,
  recordApplicationResubmissionAction,
} from "@/lib/submission/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import {
  ApplicationStatus,
  ApplicationApprovalStatus,
  CandidateStatus,
  JobStatus,
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

describe("Phase 6 Submission Append-Only Immutability Verification (tests/integration/submission-immutability.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockEmployeeId = "22222222-2222-4222-8222-222222222222";
  const mockAppId = "33333333-3333-4333-8333-333333333333";
  const mockSubId1 = "44444444-4444-4444-8444-444444444444";

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

  it("ensures recordSubmissionIssueAction does not call update on applicationSubmission", async () => {
    const updateSubmissionMock = vi.fn();

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
        applicationSubmission: {
          update: updateSubmissionMock,
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    await recordSubmissionIssueAction({
      applicationId: mockAppId,
      issueDescription: "Issue observed during confirmation check",
    });

    expect(updateSubmissionMock).not.toHaveBeenCalled();
  });

  it("ensures approveSubmissionCorrectionAction does not call update on applicationSubmission", async () => {
    const updateSubmissionMock = vi.fn();

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
        applicationSubmission: {
          update: updateSubmissionMock,
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    await approveSubmissionCorrectionAction({
      applicationId: mockAppId,
      correctionNotes: "Correction notes approved without mutating submission records",
    });

    expect(updateSubmissionMock).not.toHaveBeenCalled();
  });

  it("preserves historical attempt 1 record intact when creating attempt 2 resubmission", async () => {
    const attempt1Record = {
      id: mockSubId1,
      applicationId: mockAppId,
      attemptNumber: 1,
      submittedById: mockEmployeeId,
      externalReference: "INITIAL-ATTEMPT-REF",
      storagePath: "tenants/org/applications/app/submissions/attempt-1.png",
      confirmationEvidence: "Original confirmation text",
    };

    const createSubmissionMock = vi.fn().mockResolvedValue({
      id: "55555555-5555-5555-8555-555555555555",
      applicationId: mockAppId,
      attemptNumber: 2,
      submittedById: mockEmployeeId,
      externalReference: "SECOND-ATTEMPT-REF",
    });

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
          findFirst: vi.fn().mockResolvedValue(attempt1Record),
          create: createSubmissionMock,
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const result = await recordApplicationResubmissionAction({
      applicationId: mockAppId,
      externalReference: "SECOND-ATTEMPT-REF",
      confirmationEvidence: "New resubmission evidence",
    });

    expect(result.success).toBe(true);
    expect(createSubmissionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attemptNumber: 2,
          externalReference: "SECOND-ATTEMPT-REF",
        }),
      })
    );

    // Attempt 1 record was only read via findFirst, never mutated
    expect(attempt1Record.attemptNumber).toBe(1);
    expect(attempt1Record.externalReference).toBe("INITIAL-ATTEMPT-REF");
  });

  it("stores issueDescription and correctionNotes exclusively in ApplicationStateHistory.reason", async () => {
    const stateHistoryCreateMock = vi.fn().mockResolvedValue({});
    const issueText = "Mandatory screening question answer rejected by employer ATS";
    const correctionText = "Provided expanded work history details in cover letter";

    // 1. Issue Recording
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
          create: stateHistoryCreateMock,
        },
      };
      return callback(tx as any);
    });

    await recordSubmissionIssueAction({
      applicationId: mockAppId,
      issueDescription: issueText,
    });

    expect(stateHistoryCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: ApplicationStatus.SUBMITTED,
          toStatus: ApplicationStatus.SUBMISSION_ISSUE,
          reason: issueText,
        }),
      })
    );

    // 2. Correction Approval
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
          create: stateHistoryCreateMock,
        },
      };
      return callback(tx as any);
    });

    await approveSubmissionCorrectionAction({
      applicationId: mockAppId,
      correctionNotes: correctionText,
    });

    expect(stateHistoryCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: ApplicationStatus.REVIEW_REQUIRED,
          toStatus: ApplicationStatus.CORRECTION_APPROVED,
          reason: correctionText,
        }),
      })
    );
  });
});
