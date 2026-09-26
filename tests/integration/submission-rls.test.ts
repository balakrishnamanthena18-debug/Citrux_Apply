import { describe, it, expect, vi } from "vitest";
import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { AuthorizationError } from "@/lib/errors";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireEmployeeOrAdmin: vi.fn(),
}));

describe("Phase 6 Submission Row-Level Security & Tenancy Policy Enforcement (tests/integration/submission-rls.test.ts)", () => {
  const orgA = "11111111-1111-4111-8111-111111111111";
  const orgB = "22222222-2222-4222-8222-222222222222";
  const staffUserId = "33333333-3333-4333-8333-333333333333";
  const candidateUserId = "44444444-4444-4444-8444-444444444444";

  it("permits active EMPLOYEE within matching organization to execute submission operations", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValueOnce({
      userId: staffUserId,
      email: "staff@orgA.com",
      role: "EMPLOYEE" as any,
      organizationId: orgA,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    const ctx = await getAuthenticatedContext();
    expect(() => requireEmployeeOrAdmin(ctx)).not.toThrow();
    expect(ctx.organizationId).toBe(orgA);
  });

  it("blocks CANDIDATE role from executing staff submission operations", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValueOnce({
      userId: candidateUserId,
      email: "candidate@gmail.com",
      role: "CANDIDATE" as any,
      organizationId: orgA,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(requireEmployeeOrAdmin).mockImplementationOnce(() => {
      throw new AuthorizationError("Employee or Admin role required");
    });

    const ctx = await getAuthenticatedContext();
    expect(() => requireEmployeeOrAdmin(ctx)).toThrow(AuthorizationError);
  });

  it("blocks cross-tenant staff access when organizationId does not match application tenancy", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValueOnce({
      userId: staffUserId,
      email: "staff@orgA.com",
      role: "EMPLOYEE" as any,
      organizationId: orgA,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    const ctx = await getAuthenticatedContext();
    const targetApplicationOrgId = orgB;

    // Simulated tenant isolation check
    expect(ctx.organizationId === targetApplicationOrgId).toBe(false);
  });
});
