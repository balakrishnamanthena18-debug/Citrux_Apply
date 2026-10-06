/**
 * Phase 5B.1 — server-authoritative Candidate Job Feed read path.
 *
 * Reads persisted CandidateJobMatch + authorized Job.
 * Does NOT evaluate, create matches, create opportunities, or call LLM.
 *
 * Browser-callable entrypoints live in feed-actions.ts ("use server").
 */

import {
  getAuthenticatedContext,
  requireCandidate,
} from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { AuthorizationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { sanitizePaginationLimit } from "@/lib/utils/sanitization";
import { MATCH_CATEGORY_LABELS } from "./constants";
import {
  CANDIDATE_JOB_FEED_CATEGORIES,
  CANDIDATE_JOB_FEED_DEFAULT_PAGE_SIZE,
  CANDIDATE_JOB_FEED_MAX_PAGE_SIZE,
  isCandidateJobFeedCategory,
  type CandidateJobFeedEmptyReason,
  type CandidateJobFeedFilters,
  type CandidateJobFeedItem,
  type CandidateJobFeedPage,
  type CandidateJobFeedPreferenceLine,
  type CandidateJobFeedPresentationLine,
  type CandidateJobFeedQuery,
} from "./feed-types";
import type { Prisma } from "@/generated/prisma";

type FeedResult =
  | { success: true; data: CandidateJobFeedPage }
  | { success: false; error: string; code?: string };

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
      whyThisJobMayFit: "Based on the information available, this role needs a closer look.",
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

const FEED_SELECT = {
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
    },
  },
} as const;

function toFeedItem(row: {
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
  };
}): CandidateJobFeedItem | null {
  if (!isCandidateJobFeedCategory(row.category)) return null;
  if (row.freshness !== "CURRENT") return null;
  if (row.job.status !== "OPEN") return null;

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
  };
}

function buildPrimaryFeedWhere(
  organizationId: string,
  candidateId: string,
  filters: CandidateJobFeedFilters = {}
): Prisma.CandidateJobMatchWhereInput {
  const categories = filters.category
    ? [filters.category]
    : [...CANDIDATE_JOB_FEED_CATEGORIES];

  const jobFilter: Prisma.JobWhereInput = {
    status: "OPEN",
    organizationId,
    OR: [
      { visibility: "GLOBAL" },
      {
        visibility: "CANDIDATE_PRIVATE",
        ownerCandidateId: candidateId,
      },
    ],
  };

  if (typeof filters.remote === "boolean") {
    jobFilter.isRemote = filters.remote;
  }
  if (filters.employmentType) {
    jobFilter.employmentType = filters.employmentType as never;
  }

  const where: Prisma.CandidateJobMatchWhereInput = {
    organizationId,
    candidateId,
    status: "SUCCEEDED",
    freshness: "CURRENT",
    dismissedAt: null,
    category: { in: [...categories] },
    job: { is: jobFilter },
  };

  if (filters.saved === true) {
    where.savedAt = { not: null };
  } else if (filters.saved === false) {
    where.savedAt = null;
  }

  if (filters.applicationRequested === true) {
    where.applicationRequestedAt = { not: null };
  } else if (filters.applicationRequested === false) {
    where.applicationRequestedAt = null;
  }

  return where;
}

async function resolveEmptyReason(
  tx: Prisma.TransactionClient,
  organizationId: string,
  candidateId: string
): Promise<CandidateJobFeedEmptyReason> {
  const preparing = await tx.candidateJobMatch.count({
    where: {
      organizationId,
      candidateId,
      status: { in: ["QUEUED", "RUNNING"] },
      freshness: "CURRENT",
    },
    take: 1,
  });
  if (preparing > 0) return "PREPARING";

  const dismissedOnly = await tx.candidateJobMatch.count({
    where: {
      organizationId,
      candidateId,
      status: "SUCCEEDED",
      freshness: "CURRENT",
      dismissedAt: { not: null },
      category: { in: [...CANDIDATE_JOB_FEED_CATEGORIES] },
      job: {
        is: {
          status: "OPEN",
          organizationId,
          OR: [
            { visibility: "GLOBAL" },
            {
              visibility: "CANDIDATE_PRIVATE",
              ownerCandidateId: candidateId,
            },
          ],
        },
      },
    },
    take: 1,
  });
  if (dismissedOnly > 0) return "ALL_DISMISSED";

  return "NO_RECOMMENDATIONS";
}

