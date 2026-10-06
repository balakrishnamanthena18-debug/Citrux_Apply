/**
 * Phase 5C.2 — server-authoritative candidate job match detail read.
 *
 * Authority: matchId + authenticated session (never client candidateId/org).
 * Loads Job.jobDescription / externalUrl only here — not in the feed.
 * Does NOT evaluate matching, call workers, or create opportunities.
 */

import {
  getAuthenticatedContext,
  requireCandidate,
} from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { AuthorizationError } from "@/lib/errors";
import { MATCH_CATEGORY_LABELS, QUALIFICATION_DIMENSIONS } from "./constants";
import { deriveDecisionContinuity } from "./continuity";
import {
  isCandidateJobFeedCategory,
  type CandidateJobFeedPreferenceLine,
  type CandidateJobFeedPresentationLine,
} from "./feed-types";
import type {
  CandidateJobMatchDetail,
  CandidateJobMatchDetailResult,
  CandidateSafeQualificationLine,
} from "./detail-types";

const DIMENSION_LABELS: Record<string, string> = {
  SKILLS: "Skills",
  EXPERIENCE: "Experience",
  EDUCATION: "Education",
  CERTIFICATIONS: "Certifications",
  WORK_AUTHORIZATION: "Work authorization",
};

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

function parsePresentation(raw: unknown): {
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

/** Scrub persisted qualificationSummary — dimension/outcome/label only. */
export function parseSafeQualificationSummary(
  raw: unknown
): CandidateSafeQualificationLine[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(QUALIFICATION_DIMENSIONS);
  const out: CandidateSafeQualificationLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const dimension = typeof row.dimension === "string" ? row.dimension : "";
    const outcome = typeof row.outcome === "string" ? row.outcome : "";
    const label = typeof row.label === "string" ? row.label.trim() : "";
    if (!allowed.has(dimension) || !label) continue;
    if (
      outcome !== "MATCH" &&
      outcome !== "PARTIAL" &&
      outcome !== "MISMATCH" &&
      outcome !== "UNKNOWN" &&
      outcome !== "NOT_APPLICABLE"
    ) {
      continue;
    }
    out.push({
      dimension,
      dimensionLabel: DIMENSION_LABELS[dimension] ?? dimension,
      outcome,
      label,
    });
  }
  return out;
}

function sanitizeExternalUrl(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return trimmed;
  } catch {
    return null;
  }
}

function sanitizeSourceLabel(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 100);
  return trimmed || null;
}

function buildDetailSelect(candidateId: string, organizationId: string) {
  return {
    id: true,
    status: true,
    freshness: true,
    category: true,
    presentation: true,
    qualificationSummary: true,
    evaluatedAt: true,
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
        jobDescription: true,
        externalUrl: true,
        source: true,
        applications: {
          where: { candidateId, organizationId },
          select: { id: true, status: true, updatedAt: true },
          orderBy: { updatedAt: "desc" as const },
          take: 1,
        },
      },
    },
    opportunity: {
      select: { id: true },
    },
  } as const;
}

/**
 * Group scrubbed qualification lines by dimension for UI sections.
 * Pure helper — no DB.
 */
export function groupQualificationByDimension(
  lines: CandidateSafeQualificationLine[]
): Array<{ dimension: string; dimensionLabel: string; items: CandidateSafeQualificationLine[] }> {
  const order = [...QUALIFICATION_DIMENSIONS];
  const map = new Map<string, CandidateSafeQualificationLine[]>();
  for (const line of lines) {
    const list = map.get(line.dimension) ?? [];
    list.push(line);
    map.set(line.dimension, list);
  }
  const groups: Array<{
    dimension: string;
    dimensionLabel: string;
    items: CandidateSafeQualificationLine[];
  }> = [];
  for (const dim of order) {
    const items = map.get(dim);
    if (!items || items.length === 0) continue;
    groups.push({
      dimension: dim,
      dimensionLabel: DIMENSION_LABELS[dim] ?? dim,
      items,
    });
  }
  return groups;
}

