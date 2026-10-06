import { createHash } from "crypto";
import type { Prisma } from "@/generated/prisma";
import type { CandidateJobMatchCategory } from "@/generated/prisma/client";
import { AuthorizationError, NotFoundError, ValidationError } from "@/lib/errors";
import { assertJobUsableForCandidate } from "@/lib/job/visibility";
import {
  MATCHING_CONTRACT_VERSION,
  type MatchCategory,
} from "./constants";
import type { MatchEvaluationResult } from "./types";
import { toCandidateSafeMatchPayload } from "./evaluate";

export const CANDIDATE_ACTION_FIELDS = [
  "savedAt",
  "dismissedAt",
  "dismissReason",
  "applicationRequestedAt",
] as const;

export const EVALUATION_CONTROLLED_FIELDS = [
  "status",
  "freshness",
  "category",
  "qualificationSummary",
  "preferenceSummary",
  "presentation",
  "evidenceRefs",
  "sourceDataVersion",
  "matchingContractVersion",
  "snapshotId",
  "requirementSetId",
  "evaluatedAt",
  "errorCode",
  "errorMessage",
  "idempotencyKey",
  "attemptCount",
  "maxAttempts",
  "leaseExpiresAt",
  "opportunityId",
] as const;

export const IMMUTABLE_IDENTITY_FIELDS = [
  "organizationId",
  "candidateId",
  "jobId",
] as const;

/** Evaluation-request identity — resolves to the single CURRENT match row. */
export function buildJobMatchIdempotencyKey(input: {
  organizationId: string;
  candidateId: string;
  jobId: string;
  matchingContractVersion: string;
  sourceDataVersion: string;
}): string {
  return createHash("sha256")
    .update(
      [
        input.organizationId,
        input.candidateId,
        input.jobId,
        input.matchingContractVersion,
        input.sourceDataVersion,
      ].join(":")
    )
    .digest("hex")
    .slice(0, 64);
}

function sanitizeErrorMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  const trimmed = message.trim().slice(0, 240);
  if (/resume|extractedText|requirement|password|token|secret|api[_-]?key/i.test(trimmed)) {
    return "We couldn't complete this job match.";
  }
  return trimmed;
}

function toDbCategory(category: MatchCategory): CandidateJobMatchCategory {
  return category;
}

function buildSafeSummaries(result: MatchEvaluationResult): {
  qualificationSummary: Prisma.InputJsonValue;
  preferenceSummary: Prisma.InputJsonValue;
  presentation: Prisma.InputJsonValue;
  evidenceRefs: Prisma.InputJsonValue;
} {
  const safe = toCandidateSafeMatchPayload(result);
  return {
    qualificationSummary: safe.qualificationOutcomes as Prisma.InputJsonValue,
    preferenceSummary: safe.preferenceOutcomes as Prisma.InputJsonValue,
    presentation: safe.presentation as Prisma.InputJsonValue,
    evidenceRefs: result.items
      .filter((i) => i.evidence)
      .map((i) => i.evidence) as Prisma.InputJsonValue,
  };
}

export type AuthorizedMatchActor = {
  userId: string;
  organizationId: string;
  role: "CANDIDATE" | "EMPLOYEE" | "ADMIN" | "MANAGER" | "TEAM_LEAD" | string;
  /** Set when actor is the candidate user. */
  viewerCandidateId?: string | null;
};

/**
 * Loads job + verifies org/visibility for the target candidate.
 * Browser-supplied organizationId / candidateId / ownership are never trusted —
 * callers must pass server-derived actor + targetCandidateId.
 */
export async function assertAuthorizedJobForMatch(
  tx: Prisma.TransactionClient,
  input: {
    actor: AuthorizedMatchActor;
    targetCandidateId: string;
    jobId: string;
  }
): Promise<{
  job: {
    id: string;
    organizationId: string;
    status: "OPEN" | "CLOSED" | "ARCHIVED";
    visibility: "GLOBAL" | "CANDIDATE_PRIVATE";
    ownerCandidateId: string | null;
  };
  candidate: { id: string; organizationId: string; userId: string };
}> {
  const candidate = await tx.candidate.findFirst({
    where: {
      id: input.targetCandidateId,
      organizationId: input.actor.organizationId,
    },
    select: { id: true, organizationId: true, userId: true },
  });
  if (!candidate) throw new NotFoundError("Candidate not found");

  if (input.actor.role === "CANDIDATE") {
    if (input.actor.viewerCandidateId !== candidate.id) {
      throw new AuthorizationError("Unauthorized");
    }
    if (candidate.userId !== input.actor.userId) {
      throw new AuthorizationError("Unauthorized");
    }
  } else if (
    input.actor.role !== "EMPLOYEE" &&
    input.actor.role !== "ADMIN" &&
    input.actor.role !== "MANAGER" &&
    input.actor.role !== "TEAM_LEAD"
  ) {
    throw new AuthorizationError("Unauthorized");
  }

  const job = await tx.job.findFirst({
    where: {
      id: input.jobId,
      organizationId: input.actor.organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      status: true,
      visibility: true,
      ownerCandidateId: true,
    },
  });
  if (!job) throw new NotFoundError("Job not found");

  assertJobUsableForCandidate(job, input.actor.organizationId, candidate.id);

  return { job, candidate };
}

