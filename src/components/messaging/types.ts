export type MessageRoleView = "STAFF" | "CANDIDATE";

export interface MessagingParticipant {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}

export interface MessagingConversationListItem {
  id: string;
  subject: string;
  updatedAt: string;
  lastMessageAt: string;
  candidateId: string;
  candidateName: string;
  candidateEmail?: string | null;
  applicationId?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
  lastMessageBody?: string | null;
  lastMessageSenderRole?: string | null;
  lastMessageSenderId?: string | null;
  lastMessageReadAt?: string | null;
  unread: boolean;
}

export interface MessagingMessageItem {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  senderRole: string;
  readAt?: string | null;
  senderName: string;
  senderEmail?: string | null;
}

export interface MessagingApplicationSummary {
  id: string;
  status: string;
  createdAt: string;
  jobTitle: string;
  companyName: string;
}

export interface MessagingTaskSummary {
  id: string;
  title: string;
  status: string;
  priority: string;
}

export interface MessagingActiveThread {
  id: string;
  subject: string;
  candidateId: string;
  candidateName: string;
  candidateEmail?: string | null;
  candidateStatus?: string | null;
  candidatePhone?: string | null;
  candidateCity?: string | null;
  candidateCountry?: string | null;
  applicationId?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
  applicationStatus?: string | null;
  messages: MessagingMessageItem[];
  recentApplications: MessagingApplicationSummary[];
  recentTasks: MessagingTaskSummary[];
}

export function displayName(parts: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const name = [parts.firstName, parts.lastName].filter(Boolean).join(" ").trim();
  return name || parts.email || "Unknown";
}

export function initials(name: string): string {
  const bits = name.split(/\s+/).filter(Boolean);
  if (bits.length === 0) return "?";
  if (bits.length === 1) return bits[0]!.slice(0, 2).toUpperCase();
  return `${bits[0]![0] || ""}${bits[1]![0] || ""}`.toUpperCase();
}

const DATE_LOCALE = "en-US";

/** Deterministic locale formatting — avoid [] locale (SSR/client mismatch). */
export function formatMessageTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  // Absolute short date avoids same-day branching on wall-clock (also hydrates cleanly).
  return date.toLocaleDateString(DATE_LOCALE, { month: "short", day: "numeric" });
}

export function formatMessageClock(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(DATE_LOCALE, { hour: "numeric", minute: "2-digit" });
}

export function formatDateSeparator(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(DATE_LOCALE, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
