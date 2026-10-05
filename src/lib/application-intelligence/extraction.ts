import crypto from "crypto";
import type { Prisma } from "@/generated/prisma";
import { AuditAction } from "@/generated/prisma";
import { logUserAuditEvent } from "@/lib/audit";
import {
  ANALYSIS_PURPOSE,
  JOB_REQUIREMENT_EXTRACTION_PROMPT_VERSION,
  JOB_REQUIREMENT_EXTRACTION_VERSION,
  JOB_REQUIREMENT_SCHEMA_VERSION,
  NULL_MODEL_ID,
  NULL_PROVIDER_ID,
} from "./constants";
import {
  GATE5_EXTRACTION_AUDIT_ALIASES,
  sanitizeIntelligenceAuditDetails,
} from "./audit-contract";
import {
  assertSnapshotAnalysisBinding,
  buildSnapshotSourceVersionId,
  captureJobDescriptionSnapshot,
  hashJobDescriptionContent,
} from "./jd-snapshot";
import {
  mapExtractionOutputToStructuredRequirements,
  persistJobRequirementSet,
} from "./requirement-set";
import {
  RequirementsExtractionOutputSchema,
  type StructuredRequirement,
} from "./requirements-contract";
import { ProviderError } from "./providers/errors";

export type RequestJobRequirementExtractionInput = {
  organizationId: string;
  jobId: string;
  requestedById: string;
  /** Pin an existing snapshot; omit to capture/reuse from current Job JD. */
  snapshotId?: string;
  provider?: string;
  model?: string;
};

const CANDIDATE_LEAK_KEYS = [
  "candidateId",
  "applicationId",
  "resume",
  "resumeText",
  "candidateProfile",
  "candidateSkills",
  "candidateExperience",
  "candidatePreferences",
  "candidateHistory",
  "applicationMaterials",
  "materialsFingerprint",
] as const;

/**
 * Job-only source identity for extraction runs (no candidate materials).
 */
export function buildExtractionSourceDataVersion(parts: {
  snapshotContentHash: string;
  promptVersion: string;
  schemaVersion: string;
  extractionVersion: string;
}): string {
  return [
    `snap:${parts.snapshotContentHash.slice(0, 16)}`,
    `purpose:${ANALYSIS_PURPOSE.JOB_REQUIREMENT_EXTRACTION}`,
    `prompt:${parts.promptVersion}`,
    `schema:${parts.schemaVersion}`,
    `extract:${parts.extractionVersion}`,
  ].join("|");
}

function buildExtractionIdempotencyKey(parts: {
  jobId: string;
  snapshotContentHash: string;
  promptVersion: string;
  schemaVersion: string;
  extractionVersion: string;
  provider: string;
  model: string;
}): string {
  const material = [
    ANALYSIS_PURPOSE.JOB_REQUIREMENT_EXTRACTION,
    parts.jobId,
    parts.snapshotContentHash,
    parts.promptVersion,
    parts.schemaVersion,
    parts.extractionVersion,
    parts.provider,
    parts.model,
  ].join("|");
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 64);
}

/**
 * Snapshot integrity gate — fail before AI when invalid.
 */
export function assertSnapshotIntegrityForExtraction(input: {
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
  assertSnapshotAnalysisBinding({
    snapshotId: input.snapshot.id,
    jobId: input.snapshot.jobId,
    organizationId: input.snapshot.organizationId,
    expectedJobId: input.expectedJobId,
    expectedOrganizationId: input.expectedOrganizationId,
  });

  if (input.snapshot.id !== input.expectedSnapshotId) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Snapshot version does not match execution context",
      { retryable: false }
    );
  }

  if (!input.snapshot.sourceText || !input.snapshot.sourceText.trim()) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Snapshot content is empty — refusing extraction",
      { retryable: false }
    );
  }

  const recomputed = hashJobDescriptionContent(input.snapshot.sourceText);
  if (recomputed !== input.snapshot.contentHash) {
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
 * Reject candidate-private leakage into job-only provider context.
 */
export function assertJobOnlyExtractionContext(
  scopedContext: Record<string, unknown>
): void {
  for (const key of Object.keys(scopedContext)) {
    if (
      CANDIDATE_LEAK_KEYS.some((b) => key.toLowerCase() === b.toLowerCase())
    ) {
      throw new ProviderError(
        "CONTEXT_BOUNDARY_VIOLATION",
        "Job requirement extraction must not receive candidate context",
        { retryable: false, details: { key } }
      );
    }
  }
}

/**
 * Deterministic dedupe after normalize.v1.
 * Uncertain equivalence → keep separate (only exact normalized key merges).
 */
export function deduplicateStructuredRequirements(
  requirements: StructuredRequirement[]
): StructuredRequirement[] {
  const byKey = new Map<string, StructuredRequirement>();

  for (const req of requirements) {
    const key = [
      req.category,
      req.normalizedValue.toLowerCase(),
      req.importance,
    ].join("|");
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, req);
      continue;
    }
    const existingConf = existing.confidence ?? -1;
    const nextConf = req.confidence ?? -1;
    if (nextConf > existingConf) {
      byKey.set(key, req);
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const ka = `${a.category}|${a.normalizedValue}|${a.importance}`;
    const kb = `${b.category}|${b.normalizedValue}|${b.importance}`;
    return ka.localeCompare(kb);
  });
}

