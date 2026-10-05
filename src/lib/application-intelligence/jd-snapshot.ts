import crypto from "crypto";
import type { Prisma } from "@/generated/prisma";
import { AuditAction } from "@/generated/prisma";
import { logUserAuditEvent } from "@/lib/audit";
import { sanitizeIntelligenceAuditDetails } from "./audit-contract";

export type JobDescriptionSource = {
  id: string;
  organizationId: string;
  jobDescription: string;
  externalUrl?: string | null;
  source?: string | null;
  updatedAt: Date | string;
};

/**
 * JD content normalization before hashing (Gate 2.3).
 *
 * Rules (must not change semantic meaning):
 * 1. Convert CRLF / CR → LF
 * 2. Trim leading/trailing whitespace
 * 3. Do NOT alter internal spacing, casing, or punctuation
 * 4. Do NOT include mutable metadata (title, salary, timestamps)
 *
 * The hash represents the analyzed JD source text only.
 */
export function normalizeJdSourceForHash(sourceText: string): string {
  return sourceText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

/**
 * Deterministic content hash for JD snapshot identity.
 * Same normalized text → same hash (idempotent capture).
 */
export function hashJobDescriptionContent(sourceText: string): string {
  const normalized = normalizeJdSourceForHash(sourceText);
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Deterministic version identity for a snapshot.
 * Format: job:{jobId}:jd:{contentHash[0..16]}
 * Analyses must pin snapshot.id — never "latest".
 */
export function buildSnapshotSourceVersionId(
  jobId: string,
  contentHash: string
): string {
  return `job:${jobId}:jd:${contentHash.slice(0, 16)}`;
}

export function assertSnapshotAnalysisBinding(input: {
  snapshotId: string;
  jobId: string;
  organizationId: string;
  expectedJobId: string;
  expectedOrganizationId: string;
}): void {
  if (input.jobId !== input.expectedJobId) {
    throw new Error("Snapshot jobId mismatch — refusing analysis binding");
  }
  if (input.organizationId !== input.expectedOrganizationId) {
    throw new Error("Snapshot organizationId mismatch — refusing analysis binding");
  }
  if (!input.snapshotId) {
    throw new Error("Analysis binding requires an exact snapshotId");
  }
}

/**
 * Application-layer immutability guard.
 * Snapshots have no authorized content mutation path; RLS also denies UPDATE/DELETE.
 * Privacy/compliance deletion must use existing privacy request flows — not this helper.
 */
export function assertSnapshotContentImmutable(): never {
  throw new Error(
    "JobDescriptionSnapshot is immutable: content, hash, and source text cannot be updated or deleted via ordinary application mutation"
  );
}

/**
 * Capture or reuse an immutable JD snapshot for a job.
 * Does not modify Job.jobDescription semantics.
 * Never performs requirement extraction or AI calls.
 *
 * Auditing is opt-in (`options.audit`) so callers like runs.ts can own the event.
 */
export async function captureJobDescriptionSnapshot(
  tx: Prisma.TransactionClient,
  job: JobDescriptionSource,
  capturedById?: string | null,
  options?: { audit?: boolean }
): Promise<{
  id: string;
  organizationId: string;
  jobId: string;
  contentHash: string;
  sourceVersionId: string;
  created: boolean;
}> {
  const sourceText = job.jobDescription ?? "";
  const contentHash = hashJobDescriptionContent(sourceText);
  const sourceVersionId = buildSnapshotSourceVersionId(job.id, contentHash);

  const existing = await tx.jobDescriptionSnapshot.findUnique({
    where: {
      jobId_contentHash: {
        jobId: job.id,
        contentHash,
      },
    },
    select: {
      id: true,
      organizationId: true,
      jobId: true,
      contentHash: true,
      sourceVersionId: true,
    },
  });

  if (existing) {
    return { ...existing, created: false };
  }

  const created = await tx.jobDescriptionSnapshot.create({
    data: {
      organizationId: job.organizationId,
      jobId: job.id,
      sourceText,
      contentHash,
      sourceUrl: job.externalUrl ?? null,
      sourceLabel: job.source ?? null,
      sourceVersionId,
      capturedById: capturedById ?? null,
    },
    select: {
      id: true,
      organizationId: true,
      jobId: true,
      contentHash: true,
      sourceVersionId: true,
    },
  });

  if (options?.audit && capturedById) {
    await logUserAuditEvent({
      userId: capturedById,
      organizationId: job.organizationId,
      action: AuditAction.JOB_DESCRIPTION_SNAPSHOT_CAPTURED,
      entityType: "JobDescriptionSnapshot",
      entityId: created.id,
      details: sanitizeIntelligenceAuditDetails({
        jobId: job.id,
        snapshotId: created.id,
        contentHash: created.contentHash,
        sourceVersionId: created.sourceVersionId,
      }),
      tx,
    });
  }

  return { ...created, created: true };
}