/**
 * Upserts the SINGLE CURRENT CandidateJobMatch for (org, candidate, job).
 * Recompute updates the same row — never inserts a second feed identity.
 */
export async function upsertCurrentCandidateJobMatch(
  tx: Prisma.TransactionClient,
  input: {
    actor: AuthorizedMatchActor;
    targetCandidateId: string;
    jobId: string;
    evaluation: MatchEvaluationResult;
    snapshotId?: string | null;
    requirementSetId?: string | null;
    status?: "QUEUED" | "RUNNING" | "SUCCEEDED" | "STALE" | "FAILED";
    freshness?: "CURRENT" | "STALE" | "RECOMPUTE_REQUIRED";
  }
): Promise<{ matchId: string; created: boolean; idempotentReplay: boolean }> {
  const { job, candidate } = await assertAuthorizedJobForMatch(tx, {
    actor: input.actor,
    targetCandidateId: input.targetCandidateId,
    jobId: input.jobId,
  });

  if (job.organizationId !== candidate.organizationId) {
    throw new AuthorizationError("Cross-tenant match denied");
  }
  if (input.evaluation.jobSafe.jobId !== job.id) {
    throw new ValidationError("Evaluation job identity mismatch");
  }

  const matchingContractVersion =
    input.evaluation.matchingContractVersion || MATCHING_CONTRACT_VERSION;
  const sourceDataVersion = input.evaluation.sourceDataVersion;
  const idempotencyKey = buildJobMatchIdempotencyKey({
    organizationId: job.organizationId,
    candidateId: candidate.id,
    jobId: job.id,
    matchingContractVersion,
    sourceDataVersion,
  });

  const existing = await tx.candidateJobMatch.findUnique({
    where: {
      organizationId_candidateId_jobId: {
        organizationId: job.organizationId,
        candidateId: candidate.id,
        jobId: job.id,
      },
    },
    select: {
      id: true,
      idempotencyKey: true,
      status: true,
      sourceDataVersion: true,
    },
  });

  if (existing?.idempotencyKey === idempotencyKey && existing.status === "SUCCEEDED") {
    return {
      matchId: existing.id,
      created: false,
      idempotentReplay: true,
    };
  }

  const summaries = buildSafeSummaries(input.evaluation);
  const status = input.status ?? "SUCCEEDED";
  const freshness = input.freshness ?? "CURRENT";
  const evaluatedAt = new Date(input.evaluation.evaluatedAt);

  if (!existing) {
    const created = await tx.candidateJobMatch.create({
      data: {
        organizationId: job.organizationId,
        candidateId: candidate.id,
        jobId: job.id,
        snapshotId: input.snapshotId ?? null,
        requirementSetId: input.requirementSetId ?? null,
        matchingContractVersion,
        sourceDataVersion,
        status,
        freshness,
        category: toDbCategory(input.evaluation.category),
        qualificationSummary: summaries.qualificationSummary,
        preferenceSummary: summaries.preferenceSummary,
        presentation: summaries.presentation,
        evidenceRefs: summaries.evidenceRefs,
        errorCode: null,
        errorMessage: null,
        idempotencyKey,
        requestedById: input.actor.userId,
        evaluatedAt,
      },
      select: { id: true },
    });
    return { matchId: created.id, created: true, idempotentReplay: false };
  }

  const updated = await tx.candidateJobMatch.update({
    where: { id: existing.id },
    data: {
      snapshotId: input.snapshotId ?? null,
      requirementSetId: input.requirementSetId ?? null,
      matchingContractVersion,
      sourceDataVersion,
      status,
      freshness,
      category: toDbCategory(input.evaluation.category),
      qualificationSummary: summaries.qualificationSummary,
      preferenceSummary: summaries.preferenceSummary,
      presentation: summaries.presentation,
      evidenceRefs: summaries.evidenceRefs,
      errorCode: null,
      errorMessage: null,
      idempotencyKey,
      requestedById: input.actor.userId,
      evaluatedAt,
      leaseExpiresAt: null,
    },
    select: { id: true },
  });

  return { matchId: updated.id, created: false, idempotentReplay: false };
}

