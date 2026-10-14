import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import {
  validateStaffActivationTokenAction,
  activateStaffAccountAction,
} from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { MembershipStatus, Role, AuditAction } from "@/generated/prisma";

const mockUpdateUserById = vi.fn();

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
      signInWithPassword: vi.fn(),
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
      updateMany: vi.fn(),
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
    rateLimitBucket: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([{ attemptCount: 1 }]),
  },
}));

describe("Candidate & Staff Activation Protocol Regression Suite (tests/unit/activation-token-validation.test.ts)", () => {
  const rawToken = "super-secret-random-32-byte-token-hex";
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockOtherOrgId = "99999999-9999-4999-8999-999999999999";
  const mockUserId = "22222222-2222-4222-8222-222222222222";
  const mockMembershipId = "33333333-3333-4333-8333-333333333333";
  const mockTokenId = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateUserById.mockResolvedValue({ error: null });
  });

  describe("1. Token Validation (validateStaffActivationTokenAction)", () => {
    it("1.1 Valid candidate activation token returns candidate metadata", async () => {
      vi.mocked(prisma.staffActivationToken.findUnique).mockResolvedValue({
        id: mockTokenId,
        tokenHash,
        organizationId: mockOrgId,
        membershipId: mockMembershipId,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        usedAt: null,
        reservedUntil: null,
        createdAt: new Date(),
        membership: {
          id: mockMembershipId,
          organizationId: mockOrgId,
          userId: mockUserId,
          employeeId: null,
          status: MembershipStatus.INVITED,
          role: Role.CANDIDATE,
          department: null,
          team: null,
          user: {
            id: mockUserId,
            firstName: "Alex",
            lastName: "Candidate",
            email: "alex@example.com",
          },
          organization: {
            id: mockOrgId,
            name: "Citrux Talent Operations",
          },
          designation: null,
        },
      } as any);

      const res = await validateStaffActivationTokenAction(rawToken);

      expect(res.success).toBe(true);
      expect(res.data?.role).toBe(Role.CANDIDATE);
      expect(res.data?.employeeName).toBe("Alex Candidate");
      expect(res.data?.email).toBe("alex@example.com");
      expect(res.data?.organizationName).toBe("Citrux Talent Operations");
      expect(res.data?.employeeId).toBeNull();
      expect(res.data?.designationName).toBeNull();
    });

    it("1.2 Valid employee activation token returns employee metadata and designation", async () => {
      vi.mocked(prisma.staffActivationToken.findUnique).mockResolvedValue({
        id: mockTokenId,
        tokenHash,
        organizationId: mockOrgId,
        membershipId: mockMembershipId,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        usedAt: null,
        reservedUntil: null,
        createdAt: new Date(),
        membership: {
          id: mockMembershipId,
          organizationId: mockOrgId,
          userId: mockUserId,
          employeeId: "CIT-EMP-0042",
          status: MembershipStatus.INVITED,
          role: Role.EMPLOYEE,
          department: "Engineering",
          team: "Platform",
          user: {
            id: mockUserId,
            firstName: "Dev",
            lastName: "Employee",
            email: "dev@citrux.com",
          },
          organization: {
            id: mockOrgId,
            name: "Citrux Talent Operations",
          },
          designation: {
            id: "des-1",
            name: "Senior Operations Specialist",
          },
        },
      } as any);

      const res = await validateStaffActivationTokenAction(rawToken);

      expect(res.success).toBe(true);
      expect(res.data?.role).toBe(Role.EMPLOYEE);
      expect(res.data?.employeeName).toBe("Dev Employee");
      expect(res.data?.employeeId).toBe("CIT-EMP-0042");
      expect(res.data?.designationName).toBe("Senior Operations Specialist");
      expect(res.data?.department).toBe("Engineering");
    });

    it("1.3 Invalid token returns invalid error", async () => {
      vi.mocked(prisma.staffActivationToken.findUnique).mockResolvedValue(null);

      const res = await validateStaffActivationTokenAction("non-existent-token");

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/invalid or has expired/i);
    });

    it("1.4 Expired token returns expired error", async () => {
      vi.mocked(prisma.staffActivationToken.findUnique).mockResolvedValue({
        id: mockTokenId,
        tokenHash,
        organizationId: mockOrgId,
        membershipId: mockMembershipId,
        expiresAt: new Date(Date.now() - 1000), // Expired
        usedAt: null,
        membership: {
          id: mockMembershipId,
          organizationId: mockOrgId,
          status: MembershipStatus.INVITED,
          user: { firstName: "Old", lastName: "Candidate", email: "old@example.com" },
          organization: { name: "Citrux" },
        },
      } as any);

      const res = await validateStaffActivationTokenAction(rawToken);

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/has expired/i);
    });

    it("1.5 Previously used token returns already used error", async () => {
      vi.mocked(prisma.staffActivationToken.findUnique).mockResolvedValue({
        id: mockTokenId,
        tokenHash,
        organizationId: mockOrgId,
        membershipId: mockMembershipId,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        usedAt: new Date(Date.now() - 3600000), // Already used
        membership: {
          id: mockMembershipId,
          organizationId: mockOrgId,
          status: MembershipStatus.ACTIVE,
          user: { firstName: "Used", lastName: "Candidate", email: "used@example.com" },
          organization: { name: "Citrux" },
        },
      } as any);

      const res = await validateStaffActivationTokenAction(rawToken);

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already been used/i);
    });

    it("1.6 Blocks cross-tenant activation token mismatch", async () => {
      vi.mocked(prisma.staffActivationToken.findUnique).mockResolvedValue({
        id: mockTokenId,
        tokenHash,
        organizationId: mockOrgId, // Org A
        membershipId: mockMembershipId,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        usedAt: null,
        membership: {
          id: mockMembershipId,
          organizationId: mockOtherOrgId, // Org B (mismatch)
          status: MembershipStatus.INVITED,
          user: { firstName: "Cross", lastName: "Tenant", email: "cross@example.com" },
          organization: { name: "Org B" },
        },
      } as any);

      const res = await validateStaffActivationTokenAction(rawToken);

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/cross-tenant/i);
    });

    it("1.7 Database lookup failure returns unexpected error safely", async () => {
      vi.mocked(prisma.staffActivationToken.findUnique).mockRejectedValue(
        new Error("PostgreSQL connection timeout")
      );

      const res = await validateStaffActivationTokenAction(rawToken);

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/unexpected error occurred/i);
    });

    it("1.8 Resent invitation invalidates previous token (sets expiredAt to now)", async () => {
      // When resendCandidateInvitationAction runs, it executes:
      // prisma.staffActivationToken.updateMany({ where: { membershipId, usedAt: null }, data: { expiresAt: new Date() } })
      // Validating that previously issued token subsequently fails with expired error.
      vi.mocked(prisma.staffActivationToken.findUnique).mockResolvedValue({
        id: "previous-invalidated-token-id",
        tokenHash,
        organizationId: mockOrgId,
        membershipId: mockMembershipId,
        expiresAt: new Date(Date.now() - 5000), // Invalidation sets expiresAt to current timestamp
        usedAt: null,
        membership: {
          id: mockMembershipId,
          organizationId: mockOrgId,
          status: MembershipStatus.INVITED,
          user: { firstName: "Jane", lastName: "Candidate", email: "jane@example.com" },
          organization: { name: "Citrux" },
        },
      } as any);

      const res = await validateStaffActivationTokenAction(rawToken);

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/has expired/i);
    });
  });

  describe("2. Account Activation (activateStaffAccountAction)", () => {
    it("2.1 Correct candidate membership activation logs MEMBERSHIP_ACTIVATED audit event", async () => {
      // Phase 1 Mock: Reservation
      vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) => {
        const tx = {
          staffActivationToken: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockTokenId,
              organizationId: mockOrgId,
              expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
              usedAt: null,
              reservedUntil: null,
              membership: {
                id: mockMembershipId,
                organizationId: mockOrgId,
                userId: mockUserId,
                status: MembershipStatus.INVITED,
                role: Role.CANDIDATE,
              },
            }),
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx as any);
      });

      // Phase 3 Mock: Finalization
      let createdAuditEvent: any = null;
      let updatedMembershipStatus: string | null = null;
      vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) => {
        const tx = {
          staffActivationToken: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockTokenId,
              organizationId: mockOrgId,
              usedAt: null,
              membership: {
                id: mockMembershipId,
                organizationId: mockOrgId,
                status: MembershipStatus.INVITED,
                role: Role.CANDIDATE,
              },
            }),
            update: vi.fn().mockResolvedValue({}),
          },
          membership: {
            update: vi.fn().mockImplementation((args) => {
              updatedMembershipStatus = args.data.status;
              return { id: mockMembershipId, ...args.data };
            }),
          },
          user: {
            update: vi.fn().mockResolvedValue({}),
          },
          auditEvent: {
            create: vi.fn().mockImplementation((args) => {
              createdAuditEvent = args.data;
              return { id: "audit-1", ...args.data };
            }),
          },
        };
        return callback(tx as any);
      });

      const res = await activateStaffAccountAction({
        token: rawToken,
        password: "ValidSecurePassword123!",
        confirmPassword: "ValidSecurePassword123!",
      });

      expect(res.success).toBe(true);
      expect(res.data?.redirectUrl).toBe("/login?activated=true");
      expect(mockUpdateUserById).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({ password: "ValidSecurePassword123!", email_confirm: true })
      );
      expect(updatedMembershipStatus).toBe("ACTIVE");
      expect(createdAuditEvent.action).toBe(AuditAction.MEMBERSHIP_ACTIVATED);
    });

    it("2.2 Employee activation logs EMPLOYEE_ACTIVATED audit event", async () => {
      // Phase 1 Mock: Reservation
      vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) => {
        const tx = {
          staffActivationToken: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockTokenId,
              organizationId: mockOrgId,
              expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
              usedAt: null,
              reservedUntil: null,
              membership: {
                id: mockMembershipId,
                organizationId: mockOrgId,
                userId: mockUserId,
                status: MembershipStatus.INVITED,
                role: Role.EMPLOYEE,
              },
            }),
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx as any);
      });

      // Phase 3 Mock: Finalization
      let createdAuditEvent: any = null;
      vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) => {
        const tx = {
          staffActivationToken: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockTokenId,
              organizationId: mockOrgId,
              usedAt: null,
              membership: {
                id: mockMembershipId,
                organizationId: mockOrgId,
                status: MembershipStatus.INVITED,
                role: Role.EMPLOYEE,
              },
            }),
            update: vi.fn().mockResolvedValue({}),
          },
          membership: {
            update: vi.fn().mockResolvedValue({}),
          },
          user: {
            update: vi.fn().mockResolvedValue({}),
          },
          auditEvent: {
            create: vi.fn().mockImplementation((args) => {
              createdAuditEvent = args.data;
              return { id: "audit-2", ...args.data };
            }),
          },
        };
        return callback(tx as any);
      });

      const res = await activateStaffAccountAction({
        token: rawToken,
        password: "EmployeePassword123!",
        confirmPassword: "EmployeePassword123!",
      });

      expect(res.success).toBe(true);
      expect(createdAuditEvent.action).toBe(AuditAction.EMPLOYEE_ACTIVATED);
    });

    it("2.3 Rejects cross-tenant activation attempt in Phase 1", async () => {
      vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) => {
        const tx = {
          staffActivationToken: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockTokenId,
              organizationId: mockOrgId, // Org A
              expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
              usedAt: null,
              reservedUntil: null,
              membership: {
                id: mockMembershipId,
                organizationId: mockOtherOrgId, // Org B (cross-tenant)
                userId: mockUserId,
                status: MembershipStatus.INVITED,
                role: Role.CANDIDATE,
              },
            }),
          },
        };
        return callback(tx as any);
      });

      const res = await activateStaffAccountAction({
        token: rawToken,
        password: "Password123!",
        confirmPassword: "Password123!",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/cross-tenant/i);
      expect(mockUpdateUserById).not.toHaveBeenCalled();
    });
  });
});
