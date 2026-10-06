/**
 * Phase 5C.4 — Candidate decision continuity read path.
 *
 * Joins Match → Job → Opportunity → Application within the authenticated
 * candidate's scope. Does NOT create Applications, mutate state, evaluate
 * matching, call workers, or load ApplicationStateHistory / Task / notes.
 */

import {
  getAuthenticatedContext,
  requireCandidate,
} from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { AuthorizationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { sanitizePaginationLimit } from "@/lib/utils/sanitization";
import { getCandidateStatusPresentation } from "@/lib/utils/status-presenter";
import type { ApplicationStatus, Prisma } from "@/generated/prisma";
import { MATCH_CATEGORY_LABELS } from "./constants";
import {
  CANDIDATE_JOB_FEED_CATEGORIES,
  CANDIDATE_JOB_FEED_DEFAULT_PAGE_SIZE,
  CANDIDATE_JOB_FEED_MAX_PAGE_SIZE,
  isCandidateJobFeedCategory,
  type CandidateJobFeedPreferenceLine,
  type CandidateJobFeedPresentationLine,
} from "./feed-types";
import type {
  CandidateDecisionContinuity,
  CandidateDecisionHistoryItem,
  CandidateDecisionHistoryPage,
  CandidateDecisionHistoryQuery,
  CandidateDecisionHistoryResult,
  ContinuityDerivationInput,
} from "./continuity-types";

const EARLY_APPLICATION_STATUSES = new Set<string>([
  "DISCOVERED",
  "QUALIFIED",
  "PREPARING",
  "REVIEW",
]);

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as { o?: unknown };
    const offset = typeof parsed.o === "number" ? parsed.o : Number(parsed.o);
    if (!Number.isFinite(offset) || offset < 0) return 0;
    return Math.floor(offset);
  } catch {
    return 0;
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
}

function asPresentationLines(value: unknown): CandidateJobFeedPresentationLine[] {
  if (!Array.isArray(value)) return [];
  const out: CandidateJobFeedPresentationLine[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.title !== "string" || typeof row.message !== "string") continue;
    out.push({ title: row.title, message: row.message });
  }
  return out;
}

function asPreferenceLines(value: unknown): CandidateJobFeedPreferenceLine[] {
  if (!Array.isArray(value)) return [];
  const out: CandidateJobFeedPreferenceLine[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.title !== "string" || typeof row.message !== "string") continue;
    const tone =
      row.tone === "ok" || row.tone === "warn" || row.tone === "info"
        ? row.tone
        : "info";
    out.push({ title: row.title, message: row.message, tone });
  }
  return out;
}

function parsePersistedPresentation(raw: unknown): {
  whyThisJobMayFit: string;
  strengths: CandidateJobFeedPresentationLine[];
  thingsToCheck: CandidateJobFeedPresentationLine[];
  preferences: CandidateJobFeedPreferenceLine[];
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      whyThisJobMayFit:
        "Based on the information available, this role needs a closer look.",
      strengths: [],
      thingsToCheck: [],
      preferences: [],
    };
  }
  const p = raw as Record<string, unknown>;
  const why =
    typeof p.why === "string" && p.why.trim()
      ? p.why
      : "Based on the information available, this role needs a closer look.";
  return {
    whyThisJobMayFit: why,
    strengths: asPresentationLines(p.strengths),
    thingsToCheck: asPresentationLines(p.thingsToCheck),
    preferences: asPreferenceLines(p.preferences),
  };
}

/**
 * Pure derivation — Opportunity alone never yields APPLICATION_STARTED.
 * Application existence is required for started/submitted/terminal labels.
 * Returns null when the candidate has no Saved / Requested / Application signal.
 */