/**
 * Primary candidate job feed — persisted matches only.
 * Identity from authenticated context; client candidateId/org ignored.
 */
export async function getCandidateJobFeed(
  query: CandidateJobFeedQuery = {}
): Promise<FeedResult> {
  try {
    const ctx = await getAuthenticatedContext();
    requireCandidate(ctx);

    const pageSize = sanitizePaginationLimit(
      query.pageSize,
      CANDIDATE_JOB_FEED_DEFAULT_PAGE_SIZE,
      CANDIDATE_JOB_FEED_MAX_PAGE_SIZE
    );
    const offset = decodeCursor(query.cursor);
    const filters = query.filters ?? {};

    if (filters.category && !isCandidateJobFeedCategory(filters.category)) {
      return {
        success: false,
        error: "Invalid filter.",
        code: "VALIDATION",
      };
    }

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

      const where = buildPrimaryFeedWhere(
        candidate.organizationId,
        candidate.id,
        filters
      );

      // Deterministic: PG enum order STRONG→GOOD→POSSIBLE→NEEDS_REVIEW, then newest.
      const rows = await tx.candidateJobMatch.findMany({
        where,
        select: FEED_SELECT,
        orderBy: [
          { category: "asc" },
          { evaluatedAt: "desc" },
          { id: "desc" },
        ],
        skip: offset,
        take: pageSize + 1,
      });

      const hasMore = rows.length > pageSize;
      const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
      const items: CandidateJobFeedItem[] = [];
      for (const row of pageRows) {
        const item = toFeedItem(row);
        if (item) items.push(item);
      }

      if (items.length === 0 && offset === 0) {
        const emptyReason = await resolveEmptyReason(
          tx,
          candidate.organizationId,
          candidate.id
        );
        return {
          state: "EMPTY" as const,
          items: [],
          pageSize,
          nextCursor: null,
          emptyReason,
        };
      }

      return {
        state: "LOADED" as const,
        items,
        pageSize,
        nextCursor: hasMore ? encodeCursor(offset + pageSize) : null,
      };
    });

    return { success: true, data: page };
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return { success: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    }
    logger.error("Candidate job feed read failed", {
      event: "CANDIDATE_JOB_FEED_READ",
      success: false,
    });
    return {
      success: false,
      error: "Unable to load recommendations.",
      code: "FAILED",
    };
  }
}

/**
 * Direct match-ID read for the authenticated candidate's own feed-eligible row.
 * Used for IDOR-safe detail fetch; never returns another candidate's match.
 */
export async function getOwnCandidateJobFeedItem(
  matchId: string
): Promise<
  | { success: true; data: CandidateJobFeedItem }
  | { success: false; error: string; code?: string }
> {
  try {
    const ctx = await getAuthenticatedContext();
    requireCandidate(ctx);

    if (!matchId || typeof matchId !== "string") {
      return { success: false, error: "Invalid match.", code: "VALIDATION" };
    }

    const item = await withRlsContext(ctx.userId, async (tx) => {
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
          status: "SUCCEEDED",
          freshness: "CURRENT",
          dismissedAt: null,
          category: { in: [...CANDIDATE_JOB_FEED_CATEGORIES] },
          job: {
            is: {
              status: "OPEN",
              organizationId: candidate.organizationId,
              OR: [
                { visibility: "GLOBAL" },
                {
                  visibility: "CANDIDATE_PRIVATE",
                  ownerCandidateId: candidate.id,
                },
              ],
            },
          },
        },
        select: FEED_SELECT,
      });

      if (!row) return null;
      return toFeedItem(row);
    });

    if (!item) {
      return { success: false, error: "Not found", code: "NOT_FOUND" };
    }

    return { success: true, data: item };
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return { success: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    }
    return {
      success: false,
      error: "Unable to load recommendation.",
      code: "FAILED",
    };
  }
}

/** Pure helpers exported for unit tests (no DB). */
export const __feedTestUtils = {
  decodeCursor,
  encodeCursor,
  parsePersistedPresentation,
  toFeedItem,
  buildPrimaryFeedWhere,
  FEED_SELECT,
};
