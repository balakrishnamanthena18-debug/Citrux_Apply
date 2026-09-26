import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import {
  validateStaffActivationTokenAction,
  activateStaffAccountAction,
  signInAction,
} from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { withRlsContext } from "@/lib/db/rls";
import { MembershipStatus, Role, AuditAction } from "@/generated/prisma";

const mockUpdateUserById = vi.fn();
const mockSignInWithPassword = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: () => ({
    auth: {
      admin: {
        updateUserById: mockUpdateUserById,
      },
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    staffActivationToken: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    membership: {
      update: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

describe("Staff Activation Protocol Integration Tests (tests/integration/staff-activation.test.ts)", () => {
  const rawToken = "super-secret-random-256-bit-token";
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockUserId = "22222222-2222-4222-8222-222222222222";
  const mockMembershipId = "33333333-3333-4333-8333-333333333333";
  const mockTokenId = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateUserById.mockResolvedValue({ error: null });
  });

  it("1. validateStaffActivationTokenAction returns non-sensitive metadata for valid token", async () => {
    vi.mocked(prisma.staffActivationToken.findUnique).mockResolvedValue({
      id: mockTokenId,
      tokenHash,
      organizationId: mockOrgId,
      membershipId: mockMembershipId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours in future
      usedAt: null,
      reservedUntil: null,
      createdAt: new Date(),
      membership: {
        id: mockMembershipId,
        organizationId: mockOrgId,
        userId: mockUserId,
        employeeId: "CIT-EMP-0001",
        status: MembershipStatus.INVITED,
        role: Role.EMPLOYEE,
        department: "Operations",
        team: "Core Desk",
        user: {
          id: mockUserId,
          firstName: "Jane",
          lastName: "Doe",
          email: "jane.doe@citrux.com",
        },
        organization: {
          id: mockOrgId,
          name: "CitrUX Technologies",
        },
        designation: {
          id: "desig-1",
          name: "Operations Specialist",
        },
      },
    } as any);

    const res = await validateStaffActivationTokenAction(rawToken);

    expect(res.success).toBe(true);
    expect(res.data?.employeeName).toBe("Jane Doe");
    expect(res.data?.email).toBe("jane.doe@citrux.com");
    expect(res.data?.employeeId).toBe("CIT-EMP-0001");
    expect(res.data?.organizationName).toBe("CitrUX Technologies");
    expect(res.data?.designationName).toBe("Operations Specialist");
  });

  it("2. Three-Phase Protocol: Reservation -> Supabase Auth -> PostgreSQL Finalization", async () => {
    // Phase 1 Mock (Reservation tx)
    const mockTx1 = {
      staffActivationToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: mockTokenId,
          organizationId: mockOrgId,
          membershipId: mockMembershipId,
          expiresAt: new Date(Date.now() + 100000),
          usedAt: null,
          reservedUntil: null,
          membership: {
            id: mockMembershipId,
            userId: mockUserId,
            status: MembershipStatus.INVITED,
          },
        }),
        update: vi.fn().mockResolvedValue({ id: mockTokenId }),
      },
    };

    // Phase 3 Mock (Finalization tx)
    const mockTx3 = {
      staffActivationToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: mockTokenId,
          usedAt: null,
          membership: { status: MembershipStatus.INVITED },
        }),
        update: vi.fn().mockResolvedValue({ id: mockTokenId, usedAt: new Date() }),
      },
      membership: {
        update: vi.fn().mockResolvedValue({ id: mockMembershipId, status: MembershipStatus.ACTIVE }),
      },
      user: {
        update: vi.fn().mockResolvedValue({ id: mockUserId, status: "ACTIVE" }),
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };

    vi.mocked(prisma.$transaction)
      .mockImplementationOnce(async (cb: any) => cb(mockTx1))
      .mockImplementationOnce(async (cb: any) => cb(mockTx3));

    const res = await activateStaffAccountAction({
      token: rawToken,
      password: "StrongPassword123!",
      confirmPassword: "StrongPassword123!",
    });

    expect(res.success).toBe(true);
    expect(res.data?.redirectUrl).toContain("/login?activated=true");

    // Check Phase 1: Reservation updated with 60s window
    expect(mockTx1.staffActivationToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockTokenId },
        data: expect.objectContaining({
          reservedUntil: expect.any(Date),
        }),
      })
    );

    // Check Phase 2: Supabase updateUserById called outside DB transaction
    expect(mockUpdateUserById).toHaveBeenCalledWith(
      mockUserId,
      expect.objectContaining({
        password: "StrongPassword123!",
        email_confirm: true,
      })
    );

    // Check Phase 3: Consumed token, activated membership, wrote audit event
    expect(mockTx3.staffActivationToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockTokenId },
        data: expect.objectContaining({ usedAt: expect.any(Date) }),
      })
    );
    expect(mockTx3.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockMembershipId },
        data: expect.objectContaining({ status: MembershipStatus.ACTIVE }),
      })
    );
    expect(mockTx3.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.EMPLOYEE_ACTIVATED,
          actorId: mockUserId,
          entityId: mockMembershipId,
        }),
      })
    );
  });

  it("3. Concurrency Contention: Token with active reservation rejects second attempt", async () => {
    const mockTx = {
      staffActivationToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: mockTokenId,
          organizationId: mockOrgId,
          membershipId: mockMembershipId,
          expiresAt: new Date(Date.now() + 100000),
          usedAt: null,
          reservedUntil: new Date(Date.now() + 45000), // active reservation for 45 more seconds
          membership: {
            id: mockMembershipId,
            userId: mockUserId,
            status: MembershipStatus.INVITED,
          },
        }),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce(async (cb: any) => cb(mockTx));

    const res = await activateStaffAccountAction({
      token: rawToken,
      password: "Password123!",
      confirmPassword: "Password123!",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("already being processed");
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it("4. Consumed / Expired Token: Rejected before Phase 2", async () => {
    const mockTx = {
      staffActivationToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: mockTokenId,
          usedAt: new Date(Date.now() - 5000), // already used
          membership: { status: MembershipStatus.ACTIVE },
        }),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce(async (cb: any) => cb(mockTx));

    const res = await activateStaffAccountAction({
      token: rawToken,
      password: "Password123!",
      confirmPassword: "Password123!",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("already been used");
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it("5. Authorization Guard: INVITED employees are blocked from logging in", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: mockUserId, email: "invited@citrux.com" } },
      error: null,
    });

    // Membership status query returns null because membership.status is INVITED, not ACTIVE
    vi.mocked(withRlsContext).mockResolvedValue(null);

    const formData = new FormData();
    formData.set("email", "invited@citrux.com");
    formData.set("password", "Password123!");

    const res = await signInAction(formData);

    expect(res.success).toBe(false);
    expect(res.error).toContain("inactive or pending organization approval");
  });
});
