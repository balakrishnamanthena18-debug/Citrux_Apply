import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateCandidateStatusAction } from "@/lib/candidate/actions";
import { CandidateStatus } from "@/generated/prisma";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireEmployeeOrAdmin: vi.fn(),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(async (_userId, callback) => {
    return callback(mockTx as any);
  }),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

const mockTx = {
  candidate: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};

import { getAuthenticatedContext } from "@/lib/auth/context";

describe("Candidate Lifecycle State Transitions (tests/unit/candidate-lifecycle.test.ts)", () => {
  const staffCtx = {
    userId: "staff-uuid-1",
    email: "staff@company.com",
    organizationId: "org-operating-1",
    role: "EMPLOYEE",
    status: "ACTIVE",
    membershipStatus: "ACTIVE",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedContext).mockResolvedValue(staffCtx as any);
  });

  it("permits ONBOARDING -> ACTIVE transition", async () => {
    mockTx.candidate.findUnique.mockResolvedValueOnce({
      id: "cand-1",
      organizationId: "org-operating-1",
      status: CandidateStatus.ONBOARDING,
      userId: "user-cand-1",
    });

    const result = await updateCandidateStatusAction({
      candidateId: "123e4567-e89b-12d3-a456-426614174000",
      targetStatus: CandidateStatus.ACTIVE,
    });

    expect(result.success).toBe(true);
    expect(mockTx.candidate.update).toHaveBeenCalledWith({
      where: { id: "cand-1" },
      data: { status: CandidateStatus.ACTIVE },
    });
  });

  it("permits ACTIVE -> INACTIVE transition", async () => {
    mockTx.candidate.findUnique.mockResolvedValueOnce({
      id: "cand-1",
      organizationId: "org-operating-1",
      status: CandidateStatus.ACTIVE,
      userId: "user-cand-1",
    });

    const result = await updateCandidateStatusAction({
      candidateId: "123e4567-e89b-12d3-a456-426614174000",
      targetStatus: CandidateStatus.INACTIVE,
    });

    expect(result.success).toBe(true);
  });

  it("permits INACTIVE -> ACTIVE transition", async () => {
    mockTx.candidate.findUnique.mockResolvedValueOnce({
      id: "cand-1",
      organizationId: "org-operating-1",
      status: CandidateStatus.INACTIVE,
      userId: "user-cand-1",
    });

    const result = await updateCandidateStatusAction({
      candidateId: "123e4567-e89b-12d3-a456-426614174000",
      targetStatus: CandidateStatus.ACTIVE,
    });

    expect(result.success).toBe(true);
  });

  it("permits ACTIVE -> ARCHIVED transition", async () => {
    mockTx.candidate.findUnique.mockResolvedValueOnce({
      id: "cand-1",
      organizationId: "org-operating-1",
      status: CandidateStatus.ACTIVE,
      userId: "user-cand-1",
    });

    const result = await updateCandidateStatusAction({
      candidateId: "123e4567-e89b-12d3-a456-426614174000",
      targetStatus: CandidateStatus.ARCHIVED,
    });

    expect(result.success).toBe(true);
  });

  it("rejects ARCHIVED -> ACTIVE transition (ARCHIVED is terminal)", async () => {
    mockTx.candidate.findUnique.mockResolvedValueOnce({
      id: "cand-1",
      organizationId: "org-operating-1",
      status: CandidateStatus.ARCHIVED,
      userId: "user-cand-1",
    });

    const result = await updateCandidateStatusAction({
      candidateId: "123e4567-e89b-12d3-a456-426614174000",
      targetStatus: CandidateStatus.ACTIVE,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid candidate lifecycle transition");
  });

  it("rejects ONBOARDING -> ARCHIVED direct transition", async () => {
    mockTx.candidate.findUnique.mockResolvedValueOnce({
      id: "cand-1",
      organizationId: "org-operating-1",
      status: CandidateStatus.ONBOARDING,
      userId: "user-cand-1",
    });

    const result = await updateCandidateStatusAction({
      candidateId: "123e4567-e89b-12d3-a456-426614174000",
      targetStatus: CandidateStatus.ARCHIVED,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid candidate lifecycle transition");
  });
});
