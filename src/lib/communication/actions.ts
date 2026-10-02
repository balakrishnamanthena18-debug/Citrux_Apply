"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import {
  NotificationType,
  AuditAction,
  Role,
} from "@/generated/prisma";
import {
  CreateConversationSchema,
  SendMessageSchema,
  MarkConversationReadSchema,
  CreateInternalNoteSchema,
  GetInternalNotesSchema,
  ListNotificationsSchema,
  MarkNotificationReadSchema,
  type CreateConversationInput,
  type SendMessageInput,
  type MarkConversationReadInput,
  type CreateInternalNoteInput,
  type GetInternalNotesInput,
  type ListNotificationsInput,
  type MarkNotificationReadInput,
} from "@/lib/validation/communication.schemas";
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from "@/lib/errors";
import { emailNotificationService } from "@/lib/email";
import { buildMessageNotificationContent } from "@/lib/notifications/presentation";
import {
  buildNewConversationEmailHtml,
  buildNewConversationEmailSubject,
  buildNewConversationEmailText,
  buildNewMessageEmailHtml,
  buildNewMessageEmailSubject,
  buildNewMessageEmailText,
} from "@/lib/email/templates/messaging";
import { publishRealtimeEvent } from "@/lib/realtime/publish";
import type { SubscriptionScope } from "@/lib/realtime/types";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

function scopeForPublish(
  ctx: { role: Role; organizationId: string; userId: string },
  recipientRoleHint?: "CANDIDATE" | "EMPLOYEE" | "ADMIN"
): SubscriptionScope {
  const role =
    recipientRoleHint ||
    (ctx.role === Role.CANDIDATE ? "CANDIDATE" : ctx.role === Role.ADMIN ? "ADMIN" : "EMPLOYEE");
  return {
    role,
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    candidateId: role === "CANDIDATE" ? ctx.userId : null,
  };
}

function revalidateCommunicationViews(conversationId?: string) {
  try {
    revalidatePath("/candidate/messages");
    revalidatePath("/employee/messages");
    revalidatePath("/candidate");
    revalidatePath("/employee");
    if (conversationId) {
      revalidatePath(`/candidate/messages/${conversationId}`);
      revalidatePath(`/employee/messages/${conversationId}`);
    }
  } catch {
    // Safe fallback when executed outside Next.js request context
  }
}

// ==========================================
// 1. Candidate ↔ Staff Conversations & Messages
// ==========================================

/**
 * Initializes a new conversation between Candidate and Organization Staff.
 */
