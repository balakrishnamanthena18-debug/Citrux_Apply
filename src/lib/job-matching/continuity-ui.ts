/**
 * Phase 5C.4 — candidate-facing continuity presentation helpers.
 */

import type { CandidateDecisionContinuity } from "./continuity-types";
import type { CandidateDecisionHistoryItem } from "./continuity-types";
import type { CandidateJobFeedItem } from "./feed-types";

/** Map history DTO onto the existing feed card shape. */
export function historyItemAsFeedItem(
  item: CandidateDecisionHistoryItem
): CandidateJobFeedItem {
  return {
    matchId: item.matchId,
    job: item.job,
    match: item.match,
    state: item.state,
    continuity: item.continuity,
  };
}

export function continuityPrimaryBadge(
  continuity: CandidateDecisionContinuity
): { label: string; className: string } {
  switch (continuity.decisionState) {
    case "SAVED":
      return {
        label: continuity.decisionLabel.toUpperCase(),
        className: "border-[#D1FAE5] bg-[#ECFDF5] text-[#065F46]",
      };
    case "REQUESTED":
      return {
        label: continuity.decisionLabel.toUpperCase(),
        className: "border-[#DBEAFE] bg-[#EFF6FF] text-[#1D4ED8]",
      };
    case "APPLICATION_STARTED":
    case "APPLICATION_STATUS":
      return {
        label: continuity.decisionLabel.toUpperCase(),
        className: "border-[#DBEAFE] bg-[#EFF6FF] text-[#1D4ED8]",
      };
    case "SUBMITTED":
      return {
        label: continuity.decisionLabel.toUpperCase(),
        className: "border-[#BBF7D0] bg-[#ECFDF5] text-[#065F46]",
      };
    case "TERMINAL":
      return {
        label: continuity.decisionLabel.toUpperCase(),
        className: "border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]",
      };
    default:
      return {
        label: continuity.decisionLabel.toUpperCase(),
        className: "border-[#E2E8F0] bg-[#F8FAFC] text-[#334155]",
      };
  }
}
