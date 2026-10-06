/**
 * Phase 5B.1/5B.2 — server actions for candidate job feed reads.
 * Thin "use server" boundary so client components never import worker/prisma barrels.
 */

"use server";

import {
  getCandidateJobFeed as readCandidateJobFeed,
  getOwnCandidateJobFeedItem as readOwnCandidateJobFeedItem,
} from "./feed";
import type { CandidateJobFeedQuery } from "./feed-types";

export async function getCandidateJobFeed(query: CandidateJobFeedQuery = {}) {
  return readCandidateJobFeed(query);
}

export async function getOwnCandidateJobFeedItem(matchId: string) {
  return readOwnCandidateJobFeedItem(matchId);
}