export async function markCandidateJobMatchStale(
  tx: Prisma.TransactionClient,
  input: {
    actor: AuthorizedMatchActor;
    matchId: string;
  }
): Promise<{ matchId: string }> {
  const match = await tx.candidateJobMatch.findFirst({
    where: {
      id: input.matchId,
      organizationId: input.actor.organizationId,
    },
    select: { id: true, candidateId: true },
  });
  if (!match) throw new NotFoundError("Match not found");

  if (input.actor.role === "CANDIDATE") {
    if (input.actor.viewerCandidateId !== match.candidateId) {
      throw new AuthorizationError("Unauthorized");
    }
  }

  await tx.candidateJobMatch.update({
    where: { id: match.id },
    data: {
      freshness: "STALE",
      status: "STALE",
    },
  });

  return { matchId: match.id };
}

export async function markCandidateJobMatchFailed(
  tx: Prisma.TransactionClient,
  input: {
    actor: AuthorizedMatchActor;
    targetCandidateId: string;
    jobId: string;
    errorCode: string;
    errorMessage?: string | null;
    matchingContractVersion?: string;
    sourceDataVersion?: string;
  }
): Promise<{ matchId: string; created: boolean }> {
  const { job, candidate } = await assertAuthorizedJobForMatch(tx, {
    actor: input.actor,
    targetCandidateId: input.targetCandidateId,
    jobId: input.jobId,
  });

  const matchingContractVersion =
    input.matchingContractVersion ?? MATCHING_CONTRACT_VERSION;
  const sourceDataVersion =
    input.sourceDataVersion ?? `failed:${job.id}:${Date.now()}`;
  const idempotencyKey = buildJobMatchIdempotencyKey({
    organizationId: job.organizationId,
    candidateId: candidate.id,
    jobId: job.id,
    matchingContractVersion,
    sourceDataVersion,
  });

  const existing = await tx.candidateJobMatch.findUnique({
    where: {
      organizationId_candidateId_jobId: {
        organizationId: job.organizationId,
        candidateId: candidate.id,
        jobId: job.id,
      },
    },
    select: { id: true },
  });

  const safeMessage = sanitizeErrorMessage(input.errorMessage);

  if (!existing) {
    const created = await tx.candidateJobMatch.create({
      data: {
        organizationId: job.organizationId,
        candidateId: candidate.id,
        jobId: job.id,
        matchingContractVersion,
        sourceDataVersion,
        status: "FAILED",
        freshness: "CURRENT",
        category: null,
        idempotencyKey,
        errorCode: input.errorCode.slice(0, 64),
        errorMessage: safeMessage,
        requestedById: input.actor.userId,
      },
      select: { id: true },
    });
    return { matchId: created.id, created: true };
  }

  await tx.candidateJobMatch.update({
    where: { id: existing.id },
    data: {
      matchingContractVersion,
      sourceDataVersion,
      status: "FAILED",
      freshness: "CURRENT",
      category: null,
      idempotencyKey,
      errorCode: input.errorCode.slice(0, 64),
      errorMessage: safeMessage,
      requestedById: input.actor.userId,
      leaseExpiresAt: null,
    },
  });
  return { matchId: existing.id, created: false };
}

/**
 * Candidate-safe read of own CURRENT match. Never returns requirement JSON.
 */