export async function createConversationAction(
  input: CreateConversationInput
): Promise<ActionResult<{ conversationId: string }>> {
  const parsed = CreateConversationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();

    const conversation = await withRlsContext(ctx.userId, async (tx) => {
      // 1. Verify Candidate
      let candidate = null;
      if (parsed.data.candidateId) {
        candidate = await tx.candidate.findUnique({
          where: { id: parsed.data.candidateId, organizationId: ctx.organizationId },
          include: { user: true, assignedEmployee: true },
        });
      } else if (ctx.role === Role.CANDIDATE) {
        candidate = await tx.candidate.findUnique({
          where: { userId: ctx.userId },
          include: { user: true, assignedEmployee: true },
        });
      }

      if (!candidate) {
        throw new NotFoundError("Candidate not found in organization");
      }

      if (ctx.role === Role.CANDIDATE && candidate.userId !== ctx.userId) {
        throw new AuthorizationError("Cannot create a conversation for another candidate");
      }

      // 2. Verify Application if linked
      if (parsed.data.applicationId) {
        const application = await tx.application.findUnique({
          where: { id: parsed.data.applicationId, organizationId: ctx.organizationId },
        });
        if (!application || application.candidateId !== candidate.id) {
          throw new ValidationError("Application does not belong to candidate");
        }
      }

      // 3. Create Conversation and initial Message atomically
      const now = new Date();
      const conv = await tx.conversation.create({
        data: {
          organizationId: ctx.organizationId,
          candidateId: candidate.id,
          applicationId: parsed.data.applicationId || null,
          subject: parsed.data.subject,
          lastMessageAt: now,
          messages: {
            create: {
              senderId: ctx.userId,
              senderRole: ctx.role,
              body: parsed.data.initialMessage,
              createdAt: now,
            },
          },
        },
      });

      // 4. Create in-app Notification for the other party
      const isCandidateSender = ctx.role === Role.CANDIDATE;
      const recipientId = isCandidateSender
        ? candidate.assignedEmployeeId || null
        : candidate.userId;

      let notificationId: string | null = null;
      let notificationContent: { title: string; body: string } | null = null;
      if (recipientId) {
        notificationContent = buildMessageNotificationContent({
          subject: parsed.data.subject,
          body: parsed.data.initialMessage,
          recipientIsCandidate: !isCandidateSender,
          isNewConversation: true,
        });
        const notif = await tx.notification.create({
          data: {
            organizationId: ctx.organizationId,
            recipientId,
            type: NotificationType.NEW_MESSAGE,
            title: notificationContent.title,
            body: notificationContent.body,
            relatedEntityType: "Conversation",
            relatedEntityId: conv.id,
          },
        });
        notificationId = notif.id;
      }

      return { conv, candidate, recipientId, notificationId, notificationContent };
    });

    // 5. Audit Logging
    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.CONVERSATION_CREATED,
      entityType: "Conversation",
      entityId: conversation.conv.id,
      details: {
        candidateId: conversation.candidate.id,
        applicationId: parsed.data.applicationId || null,
        subject: parsed.data.subject,
      },
    });

    if (conversation.notificationId && conversation.recipientId) {
      const recipientIsCandidate = ctx.role !== Role.CANDIDATE;
      void publishRealtimeEvent(
        {
          ...scopeForPublish(ctx, recipientIsCandidate ? "CANDIDATE" : "EMPLOYEE"),
          userId: conversation.recipientId,
          candidateId: recipientIsCandidate ? conversation.candidate.userId : null,
        },
        {
          entityType: "Notification",
          entityId: conversation.notificationId,
          eventType: "NOTIFICATION_CREATED",
          data: {
            id: conversation.notificationId,
            title: conversation.notificationContent?.title ?? "New message from your team",
            body: conversation.notificationContent?.body ?? "",
            readAt: null,
          },
        }
      );
    }
    // 6. Safe transactional email dispatch (presentation templates only; never fail the action)
    try {
      const isCandidateSender = ctx.role === Role.CANDIDATE;
      const recipientEmail = isCandidateSender
        ? conversation.candidate.assignedEmployee?.email
        : conversation.candidate.user.email;

      if (recipientEmail) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const conversationUrl = isCandidateSender
          ? `${appUrl}/employee/messages/${conversation.conv.id}`
          : `${appUrl}/candidate/messages/${conversation.conv.id}`;
        const recipientIsCandidate = !isCandidateSender;
        const messageParams = {
          subject: parsed.data.subject,
          messageBody: parsed.data.initialMessage,
          senderName: ctx.fullName,
          conversationUrl,
          recipientIsCandidate,
        };

        emailNotificationService
          .sendTransactionalNotification({
            organizationId: ctx.organizationId,
            recipientEmail,
            templateId: "new_conversation",
            subject: buildNewConversationEmailSubject(parsed.data.subject),
            textBody: buildNewConversationEmailText(messageParams),
            htmlBody: buildNewConversationEmailHtml(messageParams),
          })
          .catch(() => {});
      }
    } catch {
      // Email presentation/dispatch must never fail conversation creation
    }

    revalidateCommunicationViews(conversation.conv.id);
    return { success: true, data: { conversationId: conversation.conv.id } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create conversation" };
  }
}

/**
 * Appends a message to an existing conversation.
 */
