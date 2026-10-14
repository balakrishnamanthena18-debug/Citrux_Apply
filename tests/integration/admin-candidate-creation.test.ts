import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCandidateAction, resendCandidateInvitationAction } from "@/lib/candidate/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent, logSystemAuditEvent } from "@/lib/audit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { emailNotificationService } from "@/lib/email";
import { Role, MembershipStatus, CandidateStatus, AuditAction, EmailDeliveryStatus } from "@/generated/prisma";
import { AuthorizationError, NotFoundError, ValidationError } from "@/lib/errors";

const mockCreateUser = vi.fn();
const mockDeleteUser = vi.fn();
const mockSendTransactionalNotification = vi.fn();

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

vi.mock("@/lib/email", () => ({
  emailNotificationService: {
    sendTransactionalNotification: (...args: any[]) => mockSendTransactionalNotification(...args),
  },
}));

describe("Admin Candidate Creation & Invitation Email Flow (tests/integration/admin-candidate-creation.test.ts)", () => {
  const mockOrgA = "11111111-1111-4111-8111-111111111111";
  const mockOrgB = "22222222-2222-4222-8222-222222222222";
  const mockAdminUserId = "33333333-3333-4333-8333-333333333333";
  const mockEmployeeUserId = "44444444-4444-4444-8444-444444444444";
  const mockCandidateUserId = "55555555-5555-4555-8555-555555555555";
  const mockNewAuthUserId = "66666666-6666-4666-8666-666666666666";
  const mockSpecialistUserId = "77777777-7777-4777-8777-777777777777";
  const mockCandidateRecordId = "88888888-8888-4888-8888-888888888888";
  const mockMembershipId = "99999999-9999-4999-8999-999999999999";

  const defaultMockTx = (overrides: Record<string, any> = {}) => ({
    organization: {
      findUnique: vi.fn().mockResolvedValue({ id: mockOrgA, name: "Citrux Technologies" }),
      ...overrides.organization,
    },
    staffActivationToken: {
      create: vi.fn().mockResolvedValue({ id: "token-1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...overrides.staffActivationToken,
    },
    membership: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: mockMembershipId, status: MembershipStatus.ACTIVE }),
      ...overrides.membership,
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: mockNewAuthUserId, status: "ACTIVE" }),
      ...overrides.user,
    },
    candidate: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: mockCandidateRecordId,
        status: CandidateStatus.ONBOARDING,
        verificationStatus: "UNVERIFIED",
        user: { id: mockNewAuthUserId, firstName: "Test", lastName: "Candidate", email: "test@example.com" },
        assignedEmployee: null,
        skills: [],
        applications: [],
      }),
      ...overrides.candidate,
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendTransactionalNotification.mockResolvedValue({
      id: "del-log-1",
      status: EmailDeliveryStatus.SENT,
      providerMessageId: "msg-12345",
    });
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
        const tx = defaultMockTx({
          membership: {
            create: vi.fn().mockImplementation((args) => {
              createdMembershipData = args.data;
              return { id: mockMembershipId, ...args.data };
            }),
          },
          user: {
            create: vi.fn().mockImplementation((args) => {
              createdUserData = args.data;
              return { id: mockNewAuthUserId, ...args.data };
            }),
          },
          candidate: {
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
        });
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

      // Verify email was NOT sent
      expect(mockSendTransactionalNotification).not.toHaveBeenCalled();
    });

    it("1.2 Supports sending invitation: sets Membership to INVITED, creates token, and dispatches email", async () => {
      let createdMembershipData: any = null;
      let createdTokenData: any = null;

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = defaultMockTx({
          membership: {
            create: vi.fn().mockImplementation((args) => {
              createdMembershipData = args.data;
              return { id: mockMembershipId, ...args.data };
            }),
          },
          staffActivationToken: {
            create: vi.fn().mockImplementation((args) => {
              createdTokenData = args.data;
              return { id: "token-uuid", ...args.data };
            }),
          },
          candidate: {
            create: vi.fn().mockResolvedValue({
              id: mockCandidateRecordId,
              status: CandidateStatus.ONBOARDING,
              verificationStatus: "UNVERIFIED",
              user: { id: mockNewAuthUserId, firstName: "Kyle", lastName: "Reese", email: "kyle@citrux.com" },
            }),
          },
        });
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
      expect(createdTokenData).toBeDefined();
      expect(createdTokenData.organizationId).toBe(mockOrgA);
      expect(createdTokenData.membershipId).toBe(mockMembershipId);
      expect(typeof createdTokenData.tokenHash).toBe("string");

      // Verify email notification service was called with recipient
      expect(mockSendTransactionalNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: mockOrgA,
          recipientEmail: "kyle@citrux.com",
          templateId: "CANDIDATE_WELCOME_ACTIVATION",
          subject: expect.stringContaining("Welcome to the Candidate Portal"),
        })
      );

      expect(res.data?.invitation).toEqual({
        attempted: true,
        sent: true,
        error: undefined,
      });
    });

    it("1.3 Validates assigned specialist belongs to organization and is active staff", async () => {
      let createdCandidateData: any = null;

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = defaultMockTx({
          membership: {
            findFirst: vi.fn().mockImplementation((args) => {
              if (
                args.where.userId === mockSpecialistUserId &&
                args.where.organizationId === mockOrgA &&
                args.where.status === "ACTIVE"
              ) {
                return {
                  id: "specialist-membership-id",
                  userId: mockSpecialistUserId,
                  organizationId: mockOrgA,
                  role: Role.EMPLOYEE,
                  status: "ACTIVE",
                  user: { id: mockSpecialistUserId, firstName: "Elena", lastName: "Rostova", email: "elena@citrux.com" },
                };
              }
              return null;
            }),
            create: vi.fn().mockResolvedValue({ id: mockMembershipId, status: MembershipStatus.ACTIVE }),
          },
          candidate: {
            create: vi.fn().mockImplementation((args) => {
              createdCandidateData = args.data;
              return {
                id: mockCandidateRecordId,
                ...args.data,
                user: { id: mockNewAuthUserId, firstName: "John", lastName: "Doe", email: "john@example.com" },
              };
            }),
          },
        });
        return callback(tx as any);
      });

      const res = await createCandidateAction({
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        assignedEmployeeId: mockSpecialistUserId,
      });

      expect(res.success).toBe(true);
      expect(createdCandidateData.assignedEmployeeId).toBe(mockSpecialistUserId);
    });

    it("1.4 Rejects invalid or cross-tenant specialist assignment", async () => {
      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = defaultMockTx({
          membership: {
            findFirst: vi.fn().mockResolvedValue(null), // Specialist not found in org
          },
        });
        return callback(tx as any);
      });

      const res = await createCandidateAction({
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        assignedEmployeeId: "99999999-9999-4999-8999-999999999999",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Selected specialist is not an active staff member/i);
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
        lastName: "Creation",
        email: "unauth@example.com",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/requires ADMIN role/i);
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
        firstName: "Self",
        lastName: "Attempt",
        email: "self@example.com",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/requires ADMIN role/i);
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
        firstName: "Cross",
        lastName: "Tenant",
        email: "crosstenant@example.com",
        organizationId: mockOrgB,
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
        data: { user: null },
        error: { message: "A user with this email address has already been registered" },
      });

      const res = await createCandidateAction({
        firstName: "Duplicate",
        lastName: "Auth",
        email: "duplicate@example.com",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already exists in authentication/i);
      expect(withRlsContext).not.toHaveBeenCalled();
    });

    it("3.2 Rejects when candidate profile already exists for user in database", async () => {
      mockCreateUser.mockResolvedValue({
        data: { user: { id: mockNewAuthUserId, email: "existing.profile@example.com" } },
        error: null,
      });

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = defaultMockTx({
          user: {
            findUnique: vi.fn().mockResolvedValue({ id: mockNewAuthUserId, email: "existing.profile@example.com" }),
          },
          candidate: {
            findUnique: vi.fn().mockResolvedValue({ id: "already-existing-candidate-id", userId: mockNewAuthUserId }),
          },
        });
        return callback(tx as any);
      });

      const res = await createCandidateAction({
        firstName: "Existing",
        lastName: "Profile",
        email: "existing.profile@example.com",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/A candidate profile already exists for this user/i);

      // Verify compensating cleanup deletes the newly created auth user
      expect(mockDeleteUser).toHaveBeenCalledWith(mockNewAuthUserId);
    });

    it("3.3 Rejects invalid inputs gracefully before calling auth or database APIs", async () => {
      const res = await createCandidateAction({
        firstName: "",
        lastName: "MissingFirst",
        email: "invalid-email-string",
      });

      expect(res.success).toBe(false);
      expect(mockCreateUser).not.toHaveBeenCalled();
      expect(withRlsContext).not.toHaveBeenCalled();
    });

    it("3.4 Cleans up orphaned auth user and logs security alert if database transaction fails", async () => {
      mockCreateUser.mockResolvedValue({
        data: { user: { id: mockNewAuthUserId, email: "error.test@example.com" } },
        error: null,
      });

      mockDeleteUser.mockResolvedValue({ error: null });

      vi.mocked(withRlsContext).mockRejectedValue(new Error("Database connection dropped"));

      const res = await createCandidateAction({
        firstName: "Db",
        lastName: "Error",
        email: "error.test@example.com",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Database connection dropped/i);
      expect(mockDeleteUser).toHaveBeenCalledWith(mockNewAuthUserId);
    });
  });

  describe("4. Candidate Invitation Email Delivery & Provider Failure Handling", () => {
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
        data: { user: { id: mockNewAuthUserId, email: "invitation.candidate@example.com" } },
        error: null,
      });
    });

    it("4.1 Preserves candidate record and membership in INVITED status when email provider fails", async () => {
      mockSendTransactionalNotification.mockResolvedValue({
        id: "failed-log-id",
        status: EmailDeliveryStatus.FAILED,
        failureReason: "SMTP authentication rejected / invalid credentials",
      });

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = defaultMockTx({
          candidate: {
            create: vi.fn().mockResolvedValue({
              id: mockCandidateRecordId,
              userId: mockNewAuthUserId,
              status: CandidateStatus.ONBOARDING,
              verificationStatus: "UNVERIFIED",
              user: { id: mockNewAuthUserId, firstName: "Invited", lastName: "Candidate", email: "invitation.candidate@example.com" },
            }),
          },
          membership: {
            create: vi.fn().mockResolvedValue({
              id: mockMembershipId,
              userId: mockNewAuthUserId,
              status: MembershipStatus.INVITED,
              role: Role.CANDIDATE,
            }),
          },
        });
        return callback(tx as any);
      });

      const res = await createCandidateAction({
        firstName: "Invited",
        lastName: "Candidate",
        email: "invitation.candidate@example.com",
        sendInvitation: true,
      });

      // The overall creation is considered successful (account preserved), but invitation reports failure
      expect(res.success).toBe(true);
      expect(res.data?.candidateId).toBe(mockCandidateRecordId);
      expect(res.data?.invitation).toEqual({
        attempted: true,
        sent: false,
        error: "SMTP authentication rejected / invalid credentials",
      });

      // Auth user must NOT be deleted because database transaction succeeded
      expect(mockDeleteUser).not.toHaveBeenCalled();
    });

    it("4.2 Resend candidate invitation: successfully generates new token, invalidates old token, and dispatches email", async () => {
      let invalidatedTokens = false;
      let createdNewToken = false;

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = defaultMockTx({
          candidate: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockCandidateRecordId,
              organizationId: mockOrgA,
              userId: mockCandidateUserId,
              user: { id: mockCandidateUserId, firstName: "Resend", lastName: "Target", email: "resend.target@example.com" },
              assignedEmployee: null,
            }),
          },
          membership: {
            findFirst: vi.fn().mockResolvedValue({
              id: mockMembershipId,
              organizationId: mockOrgA,
              userId: mockCandidateUserId,
              status: MembershipStatus.INVITED,
            }),
          },
          staffActivationToken: {
            updateMany: vi.fn().mockImplementation(() => {
              invalidatedTokens = true;
              return { count: 1 };
            }),
            create: vi.fn().mockImplementation(() => {
              createdNewToken = true;
              return { id: "new-token-id" };
            }),
          },
        });
        return callback(tx as any);
      });

      const res = await resendCandidateInvitationAction({
        candidateId: mockCandidateRecordId,
      });

      expect(res.success).toBe(true);
      expect(res.data?.sent).toBe(true);
      expect(invalidatedTokens).toBe(true);
      expect(createdNewToken).toBe(true);

      expect(mockSendTransactionalNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: mockOrgA,
          recipientEmail: "resend.target@example.com",
          templateId: "CANDIDATE_WELCOME_ACTIVATION",
          subject: expect.stringContaining("(resent)"),
        })
      );
    });

    it("4.3 Resend candidate invitation: rejects when candidate membership is already ACTIVE", async () => {
      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = defaultMockTx({
          candidate: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockCandidateRecordId,
              organizationId: mockOrgA,
              userId: mockCandidateUserId,
              user: { id: mockCandidateUserId, firstName: "Active", lastName: "Candidate", email: "active@example.com" },
            }),
          },
          membership: {
            findFirst: vi.fn().mockResolvedValue({
              id: mockMembershipId,
              organizationId: mockOrgA,
              userId: mockCandidateUserId,
              status: MembershipStatus.ACTIVE, // Already activated
            }),
          },
        });
        return callback(tx as any);
      });

      const res = await resendCandidateInvitationAction({
        candidateId: mockCandidateRecordId,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/pending invitation status/i);
      expect(mockSendTransactionalNotification).not.toHaveBeenCalled();
    });

    it("4.4 Resend candidate invitation: rejects non-admin roles", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockEmployeeUserId,
        email: "employee@citrux.com",
        role: Role.EMPLOYEE,
        organizationId: mockOrgA,
        status: "ACTIVE" as any,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      const res = await resendCandidateInvitationAction({
        candidateId: mockCandidateRecordId,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/requires ADMIN role/i);
      expect(mockSendTransactionalNotification).not.toHaveBeenCalled();
    });

    it("4.5 Candidate invitation in production environment resolves to https://portal.careerbutton.in", async () => {
      const origNodeEnv = process.env.NODE_ENV;
      const origAppUrl = process.env.NEXT_PUBLIC_APP_URL;
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      process.env.NEXT_PUBLIC_APP_URL = "https://portal.careerbutton.in";

      try {
        vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
          const tx = defaultMockTx({
            membership: {
              create: vi.fn().mockResolvedValue({ id: mockMembershipId, status: MembershipStatus.INVITED }),
            },
            staffActivationToken: {
              create: vi.fn().mockResolvedValue({ id: "token-prod-1" }),
            },
            candidate: {
              create: vi.fn().mockResolvedValue({
                id: mockCandidateRecordId,
                status: CandidateStatus.ONBOARDING,
                verificationStatus: "UNVERIFIED",
                user: { id: mockNewAuthUserId, firstName: "Prod", lastName: "Candidate", email: "prod.candidate@example.com" },
              }),
            },
          });
          return callback(tx as any);
        });

        const res = await createCandidateAction({
          firstName: "Prod",
          lastName: "Candidate",
          email: "prod.candidate@example.com",
          sendInvitation: true,
        });

        expect(res.success).toBe(true);
        expect(res.data?.invitation?.sent).toBe(true);

        // Verify the HTML and Text email bodies contain the production domain
        expect(mockSendTransactionalNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            recipientEmail: "prod.candidate@example.com",
            htmlBody: expect.stringContaining("https://portal.careerbutton.in/auth/activate?token="),
            textBody: expect.stringContaining("https://portal.careerbutton.in/auth/activate?token="),
          })
        );
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = origNodeEnv;
        process.env.NEXT_PUBLIC_APP_URL = origAppUrl;
      }
    });

    it("4.6 Candidate invitation in production with missing URL fails safely, preserves account, and does not send localhost email", async () => {
      const origNodeEnv = process.env.NODE_ENV;
      const origAppUrl = process.env.NEXT_PUBLIC_APP_URL;
      const origServerAppUrl = process.env.APP_URL;
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      delete process.env.NEXT_PUBLIC_APP_URL;
      delete process.env.APP_URL;

      try {
        vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
          const tx = defaultMockTx({
            membership: {
              create: vi.fn().mockResolvedValue({ id: mockMembershipId, status: MembershipStatus.INVITED }),
            },
            staffActivationToken: {
              create: vi.fn().mockResolvedValue({ id: "token-prod-fail" }),
            },
            candidate: {
              create: vi.fn().mockResolvedValue({
                id: mockCandidateRecordId,
                status: CandidateStatus.ONBOARDING,
                verificationStatus: "UNVERIFIED",
                user: { id: mockNewAuthUserId, firstName: "FailSafe", lastName: "Candidate", email: "failsafe@example.com" },
              }),
            },
          });
          return callback(tx as any);
        });

        const res = await createCandidateAction({
          firstName: "FailSafe",
          lastName: "Candidate",
          email: "failsafe@example.com",
          sendInvitation: true,
        });

        // Candidate account is preserved even though URL resolution / email fails
        expect(res.success).toBe(true);
        expect(res.data?.candidateId).toBe(mockCandidateRecordId);
        expect(res.data?.invitation?.attempted).toBe(true);
        expect(res.data?.invitation?.sent).toBe(false);
        expect(res.data?.invitation?.error).toContain("Production application URL is not configured");

        // Email service was NOT called with any email
        expect(mockSendTransactionalNotification).not.toHaveBeenCalled();
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = origNodeEnv;
        process.env.NEXT_PUBLIC_APP_URL = origAppUrl;
        process.env.APP_URL = origServerAppUrl;
      }
    });
  });
});
