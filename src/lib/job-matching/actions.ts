/**
 * Phase 5A.7 — server-authoritative candidate match actions.
 *
 * Save / Not Interested → CandidateJobMatch action fields only.
 * Request Application → CandidateJobOpportunity (never Application).
 *
 * "use server" boundary — no candidate UI in this phase.
 */

"use server";

import { z } from "zod";
import { AuditAction } from "@/generated/prisma";
import {
  getAuthenticatedContext,
  requireCandidate,
} from "@/lib/auth/context";
import { logUserAuditEvent } from "@/lib/audit";
import { withRlsContext } from "@/lib/db/rls";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { assertJobUsableForCandidate } from "@/lib/job/visibility";
import type { Prisma } from "@/generated/prisma";

export type MatchActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export type CandidateSafeMatchActionState = {
  matchId: string;
  jobId: string;
  category: string | null;
  matchingContractVersion: string;
  status: string;
  freshness: string;
  savedAt: string | null;
  dismissedAt: string | null;
  dismissReason: string | null;
  applicationRequestedAt: string | null;
  opportunityId: string | null;
};

export type RequestApplicationResult = CandidateSafeMatchActionState & {
  opportunity: {
    id: string;
    status: string;
    jobId: string;
    created: boolean;
  };
};

const MatchIdSchema = z.object({
  matchId: z.string().uuid(),
});

const DismissSchema = z.object({
  matchId: z.string().uuid(),
  reason: z.string().trim().max(64).optional(),
});

function toSafeState(match: {
  id: string;
  jobId: string;
  category: string | null;
  matchingContractVersion: string;
  status: string;
  freshness: string;
  savedAt: Date | null;
  dismissedAt: Date | null;
  dismissReason: string | null;
  applicationRequestedAt: Date | null;
  opportunityId: string | null;
}): CandidateSafeMatchActionState {
  return {
    matchId: match.id,
    jobId: match.jobId,
    category: match.category,
    matchingContractVersion: match.matchingContractVersion,
    status: match.status,
    freshness: match.freshness,
    savedAt: match.savedAt?.toISOString() ?? null,
    dismissedAt: match.dismissedAt?.toISOString() ?? null,
    dismissReason: match.dismissReason,
    applicationRequestedAt: match.applicationRequestedAt?.toISOString() ?? null,
    opportunityId: match.opportunityId,
  };
}

function actionError(err: unknown): MatchActionResult<never> {
  if (err instanceof ValidationError) {
    return { success: false, error: err.message, code: "VALIDATION" };
  }
  if (err instanceof AuthorizationError) {
    return { success: false, error: "Unauthorized", code: "UNAUTHORIZED" };
  }
  if (err instanceof NotFoundError) {
    return { success: false, error: "Not found", code: "NOT_FOUND" };
  }
  return {
    success: false,
    error: "Unable to complete this action.",
    code: "FAILED",
  };
}

const MATCH_SAFE_SELECT = {
  id: true,
  organizationId: true,
  candidateId: true,
  jobId: true,
  status: true,
  freshness: true,
  category: true,
  matchingContractVersion: true,
  savedAt: true,
  dismissedAt: true,
  dismissReason: true,
  applicationRequestedAt: true,
  opportunityId: true,
  job: {
    select: {
      id: true,
      organizationId: true,
      status: true,
      visibility: true,
      ownerCandidateId: true,
    },
  },
} as const;

/**
 * Load own match + revalidate job usability. Ignores any client identity fields.
 */
async function loadOwnMatchForAction(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    organizationId: string;
    matchId: string;
    requireCurrentEvaluation: boolean;
    requireOpenJob: boolean;
  }
) {
  const candidate = await tx.candidate.findFirst({
    where: {
      userId: input.userId,
      organizationId: input.organizationId,
    },
    select: { id: true, organizationId: true, status: true },
  });
  if (!candidate) {
    throw new AuthorizationError("Candidate profile not found");
  }

  const match = await tx.candidateJobMatch.findFirst({
    where: {
      id: input.matchId,
      organizationId: input.organizationId,
      candidateId: candidate.id,
    },
    select: MATCH_SAFE_SELECT,
  });
  if (!match) {
    throw new NotFoundError("Match not found");
  }

  // Defense in depth — never trust row alone without job revalidation.
  assertJobUsableForCandidate(
    match.job,
    candidate.organizationId,
    candidate.id
  );

  if (input.requireOpenJob && match.job.status !== "OPEN") {
    throw new ValidationError("This job is no longer available.");
  }

  if (input.requireCurrentEvaluation) {
    if (match.freshness === "STALE" || match.freshness === "RECOMPUTE_REQUIRED") {
      throw new ValidationError(
        "Please wait while this recommendation is updated."
      );
    }
    if (match.freshness !== "CURRENT") {
      throw new ValidationError(
        "Please wait while this recommendation is updated."
      );
    }
    if (match.status !== "SUCCEEDED") {
      throw new ValidationError(
        "This recommendation is not ready yet."
      );
    }
  }

  return { candidate, match };
}