export function deriveDecisionContinuity(
  input: ContinuityDerivationInput
): CandidateDecisionContinuity | null {
  const jobAvailable = input.jobStatus === "OPEN";
  const jobAvailabilityLabel = jobAvailable ? null : "Job no longer available";
  const savedAt = toIso(input.savedAt);
  const requestedAt = toIso(input.applicationRequestedAt);
  const requested =
    input.applicationRequestedAt != null &&
    (input.opportunityExists || input.opportunityId != null);
  const hasSignal =
    input.application != null ||
    requested ||
    input.applicationRequestedAt != null ||
    input.savedAt != null;

  if (!hasSignal) return null;

  if (input.application) {
    const status = String(input.application.status) as ApplicationStatus;
    const presentation = getCandidateStatusPresentation(status);
    const applicationHref = `/candidate/applications/${input.application.id}`;
    const applicationUpdatedAt = toIso(input.application.updatedAt);
    const base = {
      jobAvailable,
      jobAvailabilityLabel,
      applicationExists: true as const,
      applicationId: input.application.id,
      applicationHref,
      applicationStatusLabel: presentation.label,
      applicationUpdatedAt,
      savedAt,
      requestedAt,
      decisionLabel:
        requested || input.applicationRequestedAt != null
          ? "Requested"
          : input.savedAt != null
            ? "Saved"
            : "Requested",
    };

    if (status === "SUBMITTED") {
      const progressLabel = "Application submitted";
      return {
        ...base,
        decisionState: "SUBMITTED",
        progressLabel,
        lastMeaningfulCandidateVisibleEvent: progressLabel,
      };
    }

    if (presentation.isTerminal) {
      return {
        ...base,
        decisionState: "TERMINAL",
        progressLabel: presentation.label,
        lastMeaningfulCandidateVisibleEvent: presentation.label,
      };
    }

    if (EARLY_APPLICATION_STATUSES.has(status)) {
      const progressLabel = "Application started";
      return {
        ...base,
        decisionState: "APPLICATION_STARTED",
        progressLabel,
        lastMeaningfulCandidateVisibleEvent: progressLabel,
      };
    }

    return {
      ...base,
      decisionState: "APPLICATION_STATUS",
      progressLabel: presentation.label,
      lastMeaningfulCandidateVisibleEvent: presentation.label,
    };
  }

  if (requested || input.applicationRequestedAt != null) {
    // Requested without opportunity still surfaces as queued only when opportunity exists.
    // Spec: applicationRequestedAt + Opportunity ⇒ "Queued for your team".
    if (!requested) {
      // applicationRequestedAt set but opportunity missing — still show Requested safely
      // without inventing Application started.
      const progressLabel = "Queued for your team";
      return {
        decisionState: "REQUESTED",
        decisionLabel: "Requested",
        progressLabel,
        jobAvailable,
        jobAvailabilityLabel,
        applicationExists: false,
        applicationId: null,
        applicationHref: null,
        applicationStatusLabel: null,
        applicationUpdatedAt: null,
        savedAt,
        requestedAt,
        lastMeaningfulCandidateVisibleEvent:
          jobAvailabilityLabel ?? progressLabel,
      };
    }
    const progressLabel = "Queued for your team";
    return {
      decisionState: "REQUESTED",
      decisionLabel: "Requested",
      progressLabel,
      jobAvailable,
      jobAvailabilityLabel,
      applicationExists: false,
      applicationId: null,
      applicationHref: null,
      applicationStatusLabel: null,
      applicationUpdatedAt: null,
      savedAt,
      requestedAt,
      lastMeaningfulCandidateVisibleEvent:
        jobAvailabilityLabel ?? progressLabel,
    };
  }

  // Saved history without request/application.
  const progressLabel = "Saved";
  return {
    decisionState: "SAVED",
    decisionLabel: "Saved",
    progressLabel,
    jobAvailable,
    jobAvailabilityLabel,
    applicationExists: false,
    applicationId: null,
    applicationHref: null,
    applicationStatusLabel: null,
    applicationUpdatedAt: null,
    savedAt,
    requestedAt,
    lastMeaningfulCandidateVisibleEvent: jobAvailabilityLabel ?? progressLabel,
  };
}

