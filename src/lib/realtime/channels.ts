import type { SubscriptionScope } from "./types";

/**
 * Builds the canonical, secure channel name based on authenticated user scope.
 * Pure helper — safe for server and client imports (no Supabase client).
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
