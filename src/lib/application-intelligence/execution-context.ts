import type { Prisma, PrismaClient } from "@/generated/prisma";
import { ANALYSIS_PURPOSE } from "./constants";
import {
  buildSnapshotSourceVersionId,
  hashJobDescriptionContent,
} from "./jd-snapshot";
import { ProviderError } from "./providers/errors";
import { canAccessJobSnapshot } from "./security";

type IntelligenceDb = PrismaClient | Prisma.TransactionClient;

export type IntelligenceExecutionContext = {
  runId: string;
  organizationId: string;
  candidateId: string | null;
  applicationId: string | null;
  jobId: string;
  snapshotId: string;
  requirementSetId: string | null;
  analysisPurpose: string;
  sourceDataVersion: string;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  scoringVersion: string;
  freshness: string;
  attemptCount: number;
  maxAttempts: number;
  snapshot: {
    id: string;
    jobId: string;
    organizationId: string;
    contentHash: string;
    sourceVersionId: string;
    sourceText: string;
  };
  job: {
    id: string;
    organizationId: string;
    visibility: "GLOBAL" | "CANDIDATE_PRIVATE";
    ownerCandidateId: string | null;
  };
  application: {
    id: string;
    organizationId: string;
    candidateId: string;
    jobId: string;
  } | null;
  requirementSet: {
    id: string;
    snapshotId: string;
    jobId: string;
    organizationId: string;
    freshness: string;
  } | null;
};

/**
 * Reconstruct immutable execution context from the run's pinned FKs.
 * Never reads "latest" Job.jobDescription for analysis identity.
 */
export async function loadIntelligenceExecutionContext(
  db: IntelligenceDb,
  runId: string
): Promise<IntelligenceExecutionContext> {
  const run = await db.applicationIntelligenceRun.findUnique({
    where: { id: runId },
    include: {
      snapshot: {
        select: {
          id: true,
          jobId: true,
          organizationId: true,
          contentHash: true,
          sourceVersionId: true,
          sourceText: true,
        },
      },
      job: {
        select: {
          id: true,
          organizationId: true,
          visibility: true,
          ownerCandidateId: true,
        },
      },
      application: {
        select: {
          id: true,
          organizationId: true,
          candidateId: true,
          jobId: true,
        },
      },
      requirementSet: {
        select: {
          id: true,
          snapshotId: true,
          jobId: true,
          organizationId: true,
          freshness: true,
        },
      },
    },
  });

  if (!run) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Intelligence run not found",
      { retryable: false }
    );
  }

  assertAuthorizedExecutionChain(run);

  if (run.analysisPurpose === ANALYSIS_PURPOSE.JOB_REQUIREMENT_EXTRACTION) {
    assertLoadedSnapshotIntegrityForExtraction({
      snapshot: run.snapshot,
      expectedJobId: run.jobId,
      expectedOrganizationId: run.organizationId,
      expectedSnapshotId: run.snapshotId,
    });
  }

  return {
    runId: run.id,
    organizationId: run.organizationId,
    candidateId: run.candidateId,
    applicationId: run.applicationId,
    jobId: run.jobId,
    snapshotId: run.snapshotId,
    requirementSetId: run.requirementSetId,
    analysisPurpose: run.analysisPurpose,
    sourceDataVersion: run.sourceDataVersion,
    provider: run.provider,
    model: run.model,
    promptVersion: run.promptVersion,
    schemaVersion: run.schemaVersion,
    scoringVersion: run.scoringVersion,
    freshness: run.freshness,
    attemptCount: run.attemptCount,
    maxAttempts: run.maxAttempts,
    snapshot: run.snapshot,
    job: {
      id: run.job.id,
      organizationId: run.job.organizationId,
      visibility: run.job.visibility as "GLOBAL" | "CANDIDATE_PRIVATE",
      ownerCandidateId: run.job.ownerCandidateId,
    },
    application: run.application,
    requirementSet: run.requirementSet,
  };
}

