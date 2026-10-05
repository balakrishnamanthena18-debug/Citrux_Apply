export type RealtimeEntityType =
  | "Task"
  | "Application"
  | "Candidate"
  | "Notification"
  | "Message"
  | "CandidateDocument"
  | "Escalation"
  | "Staff";

export type RealtimeEventType =
  // Task events
  | "TASK_CREATED"
  | "TASK_UPDATED"
  | "TASK_ASSIGNED"
  | "TASK_REASSIGNED"
  | "TASK_ESCALATED"
  | "TASK_COMPLETED"
  | "TASK_CANCELED"
  // Application events
  | "APPLICATION_CREATED"
  | "APPLICATION_UPDATED"
  | "APPLICATION_AWAITING_APPROVAL"
  | "APPLICATION_APPROVED"
  | "APPLICATION_REVISION_REQUESTED"
  | "APPLICATION_SUBMITTED"
  | "APPLICATION_ISSUE_REPORTED"
  // Notification & Message events
  | "NOTIFICATION_CREATED"
  | "NOTIFICATION_READ"
  | "NOTIFICATION_ALL_READ"
  | "MESSAGE_CREATED"
  | "MESSAGE_READ"
  // Candidate & Document events
  | "CANDIDATE_PROFILE_UPDATED"
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_DELETED";

export type ConnectionStatus = "connected" | "connecting" | "reconnecting" | "disconnected";

export interface RealtimeEventPayload<T = unknown> {
  id: string; // Unique event UUID
  entityType: RealtimeEntityType;
  entityId: string;
  eventType: RealtimeEventType;
  version: number; // Monotonic sequence or timestamp in ms
  occurredAt: string; // ISO timestamp
  organizationId: string;
  teamId?: string | null;
  candidateId?: string | null;
  data?: T;
}

export interface SubscriptionScope {
  role: "ADMIN" | "MANAGER" | "TEAM_LEAD" | "EMPLOYEE" | "CANDIDATE";
  organizationId: string;
  userId: string;
  teamId?: string | null;
  /**
   * For CANDIDATE role realtime, this is the Auth/User.id channel key
   * (same as userId in production). It is NOT Prisma Candidate.id.
   */
  candidateId?: string | null;
}
