import { z } from "zod";

export const CreateConversationSchema = z.object({
  candidateId: z.string().uuid("Invalid candidate ID format").optional().nullable(),
  applicationId: z.string().uuid("Invalid application ID format").optional().nullable(),
  subject: z
    .string()
    .trim()
    .min(1, "Subject cannot be empty")
    .max(200, "Subject cannot exceed 200 characters"),
  initialMessage: z
    .string()
    .trim()
    .min(1, "Message content cannot be empty")
    .max(4000, "Message content cannot exceed 4000 characters"),
});

export const SendMessageSchema = z.object({
  conversationId: z.string().uuid("Invalid conversation ID format"),
  body: z
    .string()
    .trim()
    .min(1, "Message content cannot be empty")
    .max(4000, "Message content cannot exceed 4000 characters"),
});

export const MarkConversationReadSchema = z.object({
  conversationId: z.string().uuid("Invalid conversation ID format"),
});

export const CreateInternalNoteSchema = z
  .object({
    candidateId: z.string().uuid("Invalid candidate ID format").optional().nullable(),
    applicationId: z.string().uuid("Invalid application ID format").optional().nullable(),
    taskId: z.string().uuid("Invalid task ID format").optional().nullable(),
    body: z
      .string()
      .trim()
      .min(1, "Note content cannot be empty")
      .max(4000, "Note content cannot exceed 4000 characters"),
  })
  .refine(
    (data) => Boolean(data.candidateId || data.applicationId || data.taskId),
    {
      message: "Internal note must be associated with at least one entity (Candidate, Application, or Task)",
      path: ["candidateId"],
    }
  );

export const GetInternalNotesSchema = z.object({
  candidateId: z.string().uuid("Invalid candidate ID format").optional().nullable(),
  applicationId: z.string().uuid("Invalid application ID format").optional().nullable(),
  taskId: z.string().uuid("Invalid task ID format").optional().nullable(),
});

export const ListNotificationsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  unreadOnly: z.boolean().default(false),
});

export const MarkNotificationReadSchema = z.object({
  notificationId: z.string().uuid("Invalid notification ID format"),
});

export type CreateConversationInput = z.input<typeof CreateConversationSchema>;
export type SendMessageInput = z.input<typeof SendMessageSchema>;
export type MarkConversationReadInput = z.input<typeof MarkConversationReadSchema>;
export type CreateInternalNoteInput = z.input<typeof CreateInternalNoteSchema>;
export type GetInternalNotesInput = z.input<typeof GetInternalNotesSchema>;
export type ListNotificationsInput = z.input<typeof ListNotificationsSchema>;
export type MarkNotificationReadInput = z.input<typeof MarkNotificationReadSchema>;