/** Nested Application filter is injected per-candidate — never take unscoped apps. */
function buildHistorySelect(candidateId: string, organizationId: string) {
  return {
    id: true,
    category: true,
    freshness: true,
    evaluatedAt: true,
    presentation: true,
    savedAt: true,
    dismissedAt: true,
    applicationRequestedAt: true,
    opportunityId: true,
    job: {
      select: {
        id: true,
        title: true,
        companyName: true,
        location: true,
        isRemote: true,
        employmentType: true,
        salaryMin: true,
        salaryMax: true,
        salaryCurrency: true,
        status: true,
        visibility: true,
        ownerCandidateId: true,
        // Own applications only — never notes / tasks / assignees / other candidates.
        applications: {
          where: { candidateId, organizationId },
          select: {
            id: true,
            status: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" as const },
          take: 1,
        },
      },
    },
    opportunity: {
      select: {
        id: true,
        // Intentionally omit notes, discoveredById, status internals.
      },
    },
  } as const;
}

type HistoryRow = {
  id: string;
  category: string | null;
  freshness: string;
  evaluatedAt: Date | null;
  presentation: unknown;
  savedAt: Date | null;
  dismissedAt: Date | null;
  applicationRequestedAt: Date | null;
  opportunityId: string | null;
  job: {
    id: string;
    title: string;
    companyName: string;
    location: string | null;
    isRemote: boolean;
    employmentType: string;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string | null;
    status: "OPEN" | "CLOSED" | "ARCHIVED";
    visibility: "GLOBAL" | "CANDIDATE_PRIVATE";
    ownerCandidateId: string | null;
    applications: Array<{
      id: string;
      status: ApplicationStatus;
      updatedAt: Date;
    }>;
  };
  opportunity: { id: string } | null;
};

function pickOwnApplication(
  apps: HistoryRow["job"]["applications"]
): ContinuityDerivationInput["application"] {
  const own = apps[0];
  if (!own) return null;
  return { id: own.id, status: own.status, updatedAt: own.updatedAt };
}

function toHistoryItem(
  row: HistoryRow,
  candidateId: string
): CandidateDecisionHistoryItem | null {
  if (!isCandidateJobFeedCategory(row.category)) return null;
  if (row.freshness !== "CURRENT") return null;

  const jobVisible =
    row.job.visibility === "GLOBAL" ||
    (row.job.visibility === "CANDIDATE_PRIVATE" &&
      row.job.ownerCandidateId === candidateId);
  if (!jobVisible) return null;

  const application = pickOwnApplication(row.job.applications);

  const continuity = deriveDecisionContinuity({
    savedAt: row.savedAt,
    applicationRequestedAt: row.applicationRequestedAt,
    opportunityId: row.opportunityId,
    opportunityExists: row.opportunity != null,
    jobStatus: row.job.status,
    application,
  });
  if (!continuity) return null;

  const presentation = parsePersistedPresentation(row.presentation);

  return {
    matchId: row.id,
    job: {
      id: row.job.id,
      title: row.job.title,
      companyName: row.job.companyName,
      location: row.job.location,
      isRemote: row.job.isRemote,
      employmentType: row.job.employmentType,
      salaryMin: row.job.salaryMin,
      salaryMax: row.job.salaryMax,
      salaryCurrency: row.job.salaryCurrency,
      status: row.job.status,
    },
    match: {
      category: row.category,
      categoryLabel: MATCH_CATEGORY_LABELS[row.category],
      freshness: "CURRENT",
      evaluatedAt: row.evaluatedAt?.toISOString() ?? null,
      whyThisJobMayFit: presentation.whyThisJobMayFit,
      strengths: presentation.strengths,
      thingsToCheck: presentation.thingsToCheck,
      preferences: presentation.preferences,
    },
    state: {
      saved: row.savedAt != null,
      dismissed: row.dismissedAt != null,
      applicationRequested: row.applicationRequestedAt != null,
      opportunityId: row.opportunityId,
    },
    continuity,
  };
}

function buildHistoryWhere(
  organizationId: string,
  candidateId: string,
  mode: "SAVED" | "REQUESTED"
): Prisma.CandidateJobMatchWhereInput {
  // History may include OPEN / CLOSED / ARCHIVED — primary feed stays OPEN-only.
  const jobFilter: Prisma.JobWhereInput = {
    organizationId,
    OR: [
      { visibility: "GLOBAL" },
      {
        visibility: "CANDIDATE_PRIVATE",
        ownerCandidateId: candidateId,
      },
    ],
  };

  const where: Prisma.CandidateJobMatchWhereInput = {
    organizationId,
    candidateId,
    status: "SUCCEEDED",
    freshness: "CURRENT",
    dismissedAt: null,
    category: { in: [...CANDIDATE_JOB_FEED_CATEGORIES] },
    job: { is: jobFilter },
  };

  if (mode === "SAVED") {
    where.savedAt = { not: null };
  } else {
    where.applicationRequestedAt = { not: null };
  }

  return where;
}

/**
 * Saved / Requested decision history — includes closed jobs.
 * Does not alter the primary recommendation feed.
 */
export async function getCandidateDecisionHistory(
  query: CandidateDecisionHistoryQuery
): Promise<CandidateDecisionHistoryResult> {
  try {
    const ctx = await getAuthenticatedContext();
    requireCandidate(ctx);

    if (query.mode !== "SAVED" && query.mode !== "REQUESTED") {
      return { success: false, error: "Invalid filter.", code: "VALIDATION" };
    }

    const pageSize = sanitizePaginationLimit(
      query.pageSize,
      CANDIDATE_JOB_FEED_DEFAULT_PAGE_SIZE,
      CANDIDATE_JOB_FEED_MAX_PAGE_SIZE
    );
    const offset = decodeCursor(query.cursor);

    const page = await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findFirst({
        where: {
          userId: ctx.userId,
          organizationId: ctx.organizationId,
        },
        select: { id: true, organizationId: true },
      });
      if (!candidate) {
        throw new AuthorizationError("Candidate profile not found");
      }

      const where = buildHistoryWhere(
        candidate.organizationId,
        candidate.id,
        query.mode
      );

      // Deterministic: most recent decision activity first.
      const orderBy: Prisma.CandidateJobMatchOrderByWithRelationInput[] =
        query.mode === "REQUESTED"
          ? [
              { applicationRequestedAt: "desc" },
              { updatedAt: "desc" },
              { id: "desc" },
            ]
          : [
              { savedAt: "desc" },
              { updatedAt: "desc" },
              { id: "desc" },
            ];

      const rows = await tx.candidateJobMatch.findMany({
        where,
        select: buildHistorySelect(candidate.id, candidate.organizationId),
        orderBy,
        skip: offset,
        take: pageSize + 1,
      });

      const hasMore = rows.length > pageSize;
      const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
      const items: CandidateDecisionHistoryItem[] = [];
      for (const row of pageRows) {
        const item = toHistoryItem(row as HistoryRow, candidate.id);
        if (item) items.push(item);
      }

      if (items.length === 0 && offset === 0) {
        return {
          state: "EMPTY" as const,
          items: [],
          pageSize,
          nextCursor: null,
          emptyReason: "NO_HISTORY" as const,
        };
      }

      return {
        state: "LOADED" as const,
        items,
        pageSize,
        nextCursor: hasMore ? encodeCursor(offset + pageSize) : null,
      } satisfies CandidateDecisionHistoryPage;
    });

    return { success: true, data: page };
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return { success: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    }
    logger.error("Candidate decision history read failed", {
      event: "CANDIDATE_DECISION_HISTORY_READ",
      success: false,
    });
    return {
      success: false,
      error: "Unable to load decision history.",
      code: "FAILED",
    };
  }
}

