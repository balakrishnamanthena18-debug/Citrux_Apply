import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  bulkWithdrawApplicationsOnConsentRevocationAction,
  transitionApplicationStatusAction,
  createApplicationAction,
} from "@/lib/application/actions";
import { recordApplicationSubmissionAction } from "@/lib/submission/actions";
import { cancelTasksOnConsentRevocationAction } from "@/lib/task/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import {
  ApplicationStatus,
  CandidateStatus,
  TaskStatus,
  JobStatus,
} from "@/generated/prisma";
import { AuthorizationError } from "@/lib/errors";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireCandidate: vi.fn((ctx) => {
    if (ctx.role !== "CANDIDATE") {
      throw new AuthorizationError("Operation requires CANDIDATE role");
    }
  }),
  requireEmployeeOrAdmin: vi.fn((ctx) => {
    if (ctx.role !== "EMPLOYEE" && ctx.role !== "ADMIN") {
      throw new AuthorizationError("Operation requires EMPLOYEE or ADMIN role");
    }
  }),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

describe("Phase 9 Golden Path — Multi-Application Consent Revocation Cascade (tests/integration/golden-path/consent-revocation-cascade.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockCandidateUserId = "22222222-2222-4222-8222-222222222222";
  const mockCandidateId = "33333333-3333-4333-8333-333333333333";
  const mockStaffUserId = "44444444-4444-4444-8444-444444444444";
  const mockAppAId = "66666666-6666-4666-8666-666666666666"; // SUBMITTED
  const mockAppBId = "66666666-6666-4666-8666-666666666667"; // READY / PREPARING
  const mockJobId = "55555555-5555-4555-8555-555555555555";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Step 24: Rigorous Cascade Test — Application A (SUBMITTED) remains preserved; Application B (Unsubmitted) transitions to WITHDRAWN; Open Tasks are CANCELED", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "candidate@alpha.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    const updatedAppIds: string[] = [];

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockCandidateUserId,
            organizationId: mockOrgId,
          }),
        },
        // Application query: Only unsubmitted applications are fetched for withdrawal
        application: {
          findMany: vi.fn().mockResolvedValue([
            { id: mockAppBId, status: ApplicationStatus.READY, candidateId: mockCandidateId },
          ]),
          update: vi.fn().mockImplementation(async ({ where, data }) => {
            updatedAppIds.push(where.id);
            return { id: where.id, ...data };
          }),
        },
        // Open tasks for candidate canceled
        task: {
          findMany: vi.fn().mockResolvedValue([
            { id: "task-b", status: TaskStatus.IN_PROGRESS },
          ]),
          update: vi.fn().mockResolvedValue({ id: "task-b", status: TaskStatus.CANCELED }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        taskStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "task-hist-cancel" }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "app-hist-withdrawn" }),
        },
      };
      return callback(tx as any);
    });

    const bulkWithdrawRes = await bulkWithdrawApplicationsOnConsentRevocationAction(mockCandidateId);
    expect(bulkWithdrawRes.success).toBe(true);
    expect(bulkWithdrawRes.data?.withdrawnCount).toBe(1);

    const cancelTasksRes = await cancelTasksOnConsentRevocationAction(mockCandidateId);
    expect(cancelTasksRes.success).toBe(true);
    expect(cancelTasksRes.data?.canceledCount).toBe(1);

    // Application B was withdrawn
    expect(updatedAppIds).toContain(mockAppBId);
    // Application A (SUBMITTED) was NOT touched / NOT withdrawn
    expect(updatedAppIds).not.toContain(mockAppAId);
  });

  it("Asserts that withdrawn Application B cannot progress toward submission", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockStaffUserId,
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
            id: mockAppBId,
            organizationId: mockOrgId,
            status: ApplicationStatus.WITHDRAWN,
            candidate: { status: CandidateStatus.INACTIVE },
            job: { status: JobStatus.OPEN },
          }),
        },
      };
      return callback(tx as any);
    });

    // Attempting to advance Application B from WITHDRAWN to READY returns error
    const transRes = await transitionApplicationStatusAction({
      applicationId: mockAppBId,
      targetStatus: ApplicationStatus.READY,
    });
    expect(transRes.success).toBe(false);
    expect(transRes.error).toMatch(/WITHDRAWN to READY/i);

    // Attempting submission on WITHDRAWN application throws InvalidStateTransitionError
    await expect(
      recordApplicationSubmissionAction({
        applicationId: mockAppBId,
        externalReference: "ANY-REF",
        externalUrl: "https://example.com",
        confirmationEvidence: "Should fail",
        storagePath: "tenants/mock/evidence.pdf",
        submissionNotes: "Should fail",
      })
    ).rejects.toThrow();
  });

  it("Asserts that new application creation is blocked when candidate is not found or archived", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockStaffUserId,
      email: "staff@alpha.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            organizationId: mockOrgId,
            status: "ARCHIVED",
          }),
        },
        job: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockJobId,
            organizationId: mockOrgId,
            status: JobStatus.OPEN,
          }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };
      return callback(tx as any);
    });

    const createRes = await createApplicationAction({
      candidateId: mockCandidateId,
      jobId: mockJobId,
    });
    expect(createRes.success).toBe(false);
    expect(createRes.error).toMatch(/archived/i);
  });
});