export async function getCandidateSafeJobMatch(
  tx: Prisma.TransactionClient,
  input: {
    actor: AuthorizedMatchActor;
    targetCandidateId: string;
    jobId: string;
  }
) {
  await assertAuthorizedJobForMatch(tx, input);

  const match = await tx.candidateJobMatch.findUnique({
    where: {
      organizationId_candidateId_jobId: {
        organizationId: input.actor.organizationId,
        candidateId: input.targetCandidateId,
        jobId: input.jobId,
      },
    },
    select: {
      id: true,
      organizationId: true,
      candidateId: true,
      jobId: true,
      matchingContractVersion: true,
      status: true,
      freshness: true,
      category: true,
      qualificationSummary: true,
      preferenceSummary: true,
      presentation: true,
      evidenceRefs: true,
      errorCode: true,
      errorMessage: true,
      savedAt: true,
      dismissedAt: true,
      dismissReason: true,
      applicationRequestedAt: true,
      opportunityId: true,
      evaluatedAt: true,
      createdAt: true,
      updatedAt: true,
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
        },
      },
    },
  });

  if (!match) return null;

  // Candidate-safe only — omit idempotencyKey, leases, sourceDataVersion, qualificationNotes, raw requirements.
  return {
    id: match.id,
    organizationId: match.organizationId,
    candidateId: match.candidateId,
    jobId: match.jobId,
    matchingContractVersion: match.matchingContractVersion,
    status: match.status,
    freshness: match.freshness,
    category: match.category,
    categoryLabel:
      match.category === "STRONG_MATCH"
        ? "Strong match"
        : match.category === "GOOD_MATCH"
          ? "Good match"
          : match.category === "POSSIBLE_MATCH"
            ? "Possible match"
            : match.category === "NEEDS_REVIEW"
              ? "Needs review"
              : match.category === "LOW_MATCH"
                ? "Low match"
                : null,
    qualificationSummary: match.qualificationSummary,
    preferenceSummary: match.preferenceSummary,
    presentation: match.presentation,
    evidenceRefs: match.evidenceRefs,
    errorCode: match.errorCode,
    errorMessage: match.errorMessage,
    savedAt: match.savedAt,
    dismissedAt: match.dismissedAt,
    dismissReason: match.dismissReason,
    applicationRequestedAt: match.applicationRequestedAt,
    opportunityId: match.opportunityId,
    evaluatedAt: match.evaluatedAt,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
    job: match.job,
  };
}

/**
 * Intended server-authorized path for candidate-controlled action fields only.
 * Never updates evaluation/identity/worker fields.
 */
export async function updateOwnCandidateJobMatchActions(
  tx: Prisma.TransactionClient,
  input: {
    actor: AuthorizedMatchActor;
    matchId: string;
    patch: {
      savedAt?: Date | string | null;
      dismissedAt?: Date | string | null;
      dismissReason?: string | null;
      applicationRequestedAt?: Date | string | null;
    };
  }
): Promise<{ matchId: string }> {
  assertCandidateActionPatch(input.patch);

  if (input.actor.role !== "CANDIDATE" || !input.actor.viewerCandidateId) {
    throw new AuthorizationError("Only the owning candidate may update match actions");
  }

  const match = await tx.candidateJobMatch.findFirst({
    where: {
      id: input.matchId,
      organizationId: input.actor.organizationId,
      candidateId: input.actor.viewerCandidateId,
    },
    select: { id: true, candidateId: true },
  });
  if (!match) throw new NotFoundError("Match not found");

  const data: Prisma.CandidateJobMatchUpdateInput = {};
  if ("savedAt" in input.patch) {
    data.savedAt =
      input.patch.savedAt == null ? null : new Date(input.patch.savedAt);
  }
  if ("dismissedAt" in input.patch) {
    data.dismissedAt =
      input.patch.dismissedAt == null ? null : new Date(input.patch.dismissedAt);
  }
  if ("dismissReason" in input.patch) {
    data.dismissReason = input.patch.dismissReason ?? null;
  }
  if ("applicationRequestedAt" in input.patch) {
    data.applicationRequestedAt =
      input.patch.applicationRequestedAt == null
        ? null
        : new Date(input.patch.applicationRequestedAt);
  }

  await tx.candidateJobMatch.update({
    where: { id: match.id },
    data,
  });

  return { matchId: match.id };
}

/**
 * Rejects candidate attempts to mutate evaluation or identity fields.
 * Used by future action endpoints; tested now for security foundation.
 */
export function assertCandidateActionPatch(
  patch: Record<string, unknown>
): asserts patch is {
  savedAt?: Date | string | null;
  dismissedAt?: Date | string | null;
  dismissReason?: string | null;
  applicationRequestedAt?: Date | string | null;
} {
  const allowed = new Set<string>(CANDIDATE_ACTION_FIELDS);
  for (const key of Object.keys(patch)) {
    if (!allowed.has(key)) {
      throw new AuthorizationError(
        `Candidates cannot modify evaluation field "${key}"`
      );
    }
  }
  for (const key of IMMUTABLE_IDENTITY_FIELDS) {
    if (key in patch) {
      throw new AuthorizationError(`Candidates cannot modify "${key}"`);
    }
  }
  for (const key of EVALUATION_CONTROLLED_FIELDS) {
    if (key in patch) {
      throw new AuthorizationError(
        `Candidates cannot modify evaluation field "${key}"`
      );
    }
  }
}