export async function sendMessageAction(
  input: SendMessageInput
): Promise<ActionResult<{ messageId: string }>> {
  const parsed = SendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();

    const result = await withRlsContext(ctx.userId, async (tx) => {
      // 1. Fetch Conversation and Candidate
      const conv = await tx.conversation.findUnique({
        where: { id: parsed.data.conversationId, organizationId: ctx.organizationId },
        include: {
          candidate: { include: { user: true, assignedEmployee: true } },
        },
      });

      if (!conv) {
        throw new NotFoundError("Conversation not found");
      }

      if (ctx.role === Role.CANDIDATE && conv.candidate.userId !== ctx.userId) {
        throw new AuthorizationError("Cannot send message in another candidate's conversation");
      }

      const now = new Date();

      // 2. Create Message and update Conversation lastMessageAt
      const message = await tx.message.create({
        data: {
          conversationId: conv.id,
          senderId: ctx.userId,
          senderRole: ctx.role,
          body: parsed.data.body,
          createdAt: now,
        },
      });

      await tx.conversation.update({
        where: { id: conv.id },
        data: { lastMessageAt: now },
      });

      // 3. Create In-App Notification for recipient
      const isCandidateSender = ctx.role === Role.CANDIDATE;
      const recipientId = isCandidateSender
        ? conv.candidate.assignedEmployeeId || null
        : conv.candidate.userId;

      let notificationId: string | null = null;
      let notificationContent: { title: string; body: string } | null = null;
      if (recipientId) {
        notificationContent = buildMessageNotificationContent({
          subject: conv.subject,
          body: parsed.data.body,
          recipientIsCandidate: !isCandidateSender,
          isNewConversation: false,
        });
        const notif = await tx.notification.create({
          data: {
            organizationId: ctx.organizationId,
            recipientId,
            type: NotificationType.NEW_MESSAGE,
            title: notificationContent.title,
            body: notificationContent.body,
            relatedEntityType: "Conversation",
            relatedEntityId: conv.id,
          },
        });
        notificationId = notif.id;
      }

      return { message, conv, recipientId, notificationId, notificationContent };
    });

    // 4. Audit Logging
    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.MESSAGE_SENT,
      entityType: "Message",
      entityId: result.message.id,
      details: {
        conversationId: result.conv.id,
        senderRole: ctx.role,
      },
    });

    if (result.notificationId && result.recipientId) {
      const recipientIsCandidate = ctx.role !== Role.CANDIDATE;
      void publishRealtimeEvent(
        {
          ...scopeForPublish(ctx, recipientIsCandidate ? "CANDIDATE" : "EMPLOYEE"),
          userId: result.recipientId,
          organizationId: ctx.organizationId,
          candidateId: recipientIsCandidate ? result.conv.candidate.userId : null,
        },
        {
          entityType: "Notification",
          entityId: result.notificationId,
          eventType: "NOTIFICATION_CREATED",
          data: {
            id: result.notificationId,
            title: result.notificationContent?.title ?? "New message from your team",
            body: result.notificationContent?.body ?? "",
            readAt: null,
          },
        }
      );
    }

    // 5. Safe transactional email dispatch (presentation templates only; never fail the action)
    try {
      const isCandidateSender = ctx.role === Role.CANDIDATE;
      const recipientEmail = isCandidateSender
        ? result.conv.candidate.assignedEmployee?.email
        : result.conv.candidate.user.email;

      if (recipientEmail) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const conversationUrl = isCandidateSender
          ? `${appUrl}/employee/messages/${result.conv.id}`
          : `${appUrl}/candidate/messages/${result.conv.id}`;
        const recipientIsCandidate = !isCandidateSender;
        const messageParams = {
          subject: result.conv.subject || "Conversation",
          messageBody: parsed.data.body,
          senderName: ctx.fullName,
          conversationUrl,
          recipientIsCandidate,
        };

        emailNotificationService
          .sendTransactionalNotification({
            organizationId: ctx.organizationId,
            recipientEmail,
            templateId: "new_message",
            subject: buildNewMessageEmailSubject(result.conv.subject || "Conversation"),
            textBody: buildNewMessageEmailText(messageParams),
            htmlBody: buildNewMessageEmailHtml(messageParams),
          })
          .catch(() => {});
      }
    } catch {
      // Email presentation/dispatch must never fail message send
    }

    revalidateCommunicationViews(result.conv.id);
    return { success: true, data: { messageId: result.message.id } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to send message" };
  }
}

/**
 * Marks incoming unread messages in a conversation as read.
 */
export async function markConversationReadAction(
  input: MarkConversationReadInput
): Promise<ActionResult> {
  const parsed = MarkConversationReadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();

    await withRlsContext(ctx.userId, async (tx) => {
      const conv = await tx.conversation.findUnique({
        where: { id: parsed.data.conversationId, organizationId: ctx.organizationId },
        include: { candidate: true },
      });

      if (!conv) {
        throw new NotFoundError("Conversation not found");
      }

      if (ctx.role === Role.CANDIDATE && conv.candidate.userId !== ctx.userId) {
        throw new AuthorizationError("Cannot access another candidate's conversation");
      }

      await tx.message.updateMany({
        where: {
          conversationId: conv.id,
          senderId: { not: ctx.userId },
          readAt: null,
        },
        data: {
          readAt: new Date(),
        },
      });
    });

    revalidateCommunicationViews(parsed.data.conversationId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to mark conversation read" };
  }
}

// ==========================================
// 2. Internal Staff Notes (Staff Only)
// ==========================================

/**
 * Creates an internal, confidential staff operational note.
 * Strictly forbidden for CANDIDATE role.
 */
