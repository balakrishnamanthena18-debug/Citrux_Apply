import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  submitApplicationForQaAction,
  completeQaReviewAction,
} from "@/lib/qa/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { ApplicationStatus, ApplicationApprovalStatus, AuditAction, QaDecision } from "@/generated/prisma";
import { QA_CRITERION_KEYS } from "@/lib/validation/qa.schemas";
import { ValidationError } from "@/lib/errors";

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

describe("QA Review Workflow Integration (tests/integration/qa-review-workflow.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockEmployeeId = "22222222-2222-4222-8222-222222222222";
  const mockAppId = "66666666-6666-4666-8666-666666666666";

  const buildChecklist = (allVerified: boolean = true) =>
    QA_CRITERION_KEYS.map((criterionKey) => ({
      criterionKey,
      isVerified: allVerified,
    }));

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

  it("1. Staff submits application for QA review (PREPARING -> REVIEW)", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.PREPARING,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppId,
            status: ApplicationStatus.REVIEW,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "history-1" }),
        },
      };
      return callback(tx as any);
    });

    const result = await submitApplicationForQaAction(mockAppId);
    expect(result.success).toBe(true);
    expect(result.application.status).toBe(ApplicationStatus.REVIEW);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.APPLICATION_SUBMITTED_FOR_QA,
        entityId: mockAppId,
      })
    );
  });

  it("2. Staff completes QA review with PASS and all 9 criteria verified -> moves to AWAITING_APPROVAL", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.REVIEW,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppId,
            status: ApplicationStatus.AWAITING_APPROVAL,
            approvalStatus: ApplicationApprovalStatus.PENDING,
            approvalRequestedAt: new Date(),
          }),
        },
        applicationQaReview: {
          create: vi.fn().mockResolvedValue({
            id: "qa-review-1",
            organizationId: mockOrgId,
            applicationId: mockAppId,
            decision: QaDecision.PASS,
          }),
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
      notes: "All materials verified and aligned with job requirements.",
      checklistItems: buildChecklist(true),
    });

    expect(result.success).toBe(true);
    expect(result.application.status).toBe(ApplicationStatus.AWAITING_APPROVAL);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.APPLICATION_QA_PASSED,
      })
    );
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.APPLICATION_APPROVAL_REQUESTED,
      })
    );
  });

  it("3. Reject QA PASS if any criterion is unverified (isVerified = false)", async () => {
    const checklistWithOneUnverified = buildChecklist(true);
    const firstItem = checklistWithOneUnverified[0];
    if (firstItem) {
      firstItem.isVerified = false;
    }

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.REVIEW,
          }),
        },
      };
      return callback(tx as any);
    });

    await expect(
      completeQaReviewAction({
        applicationId: mockAppId,
        decision: "PASS",
        notes: null,
        checklistItems: checklistWithOneUnverified,
      })
    ).rejects.toThrow(ValidationError);
  });

  it("4. Staff completes QA review with FAIL and notes -> returns to PREPARING", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.REVIEW,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppId,
            status: ApplicationStatus.PREPARING,
          }),
        },
        applicationQaReview: {
          create: vi.fn().mockResolvedValue({
            id: "qa-review-2",
            organizationId: mockOrgId,
            applicationId: mockAppId,
            decision: QaDecision.FAIL,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "history-3" }),
        },
      };
      return callback(tx as any);
    });

    const result = await completeQaReviewAction({
      applicationId: mockAppId,
      decision: "FAIL",
      notes: "Resume needs updated skills section for React 19.",
      checklistItems: buildChecklist(false),
    });

    expect(result.success).toBe(true);
    expect(result.application.status).toBe(ApplicationStatus.PREPARING);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.APPLICATION_QA_FAILED,
      })
    );
  });
});
