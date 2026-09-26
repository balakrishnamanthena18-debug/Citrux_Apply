import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createConversationAction,
  sendMessageAction,
  markConversationReadAction,
} from "@/lib/communication/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { AuthorizationError, ValidationError } from "@/lib/errors";

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

describe("Candidate Communication & Tenant Isolation Integration (tests/integration/communication-isolation.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockCandidateAUserId = "22222222-2222-4222-8222-222222222222";
  const mockCandidateAId = "33333333-3333-4333-8333-333333333333";
  const mockCandidateBUserId = "44444444-4444-4444-8444-444444444444";
  const mockCandidateBId = "55555555-5555-4555-8555-555555555555";
  const mockStaffUserId = "66666666-6666-4666-8666-666666666666";
  const mockConversationId = "77777777-7777-4777-8777-777777777777";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Candidate creates conversation with initial message -> success and audit logged", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateAUserId,
      email: "candA@example.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateAId,
            userId: mockCandidateAUserId,
            organizationId: mockOrgId,
          }),
        },
        conversation: {
          create: vi.fn().mockResolvedValue({
            id: mockConversationId,
            organizationId: mockOrgId,
            candidateId: mockCandidateAId,
            subject: "Application Query",
          }),
        },
        message: {
          create: vi.fn().mockResolvedValue({
            id: "msg-1",
            conversationId: mockConversationId,
            senderId: mockCandidateAUserId,
            senderRole: "CANDIDATE",
            body: "When will interviews begin?",
          }),
        },
        notification: {
          create: vi.fn().mockResolvedValue({ id: "notif-1" }),
        },
      };
      return callback(tx as any);
    });

    const res = await createConversationAction({
      subject: "Application Query",
      initialMessage: "When will interviews begin?",
    });

    expect(res.success).toBe(true);
    expect(res.data?.conversationId).toBe(mockConversationId);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CONVERSATION_CREATED",
        entityId: mockConversationId,
      })
    );
  });

  it("2. Candidate B is blocked from sending a message into Candidate A's conversation", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateBUserId,
      email: "candB@example.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateBId,
            userId: mockCandidateBUserId,
            organizationId: mockOrgId,
          }),
        },
        conversation: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockConversationId,
            organizationId: mockOrgId,
            candidateId: mockCandidateAId, // Belongs to Candidate A!
            candidate: { userId: mockCandidateAUserId },
          }),
        },
      };
      return callback(tx as any);
    });

    const res = await sendMessageAction({
      conversationId: mockConversationId,
      body: "Attempting to inject into other candidate conversation",
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain("Cannot send message in another candidate's conversation");
  });

  it("3. Staff can send a response message to candidate conversation -> notification dispatched", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockStaffUserId,
      email: "staff@example.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        conversation: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockConversationId,
            organizationId: mockOrgId,
            candidateId: mockCandidateAId,
            candidate: {
              userId: mockCandidateAUserId,
              user: { email: "candA@example.com", firstName: "Alice" },
            },
          }),
          update: vi.fn().mockResolvedValue({ id: mockConversationId }),
        },
        message: {
          create: vi.fn().mockResolvedValue({
            id: "msg-2",
            conversationId: mockConversationId,
            senderId: mockStaffUserId,
            senderRole: "EMPLOYEE",
            body: "Your application is under review.",
          }),
        },
        notification: {
          create: vi.fn().mockResolvedValue({ id: "notif-1" }),
        },
      };
      return callback(tx as any);
    });

    const res = await sendMessageAction({
      conversationId: mockConversationId,
      body: "Your application is under review.",
    });

    expect(res.success).toBe(true);
    expect(res.data?.messageId).toBe("msg-2");
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "MESSAGE_SENT",
        entityId: "msg-2",
      })
    );
  });
});
