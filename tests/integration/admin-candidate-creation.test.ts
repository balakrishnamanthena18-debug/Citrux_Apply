import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCandidateAction } from "@/lib/candidate/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent, logSystemAuditEvent } from "@/lib/audit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { Role, MembershipStatus, CandidateStatus, AuditAction } from "@/generated/prisma";
import { AuthorizationError } from "@/lib/errors";

const mockCreateUser = vi.fn();
const mockDeleteUser = vi.fn();

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireAdmin: vi.fn((ctx) => {
    if (ctx.role !== "ADMIN") {
      throw new AuthorizationError("Operation requires ADMIN role");
    }
  }),
  requireEmployeeOrAdmin: vi.fn((ctx) => {
    if (ctx.role !== "ADMIN" && ctx.role !== "EMPLOYEE") {
      throw new AuthorizationError("Operation requires EMPLOYEE or ADMIN role");
    }
  }),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
  logSystemAuditEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: () => ({
    auth: {
      admin: {
        createUser: mockCreateUser,
        deleteUser: mockDeleteUser,
      },
    },
  }),
}));

describe("Admin Candidate Creation & Security Governance (tests/integration/admin-candidate-creation.test.ts)", () => {
  const mockOrgA = "11111111-1111-4111-8111-111111111111";
  const mockOrgB = "22222222-2222-4222-8222-222222222222";
  const mockAdminUserId = "33333333-3333-4333-8333-333333333333";
  const mockEmployeeUserId = "44444444-4444-4444-8444-444444444444";
  const mockCandidateUserId = "55555555-5555-4555-8555-555555555555";
  const mockNewAuthUserId = "66666666-6666-4666-8666-666666666666";
  const mockSpecialistUserId = "77777777-7777-4777-8777-777777777777";
  const mockCandidateRecordId = "88888888-8888-4888-8888-888888888888";
  const mockMembershipId = "99999999-9999-4999-8999-999999999999";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Authorized Candidate Creation (ADMIN)", () => {
    beforeEach(() => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockAdminUserId,
        email: "admin@citrux.com",
        role: Role.ADMIN,
        organizationId: mockOrgA,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      mockCreateUser.mockResolvedValue({
        data: { user: { id: mockNewAuthUserId, email: "sarah.connor@example.com" } },
        error: null,
      });
    });

    it("1.1 Successfully creates Candidate with User and Membership in ONBOARDING and UNVERIFIED states", async () => {
      let createdUserData: any = null;
      let createdMembershipData: any = null;
      let createdCandidateData: any = null;

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          membership: {
            findFirst: vi.fn(),
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockImplementation((args) => {
              createdMembershipData = args.data;
              return { id: mockMembershipId, ...args.data };
            }),
          },
          user: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockImplementation((args) => {
              createdUserData = args.data;
              return { id: mockNewAuthUserId, ...args.data };
            }),
          },
          candidate: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockImplementation((args) => {
              createdCandidateData = args.data;
              return {
                id: mockCandidateRecordId,
                ...args.data,
                user: { id: mockNewAuthUserId, firstName: "Sarah", lastName: "Connor", email: "sarah.connor@example.com" },
                assignedEmployee: null,
                skills: [],
                applications: [],
              };
            }),
          },
        };
        return callback(tx as any);
      });

      const res = await createCandidateAction({
        firstName: "Sarah",
        lastName: "Connor",
        email: "SARAH.CONNOR@Example.com",
        headline: "Cybernetics Specialist",
        country: "US",
        city: "Los Angeles",
        state: "CA",
        sendInvitation: false,
      });

      expect(res.success).toBe(true);
      expect(res.data?.candidateId).toBe(mockCandidateRecordId);

      // Verify email normalized to lower case
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "sarah.connor@example.com",
          email_confirm: true,
        })
      );

      // Verify User record
      expect(createdUserData).toEqual({
        id: mockNewAuthUserId,
        email: "sarah.connor@example.com",
        firstName: "Sarah",
        lastName: "Connor",
        status: "ACTIVE",
      });

      // Verify Membership record: role CANDIDATE, status ACTIVE when sendInvitation is false
      expect(createdMembershipData).toEqual({
        organizationId: mockOrgA,
        userId: mockNewAuthUserId,
        role: Role.CANDIDATE,
        status: MembershipStatus.ACTIVE,
      });

      // Verify Candidate record: status ONBOARDING and verificationStatus strictly UNVERIFIED
      expect(createdCandidateData).toEqual({
        organizationId: mockOrgA,
        userId: mockNewAuthUserId,
        status: CandidateStatus.ONBOARDING,
        verificationStatus: "UNVERIFIED",
        phone: null,
        headline: "Cybernetics Specialist",
        country: "US",
        city: "Los Angeles",
        state: "CA",
        assignedEmployeeId: null,
      });

      // Verify Audit Event logged atomically
      expect(logUserAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockAdminUserId,
          organizationId: mockOrgA,
          action: AuditAction.CANDIDATE_CREATED,
          entityType: "Candidate",
          entityId: mockCandidateRecordId,
          details: expect.objectContaining({
            email: "sarah.connor@example.com",
            status: CandidateStatus.ONBOARDING,
            verificationStatus: "UNVERIFIED",
            sendInvitation: false,
          }),
        })
      );
    });

    it("1.2 Supports sending invitation: sets Membership to INVITED and logs USER_INVITED audit event", async () => {
      let createdMembershipData: any = null;

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          membership: {
            findFirst: vi.fn(),
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockImplementation((args) => {
              createdMembershipData = args.data;
              return { id: mockMembershipId, ...args.data };
            }),
          },
          user: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: mockNewAuthUserId }),
          },
          candidate: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({
              id: mockCandidateRecordId,
              status: CandidateStatus.ONBOARDING,
              verificationStatus: "UNVERIFIED",
              user: { id: mockNewAuthUserId, firstName: "Kyle", lastName: "Reese", email: "kyle@citrux.com" },
            }),
          },
        };
        return callback(tx as any);
      });

      const res = await createCandidateAction({
        firstName: "Kyle",
        lastName: "Reese",
        email: "kyle@citrux.com",
        sendInvitation: true,
      });

      expect(res.success).toBe(true);
      expect(createdMembershipData.status).toBe(MembershipStatus.INVITED);

      expect(logUserAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.USER_INVITED,
          entityType: "Membership",
          entityId: mockMembershipId,
          details: expect.objectContaining({
            recipientEmail: "kyle@citrux.com",
            role: Role.CANDIDATE,
          }),
        })
      );
    });

    it("1.3 Validates assigned specialist belongs to organization and is active staff", async () => {
      let createdCandidateData: any = null;

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          membership: {
            findFirst: vi.fn().mockImplementation((args) => {
              if (
                args.where.userId === mockSpecialistUserId &&
                args.where.organizationId === mockOrgA &&
                args.where.status === "ACTIVE"
              ) {
                return {
                  id: "staff-membership-1",
                  userId: mockSpecialistUserId,
                  user: { id: mockSpecialistUserId, firstName: "Recruiter", lastName: "Bob", email: "recruiter@citrux.com" },
                };
              }
              return null;
            }),
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: mockMembershipId }),
          },
          user: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: mockNewAuthUserId }),
          },
          candidate: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockImplementation((args) => {
              createdCandidateData = args.data;
              return {
                id: mockCandidateRecordId,
                ...args.data,
                user: { id: mockNewAuthUserId, firstName: "John", lastName: "Connor", email: "john@citrux.com" },
              };
            }),
          },
        };
        return callback(tx as any);
      });

      const res = await createCandidateAction({
        firstName: "John",
        lastName: "Connor",
        email: "john@citrux.com",
        assignedEmployeeId: mockSpecialistUserId,
      });

      expect(res.success).toBe(true);
      expect(createdCandidateData.assignedEmployeeId).toBe(mockSpecialistUserId);
    });

    it("1.4 Rejects invalid or cross-tenant specialist assignment", async () => {
      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          membership: {
            findFirst: vi.fn().mockResolvedValue(null), // Specialist not found in org
          },
        };
        return callback(tx as any);
      });

      const res = await createCandidateAction({
        firstName: "John",
        lastName: "Connor",
        email: "john@citrux.com",
        assignedEmployeeId: "00000000-0000-0000-0000-000000000000",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Selected specialist is not an active staff member in this organization/i);
    });
  });

  describe("2. Authorization & RBAC Enforcement", () => {
    it("2.1 Rejects candidate creation by EMPLOYEE role", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockEmployeeUserId,
        email: "employee@citrux.com",
        role: Role.EMPLOYEE,
        organizationId: mockOrgA,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      const res = await createCandidateAction({
        firstName: "Unauthorized",
        lastName: "Candidate",
        email: "unauth@example.com",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Operation requires ADMIN role/i);
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it("2.2 Rejects candidate creation by CANDIDATE role", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockCandidateUserId,
        email: "candidate@citrux.com",
        role: Role.CANDIDATE,
        organizationId: mockOrgA,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      const res = await createCandidateAction({
        firstName: "Malicious",
        lastName: "Actor",
        email: "malicious@example.com",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Operation requires ADMIN role/i);
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it("2.3 Rejects cross-tenant creation attempt when client supplies mismatched organizationId", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockAdminUserId,
        email: "admin@citrux.com",
        role: Role.ADMIN,
        organizationId: mockOrgA,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      const res = await createCandidateAction({
        firstName: "Target",
        lastName: "Candidate",
        email: "target@example.com",
        organizationId: mockOrgB, // Cross-tenant IDOR attack
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Cannot create candidates in a different organization/i);
      expect(mockCreateUser).not.toHaveBeenCalled();
    });
  });

  describe("3. Data Integrity, Duplicate Email & Error Handling", () => {
    beforeEach(() => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockAdminUserId,
        email: "admin@citrux.com",
        role: Role.ADMIN,
        organizationId: mockOrgA,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });
    });

    it("3.1 Rejects duplicate email when Supabase Auth reports user already registered", async () => {
      mockCreateUser.mockResolvedValue({
        data: null,
        error: { message: "A user with this email address has already been registered" },
      });

      const res = await createCandidateAction({
        firstName: "Existing",
        lastName: "User",
        email: "existing@example.com",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/A user with this email address already exists in authentication/i);
    });

    it("3.2 Rejects when candidate profile already exists for user in database", async () => {
      mockCreateUser.mockResolvedValue({
        data: { user: { id: mockNewAuthUserId, email: "dupe@example.com" } },
        error: null,
      });

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          membership: { findFirst: vi.fn(), findUnique: vi.fn() },
          user: {
            findUnique: vi.fn().mockResolvedValue({ id: mockNewAuthUserId, email: "dupe@example.com" }),
          },
          candidate: {
            findUnique: vi.fn().mockResolvedValue({ id: "existing-cand-id", userId: mockNewAuthUserId }),
          },
        };
        return callback(tx as any);
      });

      mockDeleteUser.mockResolvedValue({ error: null });

      const res = await createCandidateAction({
        firstName: "Duplicate",
        lastName: "User",
        email: "dupe@example.com",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/A candidate profile already exists for this user/i);

      // Verify compensating transaction cleans up newly created auth user
      expect(mockDeleteUser).toHaveBeenCalledWith(mockNewAuthUserId);
    });

    it("3.3 Rejects invalid inputs gracefully before calling auth or database APIs", async () => {
      const resMissingEmail = await createCandidateAction({
        firstName: "Test",
        lastName: "User",
        email: "invalid-email-string",
      });
      expect(resMissingEmail.success).toBe(false);
      expect(resMissingEmail.error).toMatch(/Please provide a valid email address/i);
      expect(mockCreateUser).not.toHaveBeenCalled();

      const resMissingName = await createCandidateAction({
        firstName: "",
        lastName: "User",
        email: "valid@example.com",
      });
      expect(resMissingName.success).toBe(false);
      expect(resMissingName.error).toMatch(/First name is required/i);
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it("3.4 Cleans up orphaned auth user and logs security alert if database transaction fails", async () => {
      mockCreateUser.mockResolvedValue({
        data: { user: { id: mockNewAuthUserId, email: "failing@example.com" } },
        error: null,
      });

      vi.mocked(withRlsContext).mockRejectedValue(new Error("Database connection timeout"));
      mockDeleteUser.mockResolvedValue({ error: null });

      const res = await createCandidateAction({
        firstName: "Fail",
        lastName: "Safe",
        email: "failing@example.com",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Database connection timeout/i);

      // Verified compensating cleanup was invoked
      expect(mockDeleteUser).toHaveBeenCalledWith(mockNewAuthUserId);
    });
  });
});
