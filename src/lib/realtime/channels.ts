import type { SubscriptionScope } from "./types";

/**
 * Builds the canonical, secure channel name based on authenticated user scope.
 * Pure helper — safe for server and client imports (no Supabase client).
 *
 * Candidate channel contract:
 * `candidate:{userId}` where userId is the authenticated User.id.
 * Production layout sets scope.candidateId = userId (not Prisma Candidate.id).
 * Publishers must use the same User.id key for event.candidateId.
 */
export function getChannelName(scope: SubscriptionScope): string {
  if (scope.role === "CANDIDATE") {
    return `candidate:${scope.candidateId || scope.userId}`;
  }
  if (scope.role === "TEAM_LEAD" && scope.teamId) {
    return `team:${scope.organizationId}:${scope.teamId}`;
  }
  return `org:${scope.organizationId}`;
}
