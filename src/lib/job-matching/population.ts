/**
 * Phase 5E — Initial CandidateJobMatch population (producer).
 *
 * Responsibility: decide which (candidate, job) pairs should enter matching.
 * Does NOT evaluate matching.v1. Creates/reuses QUEUED work via
 * enqueueCandidateJobMatchWork for pairs that have NO existing match row.
 *
 * Existing rows (including dismissed/saved/requested) are never recreated
 * and never have decision fields touched by this module.
 */

import type { Prisma } from "@/generated/prisma";
import { AuditAction } from "@/generated/prisma";
import { logSystemAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { enqueueCandidateJobMatchWork } from "./worker";
import { MATCH_DRAIN_BATCH_SIZE } from "./constants";

/** Align with worker drain batch — one population page ≈ one drain page. */
export const JOB_MATCH_POPULATION_BATCH_SIZE = MATCH_DRAIN_BATCH_SIZE;

/** Max pages per mutation (25 × 40 = 1_000 pairs). Remainder needs another trigger/bootstrap. */
export const JOB_MATCH_POPULATION_MAX_BATCHES = 40;

export type JobMatchPopulationReason =
  | "GLOBAL_JOB_CREATED"
  | "GLOBAL_JOB_OPENED"
  | "GLOBAL_JOB_SHARED_TO_CATALOG"
  | "PRIVATE_JOB_CREATED"
  | "CANDIDATE_BECAME_ACTIVE"
  | "BOOTSTRAP";

export type JobMatchPopulationResult = {
  enqueued: number;
  skippedExisting: number;
  batches: number;
  truncated: boolean;
  sampleMatchIds: string[];
};

async function auditPopulation(input: {
  organizationId: string;
  reason: JobMatchPopulationReason;
  scope: "job" | "candidate";
  jobId?: string;
  candidateId?: string;
  result: JobMatchPopulationResult;
}): Promise<void> {
  if (input.result.enqueued <= 0) return;
  try {
    await logSystemAuditEvent({
      organizationId: input.organizationId,
      actorType: "SYSTEM",
      action: AuditAction.JOB_MATCH_REQUESTED,
      entityType: "CandidateJobMatch",
      entityId:
        input.result.sampleMatchIds[0] ??
        input.jobId ??
        input.candidateId ??
        input.organizationId,
      details: {
        organizationId: input.organizationId,
        reason: input.reason,
        scope: input.scope,
        jobId: input.jobId,
        candidateId: input.candidateId,
        enqueued: input.result.enqueued,
        skippedExisting: input.result.skippedExisting,
        batches: input.result.batches,
        truncated: input.result.truncated,
        sampleMatchIds: input.result.sampleMatchIds.slice(0, 10),
        status: "QUEUED",
        phase: "5E_INITIAL_POPULATION",
      },
    });
  } catch {
    // Audit must not break job/candidate mutations.
  }
}

/**
 * Candidate readiness for GLOBAL Job Intelligence population.
 * Chosen from existing lifecycle: ACTIVE only (not ONBOARDING / INACTIVE / ARCHIVED).
 */
export function isCandidateMatchPopulationEligible(status: string): boolean {
  return status === "ACTIVE";
}

async function enqueueIfAbsent(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    candidateId: string;
    jobId: string;
    requestedById?: string | null;
  }
): Promise<{ outcome: "created" | "exists"; matchId?: string }> {
  const existing = await tx.candidateJobMatch.findUnique({
    where: {
      organizationId_candidateId_jobId: {
        organizationId: input.organizationId,
        candidateId: input.candidateId,
        jobId: input.jobId,
      },
    },
    select: { id: true },
  });
  if (existing) return { outcome: "exists", matchId: existing.id };

  const enqueued = await enqueueCandidateJobMatchWork(tx, {
    organizationId: input.organizationId,
    candidateId: input.candidateId,
    jobId: input.jobId,
    requestedById: input.requestedById,
    // Bulk population: one summary audit per scope (avoid N audits).
    emitAudit: false,
  });
  return { outcome: "created", matchId: enqueued.matchId };
}

/**
 * Populate missing match work for one Job (GLOBAL → eligible ACTIVE candidates;
 * CANDIDATE_PRIVATE → owner only).
 */