/**
 * Map → evidence validate → normalize (inside map) → dedupe → classify check.
 * Throws ProviderError (non-retryable) on validation failure.
 */
export function postProcessExtractionOutput(input: {
  snapshotId: string;
  snapshotText: string;
  output: unknown;
}): StructuredRequirement[] {
  const schema = RequirementsExtractionOutputSchema.safeParse(input.output);
  if (!schema.success) {
    throw new ProviderError(
      "SCHEMA_VALIDATION_ERROR",
      "Extraction output failed requirement schema validation",
      {
        retryable: false,
        details: {
          issues: schema.error.issues.slice(0, 5).map((i) => i.message),
        },
      }
    );
  }

  let mapped: StructuredRequirement[];
  try {
    mapped = mapExtractionOutputToStructuredRequirements({
      snapshotId: input.snapshotId,
      snapshotText: input.snapshotText,
      output: schema.data,
    });
  } catch (error) {
    throw new ProviderError(
      "SCHEMA_VALIDATION_ERROR",
      error instanceof Error
        ? error.message
        : "Requirement evidence/classification validation failed",
      { retryable: false }
    );
  }

  return deduplicateStructuredRequirements(mapped);
}

/**
 * Create or reuse a QUEUED JOB_REQUIREMENT_EXTRACTION run.
 * Does NOT execute AI. Does NOT receive candidate context.
 */
