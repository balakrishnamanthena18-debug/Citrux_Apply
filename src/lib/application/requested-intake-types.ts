/**
 * Phase 5G — Requested Application Intake Queue (staff-safe DTOs).
 * Read model over CandidateJobMatch + Opportunity + Application absence.
 */

export const REQUESTED_INTAKE_DEFAULT_PAGE_SIZE = 20;
export const REQUESTED_INTAKE_MAX_PAGE_SIZE = 50;

/** Active Application = any non-terminal status (matches desk create conflict rule). */
export const ACTIVE_APPLICATION_STATUSES_EXCLUDED_FROM_INTAKE = [
  "REJECTED",
  "WITHDRAWN",
  "FAILED",
] as const;

export type RequestedApplicationIntakeItem = {
  /** Match id — stable list key; not used for authorization. */
  matchId: string;
  opportunityId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  jobId: string;
  jobTitle: string;
  companyName: string;
  location: string | null;
  isRemote: boolean;
  employmentType: string;
  /** ISO timestamp — applicationRequestedAt */
  requestedAt: string;
  /** Staff-safe match category label, or null if unevaluated. */
  matchCategory: string | null;
  requestState: "REQUESTED";
  /** True when Job is OPEN and Start is allowed by existing desk rules. */
  canStart: boolean;
  /** Human reason when canStart is false (e.g. job closed). */
  blockedReason: string | null;
};

export type RequestedApplicationIntakePage = {
  items: RequestedApplicationIntakeItem[];
  pageSize: number;
  nextCursor: string | null;
  totalPending: number;
};

export type RequestedApplicationIntakeQuery = {
  cursor?: string | null;
  pageSize?: number;
};
