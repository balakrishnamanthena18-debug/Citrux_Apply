import { randomUUID } from "crypto";
import type { Prisma } from "@/generated/prisma";
import { AuditAction } from "@/generated/prisma";
import { logUserAuditEvent } from "@/lib/audit";
import {
  JOB_REQUIREMENT_EXTRACTION_VERSION,
  JOB_REQUIREMENT_NORMALIZATION_VERSION,
  JOB_REQUIREMENT_SCHEMA_VERSION,
} from "./constants";
import {
  JobRequirementSetPayloadSchema,
  RequirementsExtractionOutputSchema,
  StructuredRequirementSchema,
  assertRequiredPreferredNotCollapsed,
  normalizeRequirementValue,
  validateRequirementEvidenceAgainstSnapshot,
  type RequirementImportance,
  type StructuredRequirement,
} from "./requirements-contract";
import { INTELLIGENCE_AUDIT_ACTIONS, sanitizeIntelligenceAuditDetails } from "./audit-contract";
import {
  assertSnapshotAnalysisBinding,
  captureJobDescriptionSnapshot,
  type JobDescriptionSource,
} from "./jd-snapshot";
import { markJobApplicationIntelligenceStale } from "./runs";

export type PersistRequirementSetInput = {
  organizationId: string;
  jobId: string;
  snapshotId: string;
  actorUserId: string;
  requirements: StructuredRequirement[];
  extractionVersion?: string;
};

/**
 * Persist a validated requirement set bound to an exact JD snapshot.
 * Does NOT call AI. Does NOT mutate Job rows.
 */
export async function persistJobRequirementSet(
  tx: Prisma.TransactionClient,
  input: PersistRequirementSetInput
): Promise<{ id: string; created: boolean; requirementCount: number }> {
  const snapshot = await tx.jobDescriptionSnapshot.findFirst({
    where: {
      id: input.snapshotId,
      jobId: input.jobId,
      organizationId: input.organizationId,
    },
    select: { id: true, jobId: true, organizationId: true, sourceText: true },
  });

  if (!snapshot) {
    throw new Error("Snapshot not found for requirement set");
  }

  assertSnapshotAnalysisBinding({
    snapshotId: snapshot.id,
    jobId: snapshot.jobId,
    organizationId: snapshot.organizationId,
    expectedJobId: input.jobId,
    expectedOrganizationId: input.organizationId,
  });

  for (const req of input.requirements) {
    const parsed = StructuredRequirementSchema.safeParse(req);
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ?? "Invalid structured requirement"
      );
    }
    const evidenceCheck = validateRequirementEvidenceAgainstSnapshot({
      snapshotId: snapshot.id,
      snapshotText: snapshot.sourceText,
      requirement: parsed.data,
    });
    if (!evidenceCheck.ok) {
      throw new Error(evidenceCheck.message);
    }
  }

  assertRequiredPreferredNotCollapsed(input.requirements);

  const payload = JobRequirementSetPayloadSchema.parse({
    schemaVersion: JOB_REQUIREMENT_SCHEMA_VERSION,
    normalizationVersion: JOB_REQUIREMENT_NORMALIZATION_VERSION,
    snapshotId: snapshot.id,
    requirements: input.requirements,
  });

  const created = await tx.jobRequirementSet.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      snapshotId: snapshot.id,
      schemaVersion: JOB_REQUIREMENT_SCHEMA_VERSION,
      extractionVersion:
        input.extractionVersion ?? JOB_REQUIREMENT_EXTRACTION_VERSION,
      normalizationVersion: JOB_REQUIREMENT_NORMALIZATION_VERSION,
      freshness: "CURRENT",
      requirements: payload.requirements,
    },
    select: { id: true },
  });

  await logUserAuditEvent({
    userId: input.actorUserId,
    organizationId: input.organizationId,
    action: AuditAction.JOB_REQUIREMENT_SET_CREATED,
    entityType: "JobRequirementSet",
    entityId: created.id,
    details: sanitizeIntelligenceAuditDetails({
      jobId: input.jobId,
      snapshotId: snapshot.id,
      requirementCount: payload.requirements.length,
      schemaVersion: JOB_REQUIREMENT_SCHEMA_VERSION,
    }),
    tx,
  });

  return {
    id: created.id,
    created: true,
    requirementCount: payload.requirements.length,
  };
}

/**
 * Mark CURRENT requirement sets for a job as STALE when a new JD snapshot lands.
 * Does not delete historical sets. Does not run AI.
 */
export async function invalidateRequirementSetsForJob(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    jobId: string;
    actorUserId: string;
    reason: "JD_SNAPSHOT_CHANGED" | "MANUAL_INVALIDATION";
    exceptSnapshotId?: string;
  }
): Promise<number> {
  const result = await tx.jobRequirementSet.updateMany({
    where: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      freshness: "CURRENT",
      ...(input.exceptSnapshotId
        ? { snapshotId: { not: input.exceptSnapshotId } }
        : {}),
    },
    data: {
      freshness:
        input.reason === "JD_SNAPSHOT_CHANGED"
          ? "RECOMPUTE_REQUIRED"
          : "STALE",
    },
  });

  if (result.count > 0) {
    await logUserAuditEvent({
      userId: input.actorUserId,
      organizationId: input.organizationId,
      action: AuditAction.JOB_REQUIREMENT_SET_INVALIDATED,
      entityType: "Job",
      entityId: input.jobId,
      details: sanitizeIntelligenceAuditDetails({
        jobId: input.jobId,
        setsInvalidated: result.count,
        reason: input.reason,
        exceptSnapshotId: input.exceptSnapshotId,
      }),
      tx,
    });
  }

  return result.count;
}

