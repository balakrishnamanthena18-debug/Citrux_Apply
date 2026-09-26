import { describe, it, expect, vi, beforeEach } from "vitest";
import { completeQaReviewAction, candidateApproveApplicationAction } from "@/lib/qa/actions";
import { recordApplicationSubmissionAction } from "@/lib/submission/actions";
import { updateCandidateAuthorizationModeAction } from "@/lib/candidate/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import {
  ApplicationStatus,
  ApplicationApprovalStatus,
  CandidateStatus,
  JobStatus,
  AuditAction,
  ApplicationAuthorizationMode,
} from "@/generated/prisma";
import { QA_CRITERION_KEYS } from "@/lib/validation/qa.schemas";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireEmployeeOrAdmin: vi.fn(),
  requireCandidate: vi.fn(),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

describe("Optional Candidate Approval & Managed Authorization Integration (tests/integration/optional-candidate-approval.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockEmployeeId = "22222222-2222-4222-8222-222222222222";
  const mockCandidateUserId = "33333333-3333-4333-8333-333333333333";
  const mockCandidateId = "44444444-4444-4444-8444-444444444444";
  const mockJobId = "55555555-5555-4555-8555-555555555555";
  const mockAppId = "66666666-6666-4666-8666-666666666666";
  const mockSubmissionId = "77777777-7777-4777-8777-777777777777";

  const buildChecklist = (allVerified: boolean = true) =>
    QA_CRITERION_KEYS.map((criterionKey) => ({
      criterionKey,
      isVerified: allVerified,
    }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("A. MANAGED Path — Direct Advance to READY upon QA PASS", () => {
    it("advances application directly to READY when candidate is in MANAGED mode and all preference boundaries pass", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockEmployeeId,
        email: "staff@citrux.com",
        role: "EMPLOYEE" as any,
        organizationId: mockOrgId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      const mockApp = {
        id: mockAppId,
        organizationId: mockOrgId,
        status: ApplicationStatus.REVIEW,
        approvalStatus: null,
        candidateId: mockCandidateId,
        jobId: mockJobId,
        candidate: {
          id: mockCandidateId,
          userId: mockCandidateUserId,
          status: CandidateStatus.ACTIVE,
          applicationAuthorizationMode: ApplicationAuthorizationMode.MANAGED,
          desiredSalaryMin: 100000,
          remotePreference: "REMOTE_OK",
        },
        job: {
          id: mockJobId,
          title: "Staff Engineer",
          companyName: "Stripe",
          status: JobStatus.OPEN,
          salaryMax: 150000,
          isRemote: true,
        },
      };

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          application: {
            findUnique: vi.fn().mockResolvedValue(mockApp),
            update: vi.fn().mockResolvedValue({
              ...mockApp,
              status: ApplicationStatus.READY,
              approvalStatus: ApplicationApprovalStatus.APPROVED,
            }),
          },
          applicationQaReview: {
            create: vi.fn().mockResolvedValue({ id: "qa-review-1", decision: "PASS" }),
          },
          applicationStateHistory: {
            create: vi.fn().mockResolvedValue({ id: "history-1" }),
          },
        };
        return callback(tx as any);
      });

      const result = await completeQaReviewAction({
        applicationId: mockAppId,
        decision: "PASS",
        notes: "Flawless application",
        checklistItems: buildChecklist(true),
      });

      expect(result.success).toBe(true);
      expect(result.application.status).toBe(ApplicationStatus.READY);
      expect(result.application.approvalStatus).toBe(ApplicationApprovalStatus.APPROVED);

      // Verify audit events
      expect(logUserAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.APPLICATION_QA_PASSED,
          entityId: mockAppId,
        })
      );
      expect(logUserAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.APPLICATION_ADVANCED_TO_READY_MANAGED,
          entityId: mockAppId,
          details: expect.objectContaining({
            authorizationMode: "MANAGED",
          }),
        })
      );
    });

    it("allows staff to record external submission on READY application and sends transactional notification", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockEmployeeId,
        email: "staff@citrux.com",
        role: "EMPLOYEE" as any,
        organizationId: mockOrgId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      const mockApp = {
        id: mockAppId,
        organizationId: mockOrgId,
        status: ApplicationStatus.READY,
        approvalStatus: ApplicationApprovalStatus.APPROVED,
        candidateId: mockCandidateId,
        candidate: {
          id: mockCandidateId,
          userId: mockCandidateUserId,
          status: CandidateStatus.ACTIVE,
          applicationAuthorizationMode: ApplicationAuthorizationMode.MANAGED,
        },
        job: {
          id: mockJobId,
          title: "Staff Engineer",
          companyName: "Stripe",
          status: JobStatus.OPEN,
        },
      };

      const mockNotificationCreate = vi.fn().mockResolvedValue({ id: "notif-1" });

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
            create: vi.fn().mockResolvedValue({
              id: mockSubmissionId,
              applicationId: mockAppId,
              attemptNumber: 1,
              submittedById: mockEmployeeId,
              externalReference: "STRIPE-12345",
              externalUrl: "https://stripe.com/jobs/123",
              confirmationEvidence: "Submitted successfully",
              storagePath: "tenants/mockOrg/applications/mockApp/submissions/evidence.png",
            }),
          },
          applicationStateHistory: {
            create: vi.fn().mockResolvedValue({ id: "history-sub-1" }),
          },
          notification: {
            create: mockNotificationCreate,
          },
          user: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockCandidateUserId,
              email: "candidate@test.com",
              firstName: "Alice",
            }),
          },
        };
        return callback(tx as any);
      });

      const subResult = await recordApplicationSubmissionAction({
        applicationId: mockAppId,
        externalReference: "STRIPE-12345",
        externalUrl: "https://stripe.com/jobs/123",
        confirmationEvidence: "Submitted successfully",
        storagePath: "tenants/mockOrg/applications/mockApp/submissions/evidence.png",
        submissionNotes: "Human applied via greenhouse",
      });

      expect(subResult.success).toBe(true);
      expect(subResult.application.status).toBe(ApplicationStatus.SUBMITTED);
      expect(mockNotificationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recipientId: mockCandidateUserId,
            title: expect.stringContaining("Application Submitted"),
          }),
        })
      );
    }, 15000);
  });

  describe("B. REVIEW_REQUIRED Path — Candidate Approval Required", () => {
    it("routes application to AWAITING_APPROVAL when candidate is in REVIEW_REQUIRED mode", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockEmployeeId,
        email: "staff@citrux.com",
        role: "EMPLOYEE" as any,
        organizationId: mockOrgId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      const mockApp = {
        id: mockAppId,
        organizationId: mockOrgId,
        status: ApplicationStatus.REVIEW,
        approvalStatus: null,
        candidateId: mockCandidateId,
        jobId: mockJobId,
        candidate: {
          id: mockCandidateId,
          userId: mockCandidateUserId,
          status: CandidateStatus.ACTIVE,
          applicationAuthorizationMode: ApplicationAuthorizationMode.REVIEW_REQUIRED,
          desiredSalaryMin: 100000,
          remotePreference: "REMOTE_OK",
        },
        job: {
          id: mockJobId,
          title: "Staff Engineer",
          companyName: "Stripe",
          status: JobStatus.OPEN,
          salaryMax: 150000,
          isRemote: true,
        },
      };

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          application: {
            findUnique: vi.fn().mockResolvedValue(mockApp),
            update: vi.fn().mockResolvedValue({
              ...mockApp,
              status: ApplicationStatus.AWAITING_APPROVAL,
              approvalStatus: ApplicationApprovalStatus.PENDING,
            }),
          },
          applicationQaReview: {
            create: vi.fn().mockResolvedValue({ id: "qa-review-2", decision: "PASS" }),
          },
          applicationStateHistory: {
            create: vi.fn().mockResolvedValue({ id: "history-2" }),
          },
        };
        return callback(tx as any);
      });

      const result = await completeQaReviewAction({
        applicationId: mockAppId,
        decision: "PASS",
        notes: "Good to go for candidate review",
        checklistItems: buildChecklist(true),
      });

      expect(result.success).toBe(true);
      expect(result.application.status).toBe(ApplicationStatus.AWAITING_APPROVAL);
      expect(result.application.approvalStatus).toBe(ApplicationApprovalStatus.PENDING);
    });
  });

  describe("C. Managed Boundary Exceptions", () => {
    it("routes to AWAITING_APPROVAL if job salaryMax is below candidate desiredSalaryMin even in MANAGED mode", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockEmployeeId,
        email: "staff@citrux.com",
        role: "EMPLOYEE" as any,
        organizationId: mockOrgId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      const mockApp = {
        id: mockAppId,
        organizationId: mockOrgId,
        status: ApplicationStatus.REVIEW,
        candidate: {
          id: mockCandidateId,
          userId: mockCandidateUserId,
          status: CandidateStatus.ACTIVE,
          applicationAuthorizationMode: ApplicationAuthorizationMode.MANAGED,
          desiredSalaryMin: 180000, // Higher than job max
        },
        job: {
          id: mockJobId,
          title: "Frontend Engineer",
          companyName: "Meta",
          status: JobStatus.OPEN,
          salaryMax: 150000, // Below floor
          isRemote: true,
        },
      };

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          application: {
            findUnique: vi.fn().mockResolvedValue(mockApp),
            update: vi.fn().mockResolvedValue({
              ...mockApp,
              status: ApplicationStatus.AWAITING_APPROVAL,
              approvalStatus: ApplicationApprovalStatus.PENDING,
            }),
          },
          applicationQaReview: {
            create: vi.fn().mockResolvedValue({ id: "qa-review-3", decision: "PASS" }),
          },
          applicationStateHistory: {
            create: vi.fn().mockResolvedValue({ id: "history-3" }),
          },
        };
        return callback(tx as any);
      });

      const result = await completeQaReviewAction({
        applicationId: mockAppId,
        decision: "PASS",
        notes: "QA passed but salary is below floor",
        checklistItems: buildChecklist(true),
      });

      expect(result.success).toBe(true);
      expect(result.application.status).toBe(ApplicationStatus.AWAITING_APPROVAL);
    });

    it("routes to AWAITING_APPROVAL if candidate is REMOTE_ONLY and job is not remote even in MANAGED mode", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockEmployeeId,
        email: "staff@citrux.com",
        role: "EMPLOYEE" as any,
        organizationId: mockOrgId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      const mockApp = {
        id: mockAppId,
        organizationId: mockOrgId,
        status: ApplicationStatus.REVIEW,
        candidate: {
          id: mockCandidateId,
          userId: mockCandidateUserId,
          status: CandidateStatus.ACTIVE,
          applicationAuthorizationMode: ApplicationAuthorizationMode.MANAGED,
          remotePreference: "REMOTE_ONLY",
        },
        job: {
          id: mockJobId,
          title: "Onsite Lead",
          companyName: "Citadel",
          status: JobStatus.OPEN,
          salaryMax: 200000,
          isRemote: false, // Onsite mismatch
        },
      };

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          application: {
            findUnique: vi.fn().mockResolvedValue(mockApp),
            update: vi.fn().mockResolvedValue({
              ...mockApp,
              status: ApplicationStatus.AWAITING_APPROVAL,
              approvalStatus: ApplicationApprovalStatus.PENDING,
            }),
          },
          applicationQaReview: {
            create: vi.fn().mockResolvedValue({ id: "qa-review-4", decision: "PASS" }),
          },
          applicationStateHistory: {
            create: vi.fn().mockResolvedValue({ id: "history-4" }),
          },
        };
        return callback(tx as any);
      });

      const result = await completeQaReviewAction({
        applicationId: mockAppId,
        decision: "PASS",
        notes: "QA passed but job is onsite while candidate is remote only",
        checklistItems: buildChecklist(true),
      });

      expect(result.success).toBe(true);
      expect(result.application.status).toBe(ApplicationStatus.AWAITING_APPROVAL);
    });
  });

  describe("D. Mode Switching & Audit Logging", () => {
    it("candidate successfully switches authorization mode and logs CANDIDATE_AUTHORIZATION_MODE_CHANGED", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockCandidateUserId,
        email: "candidate@test.com",
        role: "CANDIDATE" as any,
        organizationId: mockOrgId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      const mockCandidateRecord = {
        id: mockCandidateId,
        userId: mockCandidateUserId,
        organizationId: mockOrgId,
        applicationAuthorizationMode: ApplicationAuthorizationMode.MANAGED,
      };

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          candidate: {
            findUnique: vi.fn().mockResolvedValue(mockCandidateRecord),
            update: vi.fn().mockResolvedValue({
              ...mockCandidateRecord,
              applicationAuthorizationMode: ApplicationAuthorizationMode.REVIEW_REQUIRED,
            }),
          },
        };
        return callback(tx as any);
      });

      const result = await updateCandidateAuthorizationModeAction({
        candidateId: mockCandidateId,
        authorizationMode: ApplicationAuthorizationMode.REVIEW_REQUIRED,
      });

      expect(result.success).toBe(true);
      expect(result.data?.authorizationMode).toBe(ApplicationAuthorizationMode.REVIEW_REQUIRED);
      expect(logUserAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.CANDIDATE_AUTHORIZATION_MODE_CHANGED,
          entityId: mockCandidateId,
          details: {
            fromMode: ApplicationAuthorizationMode.MANAGED,
            toMode: ApplicationAuthorizationMode.REVIEW_REQUIRED,
          },
        })
      );
    });

    it("Scenario A: Candidate switches MANAGED -> REVIEW_REQUIRED while application is in REVIEW; subsequent QA pass routes to AWAITING_APPROVAL", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockEmployeeId,
        email: "staff@citrux.com",
        role: "EMPLOYEE" as any,
        organizationId: mockOrgId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      // Application was in REVIEW when candidate switched to REVIEW_REQUIRED
      const mockApp = {
        id: mockAppId,
        organizationId: mockOrgId,
        status: ApplicationStatus.REVIEW,
        approvalStatus: null,
        candidateId: mockCandidateId,
        jobId: mockJobId,
        candidate: {
          id: mockCandidateId,
          userId: mockCandidateUserId,
          status: CandidateStatus.ACTIVE,
          applicationAuthorizationMode: ApplicationAuthorizationMode.REVIEW_REQUIRED, // switched!
        },
        job: {
          id: mockJobId,
          title: "Senior Backend Engineer",
          companyName: "Vercel",
          status: JobStatus.OPEN,
          salaryMax: 160000,
          isRemote: true,
        },
      };

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          application: {
            findUnique: vi.fn().mockResolvedValue(mockApp),
            update: vi.fn().mockResolvedValue({
              ...mockApp,
              status: ApplicationStatus.AWAITING_APPROVAL,
              approvalStatus: ApplicationApprovalStatus.PENDING,
            }),
          },
          applicationQaReview: {
            create: vi.fn().mockResolvedValue({ id: "qa-review-a", decision: "PASS" }),
          },
          applicationStateHistory: {
            create: vi.fn().mockResolvedValue({ id: "history-a" }),
          },
        };
        return callback(tx as any);
      });

      const result = await completeQaReviewAction({
        applicationId: mockAppId,
        decision: "PASS",
        notes: "QA complete",
        checklistItems: buildChecklist(true),
      });

      expect(result.success).toBe(true);
      expect(result.application.status).toBe(ApplicationStatus.AWAITING_APPROVAL);
      expect(result.application.approvalStatus).toBe(ApplicationApprovalStatus.PENDING);
    });

    it("Scenario B & D: Mode switch while application is in READY does not retroactively invalidate READY status", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockEmployeeId,
        email: "staff@citrux.com",
        role: "EMPLOYEE" as any,
        organizationId: mockOrgId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      // Application is READY (already authorized and QA passed). Candidate switches mode to REVIEW_REQUIRED.
      const mockApp = {
        id: mockAppId,
        organizationId: mockOrgId,
        status: ApplicationStatus.READY,
        approvalStatus: ApplicationApprovalStatus.APPROVED,
        candidateId: mockCandidateId,
        candidate: {
          id: mockCandidateId,
          userId: mockCandidateUserId,
          status: CandidateStatus.ACTIVE,
          applicationAuthorizationMode: ApplicationAuthorizationMode.REVIEW_REQUIRED,
        },
        job: {
          id: mockJobId,
          title: "Staff Engineer",
          companyName: "Stripe",
          status: JobStatus.OPEN,
        },
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
            create: vi.fn().mockResolvedValue({
              id: mockSubmissionId,
              applicationId: mockAppId,
              attemptNumber: 1,
              submittedById: mockEmployeeId,
            }),
          },
          applicationStateHistory: {
            create: vi.fn().mockResolvedValue({ id: "history-sub-d" }),
          },
          notification: {
            create: vi.fn().mockResolvedValue({ id: "notif-d" }),
          },
          user: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockCandidateUserId,
              email: "candidate@test.com",
            }),
          },
        };
        return callback(tx as any);
      });

      const subResult = await recordApplicationSubmissionAction({
        applicationId: mockAppId,
        externalReference: "STRIPE-777",
        externalUrl: "https://stripe.com/jobs/777",
        confirmationEvidence: "Submitted successfully",
        storagePath: "tenants/mockOrg/applications/mockApp/submissions/evidence.png",
      });

      expect(subResult.success).toBe(true);
      expect(subResult.application.status).toBe(ApplicationStatus.SUBMITTED);
    });
  });

  describe("E. Notification Failure Resilience", () => {
    it("transactional notification error does not roll back authoritative submission record", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockEmployeeId,
        email: "staff@citrux.com",
        role: "EMPLOYEE" as any,
        organizationId: mockOrgId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      const mockApp = {
        id: mockAppId,
        organizationId: mockOrgId,
        status: ApplicationStatus.READY,
        approvalStatus: ApplicationApprovalStatus.APPROVED,
        candidateId: mockCandidateId,
        candidate: {
          id: mockCandidateId,
          userId: mockCandidateUserId,
          status: CandidateStatus.ACTIVE,
          applicationAuthorizationMode: ApplicationAuthorizationMode.MANAGED,
        },
        job: {
          id: mockJobId,
          title: "DevOps Engineer",
          companyName: "Docker",
          status: JobStatus.OPEN,
        },
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
            create: vi.fn().mockResolvedValue({
              id: mockSubmissionId,
              applicationId: mockAppId,
              attemptNumber: 1,
              submittedById: mockEmployeeId,
            }),
          },
          applicationStateHistory: {
            create: vi.fn().mockResolvedValue({ id: "history-sub-res" }),
          },
          notification: {
            create: vi.fn().mockResolvedValue({ id: "notif-res" }),
          },
          user: {
            // User query fails or returns null
            findUnique: vi.fn().mockRejectedValue(new Error("SMTP down")),
          },
        };
        return callback(tx as any);
      });

      const subResult = await recordApplicationSubmissionAction({
        applicationId: mockAppId,
        externalReference: "DOCKER-999",
        externalUrl: "https://docker.com/jobs/999",
        confirmationEvidence: "Confirmed",
        storagePath: "tenants/mockOrg/applications/mockApp/submissions/evidence.png",
      });

      expect(subResult.success).toBe(true);
      expect(subResult.application.status).toBe(ApplicationStatus.SUBMITTED);
      expect(subResult.submission.id).toBe(mockSubmissionId);
    });
  });
});