export async function populateJobMatchWorkForJob(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    jobId: string;
    reason: JobMatchPopulationReason;
    requestedById?: string | null;
  }
): Promise<JobMatchPopulationResult> {
  const result: JobMatchPopulationResult = {
    enqueued: 0,
    skippedExisting: 0,
    batches: 0,
    truncated: false,
    sampleMatchIds: [],
  };

  if (!input.organizationId || !input.jobId) return result;

  const job = await tx.job.findFirst({
    where: {
      id: input.jobId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      status: true,
      visibility: true,
      ownerCandidateId: true,
    },
  });

  if (!job || job.status !== "OPEN") {
    return result;
  }

  if (job.visibility === "CANDIDATE_PRIVATE") {
    if (!job.ownerCandidateId) return result;
    const owner = await tx.candidate.findFirst({
      where: {
        id: job.ownerCandidateId,
        organizationId: input.organizationId,
        status: { not: "ARCHIVED" },
      },
      select: { id: true },
    });
    if (!owner) return result;

    result.batches = 1;
    const { outcome, matchId } = await enqueueIfAbsent(tx, {
      organizationId: input.organizationId,
      candidateId: owner.id,
      jobId: job.id,
      requestedById: input.requestedById,
    });
    if (outcome === "created") {
      result.enqueued = 1;
      if (matchId) result.sampleMatchIds.push(matchId);
    } else {
      result.skippedExisting = 1;
    }

    await auditPopulation({
      organizationId: input.organizationId,
      reason: input.reason,
      scope: "job",
      jobId: job.id,
      result,
    });
    return result;
  }

  if (job.visibility !== "GLOBAL") {
    return result;
  }

  // Re-query unmatched each batch (filter shrinks as rows are created).
  // No cursor — mutating "none" filters make keyset pagination unsafe.
  for (let i = 0; i < JOB_MATCH_POPULATION_MAX_BATCHES; i++) {
    const page = await tx.candidate.findMany({
      where: {
        organizationId: input.organizationId,
        status: "ACTIVE",
        jobMatches: { none: { jobId: job.id } },
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: JOB_MATCH_POPULATION_BATCH_SIZE,
    });

    result.batches += 1;
    if (page.length === 0) break;

    for (const cand of page) {
      const { outcome, matchId } = await enqueueIfAbsent(tx, {
        organizationId: input.organizationId,
        candidateId: cand.id,
        jobId: job.id,
        requestedById: input.requestedById,
      });
      if (outcome === "created") {
        result.enqueued += 1;
        if (matchId && result.sampleMatchIds.length < 10) {
          result.sampleMatchIds.push(matchId);
        }
      } else {
        result.skippedExisting += 1;
      }
    }

    if (page.length < JOB_MATCH_POPULATION_BATCH_SIZE) break;
    if (i === JOB_MATCH_POPULATION_MAX_BATCHES - 1) {
      result.truncated = true;
    }
  }

  if (result.truncated) {
    logger.warn("Job match population truncated at batch cap", {
      event: "JOB_MATCH_POPULATION",
      organizationId: input.organizationId,
      jobId: job.id,
      reason: input.reason,
      enqueued: result.enqueued,
      batches: result.batches,
    });
  }

  await auditPopulation({
    organizationId: input.organizationId,
    reason: input.reason,
    scope: "job",
    jobId: job.id,
    result,
  });

  return result;
}

/**
 * Populate missing match work for one ACTIVE candidate across OPEN GLOBAL
 * jobs and OPEN private jobs they own.
 */
export async function populateJobMatchWorkForCandidate(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    candidateId: string;
    reason: JobMatchPopulationReason;
    requestedById?: string | null;
  }
): Promise<JobMatchPopulationResult> {
  const result: JobMatchPopulationResult = {
    enqueued: 0,
    skippedExisting: 0,
    batches: 0,
    truncated: false,
    sampleMatchIds: [],
  };

  if (!input.organizationId || !input.candidateId) return result;

  const candidate = await tx.candidate.findFirst({
    where: {
      id: input.candidateId,
      organizationId: input.organizationId,
    },
    select: { id: true, status: true },
  });

  if (!candidate || !isCandidateMatchPopulationEligible(candidate.status)) {
    return result;
  }

  for (let i = 0; i < JOB_MATCH_POPULATION_MAX_BATCHES; i++) {
    const page = await tx.job.findMany({
      where: {
        organizationId: input.organizationId,
        status: "OPEN",
        OR: [
          { visibility: "GLOBAL" },
          {
            visibility: "CANDIDATE_PRIVATE",
            ownerCandidateId: candidate.id,
          },
        ],
        jobMatches: {
          none: {
            candidateId: candidate.id,
          },
        },
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: JOB_MATCH_POPULATION_BATCH_SIZE,
    });

    result.batches += 1;
    if (page.length === 0) break;

    for (const job of page) {
      const { outcome, matchId } = await enqueueIfAbsent(tx, {
        organizationId: input.organizationId,
        candidateId: candidate.id,
        jobId: job.id,
        requestedById: input.requestedById,
      });
      if (outcome === "created") {
        result.enqueued += 1;
        if (matchId && result.sampleMatchIds.length < 10) {
          result.sampleMatchIds.push(matchId);
        }
      } else {
        result.skippedExisting += 1;
      }
    }

    if (page.length < JOB_MATCH_POPULATION_BATCH_SIZE) break;
    if (i === JOB_MATCH_POPULATION_MAX_BATCHES - 1) {
      result.truncated = true;
    }
  }

  if (result.truncated) {
    logger.warn("Candidate match population truncated at batch cap", {
      event: "JOB_MATCH_POPULATION",
      organizationId: input.organizationId,
      candidateId: candidate.id,
      reason: input.reason,
      enqueued: result.enqueued,
      batches: result.batches,
    });
  }

  await auditPopulation({
    organizationId: input.organizationId,
    reason: input.reason,
    scope: "candidate",
    candidateId: candidate.id,
    result,
  });

  return result;
}
