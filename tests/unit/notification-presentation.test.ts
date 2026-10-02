import { describe, expect, it } from "vitest";
import {
  buildMessageNotificationContent,
  formatNotificationRelativeTime,
  groupNotificationsByRecency,
  normalizeNotificationContext,
  presentNotification,
  resolveNotificationHref,
} from "@/lib/notifications/presentation";

describe("notification presentation model", () => {
  it("builds structured NEW_MESSAGE content without exposing raw inquiry title as headline", () => {
    const content = buildMessageNotificationContent({
      subject: "Inquiry: SE at Apple",
      body: "hello",
      recipientIsCandidate: true,
    });
    expect(content.title).toBe("New message from your team");
    expect(content.body).toBe("SE at Apple\nhello");
  });

  it("presents legacy reply titles with hierarchy", () => {
    const presented = presentNotification(
      {
        id: "n1",
        type: "NEW_MESSAGE",
        title: 'New reply in "Inquiry: SE at Apple"',
        body: "hello",
        relatedEntityType: "Conversation",
        relatedEntityId: "conv-1",
        readAt: null,
        createdAt: new Date().toISOString(),
      },
      "CANDIDATE"
    );
    expect(presented.headline).toBe("New message from your team");
    expect(presented.context).toBe("SE at Apple");
    expect(presented.preview).toBe("hello");
    expect(presented.actionLabel).toBe("View message");
    expect(presented.href).toBe("/candidate/messages/conv-1");
    expect(presented.unread).toBe(true);
  });

  it("presents structured body context/preview for new payloads", () => {
    const presented = presentNotification(
      {
        id: "n2",
        type: "NEW_MESSAGE",
        title: "New message from your team",
        body: "SE at Apple\nYour package is ready.",
        relatedEntityType: "Conversation",
        relatedEntityId: "conv-2",
        readAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      "CANDIDATE"
    );
    expect(presented.context).toBe("SE at Apple");
    expect(presented.preview).toBe("Your package is ready.");
    expect(presented.unread).toBe(false);
  });

  it("rejects unsafe external destinations and uses role-scoped deep links", () => {
    expect(
      resolveNotificationHref(
        {
          id: "a",
          type: "NEW_MESSAGE",
          title: "t",
          body: "b",
          relatedEntityType: "Conversation",
          relatedEntityId: "c1",
          createdAt: new Date().toISOString(),
        },
        "EMPLOYEE"
      )
    ).toBe("/employee/messages/c1");

    expect(
      resolveNotificationHref(
        {
          id: "b",
          type: "APPLICATION_SUBMITTED",
          title: "t",
          body: "b",
          relatedEntityType: "Application",
          relatedEntityId: "app-1",
          createdAt: new Date().toISOString(),
        },
        "CANDIDATE"
      )
    ).toBe("/candidate/applications/app-1");
  });

  it("groups today vs earlier and formats relative time", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const todayItem = { createdAt: new Date("2026-10-02T10:00:00Z") };
    const earlierItem = { createdAt: new Date("2026-10-01T10:00:00Z") };
    const groups = groupNotificationsByRecency([todayItem, earlierItem], now);
    expect(groups.today).toHaveLength(1);
    expect(groups.earlier).toHaveLength(1);
    expect(formatNotificationRelativeTime(new Date("2026-10-02T11:58:00Z"), now)).toBe(
      "2 min ago"
    );
  });

  it("normalizes inquiry subjects for context display", () => {
    expect(normalizeNotificationContext('Inquiry: SE at Apple')).toBe("SE at Apple");
  });

  it("maps application submitted into submission presentation", () => {
    const presented = presentNotification(
      {
        id: "n3",
        type: "APPLICATION_SUBMITTED",
        title: "Application Submitted: Software Engineer at Apple",
        body: "Submitted on your behalf.",
        relatedEntityType: "Application",
        relatedEntityId: "app-9",
        readAt: null,
        createdAt: new Date().toISOString(),
      },
      "CANDIDATE"
    );
    expect(presented.kind).toBe("APPLICATION_SUBMITTED");
    expect(presented.headline).toBe("Application submitted");
    expect(presented.context).toBe("Software Engineer — Apple");
    expect(presented.href).toBe("/candidate/applications/app-9");
  });
});