export async function createInternalNoteAction(
  input: CreateInternalNoteInput
): Promise<ActionResult<{ noteId: string }>> {
  const parsed = CreateInternalNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    const note = await withRlsContext(ctx.userId, async (tx) => {
      // 1. Verify Candidate if linked
      if (parsed.data.candidateId) {
        const cand = await tx.candidate.findUnique({
          where: { id: parsed.data.candidateId, organizationId: ctx.organizationId },
        });
        if (!cand) throw new NotFoundError("Candidate not found");
      }

      // 2. Verify Application if linked
      if (parsed.data.applicationId) {
        const app = await tx.application.findUnique({
          where: { id: parsed.data.applicationId, organizationId: ctx.organizationId },
        });
        if (!app) throw new NotFoundError("Application not found");
      }

      // 3. Verify Task if linked
      if (parsed.data.taskId) {
        const task = await tx.task.findUnique({
          where: { id: parsed.data.taskId, organizationId: ctx.organizationId },
        });
        if (!task) throw new NotFoundError("Task not found");
      }

      // 4. Create internal note
      return tx.internalNote.create({
        data: {
          organizationId: ctx.organizationId,
          candidateId: parsed.data.candidateId || null,
          applicationId: parsed.data.applicationId || null,
          taskId: parsed.data.taskId || null,
          authorId: ctx.userId,
          body: parsed.data.body,
        },
      });
    });

    // 5. Audit Logging
    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.INTERNAL_NOTE_CREATED,
      entityType: "InternalNote",
      entityId: note.id,
      details: {
        candidateId: parsed.data.candidateId || null,
        applicationId: parsed.data.applicationId || null,
        taskId: parsed.data.taskId || null,
      },
    });

    revalidateCommunicationViews();
    return { success: true, data: { noteId: note.id } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create internal note" };
  }
}

/**
 * Retrieves internal staff notes for a candidate, application, or task.
 * Strictly forbidden for CANDIDATE role.
 */
export async function getInternalNotesAction(
  input: GetInternalNotesInput
): Promise<ActionResult<{ notes: any[] }>> {
  const parsed = GetInternalNotesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    const notes = await withRlsContext(ctx.userId, async (tx) => {
      const whereClause: any = { organizationId: ctx.organizationId };
      if (parsed.data.candidateId) whereClause.candidateId = parsed.data.candidateId;
      if (parsed.data.applicationId) whereClause.applicationId = parsed.data.applicationId;
      if (parsed.data.taskId) whereClause.taskId = parsed.data.taskId;

      return tx.internalNote.findMany({
        where: whereClause,
        include: {
          author: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    });

    return { success: true, data: { notes } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to retrieve internal notes" };
  }
}

// ==========================================
// 3. In-App Notifications
// ==========================================

/**
 * Lists in-app notifications for the authenticated user.
 */
export async function listNotificationsAction(
  input?: ListNotificationsInput
): Promise<ActionResult<{ notifications: any[] }>> {
  const parsed = ListNotificationsSchema.safeParse(input || {});
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();

    const notifications = await withRlsContext(ctx.userId, async (tx) => {
      return tx.notification.findMany({
        where: {
          organizationId: ctx.organizationId,
          recipientId: ctx.userId,
          ...(parsed.data.unreadOnly ? { readAt: null } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: parsed.data.limit ?? 20,
      });
    });

    return { success: true, data: { notifications } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to list notifications" };
  }
}

/**
 * Marks a single in-app notification as read.
 */
export async function markNotificationReadAction(
  input: MarkNotificationReadInput
): Promise<ActionResult> {
  const parsed = MarkNotificationReadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();

    await withRlsContext(ctx.userId, async (tx) => {
      const notif = await tx.notification.findUnique({
        where: { id: parsed.data.notificationId },
      });

      if (!notif || notif.recipientId !== ctx.userId || notif.organizationId !== ctx.organizationId) {
        throw new NotFoundError("Notification not found");
      }

      await tx.notification.update({
        where: { id: notif.id },
        data: { readAt: new Date() },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.NOTIFICATION_READ,
      entityType: "Notification",
      entityId: parsed.data.notificationId,
    });

    revalidateCommunicationViews();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to mark notification read" };
  }
}

/**
 * Marks all in-app notifications as read for the authenticated user.
 */
export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  try {
    const ctx = await getAuthenticatedContext();

    await withRlsContext(ctx.userId, async (tx) => {
      await tx.notification.updateMany({
        where: {
          organizationId: ctx.organizationId,
          recipientId: ctx.userId,
          readAt: null,
        },
        data: { readAt: new Date() },
      });
    });

    revalidateCommunicationViews();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to mark all notifications read" };
  }
}
