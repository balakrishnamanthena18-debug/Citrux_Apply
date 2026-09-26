import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  recordApplicationSubmissionAction,
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
import { ValidationError, InvalidStateTransitionError } from "@/lib/errors";

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

describe("Phase 6 Submission Precondition Guards (tests/integration/submission-guards.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockEmployeeId = "22222222-2222-4222-8222-222222222222";
  const mockAppId = "33333333-3333-4333-8333-333333333333";

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

  it("blocks initial submission if application status is not READY", async () => {
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.PREPARING,
            approvalStatus: ApplicationApprovalStatus.APPROVED,
            candidate: { status: CandidateStatus.ACTIVE },
            job: { status: JobStatus.OPEN },
          }),
        },
      };
      return callback(tx as any);
    });

    await expect(
      recordApplicationSubmissionAction({
        applicationId: mockAppId,
        confirmationEvidence: "Evidence",
      })
    ).rejects.toThrow(InvalidStateTransitionError);
  });

  it("blocks initial submission if candidate approval is not APPROVED", async () => {
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.READY,
            approvalStatus: ApplicationApprovalStatus.PENDING,
            candidate: { status: CandidateStatus.ACTIVE },
            job: { status: JobStatus.OPEN },
          }),
        },
      };
      return callback(tx as any);
    });

    await expect(
      recordApplicationSubmissionAction({
        applicationId: mockAppId,
        confirmationEvidence: "Evidence",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("blocks initial submission if candidate consent is not ACTIVE", async () => {
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.READY,
            approvalStatus: ApplicationApprovalStatus.APPROVED,
            candidate: { status: CandidateStatus.ARCHIVED },
            job: { status: JobStatus.OPEN },
          }),
        },
      };
      return callback(tx as any);
    });

    await expect(
      recordApplicationSubmissionAction({
        applicationId: mockAppId,
        confirmationEvidence: "Evidence",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("blocks initial submission if job listing is CLOSED or ARCHIVED", async () => {
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.READY,
            approvalStatus: ApplicationApprovalStatus.APPROVED,
            candidate: { status: CandidateStatus.ACTIVE },
            job: { status: JobStatus.CLOSED },
          }),
        },
      };
      return callback(tx as any);
    });

    await expect(
      recordApplicationSubmissionAction({
        applicationId: mockAppId,
        confirmationEvidence: "Evidence",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("blocks resubmission if application status is not RESUBMISSION", async () => {
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.CORRECTION_APPROVED,
            candidate: { status: CandidateStatus.ACTIVE },
            job: { status: JobStatus.OPEN },
          }),
        },
      };
      return callback(tx as any);
    });

    await expect(
      recordApplicationResubmissionAction({
        applicationId: mockAppId,
        confirmationEvidence: "Evidence",
      })
    ).rejects.toThrow(InvalidStateTransitionError);
  });
});
