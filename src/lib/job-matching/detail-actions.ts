/**
 * Phase 5C.2 — server actions for candidate job match detail reads.
 * Thin "use server" boundary so client never imports prisma/worker barrels.
 */

"use server";

import { getCandidateJobMatchDetail as readCandidateJobMatchDetail } from "./detail";

export async function getCandidateJobMatchDetail(matchId: string) {
  return readCandidateJobMatchDetail(matchId);
}
