import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  completeQaReviewAction,
  candidateApproveApplicationAction,
} from "@/lib/qa/actions";
import {
  recordApplicationSubmissionAction,
  recordSubmissionIssueAction,
  approveSubmissionCorrectionAction,
  stageApplicationResubmissionAction,
  recordApplicationResubmissionAction,
} from "@/lib/submission/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import {
  ApplicationStatus,
  ApplicationApprovalStatus,
  CandidateStatus,
  JobStatus,
  QaDecision,
} from "@/generated/prisma";
import { QA_CRITERION_KEYS } from "@/lib/validation/qa.schemas";
import { ValidationError, AuthorizationError } from "@/lib/errors";
import { authoritativeQaTxMocks } from "../../helpers/authoritative-qa-mock";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireEmployeeOrAdmin: vi.fn((ctx) => {
    if (ctx.role !== "EMPLOYEE" && ctx.role !== "ADMIN") {
      throw new AuthorizationError("Operation requires EMPLOYEE or ADMIN role");
    }
  }),
  requireCandidate: vi.fn((ctx) => {
    if (ctx.role !== "CANDIDATE") {
      throw new AuthorizationError("Operation requires CANDIDATE role");
    }
  }),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

describe("Phase 9 Golden Path — QA Review, Candidate Approval & Immutable Submission (tests/integration/golden-path/qa-approval-submission.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockEmployeeId = "22222222-2222-4222-8222-222222222222";
  const mockCandidateUserId = "33333333-3333-4333-8333-333333333333";
  const mockCandidateId = "44444444-4444-4444-8444-444444444444";
  const mockAppAId = "66666666-6666-4666-8666-666666666666";
  const mockSubmissionId = "77777777-7777-4777-8777-777777777777";

  const buildAllPassChecklist = () =>
    QA_CRITERION_KEYS.map((criterionKey) => ({
      criterionKey,
      isVerified: true,
    }));

  const buildFailingChecklist = (failIndex: number = 0) =>
    QA_CRITERION_KEYS.map((criterionKey, idx) => ({
      criterionKey,
      isVerified: idx !== failIndex,
    }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Step 13: QA review failure requires mandatory non-empty notes (trim <= 5000 chars, no 10 char minimum)", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@alpha.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    // Submitting FAIL without notes or whitespace only must fail Zod validation
    await expect(
      completeQaReviewAction({
        applicationId: mockAppAId,
        decision: "FAIL",
        checklistItems: buildFailingChecklist(0),
        notes: "   ", // whitespace only
      })
    ).rejects.toThrow();

    // Submitting FAIL with valid concise notes (e.g. 5 chars) succeeds
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppAId,
            organizationId: mockOrgId,
            status: ApplicationStatus.REVIEW,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppAId,
            status: ApplicationStatus.REVIEW,
          }),
        },
        applicationQaReview: {
          create: vi.fn().mockResolvedValue({
            id: "qa-rev-fail",
            applicationId: mockAppAId,
            reviewerId: mockEmployeeId,
            decision: QaDecision.FAIL,
            notes: "Fix resume formatting",
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-fail" }),
        },
      };
      return callback(tx as any);
    });

    const failedQaRes = await completeQaReviewAction({
      applicationId: mockAppAId,
      decision: "FAIL",
      checklistItems: buildFailingChecklist(0),
      notes: "Fix resume formatting",
    });
    expect(failedQaRes.success).toBe(true);
    expect(failedQaRes.qaReview?.decision).toBe(QaDecision.FAIL);
  });

  it("Step 13: Staff conducts unanimous 9-Point QA review -> PASS and moves to AWAITING_APPROVAL", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@alpha.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppAId,
            organizationId: mockOrgId,
            status: ApplicationStatus.REVIEW,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppAId,
            status: ApplicationStatus.AWAITING_APPROVAL,
            approvalStatus: ApplicationApprovalStatus.PENDING,
            approvalRequestedAt: new Date(),
          }),
        },
        applicationQaReview: {
          create: vi.fn().mockResolvedValue({
            id: "qa-rev-pass",
            applicationId: mockAppAId,
            reviewerId: mockEmployeeId,
            decision: QaDecision.PASS,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-qa-pass" }),
        },
      };
      return callback(tx as any);
    });

    const qaPassRes = await completeQaReviewAction({
      applicationId: mockAppAId,
      decision: "PASS",
      checklistItems: buildAllPassChecklist(),
      notes: "All 9 QA criteria completely verified.",
    });

    expect(qaPassRes.success).toBe(true);
    expect(qaPassRes.qaReview?.decision).toBe(QaDecision.PASS);
    expect(qaPassRes.application.status).toBe(ApplicationStatus.AWAITING_APPROVAL);
  });

  it("Step 15 & 16: Candidate reviews & submits explicit approval -> authorizes AWAITING_APPROVAL -> READY", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "candidate@alpha.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

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
            id: mockAppAId,
            organizationId: mockOrgId,
            candidateId: mockCandidateId,
            status: ApplicationStatus.AWAITING_APPROVAL,
            job: { id: "job-1", status: JobStatus.OPEN },
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppAId,
            status: ApplicationStatus.READY,
            approvalStatus: ApplicationApprovalStatus.APPROVED,
            approvedBy: mockCandidateUserId,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-approved-ready" }),
        },
        ...authoritativeQaTxMocks(),
      };
      return callback(tx as any);
    });

    const approveRes = await candidateApproveApplicationAction({
      applicationId: mockAppAId,
    });

    expect(approveRes.success).toBe(true);
    expect(approveRes.application.status).toBe(ApplicationStatus.READY);
  });

  it("Step 17 & 18: Staff performs manual external submission -> Uploads & Links Immutable Submission Evidence", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@alpha.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    const mockApp = {
      id: mockAppAId,
      organizationId: mockOrgId,
      status: ApplicationStatus.READY,
      approvalStatus: ApplicationApprovalStatus.APPROVED,
      candidate: { status: CandidateStatus.ACTIVE },
      job: { status: JobStatus.OPEN },
    };

    const mockSubmission = {
      id: mockSubmissionId,
      applicationId: mockAppAId,
      attemptNumber: 1,
      submittedById: mockEmployeeId,
      externalReference: "STRIPE-REF-10023",
      externalUrl: "https://stripe.com/jobs/apply/confirmation",
      confirmationEvidence: "Application submission confirmation page captured.",
      storagePath: `tenants/${mockOrgId}/applications/${mockAppAId}/submissions/evidence-1.pdf`,
      submissionNotes: "Submitted through Greenhouse portal.",
      submittedAt: new Date(),
      createdAt: new Date(),
    };

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue(mockApp),
          update: vi.fn().mockResolvedValue({
            id: mockAppAId,
            status: ApplicationStatus.SUBMITTED,
            submittedAt: new Date(),
          }),
        },
        applicationSubmission: {
          findFirst: vi.fn().mockResolvedValue(null), // attempt 1
          create: vi.fn().mockResolvedValue(mockSubmission),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-submitted" }),
        },
      };
      return callback(tx as any);
    });

    const subRes = await recordApplicationSubmissionAction({
      applicationId: mockAppAId,
      externalReference: "STRIPE-REF-10023",
      externalUrl: "https://stripe.com/jobs/apply/confirmation",
      confirmationEvidence: "Application submission confirmation page captured.",
      storagePath: `tenants/${mockOrgId}/applications/${mockAppAId}/submissions/evidence-1.pdf`,
      submissionNotes: "Submitted through Greenhouse portal.",
    });

    expect(subRes.success).toBe(true);
    expect(subRes.submission.attemptNumber).toBe(1);
    expect(subRes.application.status).toBe(ApplicationStatus.SUBMITTED);
  });

  it("Executes post-submission correction lifecycle: SUBMISSION_ISSUE -> REVIEW_REQUIRED -> CORRECTION_APPROVED -> RESUBMISSION -> SUBMITTED", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@alpha.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    // 1. Issue Flagged: SUBMISSION_ISSUE -> moves to REVIEW_REQUIRED
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppAId,
            organizationId: mockOrgId,
            status: ApplicationStatus.SUBMITTED,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppAId,
            status: ApplicationStatus.REVIEW_REQUIRED,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-issue" }),
        },
      };
      return callback(tx as any);
    });

    const issueRes = await recordSubmissionIssueAction({
      applicationId: mockAppAId,
      issueDescription: "Incorrect work authorization attachment detected on portal.",
    });
    expect(issueRes.success).toBe(true);
    expect(issueRes.application.status).toBe(ApplicationStatus.REVIEW_REQUIRED);

    // 2. Correction Approved -> moves to CORRECTION_APPROVED
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppAId,
            organizationId: mockOrgId,
            status: ApplicationStatus.REVIEW_REQUIRED,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppAId,
            status: ApplicationStatus.CORRECTION_APPROVED,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-corr-app" }),
        },
      };
      return callback(tx as any);
    });

    const corrAppRes = await approveSubmissionCorrectionAction({
      applicationId: mockAppAId,
      correctionNotes: "Work authorization re-verified and updated.",
    });
    expect(corrAppRes.success).toBe(true);
    expect(corrAppRes.application.status).toBe(ApplicationStatus.CORRECTION_APPROVED);

    // 3. Stage Resubmission -> moves to RESUBMISSION
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppAId,
            organizationId: mockOrgId,
            status: ApplicationStatus.CORRECTION_APPROVED,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppAId,
            status: ApplicationStatus.RESUBMISSION,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-stage-resub" }),
        },
      };
      return callback(tx as any);
    });

    const stageRes = await stageApplicationResubmissionAction({
      applicationId: mockAppAId,
    });
    expect(stageRes.success).toBe(true);
    expect(stageRes.application.status).toBe(ApplicationStatus.RESUBMISSION);

    // 4. Record Resubmission (Attempt 2) -> moves to SUBMITTED
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppAId,
            organizationId: mockOrgId,
            status: ApplicationStatus.RESUBMISSION,
            candidate: { status: CandidateStatus.ACTIVE },
            job: { status: JobStatus.OPEN },
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppAId,
            status: ApplicationStatus.SUBMITTED,
          }),
        },
        applicationSubmission: {
          findFirst: vi.fn().mockResolvedValue({ attemptNumber: 1 }), // previous attempt was 1
          create: vi.fn().mockResolvedValue({
            id: "sub-attempt-2",
            applicationId: mockAppAId,
            attemptNumber: 2,
            storagePath: `tenants/${mockOrgId}/applications/${mockAppAId}/submissions/evidence-2.pdf`,
            externalReference: "STRIPE-REF-10023-V2",
            externalUrl: "https://stripe.com/jobs/apply/confirmation",
            confirmationEvidence: "Resubmission confirmed.",
            submissionNotes: "Resubmitted with corrected documentation.",
            submittedById: mockEmployeeId,
            submittedAt: new Date(),
            createdAt: new Date(),
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-resub" }),
        },
      };
      return callback(tx as any);
    });

    const resubRes = await recordApplicationResubmissionAction({
      applicationId: mockAppAId,
      externalReference: "STRIPE-REF-10023-V2",
      externalUrl: "https://stripe.com/jobs/apply/confirmation",
      confirmationEvidence: "Resubmission confirmed.",
      submissionNotes: "Resubmitted with corrected documentation.",
    });

    expect(resubRes.success).toBe(true);
    expect(resubRes.submission.attemptNumber).toBe(2);
    expect(resubRes.application.status).toBe(ApplicationStatus.SUBMITTED);
  });
});
