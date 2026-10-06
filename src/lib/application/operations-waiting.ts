/**
 * Phase 5T — Actor-attributed waiting & responsibility labels.
 *
 * Derived from Application.status (+ optional approvalRequestedAt).
 * No SLA, thresholds, stuck flags, or schema.
 * QA is staff work in this domain — REVIEW uses expectedActor EMPLOYEE + waitingKind QA_REVIEW.
 */

import type { ApplicationStatus } from "@/generated/prisma";
import {
  formatCurrentStateAge,
  type CurrentStateAgeResult,
} from "./operations-aging";
import { deriveNextActionGuidance } from "./operations-guidance";
import type { ExpectedActor, WaitingKind } from "./operations-types";

export type { ExpectedActor, WaitingKind };

export type WaitingAttribution = {
  expectedActor: ExpectedActor;
  waitingKind: WaitingKind;
  /** Staff-facing short label for Waiting For column. */
  waitingForLabel: string;
  /**
   * Authoritative wait start ISO, or null when unavailable.
   * Prefer approvalRequestedAt for AWAITING_APPROVAL; else status-history entry.
   */
  waitingSince: string | null;
  waitingAgeKind: "AGE" | "AGE_UNAVAILABLE";
  waitingAgeLabel: string;
};

const WAITING_FOR_LABEL: Record<WaitingKind, string> = {
  EMPLOYEE_ACTION: "Employee action",
  CANDIDATE_RESPONSE: "Candidate",
  EXTERNAL_OUTCOME: "External outcome",
  QA_REVIEW: "QA review",
  TERMINAL: "Terminal",
  UNKNOWN: "Unknown",
};

/**
 * Deterministic status → responsibility map from existing lifecycle semantics.
 */
export function mapStatusResponsibility(status: ApplicationStatus): {
  expectedActor: ExpectedActor;
  waitingKind: WaitingKind;
} {
  switch (status) {
    case "DISCOVERED":
    case "QUALIFIED":
    case "PREPARING":
    case "READY":
    case "SUBMISSION_ISSUE":
    case "REVIEW_REQUIRED":
    case "CORRECTION_APPROVED":
    case "RESUBMISSION":
      return { expectedActor: "EMPLOYEE", waitingKind: "EMPLOYEE_ACTION" };
    case "REVIEW":
      // Staff perform QA; no independent QA Role in Application authority.
      return { expectedActor: "EMPLOYEE", waitingKind: "QA_REVIEW" };
    case "AWAITING_APPROVAL":
      return { expectedActor: "CANDIDATE", waitingKind: "CANDIDATE_RESPONSE" };
    case "SUBMITTED":
      return { expectedActor: "EXTERNAL", waitingKind: "EXTERNAL_OUTCOME" };
    case "FAILED":
    case "REJECTED":
    case "WITHDRAWN":
      return { expectedActor: "NONE", waitingKind: "TERMINAL" };
    default:
      return { expectedActor: "UNKNOWN", waitingKind: "UNKNOWN" };
  }
}

export function waitingForLabel(kind: WaitingKind): string {
  return WAITING_FOR_LABEL[kind];
}

/**
 * Resolve waiting attribution for one Application.
 *
 * @param statusHistoryEnteredAt — from Phase 5K aging (null → AGE_UNAVAILABLE fallback)
 * @param approvalRequestedAt — used only when status is AWAITING_APPROVAL
 */
export function resolveWaitingAttribution(
  status: ApplicationStatus,
  now: Date,
  args: {
    statusHistoryEnteredAt: Date | string | null;
    approvalRequestedAt?: Date | string | null;
  }
): WaitingAttribution {
  const { expectedActor, waitingKind } = mapStatusResponsibility(status);

  let waitStart: Date | null = null;

  if (status === "AWAITING_APPROVAL" && args.approvalRequestedAt) {
    const raw = args.approvalRequestedAt;
    const d = raw instanceof Date ? raw : new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      waitStart = d;
    }
  }

  if (!waitStart && args.statusHistoryEnteredAt) {
    const raw = args.statusHistoryEnteredAt;
    const d = raw instanceof Date ? raw : new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      waitStart = d;
    }
  }

  const age: CurrentStateAgeResult = formatCurrentStateAge(waitStart, now);

  return {
    expectedActor,
    waitingKind,
    waitingForLabel: waitingForLabel(waitingKind),
    waitingSince: age.currentStateEnteredAt,
    waitingAgeKind: age.kind,
    waitingAgeLabel: age.label,
  };
}

/**
 * Consistency check helper for tests: next-action guidance must not claim
 * employee delay when waiting on candidate, etc.
 */
export function assertNextActionConsistentWithWaiting(
  status: ApplicationStatus
): { ok: boolean; nextAction: string; waitingKind: WaitingKind } {
  const { waitingKind } = mapStatusResponsibility(status);
  const nextAction = deriveNextActionGuidance(status);
  let ok = true;
  if (waitingKind === "CANDIDATE_RESPONSE") {
    ok = /candidate/i.test(nextAction);
  } else if (waitingKind === "EXTERNAL_OUTCOME") {
    ok = /monitor|external|submission recorded/i.test(nextAction);
  } else if (waitingKind === "TERMINAL") {
    ok = /terminal|withdrawn|rejected|failure/i.test(nextAction);
  }
  return { ok, nextAction, waitingKind };
}
