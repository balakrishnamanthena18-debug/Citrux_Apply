import { describe, it, expect, vi, beforeEach } from "vitest";
import { bulkWithdrawApplicationsOnConsentRevocationAction } from "@/lib/application/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { ApplicationStatus, AuditAction } from "@/generated/prisma";

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

describe("QA & Application Consent Revocation Integration (tests/integration/qa-consent-revocation.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockCandidateUserId = "33333333-3333-4333-8333-333333333333";
  const mockCandidateId = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "candidate@test.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });
  });

  it("1. Candidate consent revocation cascades to unsubmitted applications (PREPARING, REVIEW, AWAITING_APPROVAL -> WITHDRAWN)", async () => {
    const activeApps = [
      { id: "app-prep", status: ApplicationStatus.PREPARING },
      { id: "app-review", status: ApplicationStatus.REVIEW },
      { id: "app-await", status: ApplicationStatus.AWAITING_APPROVAL },
    ];

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockCandidateUserId,
            organizationId: mockOrgId,
            status: "ACTIVE",
          }),
        },
        application: {
          findMany: vi.fn().mockResolvedValue(activeApps),
          update: vi.fn().mockResolvedValue({ id: "app-1", status: ApplicationStatus.WITHDRAWN }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-1" }),
        },
      };
      return callback(tx as any);
    });

    const result = await bulkWithdrawApplicationsOnConsentRevocationAction(mockCandidateId);
    expect(result.success).toBe(true);
    expect(result.data?.withdrawnCount).toBe(3);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.APPLICATION_BULK_WITHDRAWN_CONSENT_REVOKED,
      })
    );
  });
});
