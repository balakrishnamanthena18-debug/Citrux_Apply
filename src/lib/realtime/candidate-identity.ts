import type { SubscriptionScope } from "./types";
import { getChannelName } from "./channels";

/**
 * Production invariant: candidate realtime channels are keyed by Auth/User.id.
 * Prisma Candidate.id is a separate operational record and must not be used as
 * the channel key unless every publisher is migrated in lockstep.
 */
export function resolveCandidateRealtimeChannelKey(userId: string): string {
  return userId;
}

export function buildCandidateRealtimeScope(args: {
  organizationId: string;
  userId: string;
}): SubscriptionScope {
  const channelKey = resolveCandidateRealtimeChannelKey(args.userId);
  return {
    role: "CANDIDATE",
    organizationId: args.organizationId,
    userId: args.userId,
    candidateId: channelKey,
  };
}

export function getCandidateRealtimeChannelName(userId: string): string {
  return getChannelName(
    buildCandidateRealtimeScope({
      organizationId: "unused-for-candidate-channel",
      userId,
    })
  );
}

/**
 * Cross-candidate isolation check for realtime payloads.
 * Returns true when Candidate A must not receive Candidate B's event.
 */
export function isCrossCandidateRealtimeLeak(args: {
  subscriberUserId: string;
  eventCandidateId?: string | null;
}): boolean {
  if (!args.eventCandidateId) return false;
  return args.eventCandidateId !== args.subscriberUserId;
}
