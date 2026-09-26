import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  recordApplicationSubmissionAction,
  recordSubmissionIssueAction,
  reviewSubmissionIssueAction,
  approveSubmissionCorrectionAction,
  stageApplicationResubmissionAction,
  recordApplicationResubmissionAction,
} from "@/lib/application/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { ApplicationStatus } from "@/generated/prisma";

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

describe("Application Submission & Correction Cycle (tests/integration/application-submission-correction.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockEmployeeId = "22222222-2222-4222-8222-222222222222";
  const mockAppId = "66666666-6666-4666-8666-666666666666";
  const mockSubId1 = "77777777-7777-4777-8777-777777777777";
  const mockSubId2 = "88888888-8888-4888-8888-888888888888";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@test.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });
  });

  it("1. Records initial manual external submission with attemptNumber = 1 and evidence", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.READY,
            job: { status: "OPEN" },
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        applicationSubmission: {
          create: vi.fn().mockResolvedValue({
            id: mockSubId1,
            applicationId: mockAppId,
            attemptNumber: 1,
            externalReference: "LEVER-12345",
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const result = await recordApplicationSubmissionAction({
      applicationId: mockAppId,
      externalReference: "LEVER-12345",
      confirmationEvidence: "Thank you for applying to Stripe! We received your application.",
      submissionNotes: "Submitted via Lever portal",
    });

    expect(result.success).toBe(true);
    expect(result.data?.submissionId).toBe(mockSubId1);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "APPLICATION_SUBMITTED",
        entityId: mockSubId1,
        details: expect.objectContaining({ attemptNumber: 1 }),
      })
    );
  });

  it("2. Records submission issue (SUBMITTED -> SUBMISSION_ISSUE)", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.SUBMITTED,
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const result = await recordSubmissionIssueAction({
      applicationId: mockAppId,
      issueDescription: "Portal reported missing mandatory portfolio link field",
    });

    expect(result.success).toBe(true);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "APPLICATION_SUBMISSION_ISSUE",
        entityId: mockAppId,
      })
    );
  });

  it("3. Starts review and approves correction plan (SUBMISSION_ISSUE -> REVIEW_REQUIRED -> CORRECTION_APPROVED)", async () => {
    // Review Issue
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.SUBMISSION_ISSUE,
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const reviewRes = await reviewSubmissionIssueAction(mockAppId);
    expect(reviewRes.success).toBe(true);

    // Approve Correction
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.REVIEW_REQUIRED,
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const approveRes = await approveSubmissionCorrectionAction({
      applicationId: mockAppId,
      correctionNotes: "Added portfolio URL in application material notes",
    });

    expect(approveRes.success).toBe(true);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "APPLICATION_CORRECTION_APPROVED",
        entityId: mockAppId,
      })
    );
  });

  it("4. Stages and executes resubmission with incremented attemptNumber = 2", async () => {
    // Stage Resubmission
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.CORRECTION_APPROVED,
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const stageRes = await stageApplicationResubmissionAction(mockAppId);
    expect(stageRes.success).toBe(true);

    // Record Resubmission
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.RESUBMISSION,
            submissions: [{ id: mockSubId1, attemptNumber: 1 }],
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        applicationSubmission: {
          create: vi.fn().mockResolvedValue({
            id: mockSubId2,
            applicationId: mockAppId,
            attemptNumber: 2,
            externalReference: "LEVER-12345-RESUB",
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const resubResult = await recordApplicationResubmissionAction({
      applicationId: mockAppId,
      externalReference: "LEVER-12345-RESUB",
      confirmationEvidence: "Resubmission confirmed by Stripe portal.",
    });

    expect(resubResult.success).toBe(true);
    expect(resubResult.data?.submissionId).toBe(mockSubId2);
    expect(resubResult.data?.attemptNumber).toBe(2);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "APPLICATION_RESUBMITTED",
        entityId: mockSubId2,
        details: expect.objectContaining({ attemptNumber: 2 }),
      })
    );
  });
});
