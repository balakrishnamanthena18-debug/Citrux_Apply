/**
 * @deprecated Phase 1 Candidate Portal Completion
 *
 * CandidateNotificationCenter was never wired into the candidate shell.
 * The authoritative notification UX is `NotificationsBell` (AppHeader), backed by:
 * - GET /api/notifications
 * - markNotificationReadAction / markAllNotificationsReadAction
 * - realtime entity-type subscription for Notification
 *
 * Do not reintroduce a second candidate notification system.
 * This file remains only as a stable import tombstone for stale references.
 */

export {};
