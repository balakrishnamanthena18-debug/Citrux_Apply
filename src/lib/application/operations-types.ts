/**
 * Phase 5K — Application Operations Visibility read-model types.
 * Authorization scope is never taken from client-supplied org/team/manager IDs.
 */

import type { ApplicationStatus } from "@/generated/prisma";

/** Operational queues. NEEDS_ATTENTION semantics are frozen (Phase 5J). */
export type OperationalApplicationQueue =
  | "all"
  | "mine"
  | "unassigned"
  | "team"
  | "manager"
  | "orphaned"
  | "continuity"
  | "needs_attention"
  | "ready"
  | "submitted"
  | "failed"
  | "in_progress";

export const NEEDS_ATTENTION_STATUSES = [
  "AWAITING_APPROVAL",
  "SUBMISSION_ISSUE",
  "REVIEW_REQUIRED",
  "CORRECTION_APPROVED",
  "RESUBMISSION",
  "FAILED",
] as const satisfies readonly ApplicationStatus[];

export const IN_PROGRESS_STATUSES = [
  "DISCOVERED",
  "QUALIFIED",
  "PREPARING",
  "REVIEW",
] as const satisfies readonly ApplicationStatus[];

export const OPERATIONAL_APPLICATION_QUEUES: readonly OperationalApplicationQueue[] = [
  "all",
  "mine",
  "unassigned",
  "team",
  "manager",
  "orphaned",
  "continuity",
  "needs_attention",
  "ready",
  "submitted",
  "failed",
  "in_progress",
] as const;

export const OPS_DEFAULT_PAGE_SIZE = 25;
export const OPS_MAX_PAGE_SIZE = 100;

export type CurrentStateAgeKind = "AGE" | "AGE_UNAVAILABLE";

export interface OperationalApplicationItem {
  id: string;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
  assignedEmployeeId: string | null;
  /** Active owner display name, or former owner name when inactive. */
  ownerDisplayName: string;
  /** Phase 5O — assignee has no ACTIVE staff Membership in org. */
  ownerInactive: boolean;
  /**
   * Phase 5R — ACTIVE owner whose assignment-time snapshot is outside the
   * viewer's current structural scope (continuity item). Never true for orphans
   * or SNAPSHOT_UNKNOWN legacy rows.
   */
  continuityOutsideScope: boolean;
  candidateId: string;
  candidate: {
    id: string;
    applicationAuthorizationMode: string;
    user: {
      firstName: string | null;
      lastName: string | null;
      email: string;
    };
  };
  jobId: string;
  job: {
    id: string;
    title: string;
    companyName: string;
    location: string | null;
    isRemote: boolean;
    source: string | null;
    externalUrl: string | null;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string | null;
  };
  submissions: Array<{
    id: string;
    attemptNumber: number;
    submittedAt: string;
  }>;
  /** ISO timestamp when current status was entered; null when AGE_UNAVAILABLE. */
  currentStateEnteredAt: string | null;
  currentStateAgeKind: CurrentStateAgeKind;
  /** Deterministic server-formatted age label (e.g. "12 min") or "AGE_UNAVAILABLE". */
  currentStateAgeLabel: string;
  nextAction: string;
}

export interface OperationalQueueCounts {
  total: number;
  mine: number;
  unassigned: number;
  team: number;
  manager: number;
  orphaned: number;
  continuity: number;
  ready: number;
  inProgress: number;
  submitted: number;
  needsAttention: number;
  failed: number;
}

export interface OperationalScopeAvailability {
  team: boolean;
  manager: boolean;
  /** Actor may open the Inactive Owner / orphaned queue. */
  orphaned: boolean;
  /** Actor may open the Out of Scope / continuity queue (Phase 5R). */
  continuity: boolean;
  /** Non-empty authorized team keys derived from Membership (for display only). */
  teamKeys: string[];
  directReportCount: number;
}

export interface OperationalApplicationsQuery {
  queue?: OperationalApplicationQueue | string | null;
  search?: string | null;
  status?: string | null;
  candidateId?: string | null;
  source?: string | null;
  /** 1-based page index. */
  page?: number | string | null;
  pageSize?: number | string | null;
  /**
   * Sort mode. Default prefers current-state age (oldest first), then createdAt, id.
   * "newest" / "oldest" preserve prior console createdAt semantics.
   */
  sort?: "age" | "newest" | "oldest" | "updated" | string | null;
}

export interface OperationalApplicationsPage {
  items: OperationalApplicationItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  queue: OperationalApplicationQueue;
  counts: OperationalQueueCounts;
  scopes: OperationalScopeAvailability;
  /** Server clock used for age labels (ISO). */
  asOf: string;
}