/**
 * Convert validated extraction output into structured requirements with evidence.
 * Used by Gate 5; available here as the locked transformation contract.
 * Does not persist. Does not call AI.
 */
export function mapExtractionOutputToStructuredRequirements(input: {
  snapshotId: string;
  snapshotText: string;
  output: unknown;
}): StructuredRequirement[] {
  const parsed = RequirementsExtractionOutputSchema.parse(input.output);
  const mapped: StructuredRequirement[] = [];

  for (const item of parsed.requirements) {
    const req: StructuredRequirement = {
      id: randomUUID(),
      category: item.category,
      rawValue: item.value,
      normalizedValue: normalizeRequirementValue(item.value),
      importance: item.importance,
      confidence: item.confidence,
      derivation: "AI_EXTRACTED",
      evidence: {
        snapshotId: input.snapshotId,
        excerpt: item.sourceEvidence,
      },
    };

    const evidenceCheck = validateRequirementEvidenceAgainstSnapshot({
      snapshotId: input.snapshotId,
      snapshotText: input.snapshotText,
      requirement: req,
    });
    if (!evidenceCheck.ok) {
      throw new Error(evidenceCheck.message);
    }
    mapped.push(req);
  }

  assertRequiredPreferredNotCollapsed(mapped);
  return mapped;
}

/**
 * Deterministic requirements from structured Job fields (not AI).
 * Evidence points at the snapshot + field name.
 */
export function buildStructuredJobFieldRequirements(input: {
  snapshotId: string;
  job: {
    location?: string | null;
    isRemote: boolean;
    employmentType: string;
    salaryMin?: number | null;
    salaryMax?: number | null;
    salaryCurrency?: string | null;
  };
}): StructuredRequirement[] {
  const out: StructuredRequirement[] = [];
  const importance: RequirementImportance = "REQUIRED";

  if (input.job.location) {
    out.push({
      id: randomUUID(),
      category: "LOCATION",
      rawValue: input.job.location,
      normalizedValue: normalizeRequirementValue(input.job.location),
      importance,
      confidence: 1,
      derivation: "STRUCTURED_JOB_FIELD",
      evidence: {
        snapshotId: input.snapshotId,
        excerpt: input.job.location,
        field: "location",
      },
    });
  }

  out.push({
    id: randomUUID(),
    category: "REMOTE_POLICY",
    rawValue: input.job.isRemote ? "remote" : "on-site/hybrid",
    normalizedValue: input.job.isRemote ? "remote" : "on-site/hybrid",
    importance,
    confidence: 1,
    derivation: "STRUCTURED_JOB_FIELD",
    evidence: {
      snapshotId: input.snapshotId,
      excerpt: input.job.isRemote ? "remote" : "on-site/hybrid",
      field: "isRemote",
    },
  });

  out.push({
    id: randomUUID(),
    category: "EMPLOYMENT_TYPE",
    rawValue: input.job.employmentType,
    normalizedValue: input.job.employmentType,
    importance,
    confidence: 1,
    derivation: "STRUCTURED_JOB_FIELD",
    evidence: {
      snapshotId: input.snapshotId,
      excerpt: input.job.employmentType,
      field: "employmentType",
    },
  });

  if (input.job.salaryMin != null || input.job.salaryMax != null) {
    const currency = input.job.salaryCurrency ?? "USD";
    const raw = `${input.job.salaryMin ?? "?"}-${input.job.salaryMax ?? "?"} ${currency}`;
    out.push({
      id: randomUUID(),
      category: "SALARY",
      rawValue: raw,
      normalizedValue: raw,
      importance: "UNKNOWN",
      confidence: 1,
      derivation: "STRUCTURED_JOB_FIELD",
      evidence: {
        snapshotId: input.snapshotId,
        excerpt: raw,
        field: "salary",
      },
    });
  }

  return out;
}

export function requirementSetIsUsableForSnapshot(input: {
  requirementSetSnapshotId: string;
  analysisSnapshotId: string;
  freshness: string;
}): boolean {
  return (
    input.requirementSetSnapshotId === input.analysisSnapshotId &&
    input.freshness === "CURRENT"
  );
}

/** Re-export audit key aliases for Gate 2 naming. */
export const REQUIREMENT_SET_AUDIT = {
  created: INTELLIGENCE_AUDIT_ACTIONS.requirementSetCreated,
  invalidated: INTELLIGENCE_AUDIT_ACTIONS.requirementSetInvalidated,
} as const;

/**
 * After Job create/update: capture immutable JD snapshot and invalidate prior
 * requirement sets when a new snapshot identity is created.
 */
export async function syncJobDescriptionSnapshotAfterJobWrite(
  tx: Prisma.TransactionClient,
  job: JobDescriptionSource,
  actorUserId: string
): Promise<{
  id: string;
  contentHash: string;
  sourceVersionId: string;
  created: boolean;
}> {
  const snapshot = await captureJobDescriptionSnapshot(tx, job, actorUserId, {
    audit: true,
  });

  if (snapshot.created) {
    await invalidateRequirementSetsForJob(tx, {
      organizationId: job.organizationId,
      jobId: job.id,
      actorUserId,
      reason: "JD_SNAPSHOT_CHANGED",
      exceptSnapshotId: snapshot.id,
    });
    await markJobApplicationIntelligenceStale(tx, {
      organizationId: job.organizationId,
      jobId: job.id,
      actorUserId,
      freshness: "RECOMPUTE_REQUIRED",
    });
  }

  return snapshot;
}