/**
 * Continuity for a single owned match (detail strip).
 * Returns null when match is not owned / not visible.
 * Does not throw on closed jobs — history continuity must survive closure.
 */
export async function getOwnCandidateDecisionContinuity(
  matchId: string
): Promise<
  | { success: true; data: CandidateDecisionContinuity | null }
  | { success: false; error: string; code?: string }
> {
  try {
    const ctx = await getAuthenticatedContext();
    requireCandidate(ctx);

    if (!matchId || typeof matchId !== "string") {
      return { success: false, error: "Invalid match.", code: "VALIDATION" };
    }

    const resolved = await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findFirst({
        where: {
          userId: ctx.userId,
          organizationId: ctx.organizationId,
        },
        select: { id: true, organizationId: true },
      });
      if (!candidate) {
        throw new AuthorizationError("Candidate profile not found");
      }

      const row = await tx.candidateJobMatch.findFirst({
        where: {
          id: matchId,
          organizationId: candidate.organizationId,
          candidateId: candidate.id,
        },
        select: buildHistorySelect(candidate.id, candidate.organizationId),
      });
      if (!row) return { kind: "missing" as const };

      const jobVisible =
        row.job.visibility === "GLOBAL" ||
        (row.job.visibility === "CANDIDATE_PRIVATE" &&
          row.job.ownerCandidateId === candidate.id);
      if (!jobVisible) return { kind: "missing" as const };

      const application = pickOwnApplication(
        row.job.applications as HistoryRow["job"]["applications"]
      );

      return {
        kind: "ok" as const,
        continuity: deriveDecisionContinuity({
          savedAt: row.savedAt,
          applicationRequestedAt: row.applicationRequestedAt,
          opportunityId: row.opportunityId,
          opportunityExists: row.opportunity != null,
          jobStatus: row.job.status,
          application,
        }),
      };
    });

    if (resolved.kind === "missing") {
      return { success: false, error: "Not found", code: "NOT_FOUND" };
    }
    return { success: true, data: resolved.continuity };
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return { success: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    }
    return {
      success: false,
      error: "Unable to load decision continuity.",
      code: "FAILED",
    };
  }
}

/** Pure helpers for unit tests. */
export const __continuityTestUtils = {
  deriveDecisionContinuity,
  decodeCursor,
  encodeCursor,
  buildHistoryWhere,
  buildHistorySelect,
  toHistoryItem,
  pickOwnApplication,
  EARLY_APPLICATION_STATUSES,
};
