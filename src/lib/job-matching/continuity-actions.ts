/**
 * Phase 5C.4 — server actions for candidate decision continuity reads.
 */

"use server";

import {
  getCandidateDecisionHistory as readCandidateDecisionHistory,
  getOwnCandidateDecisionContinuity as readOwnCandidateDecisionContinuity,
} from "./continuity";
import type { CandidateDecisionHistoryQuery } from "./continuity-types";

export async function getCandidateDecisionHistory(
  query: CandidateDecisionHistoryQuery
) {
  return readCandidateDecisionHistory(query);
}

export async function getOwnCandidateDecisionContinuity(matchId: string) {
  return readOwnCandidateDecisionContinuity(matchId);
}