/**
 * Ensure ONE CandidateJobOpportunity per (candidateId, jobId).
 * Reuses existing ensure semantics from application layer (unique key).
 * Never creates Application.
 */
export async function ensureCandidateJobOpportunityForMatch(
  tx: Prisma.TransactionClient,
  args: {
    organizationId: string;
    candidateId: string;
    jobId: string;
    discoveredById: string;
  }
): Promise<{ opportunity: { id: string; status: string; jobId: string }; created: boolean }> {
  const existing = await tx.candidateJobOpportunity.findUnique({
    where: {
      candidateId_jobId: {
        candidateId: args.candidateId,
        jobId: args.jobId,
      },
    },
    select: { id: true, status: true, jobId: true, organizationId: true },
  });
  if (existing) {
    if (existing.organizationId !== args.organizationId) {
      throw new AuthorizationError("Unauthorized");
    }
    return {
      opportunity: {
        id: existing.id,
        status: existing.status,
        jobId: existing.jobId,
      },
      created: false,
    };
  }

  try {
    const created = await tx.candidateJobOpportunity.create({
      data: {
        organizationId: args.organizationId,
        candidateId: args.candidateId,
        jobId: args.jobId,
        discoveredById: args.discoveredById,
        status: "ACTIVE",
      },
      select: { id: true, status: true, jobId: true },
    });
    return {
      opportunity: {
        id: created.id,
        status: created.status,
        jobId: created.jobId,
      },
      created: true,
    };
  } catch (err: unknown) {
    // Concurrent create: unique(candidateId, jobId) — reuse winner.
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : "";
    if (code !== "P2002") throw err;

    const raced = await tx.candidateJobOpportunity.findUnique({
      where: {
        candidateId_jobId: {
          candidateId: args.candidateId,
          jobId: args.jobId,
        },
      },
      select: { id: true, status: true, jobId: true, organizationId: true },
    });
    if (!raced || raced.organizationId !== args.organizationId) {
      throw new AuthorizationError("Unauthorized");
    }
    return {
      opportunity: {
        id: raced.id,
        status: raced.status,
        jobId: raced.jobId,
      },
      created: false,
    };
  }
}

/**
 * SAVE — sets savedAt on own CURRENT match. Clears dismiss when re-saving.
 * Idempotent. Does not mutate evaluation fields.
 */
export async function saveCandidateJobMatchAction(
  input: { matchId: string }
): Promise<MatchActionResult<CandidateSafeMatchActionState>> {
  const parsed = MatchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid match.", code: "VALIDATION" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireCandidate(ctx);

    const result = await withRlsContext(ctx.userId, async (tx) => {
      const { candidate, match } = await loadOwnMatchForAction(tx, {
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        matchId: parsed.data.matchId,
        requireCurrentEvaluation: true,
        requireOpenJob: true,
      });

      if (match.savedAt && !match.dismissedAt) {
        return { state: toSafeState(match), idempotent: true as const };
      }

      const now = new Date();
      const updated = await tx.candidateJobMatch.update({
        where: { id: match.id },
        data: {
          savedAt: match.savedAt ?? now,
          dismissedAt: null,
          dismissReason: null,
        },
        select: MATCH_SAFE_SELECT,
      });

      await logUserAuditEvent({
        tx,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.JOB_MATCH_SAVED,
        entityType: "CandidateJobMatch",
        entityId: match.id,
        details: {
          organizationId: ctx.organizationId,
          candidateId: candidate.id,
          jobId: match.jobId,
          matchId: match.id,
          category: match.category,
          matchingContractVersion: match.matchingContractVersion,
        },
      });

      return { state: toSafeState(updated), idempotent: false as const };
    });

    return { success: true, data: result.state };
  } catch (err) {
    return actionError(err);
  }
}

/**
 * NOT INTERESTED — sets dismissedAt / dismissReason.
 * Idempotent. Preserves savedAt history. Does not delete Job/Match/Opportunity/Application.
 */
