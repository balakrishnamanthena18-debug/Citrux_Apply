import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  bulkWithdrawApplicationsOnConsentRevocationAction,
  recordApplicationSubmissionAction,
  withdrawApplicationAction,
} from "@/lib/application/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
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

describe("Candidate Consent Revocation & Bulk Withdrawal (tests/integration/application-consent.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockCandidateUserId = "33333333-3333-4333-8333-333333333333";
  const mockCandidateId = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Bulk withdraws all active unsubmitted applications when candidate consent is revoked", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "cand@test.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    const activeApps = [
      { id: "app-1", status: ApplicationStatus.DISCOVERED },
      { id: "app-2", status: ApplicationStatus.PREPARING },
      { id: "app-3", status: ApplicationStatus.AWAITING_APPROVAL },
      { id: "app-4", status: ApplicationStatus.READY },
    ];

    const updatedAppIds: string[] = [];
    const historyEntries: any[] = [];

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockCandidateUserId,
            organizationId: mockOrgId,
          }),
        },
        application: {
          findMany: vi.fn().mockResolvedValue(activeApps),
          update: vi.fn().mockImplementation(async ({ where, data }) => {
            updatedAppIds.push(where.id);
            return { id: where.id, ...data };
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockImplementation(async ({ data }) => {
            historyEntries.push(data);
            return data;
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await bulkWithdrawApplicationsOnConsentRevocationAction(mockCandidateId);

    expect(result.success).toBe(true);
    expect(result.data?.withdrawnCount).toBe(4);
    expect(updatedAppIds).toEqual(["app-1", "app-2", "app-3", "app-4"]);
    expect(historyEntries).toHaveLength(4);
    expect(historyEntries[0].toStatus).toBe(ApplicationStatus.WITHDRAWN);
  });

  it("2. Preserves already submitted applications (SUBMITTED) as immutable historical records", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "cand@test.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    let findManyStatusFilter: any;

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockCandidateUserId,
            organizationId: mockOrgId,
          }),
        },
        application: {
          findMany: vi.fn().mockImplementation(async ({ where }) => {
            findManyStatusFilter = where.status;
            // When query filters out SUBMITTED, REJECTED, WITHDRAWN, FAILED
            return [];
          }),
        },
        applicationStateHistory: {
          create: vi.fn(),
        },
      };
      return callback(tx as any);
    });

    const result = await bulkWithdrawApplicationsOnConsentRevocationAction(mockCandidateId);

    expect(result.success).toBe(true);
    expect(result.data?.withdrawnCount).toBe(0);
    expect(findManyStatusFilter.notIn).toContain(ApplicationStatus.SUBMITTED);
    expect(findManyStatusFilter.notIn).toContain(ApplicationStatus.REJECTED);
    expect(findManyStatusFilter.notIn).toContain(ApplicationStatus.WITHDRAWN);
    expect(findManyStatusFilter.notIn).toContain(ApplicationStatus.FAILED);
  });

  it("3. Blocks direct withdrawal of already externally submitted applications", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "cand@test.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: "submitted-app-1",
            organizationId: mockOrgId,
            status: ApplicationStatus.SUBMITTED,
            candidate: { userId: mockCandidateUserId },
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await withdrawApplicationAction("submitted-app-1", "User changed mind");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Cannot withdraw an application that has already been externally submitted");
  });

  it("4. Rejects consent revocation triggered by an unauthorized candidate", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: "different-cand-user",
      email: "attacker@test.com",
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
            userId: mockCandidateUserId, // Different user
            organizationId: mockOrgId,
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await bulkWithdrawApplicationsOnConsentRevocationAction(mockCandidateId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unauthorized consent operation");
  });
});