export async function requestJobRequirementExtraction(
  tx: Prisma.TransactionClient,
  input: RequestJobRequirementExtractionInput
): Promise<{
  runId: string;
  snapshotId: string;
  created: boolean;
  status: "QUEUED" | "RUNNING" | "RETRY_PENDING" | "SUCCEEDED" | "FAILED";
}> {
  if (!input.organizationId || !input.jobId || !input.requestedById) {
    throw new Error("Job requirement extraction scope incomplete");
  }

  const job = await tx.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: {
      id: true,
      organizationId: true,
      jobDescription: true,
      externalUrl: true,
      source: true,
      updatedAt: true,
      visibility: true,
      ownerCandidateId: true,
    },
  });

  if (!job) {
    throw new Error("Job not found for requirement extraction");
  }

  if (!input.snapshotId && !(job.jobDescription ?? "").trim()) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Snapshot content is empty — refusing extraction",
      { retryable: false }
    );
  }

  let snapshot: {
    id: string;
    contentHash: string;
    sourceVersionId: string;
    created: boolean;
  };

  if (input.snapshotId) {
    const pinned = await tx.jobDescriptionSnapshot.findFirst({
      where: {
        id: input.snapshotId,
        jobId: input.jobId,
        organizationId: input.organizationId,
      },
      select: {
        id: true,
        jobId: true,
        organizationId: true,
        contentHash: true,
        sourceVersionId: true,
        sourceText: true,
      },
    });
    if (!pinned) {
      throw new ProviderError(
        "PERMANENT_CLIENT_ERROR",
        "Pinned snapshot not found for job/organization",
        { retryable: false }
      );
    }
    assertSnapshotIntegrityForExtraction({
      snapshot: pinned,
      expectedJobId: input.jobId,
      expectedOrganizationId: input.organizationId,
      expectedSnapshotId: input.snapshotId,
    });
    snapshot = {
      id: pinned.id,
      contentHash: pinned.contentHash,
      sourceVersionId: pinned.sourceVersionId,
      created: false,
    };
  } else {
    snapshot = await captureJobDescriptionSnapshot(
      tx,
      job,
      input.requestedById,
      { audit: true }
    );
  }

  const provider = input.provider ?? NULL_PROVIDER_ID;
  const model = input.model ?? NULL_MODEL_ID;
  const sourceDataVersion = buildExtractionSourceDataVersion({
    snapshotContentHash: snapshot.contentHash,
    promptVersion: JOB_REQUIREMENT_EXTRACTION_PROMPT_VERSION,
    schemaVersion: JOB_REQUIREMENT_SCHEMA_VERSION,
    extractionVersion: JOB_REQUIREMENT_EXTRACTION_VERSION,
  });
  const idempotencyKey = buildExtractionIdempotencyKey({
    jobId: input.jobId,
    snapshotContentHash: snapshot.contentHash,
    promptVersion: JOB_REQUIREMENT_EXTRACTION_PROMPT_VERSION,
    schemaVersion: JOB_REQUIREMENT_SCHEMA_VERSION,
    extractionVersion: JOB_REQUIREMENT_EXTRACTION_VERSION,
    provider,
    model,
  });

  const existing = await tx.applicationIntelligenceRun.findUnique({
    where: { idempotencyKey },
    select: { id: true, status: true, snapshotId: true },
  });

  if (existing) {
    return {
      runId: existing.id,
      snapshotId: existing.snapshotId,
      created: false,
      status: existing.status,
    };
  }

  const run = await tx.applicationIntelligenceRun.create({
    data: {
      organizationId: input.organizationId,
      candidateId: null,
      applicationId: null,
      jobId: input.jobId,
      snapshotId: snapshot.id,
      requestedById: input.requestedById,
      analysisPurpose: ANALYSIS_PURPOSE.JOB_REQUIREMENT_EXTRACTION,
      status: "QUEUED",
      freshness: "CURRENT",
      validationStatus: "PENDING",
      provider,
      model,
      promptVersion: JOB_REQUIREMENT_EXTRACTION_PROMPT_VERSION,
      schemaVersion: JOB_REQUIREMENT_SCHEMA_VERSION,
      scoringVersion: JOB_REQUIREMENT_EXTRACTION_VERSION,
      idempotencyKey,
      sourceDataVersion,
    },
    select: { id: true, snapshotId: true },
  });

  await logUserAuditEvent({
    userId: input.requestedById,
    organizationId: input.organizationId,
    action: AuditAction.APPLICATION_INTELLIGENCE_REQUESTED,
    entityType: "ApplicationIntelligenceRun",
    entityId: run.id,
    details: sanitizeIntelligenceAuditDetails({
      auditAlias: GATE5_EXTRACTION_AUDIT_ALIASES.requested,
      analysisPurpose: ANALYSIS_PURPOSE.JOB_REQUIREMENT_EXTRACTION,
      jobId: input.jobId,
      snapshotId: snapshot.id,
      runId: run.id,
      provider,
      model,
      promptVersion: JOB_REQUIREMENT_EXTRACTION_PROMPT_VERSION,
      schemaVersion: JOB_REQUIREMENT_SCHEMA_VERSION,
      jobVisibility: job.visibility,
    }),
    tx,
  });

  return {
    runId: run.id,
    snapshotId: run.snapshotId,
    created: true,
    status: "QUEUED",
  };
}

/**
 * Persist validated requirements and bind the set to the run.
 */
export async function persistExtractionRequirementSet(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    jobId: string;
    snapshotId: string;
    runId: string;
    actorUserId: string;
    requirements: StructuredRequirement[];
  }
): Promise<{ requirementSetId: string; requirementCount: number }> {
  const persisted = await persistJobRequirementSet(tx, {
    organizationId: input.organizationId,
    jobId: input.jobId,
    snapshotId: input.snapshotId,
    actorUserId: input.actorUserId,
    requirements: input.requirements,
    extractionVersion: JOB_REQUIREMENT_EXTRACTION_VERSION,
  });

  await tx.applicationIntelligenceRun.update({
    where: { id: input.runId },
    data: { requirementSetId: persisted.id },
  });

  return {
    requirementSetId: persisted.id,
    requirementCount: persisted.requirementCount,
  };
}
