/**
 * Phase 5K — current-state aging from ApplicationStateHistory.
 * updatedAt is never authoritative for state entry.
 */

import type { ApplicationStatus } from "@/generated/prisma";
import type { CurrentStateAgeKind } from "./operations-types";

export interface StateHistoryRow {
  applicationId: string;
  toStatus: ApplicationStatus;
  createdAt: Date;
}

export interface CurrentStateAgeResult {
  kind: CurrentStateAgeKind;
  /** ISO timestamp when usable; null when AGE_UNAVAILABLE. */
  currentStateEnteredAt: string | null;
  /** Deterministic label: "12 min" | "2 hr" | "1 day" | "3 days" | "AGE_UNAVAILABLE". */
  label: string;
  /** Milliseconds in current state when known; null otherwise. Used for ordering. */
  ageMs: number | null;
}

/**
 * Pick the latest state-history row whose toStatus matches the Application's current status.
 * If none, AGE_UNAVAILABLE (do not fabricate from updatedAt/createdAt).
 */
export function resolveCurrentStateEnteredAt(
  currentStatus: ApplicationStatus,
  historyNewestFirst: StateHistoryRow[]
): Date | null {
  for (const row of historyNewestFirst) {
    if (row.toStatus === currentStatus) {
      return row.createdAt;
    }
  }
  return null;
}

/**
 * Format age without locale/timezone variance. `now` must be injected (server request clock).
 */
export function formatCurrentStateAge(
  enteredAt: Date | null,
  now: Date
): CurrentStateAgeResult {
  if (!enteredAt || Number.isNaN(enteredAt.getTime())) {
    return {
      kind: "AGE_UNAVAILABLE",
      currentStateEnteredAt: null,
      label: "AGE_UNAVAILABLE",
      ageMs: null,
    };
  }

  const ageMs = Math.max(0, now.getTime() - enteredAt.getTime());
  const mins = Math.floor(ageMs / 60_000);

  let label: string;
  if (mins < 60) {
    label = `${Math.max(1, mins)} min`;
    if (mins < 1) label = "0 min";
  } else {
    const hours = Math.floor(mins / 60);
    if (hours < 24) {
      label = `${hours} hr`;
    } else {
      const days = Math.floor(hours / 24);
      label = days === 1 ? "1 day" : `${days} days`;
    }
  }

  return {
    kind: "AGE",
    currentStateEnteredAt: enteredAt.toISOString(),
    label,
    ageMs,
  };
}

/**
 * Batch-resolve ages for a page of applications (single history query; no N+1).
 */
export function attachAgesFromHistoryBatch(
  apps: Array<{ id: string; status: ApplicationStatus }>,
  historyRows: StateHistoryRow[],
  now: Date
): Map<string, CurrentStateAgeResult> {
  const byApp = new Map<string, StateHistoryRow[]>();
  for (const row of historyRows) {
    const list = byApp.get(row.applicationId);
    if (list) list.push(row);
    else byApp.set(row.applicationId, [row]);
  }

  // Ensure newest-first per application
  for (const [, list] of byApp) {
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  const out = new Map<string, CurrentStateAgeResult>();
  for (const app of apps) {
    const entered = resolveCurrentStateEnteredAt(
      app.status,
      byApp.get(app.id) ?? []
    );
    out.set(app.id, formatCurrentStateAge(entered, now));
  }
  return out;
}