/**
 * Detail read by matchId for the authenticated candidate.
 */
export async function getCandidateJobMatchDetail(
  matchId: string
): Promise<CandidateJobMatchDetailResult> {
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

      // Ownership-first read (do not require feed eligibility yet).
      const row = await tx.candidateJobMatch.findFirst({
        where: {
          id: matchId,
          organizationId: candidate.organizationId,
          candidateId: candidate.id,
        },
        select: buildDetailSelect(candidate.id, candidate.organizationId),
      });

      if (!row) {
        return { kind: "missing" as const };
      }

      // Private job isolation — defense in depth beyond RLS.
      const job = row.job;
      const jobVisible =
        job.visibility === "GLOBAL" ||
        (job.visibility === "CANDIDATE_PRIVATE" &&
          job.ownerCandidateId === candidate.id);
      if (!jobVisible) {
        return { kind: "missing" as const };
      }

      const hasDecisionHistory =
        row.savedAt != null || row.applicationRequestedAt != null;
      const jobClosed =
        job.status === "CLOSED" || job.status === "ARCHIVED";

      // Closed jobs without a Saved/Requested decision stay unavailable.
      // History continuity (5C.4) keeps closed Saved/Requested decisions readable.
      if (jobClosed && !hasDecisionHistory) {
        return { kind: "closed" as const };
      }

      if (
        row.freshness !== "CURRENT" ||
        row.status === "STALE" ||
        row.status === "QUEUED" ||
        row.status === "RUNNING" ||
        row.status === "FAILED"
      ) {
        return { kind: "stale" as const };
      }

      if (row.status !== "SUCCEEDED" || !isCandidateJobFeedCategory(row.category)) {
        return { kind: "stale" as const };
      }

      const ownApp = job.applications[0] ?? null;
      const continuity = deriveDecisionContinuity({
        savedAt: row.savedAt,
        applicationRequestedAt: row.applicationRequestedAt,
        opportunityId: row.opportunityId,
        opportunityExists: row.opportunity != null,
        jobStatus: job.status,
        application: ownApp
          ? {
              id: ownApp.id,
              status: ownApp.status,
              updatedAt: ownApp.updatedAt,
            }
          : null,
      });

      const presentation = parsePresentation(row.presentation);
      const detail: CandidateJobMatchDetail = {
        matchId: row.id,
        job: {
          id: job.id,
          title: job.title,
          companyName: job.companyName,
          location: job.location,
          isRemote: job.isRemote,
          employmentType: job.employmentType,
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          salaryCurrency: job.salaryCurrency,
          status: job.status,
          jobDescription: job.jobDescription,
          externalUrl: sanitizeExternalUrl(job.externalUrl),
          sourceLabel: sanitizeSourceLabel(job.source),
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
          qualificationSummary: parseSafeQualificationSummary(
            row.qualificationSummary
          ),
        },
        state: {
          saved: row.savedAt != null,
          dismissed: row.dismissedAt != null,
          applicationRequested: row.applicationRequestedAt != null,
          opportunityId: row.opportunityId,
        },
        continuity,
      };

      return { kind: "ok" as const, detail };
    });

    if (resolved.kind === "missing") {
      return { success: false, error: "Not found", code: "NOT_FOUND" };
    }
    if (resolved.kind === "closed") {
      return {
        success: false,
        error: "This job is no longer available.",
        code: "CLOSED",
      };
    }
    if (resolved.kind === "stale") {
      return {
        success: false,
        error: "This recommendation is no longer current.",
        code: "STALE",
      };
    }

    return { success: true, data: resolved.detail };
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return { success: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    }
    return {
      success: false,
      error: "Unable to load job details.",
      code: "FAILED",
    };
  }
}

/** Pure helpers for unit tests. */
export const __detailTestUtils = {
  parseSafeQualificationSummary,
  groupQualificationByDimension,
  sanitizeExternalUrl,
  sanitizeSourceLabel,
  parsePresentation,
  buildDetailSelect,
};