export function assertAuthorizedExecutionChain(run: {
  organizationId: string;
  candidateId: string | null;
  applicationId: string | null;
  jobId: string;
  snapshotId: string;
  analysisPurpose?: string;
  snapshot: {
    id: string;
    jobId: string;
    organizationId: string;
  };
  job: {
    id: string;
    organizationId: string;
    visibility: string;
    ownerCandidateId: string | null;
  };
  application: {
    id: string;
    organizationId: string;
    candidateId: string;
    jobId: string;
  } | null;
  requirementSet: {
    id: string;
    snapshotId: string;
    jobId: string;
    organizationId: string;
  } | null;
}): void {
  const isJobOnlyExtraction =
    run.analysisPurpose === ANALYSIS_PURPOSE.JOB_REQUIREMENT_EXTRACTION ||
    (run.applicationId == null && run.candidateId == null);

  if (run.job.organizationId !== run.organizationId) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Cross-tenant job rejected",
      { retryable: false }
    );
  }
  if (run.snapshot.organizationId !== run.organizationId) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Cross-tenant snapshot rejected",
      { retryable: false }
    );
  }
  if (run.snapshot.jobId !== run.jobId || run.snapshot.id !== run.snapshotId) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Unauthorized or mismatched snapshot",
      { retryable: false }
    );
  }
  if (run.job.id !== run.jobId) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Application/job mismatch",
      { retryable: false }
    );
  }

  if (isJobOnlyExtraction) {
    if (run.applicationId != null || run.candidateId != null) {
      throw new ProviderError(
        "PERMANENT_CLIENT_ERROR",
        "Job requirement extraction must not bind candidate/application",
        { retryable: false }
      );
    }
    if (run.application != null) {
      throw new ProviderError(
        "PERMANENT_CLIENT_ERROR",
        "Job requirement extraction must not load application context",
        { retryable: false }
      );
    }
  } else {
    if (!run.application || !run.candidateId || !run.applicationId) {
      throw new ProviderError(
        "PERMANENT_CLIENT_ERROR",
        "Application-scoped intelligence requires candidate and application",
        { retryable: false }
      );
    }
    if (run.application.organizationId !== run.organizationId) {
      throw new ProviderError(
        "PERMANENT_CLIENT_ERROR",
        "Cross-tenant application rejected",
        { retryable: false }
      );
    }
    if (run.application.candidateId !== run.candidateId) {
      throw new ProviderError(
        "PERMANENT_CLIENT_ERROR",
        "Application/candidate mismatch",
        { retryable: false }
      );
    }
    if (run.application.jobId !== run.jobId) {
      throw new ProviderError(
        "PERMANENT_CLIENT_ERROR",
        "Application/job mismatch",
        { retryable: false }
      );
    }
    if (
      run.job.visibility === "CANDIDATE_PRIVATE" &&
      run.job.ownerCandidateId !== run.candidateId
    ) {
      throw new ProviderError(
        "PERMANENT_CLIENT_ERROR",
        "Private job snapshot denied for this candidate",
        { retryable: false }
      );
    }
  }

  // Defense in depth — same helper as read path
  if (
    !canAccessJobSnapshot({
      viewerOrganizationId: run.organizationId,
      snapshotOrganizationId: run.snapshot.organizationId,
      role: "EMPLOYEE",
      viewerUserId: "worker",
      viewerCandidateId: run.candidateId,
      jobVisibility: run.job.visibility as "GLOBAL" | "CANDIDATE_PRIVATE",
      jobOwnerCandidateId: run.job.ownerCandidateId,
      isOrgPrivilegedStaff: true,
    })
  ) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Snapshot access denied",
      { retryable: false }
    );
  }

  if (run.requirementSet) {
    if (
      run.requirementSet.organizationId !== run.organizationId ||
      run.requirementSet.jobId !== run.jobId ||
      run.requirementSet.snapshotId !== run.snapshotId
    ) {
      throw new ProviderError(
        "PERMANENT_CLIENT_ERROR",
        "Requirement set does not match run snapshot/job",
        { retryable: false }
      );
    }
  }
}

function assertLoadedSnapshotIntegrityForExtraction(input: {
  snapshot: {
    id: string;
    jobId: string;
    organizationId: string;
    contentHash: string;
    sourceVersionId: string;
    sourceText: string;
  };
  expectedJobId: string;
  expectedOrganizationId: string;
  expectedSnapshotId: string;
}): void {
  if (
    input.snapshot.jobId !== input.expectedJobId ||
    input.snapshot.organizationId !== input.expectedOrganizationId ||
    input.snapshot.id !== input.expectedSnapshotId
  ) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Snapshot version does not match execution context",
      { retryable: false }
    );
  }
  if (!input.snapshot.sourceText?.trim()) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Snapshot content is empty — refusing extraction",
      { retryable: false }
    );
  }
  if (
    hashJobDescriptionContent(input.snapshot.sourceText) !==
    input.snapshot.contentHash
  ) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Snapshot content hash is invalid",
      { retryable: false }
    );
  }
  const expectedVersion = buildSnapshotSourceVersionId(
    input.snapshot.jobId,
    input.snapshot.contentHash
  );
  if (input.snapshot.sourceVersionId !== expectedVersion) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Snapshot sourceVersionId mismatch",
      { retryable: false }
    );
  }
}

/**
 * Stale policy: if run freshness already RECOMPUTE_REQUIRED/STALE, do not
 * present as CURRENT success. Worker may still complete with stamped freshness.
 */
export function evaluateExecutionFreshness(input: {
  runFreshness: string;
  requirementSetFreshness?: string | null;
}): "CURRENT" | "STALE" | "RECOMPUTE_REQUIRED" {
  if (
    input.runFreshness === "RECOMPUTE_REQUIRED" ||
    input.requirementSetFreshness === "RECOMPUTE_REQUIRED"
  ) {
    return "RECOMPUTE_REQUIRED";
  }
  if (
    input.runFreshness === "STALE" ||
    input.requirementSetFreshness === "STALE"
  ) {
    return "STALE";
  }
  return "CURRENT";
}
