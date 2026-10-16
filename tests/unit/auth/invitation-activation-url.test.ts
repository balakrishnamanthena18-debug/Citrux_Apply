import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildAppUrl,
  resolveAppUrl,
  getRequestOrigin,
  getTrustedOriginFromHost,
  DEFAULT_PRODUCTION_APP_URL,
} from "@/lib/url";
import { createEmployeeAction, resendStaffActivationAction } from "@/lib/admin/actions";
import { createCandidateAction, resendCandidateInvitationAction } from "@/lib/candidate/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { emailNotificationService } from "@/lib/email";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { Role, MembershipStatus, CandidateStatus, EmailDeliveryStatus } from "@/generated/prisma";
import { headers } from "next/headers";

const mockCreateUser = vi.fn();
const mockDeleteUser = vi.fn();
const mockSendTransactionalNotification = vi.fn();

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireAdmin: vi.fn(),
  requireEmployeeOrAdmin: vi.fn(),
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

vi.mock("@/lib/admin/revalidate", () => ({
  revalidateAdminViews: vi.fn(),
}));

vi.mock("@/lib/candidate/revalidate", () => ({
  revalidateCandidateViews: vi.fn(),
}));

describe("OOS Activation URL Fix & Regression Test Suite", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockAdminUserId = "22222222-2222-4222-8222-222222222222";
  const mockNewAuthUserId = "33333333-3333-4333-8333-333333333333";
  const mockMembershipId = "44444444-4444-4444-8444-444444444444";
  const mockCandidateId = "55555555-5555-5555-8555-555555555555";

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendTransactionalNotification.mockResolvedValue({
      id: "del-log-1",
      status: EmailDeliveryStatus.SENT,
      providerMessageId: "msg-12345",
    });
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockAdminUserId,
      email: "admin@careerbutton.in",
      role: Role.ADMIN,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: MembershipStatus.ACTIVE,
    });
    mockCreateUser.mockResolvedValue({
      data: { user: { id: mockNewAuthUserId, email: "employee@careerbutton.in" } },
      error: null,
    });
    mockDeleteUser.mockResolvedValue({ error: null });
  });

  // --------------------------------------------------------------------------
  // Category 1: URL Resolver Core Behaviors
  // --------------------------------------------------------------------------
  describe("Canonical URL Resolution Policies", () => {
    const PROD_URL = "https://portal.careerbutton.in";

    it("5. Production environment with no request origin resolves to canonical production URL", () => {
      const url = resolveAppUrl({
        nodeEnv: "production",
        env: {},
      });
      expect(url).toBe(PROD_URL);
      expect(url).not.toContain("localhost");
    });

    it("6. Production environment with localhost configured safely rejects localhost and falls back", () => {
      const url = resolveAppUrl({
        nodeEnv: "production",
        env: {
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
          APP_URL: "http://localhost:3000",
        },
      });
      expect(url).toBe(PROD_URL);
      expect(url).not.toContain("localhost");
    });

    it("7. Approved production request origin is accepted and used", () => {
      const url = resolveAppUrl({
        nodeEnv: "production",
        requestOrigin: "https://portal.careerbutton.in",
        env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      });
      expect(url).toBe("https://portal.careerbutton.in");

      const vercelUrl = resolveAppUrl({
        nodeEnv: "production",
        requestOrigin: "https://citrux-apply-mrgx.vercel.app",
      });
      expect(vercelUrl).toBe("https://citrux-apply-mrgx.vercel.app");
    });

    it("8. Malicious or unapproved forwarded host is rejected and never overrides production canonical URL", () => {
      const rejectedAttacker = getTrustedOriginFromHost("evil-phishing.com", "https", {
        nodeEnv: "production",
      });
      expect(rejectedAttacker).toBeUndefined();

      const rejectedLocalhostInProd = getTrustedOriginFromHost("localhost:3000", "http", {
        nodeEnv: "production",
      });
      expect(rejectedLocalhostInProd).toBeUndefined();

      const resolved = resolveAppUrl({
        nodeEnv: "production",
        requestOrigin: "https://evil-phishing.com",
        env: {},
      });
      expect(resolved).toBe(PROD_URL);
      expect(resolved).not.toContain("evil-phishing.com");
      expect(resolved).not.toContain("localhost");
    });

    it("9. Local development URL behavior uses localhost when in development", () => {
      const devUrl = resolveAppUrl({
        nodeEnv: "development",
        env: {},
      });
      expect(devUrl).toBe("http://localhost:3000");

      const customDevUrl = resolveAppUrl({
        nodeEnv: "development",
        env: { NEXT_PUBLIC_APP_URL: "http://localhost:3001" },
      });
      expect(customDevUrl).toBe("http://localhost:3001");
    });

    it("10. Preservation of the activation path and token query format", () => {
      const fakeToken = "a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890";
      const activationUrl = buildAppUrl(`/auth/activate?token=${fakeToken}`, {
        nodeEnv: "production",
      });
      expect(activationUrl).toBe(`https://portal.careerbutton.in/auth/activate?token=${fakeToken}`);
      expect(activationUrl).toMatch(/^https:\/\/portal\.careerbutton\.in\/auth\/activate\?token=[a-f0-9]{64}$/);
    });

    it("Vercel preview deployments (VERCEL=1) never leak localhost", () => {
      const url = resolveAppUrl({
        env: {
          VERCEL: "1",
          VERCEL_ENV: "preview",
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        },
      });
      expect(url).toBe(PROD_URL);
      expect(url).not.toContain("localhost");
    });
  });

  // --------------------------------------------------------------------------
  // Category 2: Server Action Invitation Paths
  // --------------------------------------------------------------------------
  describe("Server Action Invitation URL Generation", () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origVercel = process.env.VERCEL;

    beforeEach(() => {
      (process.env as any).NODE_ENV = "production";
      (process.env as any).VERCEL = "1";
    });

    afterEach(() => {
      (process.env as any).NODE_ENV = origNodeEnv;
      (process.env as any).VERCEL = origVercel;
    });

    it("1. Employee invitation creation generates canonical production activation URL and dispatches email without localhost", async () => {
      vi.mocked(headers).mockResolvedValue(
        new Headers({
          "x-forwarded-host": "portal.careerbutton.in",
          "x-forwarded-proto": "https",
        }) as any
      );

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          designation: { findUnique: vi.fn() },
          membership: {
            findUnique: vi.fn().mockResolvedValue(null),
            findFirst: vi.fn(),
            create: vi.fn().mockResolvedValue({ id: mockMembershipId, status: MembershipStatus.INVITED }),
            count: vi.fn().mockResolvedValue(0),
          },
          user: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: mockNewAuthUserId, email: "new.employee@careerbutton.in" }),
          },
          staffActivationToken: {
            create: vi.fn().mockResolvedValue({ id: "token-1" }),
          },
        };
        return callback(tx as any);
      });

      const res = await createEmployeeAction({
        email: "new.employee@careerbutton.in",
        firstName: "Test",
        lastName: "Employee",
        role: "EMPLOYEE",
      });

      expect(res.success).toBe(true);
      expect(mockSendTransactionalNotification).toHaveBeenCalledTimes(1);

      const emailCall = mockSendTransactionalNotification.mock.calls[0][0];
      expect(emailCall.recipientEmail).toBe("new.employee@careerbutton.in");
      expect(emailCall.templateId).toBe("STAFF_WELCOME_ACTIVATION");
      expect(emailCall.htmlBody).toContain("https://portal.careerbutton.in/auth/activate?token=");
      expect(emailCall.textBody).toContain("https://portal.careerbutton.in/auth/activate?token=");
      expect(emailCall.htmlBody).not.toContain("localhost");
      expect(emailCall.textBody).not.toContain("localhost");
    });

    it("2. Employee invitation resend generates canonical production activation URL and dispatches email without localhost", async () => {
      vi.mocked(headers).mockResolvedValue(
        new Headers({
          "x-forwarded-host": "portal.careerbutton.in",
          "x-forwarded-proto": "https",
        }) as any
      );

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          membership: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockMembershipId,
              organizationId: mockOrgId,
              status: MembershipStatus.INVITED,
              userId: mockNewAuthUserId,
              employeeId: "CIT-EMP-0001",
              role: Role.EMPLOYEE,
              department: "Operations",
              user: { email: "existing.staff@careerbutton.in", firstName: "Existing" },
              designation: null,
            }),
          },
          staffActivationToken: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue({ id: "token-2" }),
          },
        };
        return callback(tx as any);
      });

      const res = await resendStaffActivationAction({
        membershipId: mockMembershipId,
      });

      expect(res.success).toBe(true);
      expect(mockSendTransactionalNotification).toHaveBeenCalledTimes(1);

      const emailCall = mockSendTransactionalNotification.mock.calls[0][0];
      expect(emailCall.recipientEmail).toBe("existing.staff@careerbutton.in");
      expect(emailCall.templateId).toBe("STAFF_WELCOME_ACTIVATION");
      expect(emailCall.htmlBody).toContain("https://portal.careerbutton.in/auth/activate?token=");
      expect(emailCall.textBody).toContain("https://portal.careerbutton.in/auth/activate?token=");
      expect(emailCall.htmlBody).not.toContain("localhost");
      expect(emailCall.textBody).not.toContain("localhost");
    });

    it("3. Candidate invitation creation generates canonical production activation URL and dispatches email without localhost", async () => {
      vi.mocked(headers).mockResolvedValue(
        new Headers({
          "x-forwarded-host": "portal.careerbutton.in",
          "x-forwarded-proto": "https",
        }) as any
      );

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: mockNewAuthUserId, email: "cand@careerbutton.in" }),
          },
          candidate: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({
              id: mockCandidateId,
              status: CandidateStatus.ONBOARDING,
              verificationStatus: "UNVERIFIED",
              user: { id: mockNewAuthUserId, firstName: "Cand", lastName: "User", email: "cand@careerbutton.in" },
            }),
          },
          membership: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: mockMembershipId, status: MembershipStatus.INVITED }),
          },
          staffActivationToken: {
            create: vi.fn().mockResolvedValue({ id: "cand-token-1" }),
          },
          organization: {
            findUnique: vi.fn().mockResolvedValue({ name: "CareerButton" }),
          },
        };
        return callback(tx as any);
      });

      const res = await createCandidateAction({
        email: "cand@careerbutton.in",
        firstName: "Cand",
        lastName: "User",
        sendInvitation: true,
      });

      expect(res.success).toBe(true);
      expect(mockSendTransactionalNotification).toHaveBeenCalledTimes(1);

      const emailCall = mockSendTransactionalNotification.mock.calls[0][0];
      expect(emailCall.recipientEmail).toBe("cand@careerbutton.in");
      expect(emailCall.templateId).toBe("CANDIDATE_WELCOME_ACTIVATION");
      expect(emailCall.htmlBody).toContain("https://portal.careerbutton.in/auth/activate?token=");
      expect(emailCall.textBody).toContain("https://portal.careerbutton.in/auth/activate?token=");
      expect(emailCall.htmlBody).not.toContain("localhost");
      expect(emailCall.textBody).not.toContain("localhost");
    });

    it("4. Candidate invitation resend generates canonical production activation URL and dispatches email without localhost", async () => {
      vi.mocked(headers).mockResolvedValue(
        new Headers({
          "x-forwarded-host": "portal.careerbutton.in",
          "x-forwarded-proto": "https",
        }) as any
      );

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          candidate: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockCandidateId,
              organizationId: mockOrgId,
              userId: mockNewAuthUserId,
              user: { id: mockNewAuthUserId, firstName: "Resend", lastName: "Candidate", email: "resend.cand@careerbutton.in" },
              assignedEmployee: null,
            }),
          },
          membership: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockMembershipId,
              organizationId: mockOrgId,
              userId: mockNewAuthUserId,
              status: MembershipStatus.INVITED,
            }),
            findFirst: vi.fn().mockResolvedValue({
              id: mockMembershipId,
              organizationId: mockOrgId,
              userId: mockNewAuthUserId,
              status: MembershipStatus.INVITED,
            }),
          },
          staffActivationToken: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue({ id: "cand-token-2" }),
          },
          organization: {
            findUnique: vi.fn().mockResolvedValue({ name: "CareerButton" }),
          },
        };
        return callback(tx as any);
      });

      const res = await resendCandidateInvitationAction({
        candidateId: mockCandidateId,
      });

      expect(res.success).toBe(true);
      expect(mockSendTransactionalNotification).toHaveBeenCalledTimes(1);

      const emailCall = mockSendTransactionalNotification.mock.calls[0][0];
      expect(emailCall.recipientEmail).toBe("resend.cand@careerbutton.in");
      expect(emailCall.templateId).toBe("CANDIDATE_WELCOME_ACTIVATION");
      expect(emailCall.htmlBody).toContain("https://portal.careerbutton.in/auth/activate?token=");
      expect(emailCall.textBody).toContain("https://portal.careerbutton.in/auth/activate?token=");
      expect(emailCall.htmlBody).not.toContain("localhost");
      expect(emailCall.textBody).not.toContain("localhost");
    });
  });
});
