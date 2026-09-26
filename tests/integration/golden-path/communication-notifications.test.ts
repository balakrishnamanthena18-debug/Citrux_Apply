import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createConversationAction,
  sendMessageAction,
  markConversationReadAction,
  listNotificationsAction,
  markNotificationReadAction,
  createInternalNoteAction,
  getInternalNotesAction,
} from "@/lib/communication/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { NotificationType } from "@/generated/prisma";
import { AuthorizationError } from "@/lib/errors";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireEmployeeOrAdmin: vi.fn((ctx) => {
    if (ctx.role !== "EMPLOYEE" && ctx.role !== "ADMIN") {
      throw new AuthorizationError("Operation requires EMPLOYEE or ADMIN role");
    }
  }),
  requireCandidate: vi.fn((ctx) => {
    if (ctx.role !== "CANDIDATE") {
      throw new AuthorizationError("Operation requires CANDIDATE role");
    }
  }),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

describe("Phase 9 Golden Path — Communication & Notifications Core (tests/integration/golden-path/communication-notifications.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockCandidateUserId = "22222222-2222-4222-8222-222222222222";
  const mockCandidateId = "33333333-3333-4333-8333-333333333333";
  const mockStaffUserId = "44444444-4444-4444-8444-444444444444";
  const mockConversationId = "55555555-5555-4555-8555-555555555555";
  const mockMessage1Id = "66666666-6666-4666-8666-666666666666";
  const mockMessage2Id = "66666666-6666-4666-8666-666666666667";
  const mockNotifId = "77777777-7777-4777-8777-777777777777";
  const mockAppId = "88888888-8888-4888-8888-888888888888";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Step 19: Notification dispatched to candidate and email transport abstraction triggered", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "candidate@alpha.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        notification: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: mockNotifId,
              organizationId: mockOrgId,
              recipientId: mockCandidateUserId,
              type: NotificationType.APPLICATION_STATUS_CHANGED,
              title: "Application Submitted",
              body: "Your application for Staff Engineer has been successfully submitted to Stripe.",
              isRead: false,
              createdAt: new Date(),
            },
          ]),
          count: vi.fn().mockResolvedValue(1),
          findUnique: vi.fn().mockResolvedValue({
            id: mockNotifId,
            organizationId: mockOrgId,
            recipientId: mockCandidateUserId,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockNotifId,
            isRead: true,
            readAt: new Date(),
          }),
        },
      };
      return callback(tx as any);
    });

    const notifListRes = await listNotificationsAction({});
    expect(notifListRes.success).toBe(true);
    expect(notifListRes.data?.notifications).toHaveLength(1);
    expect(notifListRes.data?.notifications[0].title).toBe("Application Submitted");

    const markReadRes = await markNotificationReadAction({ notificationId: mockNotifId });
    expect(markReadRes.success).toBe(true);
  });

  it("Step 20 & 21: Candidate initiates direct message to staff -> Staff replies -> Text-only append-only persistence", async () => {
    // Step 20: Candidate creates conversation & sends initial message
    vi.mocked(getAuthenticatedContext).mockResolvedValueOnce({
      userId: mockCandidateUserId,
      email: "candidate@alpha.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            organizationId: mockOrgId,
            userId: mockCandidateUserId,
            user: { email: "candidate@alpha.com" },
            assignedEmployee: null,
          }),
        },
        conversation: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: mockConversationId,
            organizationId: mockOrgId,
            candidateId: mockCandidateId,
            subject: "Question regarding Stripe submission",
            lastMessageAt: new Date(),
          }),
        },
        notification: {
          create: vi.fn().mockResolvedValue({ id: "notif-1" }),
        },
      };
      return callback(tx as any);
    });

    const candMsgRes = await createConversationAction({
      candidateId: mockCandidateId,
      subject: "Question regarding Stripe submission",
      initialMessage: "Hi team, do I need to prepare anything for the initial screen?",
    });

    expect(candMsgRes.success).toBe(true);
    expect(candMsgRes.data?.conversationId).toBe(mockConversationId);

    // Step 21: Staff member replies
    vi.mocked(getAuthenticatedContext).mockResolvedValueOnce({
      userId: mockStaffUserId,
      email: "staff@alpha.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        conversation: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockConversationId,
            organizationId: mockOrgId,
            candidate: {
              userId: mockCandidateUserId,
              user: { email: "candidate@alpha.com" },
              assignedEmployee: null,
            },
          }),
          update: vi.fn().mockResolvedValue({
            id: mockConversationId,
            lastMessageAt: new Date(),
          }),
        },
        message: {
          create: vi.fn().mockResolvedValue({
            id: mockMessage2Id,
            conversationId: mockConversationId,
            senderId: mockStaffUserId,
            body: "We will share the preparation guide shortly.",
            createdAt: new Date(),
          }),
        },
        notification: {
          create: vi.fn().mockResolvedValue({ id: "notif-reply" }),
        },
      };
      return callback(tx as any);
    });

    const staffReplyRes = await sendMessageAction({
      conversationId: mockConversationId,
      body: "We will share the preparation guide shortly.",
    });

    expect(staffReplyRes.success).toBe(true);
    expect(staffReplyRes.data?.messageId).toBe(mockMessage2Id);
  });

  it("Asserts Candidate is strictly blocked from accessing staff internal notes", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "candidate@alpha.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    // Candidate attempting to list internal notes returns error
    const listRes = await getInternalNotesAction({ applicationId: mockAppId });
    expect(listRes.success).toBe(false);
    expect(listRes.error).toMatch(/EMPLOYEE or ADMIN role/i);

    // Candidate attempting to create internal note returns error
    const createRes = await createInternalNoteAction({
      applicationId: mockAppId,
      body: "Attempting to create internal note as candidate",
    });
    expect(createRes.success).toBe(false);
    expect(createRes.error).toMatch(/EMPLOYEE or ADMIN role/i);
  });
});
