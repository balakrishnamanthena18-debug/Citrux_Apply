import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  assignCandidateAction,
  verifyCandidateAction,
} from "@/lib/candidate/actions";
import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { AuthorizationError } from "@/lib/errors";

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

describe("Candidate Assignment & Verification (tests/integration/candidate-assignment.test.ts)", () => {
  const mockOrgId = "org-uuid-111";
  const mockEmployeeId = "user-uuid-emp-1";
  const mockAssigneeId = "11111111-1111-1111-1111-111111111111";
  const mockCandidateId = "22222222-2222-2222-2222-222222222222";

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

  it("1. Staff member can assign candidate to an active employee in the same org", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            organizationId: mockOrgId,
            assignedEmployeeId: null,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            assignedEmployeeId: mockAssigneeId,
          }),
        },
        membership: {
          findFirst: vi.fn().mockResolvedValue({
            id: "mem-uuid-2",
            userId: mockAssigneeId,
            organizationId: mockOrgId,
            role: "EMPLOYEE",
            status: "ACTIVE",
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await assignCandidateAction({
      candidateId: mockCandidateId,
      employeeId: mockAssigneeId,
    });

    expect(result.success).toBe(true);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CANDIDATE_ASSIGNED",
        entityId: mockCandidateId,
        details: {
          assignedEmployeeId: mockAssigneeId,
        },
      })
    );
  });

  it("2. Assignment fails if assignee is not an active staff member of the organization", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            organizationId: mockOrgId,
          }),
        },
        membership: {
          findFirst: vi.fn().mockResolvedValue(null), // Not found or not active staff
        },
      };
      return callback(tx as any);
    });

    const result = await assignCandidateAction({
      candidateId: mockCandidateId,
      employeeId: mockAssigneeId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Target user is not an active staff member in this organization");
  });

  it("3. Unassigning candidate (setting employeeId to null) succeeds", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            organizationId: mockOrgId,
            assignedEmployeeId: mockAssigneeId,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            assignedEmployeeId: null,
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await assignCandidateAction({
      candidateId: mockCandidateId,
      employeeId: null,
    });

    expect(result.success).toBe(true);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CANDIDATE_ASSIGNED",
        entityId: mockCandidateId,
        details: {
          assignedEmployeeId: null,
        },
      })
    );
  });

  it("4. Rejects candidate verification changes when unauthorized", async () => {
    vi.mocked(requireEmployeeOrAdmin).mockImplementation(() => {
      throw new AuthorizationError("Forbidden: Requires EMPLOYEE or ADMIN role");
    });

    const result = await verifyCandidateAction({
      candidateId: mockCandidateId,
      verificationStatus: "VERIFIED",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Forbidden");
  });

  it("5. Allows staff to update verification status and generates audit log", async () => {
    vi.mocked(requireEmployeeOrAdmin).mockReturnValue(undefined as any);

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            organizationId: mockOrgId,
            verificationStatus: "UNVERIFIED",
          }),
          update: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            verificationStatus: "VERIFIED",
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await verifyCandidateAction({
      candidateId: mockCandidateId,
      verificationStatus: "VERIFIED",
      verificationNotes: "Identity confirmed via official passport check.",
    });

    expect(result.success).toBe(true);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CANDIDATE_VERIFIED",
        entityId: mockCandidateId,
        details: {
          verificationStatus: "VERIFIED",
          notes: "Identity confirmed via official passport check.",
        },
      })
    );
  });
});
