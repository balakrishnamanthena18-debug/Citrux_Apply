import { describe, it, expect } from "vitest";
import {
  CreateConversationSchema,
  SendMessageSchema,
  MarkConversationReadSchema,
  CreateInternalNoteSchema,
  GetInternalNotesSchema,
  ListNotificationsSchema,
  MarkNotificationReadSchema,
} from "@/lib/validation/communication.schemas";

describe("Phase 7 Communication Validation Schemas (tests/unit/communication-schemas.test.ts)", () => {
  const validUUID = "11111111-1111-4111-8111-111111111111";

  describe("CreateConversationSchema", () => {
    it("validates valid conversation creation payload", () => {
      const res = CreateConversationSchema.safeParse({
        subject: "Question about Interview Schedule",
        initialMessage: "Hello, when can I expect the next round of interviews?",
        applicationId: validUUID,
      });
      expect(res.success).toBe(true);
    });

    it("rejects missing subject or initialMessage", () => {
      const res = CreateConversationSchema.safeParse({
        subject: "",
        initialMessage: "",
      });
      expect(res.success).toBe(false);
    });

    it("rejects subject exceeding 200 characters", () => {
      const res = CreateConversationSchema.safeParse({
        subject: "A".repeat(201),
        initialMessage: "Valid message text",
      });
      expect(res.success).toBe(false);
    });
  });

  describe("SendMessageSchema", () => {
    it("validates valid message payload", () => {
      const res = SendMessageSchema.safeParse({
        conversationId: validUUID,
        body: "Here is the response regarding the role.",
      });
      expect(res.success).toBe(true);
    });

    it("rejects empty message body", () => {
      const res = SendMessageSchema.safeParse({
        conversationId: validUUID,
        body: "   ",
      });
      expect(res.success).toBe(false);
    });

    it("rejects message body exceeding 10000 characters", () => {
      const res = SendMessageSchema.safeParse({
        conversationId: validUUID,
        body: "A".repeat(10001),
      });
      expect(res.success).toBe(false);
    });
  });

  describe("CreateInternalNoteSchema", () => {
    it("validates valid internal note payload", () => {
      const res = CreateInternalNoteSchema.safeParse({
        candidateId: validUUID,
        applicationId: validUUID,
        body: "Candidate demonstrated strong background during phone screen.",
      });
      expect(res.success).toBe(true);
    });

    it("rejects empty note body", () => {
      const res = CreateInternalNoteSchema.safeParse({
        candidateId: validUUID,
        body: "",
      });
      expect(res.success).toBe(false);
    });
  });

  describe("ListNotificationsSchema", () => {
    it("applies default limit and unreadOnly when omitted", () => {
      const res = ListNotificationsSchema.safeParse({});
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.limit).toBe(20);
        expect(res.data.unreadOnly).toBe(false);
      }
    });

    it("validates custom limits within range", () => {
      const res = ListNotificationsSchema.safeParse({
        limit: 50,
        unreadOnly: true,
      });
      expect(res.success).toBe(true);
    });

    it("rejects limit over 100", () => {
      const res = ListNotificationsSchema.safeParse({
        limit: 101,
      });
      expect(res.success).toBe(false);
    });
  });

  describe("MarkNotificationReadSchema", () => {
    it("validates valid notification ID", () => {
      const res = MarkNotificationReadSchema.safeParse({
        notificationId: validUUID,
      });
      expect(res.success).toBe(true);
    });

    it("rejects invalid UUID", () => {
      const res = MarkNotificationReadSchema.safeParse({
        notificationId: "invalid-uuid",
      });
      expect(res.success).toBe(false);
    });
  });
});
