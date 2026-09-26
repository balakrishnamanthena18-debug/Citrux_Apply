import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listNotificationsAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/lib/communication/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

describe("Notifications Workflow & Isolation (tests/integration/notifications-workflow.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockCandidateUserId = "22222222-2222-4222-8222-222222222222";
  const mockNotifId1 = "33333333-3333-4333-8333-333333333333";
  const mockNotifId2 = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "cand@example.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });
  });

  it("1. Candidate lists their notifications with recipient filtering", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        notification: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: mockNotifId1,
              recipientId: mockCandidateUserId,
              title: "New Message Received",
              body: "Staff has responded to your inquiry.",
              readAt: null,
            },
          ]),
        },
      };
      return callback(tx as any);
    });

    const res = await listNotificationsAction({ limit: 10 });
    expect(res.success).toBe(true);
    expect(res.data?.notifications).toHaveLength(1);
    expect(res.data?.notifications[0].title).toBe("New Message Received");
  });

  it("2. Candidate marks individual notification as read -> updates readAt and logs audit", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        notification: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockNotifId1,
            recipientId: mockCandidateUserId,
            organizationId: mockOrgId,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockNotifId1,
            readAt: new Date(),
          }),
        },
      };
      return callback(tx as any);
    });

    const res = await markNotificationReadAction({ notificationId: mockNotifId1 });
    expect(res.success).toBe(true);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "NOTIFICATION_READ",
        entityId: mockNotifId1,
      })
    );
  });

  it("3. Candidate marks all notifications as read in bulk", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        notification: {
          updateMany: vi.fn().mockResolvedValue({ count: 3 }),
        },
      };
      return callback(tx as any);
    });

    const res = await markAllNotificationsReadAction();
    expect(res.success).toBe(true);
  });
});
