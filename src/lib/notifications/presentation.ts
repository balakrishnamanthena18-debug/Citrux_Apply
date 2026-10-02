/**
 * OOS notification presentation model.
 * Maps stored Notification rows into a structured, scannable UI contract
 * without requiring schema migrations. Supports legacy title/body formats.
 */

import type { Role } from "@/generated/prisma";

export type NotificationPresentationKind =
  | "MESSAGE"
  | "APPLICATION_STATUS"
  | "APPLICATION_SUBMITTED"
  | "APPROVAL_REQUIRED"
  | "DOCUMENT_REQUIRED"
  | "INTERVIEW"
  | "TASK"
  | "SYSTEM_SECURITY";

export type NotificationIconKind =
  | "message"
  | "application"
  | "approval"
  | "document"
  | "interview"
  | "task"
  | "system";

export interface NotificationRecordLike {
  id: string;
  type: string;
  title: string;
  body: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  readAt?: string | Date | null;
  createdAt: string | Date;
}

export interface NotificationPresentation {
  kind: NotificationPresentationKind;
  icon: NotificationIconKind;
  headline: string;
  context: string | null;
  preview: string | null;
  actionLabel: string;
  href: string;
  unread: boolean;
  createdAt: Date;
}

const PREVIEW_MAX = 120;
const TITLE_MAX = 200;

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/** Strip common inquiry / conversation prefixes for display context. */
export function normalizeNotificationContext(subject: string): string {
  return subject
    .replace(/^Inquiry:\s*/i, "")
    .replace(/^New conversation:\s*/i, "")
    .replace(/^New reply in\s*["“]?/i, "")
    .replace(/["”]$/g, "")
    .trim();
}

export function buildMessageNotificationContent(params: {
  subject: string;
  body: string;
  recipientIsCandidate: boolean;
  isNewConversation?: boolean;
}): { title: string; body: string } {
  const context = normalizeNotificationContext(params.subject ?? "");
  const preview = truncate(String(params.body ?? ""), PREVIEW_MAX);
  const headline = params.recipientIsCandidate
    ? "New message from your team"
    : params.isNewConversation
      ? "New conversation started"
      : "New message from candidate";

  return {
    title: truncate(headline, TITLE_MAX),
    body: context ? `${context}\n${preview}` : preview,
  };
}

function roleHome(role: Role): "candidate" | "employee" | "admin" {
  if (role === "CANDIDATE") return "candidate";
  if (role === "ADMIN") return "admin";
  return "employee";
}

export function resolveNotificationHref(
  n: NotificationRecordLike,
  role: Role
): string {
  const base = roleHome(role);
  const entityId = n.relatedEntityId;

  if (n.type === "NEW_MESSAGE" && n.relatedEntityType === "Conversation" && entityId) {
    if (base === "admin") return `/employee/messages/${entityId}`;
    return `/${base}/messages/${entityId}`;
  }

  if (
    (n.relatedEntityType === "Application" ||
      n.type === "APPLICATION_STATUS_CHANGED" ||
      n.type === "APPLICATION_SUBMITTED" ||
      n.type === "CANDIDATE_APPROVAL_REQUESTED" ||
      n.type === "CANDIDATE_REVISION_REQUESTED" ||
      n.type === "SUBMISSION_ISSUE_REPORTED" ||
      n.type === "CORRECTION_REVIEW_STARTED") &&
    entityId
  ) {
    if (base === "candidate") return `/candidate/applications/${entityId}`;
    if (base === "admin") return `/admin/applications`;
    return `/employee/applications/${entityId}`;
  }

  if (n.type === "TASK_ASSIGNED" && entityId) {
    if (base === "admin") return `/admin/tasks/escalations`;
    return `/employee/tasks/${entityId}`;
  }

  if (base === "candidate") return "/candidate";
  if (base === "admin") return "/admin";
  return "/employee";
}

function parseLegacyMessageTitle(title: string): {
  headline: string;
  context: string | null;
} {
  const replyMatch = title.match(/^New reply in ["“](.+)["”]$/i);
  if (replyMatch?.[1]) {
    return {
      headline: "New message from your team",
      context: normalizeNotificationContext(replyMatch[1]),
    };
  }
  const convMatch = title.match(/^New conversation:\s*(.+)$/i);
  if (convMatch?.[1]) {
    return {
      headline: "New message from your team",
      context: normalizeNotificationContext(convMatch[1]),
    };
  }
  return { headline: title, context: null };
}

function splitBodyContextPreview(body: string): {
  context: string | null;
  preview: string | null;
} {
  const trimmed = body.trim();
  if (!trimmed) return { context: null, preview: null };
  const nl = trimmed.indexOf("\n");
  if (nl === -1) {
    return { context: null, preview: truncate(trimmed, PREVIEW_MAX) };
  }
  const context = trimmed.slice(0, nl).trim() || null;
  const preview = truncate(trimmed.slice(nl + 1), PREVIEW_MAX) || null;
  return { context, preview };
}

function kindForType(type: string): {
  kind: NotificationPresentationKind;
  icon: NotificationIconKind;
  defaultHeadline: string;
  actionLabel: string;
} {
  switch (type) {
    case "NEW_MESSAGE":
      return {
        kind: "MESSAGE",
        icon: "message",
        defaultHeadline: "New message from your team",
        actionLabel: "View message",
      };
    case "APPLICATION_SUBMITTED":
      return {
        kind: "APPLICATION_SUBMITTED",
        icon: "application",
        defaultHeadline: "Application submitted",
        actionLabel: "View application",
      };
    case "APPLICATION_STATUS_CHANGED":
    case "SUBMISSION_ISSUE_REPORTED":
    case "CORRECTION_REVIEW_STARTED":
      return {
        kind: "APPLICATION_STATUS",
        icon: "application",
        defaultHeadline: "Application update",
        actionLabel: "View application",
      };
    case "CANDIDATE_APPROVAL_REQUESTED":
      return {
        kind: "APPROVAL_REQUIRED",
        icon: "approval",
        defaultHeadline: "Your approval is needed",
        actionLabel: "Review now",
      };
    case "CANDIDATE_REVISION_REQUESTED":
      return {
        kind: "DOCUMENT_REQUIRED",
        icon: "document",
        defaultHeadline: "Revision requested",
        actionLabel: "Open details",
      };
    case "TASK_ASSIGNED":
      return {
        kind: "TASK",
        icon: "task",
        defaultHeadline: "Task assigned",
        actionLabel: "Open task",
      };
    default:
      return {
        kind: "SYSTEM_SECURITY",
        icon: "system",
        defaultHeadline: "System update",
        actionLabel: "Open",
      };
  }
}

/**
 * Present a stored notification for UI.
 * Handles legacy message titles and structured body (`context\\npreview`).
 */
export function presentNotification(
  n: NotificationRecordLike,
  role: Role
): NotificationPresentation {
  const meta = kindForType(n.type);
  const unread = !n.readAt;
  const createdAt = new Date(n.createdAt);
  const href = resolveNotificationHref(n, role);

  if (n.type === "NEW_MESSAGE") {
    const legacy = parseLegacyMessageTitle(n.title);
    const split = splitBodyContextPreview(n.body);
    const isLegacyTitle = legacy.context !== null;
    return {
      kind: meta.kind,
      icon: meta.icon,
      headline: isLegacyTitle ? legacy.headline : n.title || meta.defaultHeadline,
      context: isLegacyTitle ? legacy.context : split.context,
      preview: isLegacyTitle
        ? truncate(n.body, PREVIEW_MAX)
        : split.preview ?? (split.context ? null : truncate(n.body, PREVIEW_MAX)),
      actionLabel: meta.actionLabel,
      href,
      unread,
      createdAt,
    };
  }

  if (n.type === "APPLICATION_SUBMITTED") {
    const submittedMatch = n.title.match(
      /^Application Submitted:\s*(.+?)\s+at\s+(.+)$/i
    );
    return {
      kind: meta.kind,
      icon: meta.icon,
      headline: meta.defaultHeadline,
      context:
        submittedMatch?.[1] && submittedMatch?.[2]
          ? `${submittedMatch[1]} — ${submittedMatch[2]}`
          : normalizeNotificationContext(n.title),
      preview: truncate(n.body, PREVIEW_MAX),
      actionLabel: meta.actionLabel,
      href,
      unread,
      createdAt,
    };
  }

  return {
    kind: meta.kind,
    icon: meta.icon,
    headline: n.title || meta.defaultHeadline,
    context: null,
    preview: truncate(n.body, PREVIEW_MAX),
    actionLabel: meta.actionLabel,
    href,
    unread,
    createdAt,
  };
}

export function groupNotificationsByRecency<T extends { createdAt: Date }>(
  items: T[],
  now = new Date()
): { today: T[]; earlier: T[] } {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today: T[] = [];
  const earlier: T[] = [];
  for (const item of items) {
    if (item.createdAt >= startOfToday) today.push(item);
    else earlier.push(item);
  }
  return { today, earlier };
}

export function formatNotificationRelativeTime(
  date: Date,
  now = new Date()
): string {
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
