import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  startApplicationFromDeskAction,
  getCandidateLogSummaryAction,
  recordApplicationSubmissionAction,
} from "@/lib/application/actions";
import { completeQaReviewAction } from "@/lib/qa/actions";
import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import {
  ApplicationStatus,
  ApplicationApprovalStatus,
  JobStatus,
  QaDecision,
} from "@/generated/prisma";
import { QA_CRITERION_KEYS } from "@/lib/validation/qa.schemas";

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

describe("Application Desk Fast Intake & Canonical Lifecycle Integrity (tests/integration/application-log.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockEmployeeId = "22222222-2222-4222-8222-222222222222";
  const mockCandidateUserId = "33333333-3333-4333-8333-333333333333";
  const mockCandidateId = "44444444-4444-4444-8444-444444444444";
  const mockJobId = "55555555-5555-4555-8555-555555555555";
  const mockAppId = "66666666-6666-4666-8666-666666666666";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Initializes canonical Application in DISCOVERED status referencing existing jobId", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@citrux.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    const mockTx = {
      candidate: {
        findUnique: vi.fn().mockResolvedValue({
          id: mockCandidateId,
          userId: mockCandidateUserId,
          organizationId: mockOrgId,
          status: "ACTIVE",
          applicationAuthorizationMode: "MANAGED",
          user: {
            id: mockCandidateUserId,
            email: "balu@test.com",
            firstName: "Balu",
            lastName: "Manthena",
          },
        }),
      },
      job: {
        findFirst: vi.fn().mockResolvedValue({
          id: mockJobId,
          status: JobStatus.OPEN,
          title: "Staff Frontend Engineer",
          companyName: "Airbnb",
          source: "Company Career",
          visibility: "GLOBAL",
          ownerCandidateId: null,
          organizationId: mockOrgId,
        }),
        create: vi.fn(),
      },
      candidateJobOpportunity: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "99999999-9999-4999-8999-999999999999",
          candidateId: mockCandidateId,
          jobId: mockJobId,
        }),
      },
      application: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: mockAppId,
          organizationId: mockOrgId,
          candidateId: mockCandidateId,
          jobId: mockJobId,
          assignedEmployeeId: mockEmployeeId,
          status: ApplicationStatus.DISCOVERED,
        }),
      },
      applicationStateHistory: {
        create: vi.fn().mockResolvedValue({}),
      },
      internalNote: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      return callback(mockTx as any);
    });

    const result = await startApplicationFromDeskAction({
      candidateId: mockCandidateId,
      jobId: mockJobId,
      internalNotes: "Candidate fit confirmed",
    });

    expect(result.success).toBe(true);
    expect(result.data?.applicationId).toBe(mockAppId);
    expect(result.data?.jobId).toBe(mockJobId);
    expect(result.data?.isExistingJob).toBe(true);
    expect(mockTx.job.create).not.toHaveBeenCalled();

    expect(mockTx.application.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          candidateId: mockCandidateId,
          jobId: mockJobId,
          status: ApplicationStatus.DISCOVERED,
        }),
      })
    );

    expect(mockTx.applicationStateHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          applicationId: mockAppId,
          toStatus: ApplicationStatus.DISCOVERED,
        }),
      })
    );

    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "APPLICATION_CREATED",
        entityType: "Application",
        entityId: mockAppId,
        details: expect.objectContaining({ viaApplicationDesk: true, jobId: mockJobId }),
      })
    );
  });

  it("2. Rejects missing jobId at schema validation", async () => {
    const result = await startApplicationFromDeskAction({
      candidateId: mockCandidateId,
      jobId: "" as any,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/job/i);
  });

  it("3. Rejects unauthorized / missing Job (IDOR protection)", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@citrux.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    const mockTx = {
      candidate: {
        findUnique: vi.fn().mockResolvedValue({
          id: mockCandidateId,
          organizationId: mockOrgId,
          status: "ACTIVE",
          user: { firstName: "Balu", lastName: "Manthena", email: "balu@test.com" },
        }),
      },
      job: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      return callback(mockTx as any);
    });

    const result = await startApplicationFromDeskAction({
      candidateId: mockCandidateId,
      jobId: mockJobId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Job not found|unauthorized/i);
  });

  it("4. Rejects duplicate active applications for same candidate + job", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@citrux.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    const mockTx = {
      candidate: {
        findUnique: vi.fn().mockResolvedValue({
          id: mockCandidateId,
          organizationId: mockOrgId,
          status: "ACTIVE",
          user: { firstName: "Balu", lastName: "Manthena", email: "balu@test.com" },
        }),
      },
      job: {
        findFirst: vi.fn().mockResolvedValue({
          id: mockJobId,
          status: JobStatus.OPEN,
          title: "Staff Engineer",
          companyName: "Google",
          source: "LinkedIn",
          visibility: "GLOBAL",
          ownerCandidateId: null,
          organizationId: mockOrgId,
        }),
      },
      candidateJobOpportunity: {
        findUnique: vi.fn().mockResolvedValue({
          id: "99999999-9999-4999-8999-999999999999",
        }),
        create: vi.fn(),
      },
      application: {
        findFirst: vi.fn().mockResolvedValue({
          id: "existing-app-id",
          status: ApplicationStatus.PREPARING,
        }),
      },
    };

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      return callback(mockTx as any);
    });

    const result = await startApplicationFromDeskAction({
      candidateId: mockCandidateId,
      jobId: mockJobId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("already has an active application");
  });

  it("5. Rejects application initialization for archived candidate", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@citrux.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    const mockTx = {
      candidate: {
        findUnique: vi.fn().mockResolvedValue({
          id: mockCandidateId,
          organizationId: mockOrgId,
          status: "ARCHIVED",
          user: { firstName: "Old", lastName: "Candidate", email: "old@test.com" },
        }),
      },
    };

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      return callback(mockTx as any);
    });

    const result = await startApplicationFromDeskAction({
      candidateId: mockCandidateId,
      jobId: mockJobId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("archived candidate");
  });

  it("6. Rejects unauthorized candidate", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@citrux.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    const mockTx = {
      candidate: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      return callback(mockTx as any);
    });

    const result = await startApplicationFromDeskAction({
      candidateId: mockCandidateId,
      jobId: mockJobId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Candidate not found|unauthorized/i);
  });

  it("7. Completing QA with all 9 criteria advances MANAGED candidate to READY, and authoritative submission transitions to SUBMITTED", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@citrux.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    const mockAppRecord = {
      id: mockAppId,
      organizationId: mockOrgId,
      status: ApplicationStatus.REVIEW,
      candidate: {
        id: mockCandidateId,
        status: "ACTIVE",
        applicationAuthorizationMode: "MANAGED",
        desiredSalaryMin: 150000,
        remotePreference: "FLEXIBLE",
      },
      job: {
        id: mockJobId,
        status: JobStatus.OPEN,
        salaryMax: 200000,
        isRemote: true,
      },
    };

    const mockTxQa = {
      application: {
        findUnique: vi.fn().mockResolvedValue(mockAppRecord),
        update: vi.fn().mockResolvedValue({ ...mockAppRecord, status: ApplicationStatus.READY }),
      },
      applicationQaReview: {
        create: vi.fn().mockResolvedValue({ id: "qa-review-id", decision: QaDecision.PASS }),
      },
      applicationStateHistory: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      return callback(mockTxQa as any);
    });

    const allChecklistItems = QA_CRITERION_KEYS.map((k) => ({ criterionKey: k, isVerified: true }));
    const qaResult = await completeQaReviewAction({
      applicationId: mockAppId,
      decision: QaDecision.PASS,
      checklistItems: allChecklistItems,
      notes: "All 9 QA criteria verified",
    });

    expect(qaResult).toBeDefined();
    expect(mockTxQa.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockAppId },
        data: expect.objectContaining({
          status: ApplicationStatus.READY,
          approvalStatus: ApplicationApprovalStatus.APPROVED,
        }),
      })
    );

    const mockTxSubmit = {
      application: {
        findUnique: vi.fn().mockResolvedValue({
          id: mockAppId,
          organizationId: mockOrgId,
          status: ApplicationStatus.READY,
          job: { status: "OPEN" },
        }),
        update: vi.fn().mockResolvedValue({ id: mockAppId, status: ApplicationStatus.SUBMITTED }),
      },
      applicationSubmission: {
        create: vi.fn().mockResolvedValue({
          id: "sub-123",
          applicationId: mockAppId,
          attemptNumber: 1,
        }),
      },
      applicationStateHistory: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      return callback(mockTxSubmit as any);
    });

    const submitResult = await recordApplicationSubmissionAction({
      applicationId: mockAppId,
      confirmationEvidence: "Employer confirmation email received",
      externalReference: "REQ-9921",
    });

    expect(submitResult.success).toBe(true);
    expect(mockTxSubmit.applicationSubmission.create).toHaveBeenCalled();
    expect(mockTxSubmit.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockAppId },
        data: { status: ApplicationStatus.SUBMITTED },
      })
    );
  });

  it("8. getCandidateLogSummaryAction returns candidate metrics and recent applications", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@citrux.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    const mockTx = {
      candidate: {
        findUnique: vi.fn().mockResolvedValue({
          id: mockCandidateId,
          organizationId: mockOrgId,
          status: "ACTIVE",
          applicationAuthorizationMode: "MANAGED",
          user: {
            firstName: "Balu",
            lastName: "Manthena",
            email: "balu@test.com",
          },
        }),
      },
      application: {
        count: vi
          .fn()
          .mockResolvedValueOnce(4)
          .mockResolvedValueOnce(17)
          .mockResolvedValueOnce(42),
        findMany: vi.fn().mockResolvedValue([
          {
            id: mockAppId,
            status: ApplicationStatus.SUBMITTED,
            createdAt: new Date("2026-09-26T10:00:00Z"),
            job: {
              title: "Senior Frontend Engineer",
              companyName: "Airbnb",
              source: "Company Career",
              location: "Remote",
              isRemote: true,
              salaryMin: 195000,
              salaryMax: 240000,
            },
            submissions: [
              {
                attemptNumber: 1,
                submittedAt: new Date("2026-09-26T10:00:00Z"),
              },
            ],
          },
        ]),
      },
    };

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      return callback(mockTx as any);
    });

    const result = await getCandidateLogSummaryAction(mockCandidateId);

    expect(result.success).toBe(true);
    expect(result.data?.candidate.fullName).toBe("Balu Manthena");
    expect(result.data?.candidate.applicationAuthorizationMode).toBe("MANAGED");
    expect(result.data?.metrics.today).toBe(4);
    expect(result.data?.metrics.thisWeek).toBe(17);
    expect(result.data?.metrics.totalSubmitted).toBe(42);
    expect(result.data?.recentApplications).toHaveLength(1);
    expect(result.data?.recentApplications?.[0]?.companyName).toBe("Airbnb");
  });
});