export async function dismissCandidateJobMatchAction(
  input: { matchId: string; reason?: string }
): Promise<MatchActionResult<CandidateSafeMatchActionState>> {
  const parsed = DismissSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid request.", code: "VALIDATION" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireCandidate(ctx);

    const result = await withRlsContext(ctx.userId, async (tx) => {
      const { candidate, match } = await loadOwnMatchForAction(tx, {
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        matchId: parsed.data.matchId,
        // Dismiss is allowed on stale rows (hide outdated recommendation).
        requireCurrentEvaluation: false,
        requireOpenJob: false,
      });

      // Still re-check visibility (already done); job may be closed and still dismissable.

      const reason = parsed.data.reason?.slice(0, 64) ?? null;

      if (match.dismissedAt) {
        // Idempotent: optionally refresh reason if provided and previously null.
        if (reason && !match.dismissReason) {
          const updated = await tx.candidateJobMatch.update({
            where: { id: match.id },
            data: { dismissReason: reason },
            select: MATCH_SAFE_SELECT,
          });
          return { state: toSafeState(updated), idempotent: true as const };
        }
        return { state: toSafeState(match), idempotent: true as const };
      }

      const now = new Date();
      const updated = await tx.candidateJobMatch.update({
        where: { id: match.id },
        data: {
          dismissedAt: now,
          dismissReason: reason,
        },
        select: MATCH_SAFE_SELECT,
      });

      await logUserAuditEvent({
        tx,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.JOB_MATCH_DISMISSED,
        entityType: "CandidateJobMatch",
        entityId: match.id,
        details: {
          organizationId: ctx.organizationId,
          candidateId: candidate.id,
          jobId: match.jobId,
          matchId: match.id,
          category: match.category,
          matchingContractVersion: match.matchingContractVersion,
          dismissReason: reason,
        },
      });

      return { state: toSafeState(updated), idempotent: false as const };
    });

    return { success: true, data: result.state };
  } catch (err) {
    return actionError(err);
  }
}

/**
 * REQUEST APPLICATION — creates/reuses CandidateJobOpportunity only.
 * NEVER creates Application. Requires CURRENT SUCCEEDED evaluation + OPEN usable job.
 */
export async function requestCandidateJobApplicationAction(
  input: { matchId: string }
): Promise<MatchActionResult<RequestApplicationResult>> {
  const parsed = MatchIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid match.", code: "VALIDATION" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireCandidate(ctx);

    const result = await withRlsContext(ctx.userId, async (tx) => {
      const { candidate, match } = await loadOwnMatchForAction(tx, {
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        matchId: parsed.data.matchId,
        requireCurrentEvaluation: true,
        requireOpenJob: true,
      });

      if (match.opportunityId && match.applicationRequestedAt) {
        const existingOpp = await tx.candidateJobOpportunity.findFirst({
          where: {
            id: match.opportunityId,
            organizationId: ctx.organizationId,
            candidateId: candidate.id,
            jobId: match.jobId,
          },
          select: { id: true, status: true, jobId: true },
        });
        if (existingOpp) {
          return {
            state: toSafeState(match),
            opportunity: existingOpp,
            created: false,
            idempotent: true as const,
          };
        }
      }

      const { opportunity, created } = await ensureCandidateJobOpportunityForMatch(
        tx,
        {
          organizationId: ctx.organizationId,
          candidateId: candidate.id,
          jobId: match.jobId,
          discoveredById: ctx.userId,
        }
      );

      const now = new Date();

      // CAS: only the first writer sets applicationRequestedAt + emits audit.
      const claimed = await tx.candidateJobMatch.updateMany({
        where: {
          id: match.id,
          candidateId: candidate.id,
          organizationId: ctx.organizationId,
          applicationRequestedAt: null,
        },
        data: {
          opportunityId: opportunity.id,
          applicationRequestedAt: now,
          dismissedAt: null,
          dismissReason: null,
        },
      });

      if (claimed.count === 1) {
        await logUserAuditEvent({
          tx,
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          action: AuditAction.JOB_APPLICATION_REQUESTED,
          entityType: "CandidateJobMatch",
          entityId: match.id,
          details: {
            organizationId: ctx.organizationId,
            candidateId: candidate.id,
            jobId: match.jobId,
            matchId: match.id,
            opportunityId: opportunity.id,
            category: match.category,
            matchingContractVersion: match.matchingContractVersion,
            opportunityCreated: created,
          },
        });
      } else if (match.opportunityId !== opportunity.id) {
        // Ensure link even if applicationRequestedAt was already set.
        await tx.candidateJobMatch.updateMany({
          where: {
            id: match.id,
            candidateId: candidate.id,
            organizationId: ctx.organizationId,
            opportunityId: null,
          },
          data: { opportunityId: opportunity.id },
        });
      }

      const updated = await tx.candidateJobMatch.findFirst({
        where: {
          id: match.id,
          organizationId: ctx.organizationId,
          candidateId: candidate.id,
        },
        select: MATCH_SAFE_SELECT,
      });
      if (!updated) throw new NotFoundError("Match not found");

      return {
        state: toSafeState(updated),
        opportunity,
        created,
        idempotent: claimed.count === 0,
      };
    });

    return {
      success: true,
      data: {
        ...result.state,
        opportunity: {
          id: result.opportunity.id,
          status: result.opportunity.status,
          jobId: result.opportunity.jobId,
          created: result.created,
        },
      },
    };
  } catch (err) {
    return actionError(err);
  }
}
