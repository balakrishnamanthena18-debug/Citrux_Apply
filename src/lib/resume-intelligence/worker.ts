import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma";
import { logger } from "@/lib/logger";
import {
  RESUME_ANALYSIS_VERSION,
  RESUME_LEASE_MS,
  buildResumeReviewIdempotencyKey,
  sha256Hex,
} from "./constants";
import { ensureCandidateDocumentExtract } from "./persist-extract";
import { analyzeAtsReadability } from "./ats-readability";
import {
  analyzeResumeRepresentation,
  type CandidateTruthSnapshot,
  type JobRequirementLite,
} from "./representation";

function buildSourceDataVersion(input: {
  contentHash: string;
  candidate: CandidateTruthSnapshot;
  requirementSetId: string | null;
  requirementFingerprint: string;
}): string {
  return sha256Hex(
    [
      input.contentHash,
      input.candidate.skills.map((s) => s.id).join(","),
      input.candidate.experiences.map((e) => e.id).join(","),
      input.candidate.projects.map((p) => p.id).join(","),
      input.requirementSetId ?? "none",
      input.requirementFingerprint,
      RESUME_ANALYSIS_VERSION,
    ].join("|")
  );
}

async function loadCandidateTruth(
  tx: Prisma.TransactionClient | typeof prisma,
  candidateId: string
): Promise<CandidateTruthSnapshot> {
  const [skills, experiences, projects, educations, certifications] =
    await Promise.all([
      tx.candidateSkill.findMany({
        where: { candidateId },
        select: { id: true, name: true },
      }),
      tx.candidateExperience.findMany({
        where: { candidateId },
        select: {
          id: true,
          companyName: true,
          jobTitle: true,
          technologies: true,
          description: true,
        },
        orderBy: { orderIndex: "asc" },
      }),
      tx.candidateProject.findMany({
        where: { candidateId },
        select: {
          id: true,
          title: true,
          technologies: true,
          description: true,
        },
        orderBy: { orderIndex: "asc" },
      }),
      tx.candidateEducation.findMany({
        where: { candidateId },
        select: { id: true, institution: true, degree: true },
      }),
      tx.candidateCertification.findMany({
        where: { candidateId },
        select: { id: true, name: true, issuingAuthority: true },
      }),
    ]);

  return { skills, experiences, projects, educations, certifications };
}

function fingerprintRequirements(requirements: unknown): {
  items: JobRequirementLite[];
  fingerprint: string;
} {
  const items: JobRequirementLite[] = [];
  if (Array.isArray(requirements)) {
    for (const raw of requirements) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const id =
        typeof r.id === "string" ? r.id : typeof r.key === "string" ? r.key : null;
      const text =
        typeof r.text === "string"
          ? r.text
          : typeof r.label === "string"
            ? r.label
            : typeof r.description === "string"
              ? r.description
              : null;
      if (!id || !text) continue;
      items.push({
        id,
        text,
        category: typeof r.category === "string" ? r.category : null,
      });
    }
  }
  return {
    items,
    fingerprint: sha256Hex(items.map((i) => `${i.id}:${i.text}`).join("|")),
  };
}

export async function enqueueResumeReview(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    candidateId: string;
    applicationId: string | null;
    candidateDocumentId: string;
    requestedById: string | null;
  }
): Promise<{ reviewId: string; reused: boolean }> {
  const doc = await tx.candidateDocument.findFirst({
    where: {
      id: input.candidateDocumentId,
      candidateId: input.candidateId,
      documentType: "RESUME",
      candidate: { organizationId: input.organizationId },
    },
    select: {
      id: true,
      versionNumber: true,
    },
  });
  if (!doc) {
    throw new Error("RESUME_DOCUMENT_NOT_FOUND");
  }

  const candidate = await loadCandidateTruth(tx, input.candidateId);
  let requirementSetId: string | null = null;
  let requirementFingerprint = "none";

  if (input.applicationId) {
    const app = await tx.application.findFirst({
      where: {
        id: input.applicationId,
        organizationId: input.organizationId,
        candidateId: input.candidateId,
      },
      select: { jobId: true },
    });
    if (app) {
      const reqSet = await tx.jobRequirementSet.findFirst({
        where: {
          organizationId: input.organizationId,
          jobId: app.jobId,
          freshness: "CURRENT",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, requirements: true },
      });
      if (reqSet) {
        requirementSetId = reqSet.id;
        requirementFingerprint = fingerprintRequirements(reqSet.requirements)
          .fingerprint;
      }
    }
  }

  const provisionalSource = buildSourceDataVersion({
    contentHash: `doc:${doc.id}:v${doc.versionNumber}`,
    candidate,
    requirementSetId,
    requirementFingerprint,
  });

  const idempotencyKey = buildResumeReviewIdempotencyKey({
    organizationId: input.organizationId,
    candidateId: input.candidateId,
    applicationId: input.applicationId,
    candidateDocumentId: doc.id,
    sourceDataVersion: provisionalSource,
  });

  const existing = await tx.resumeReview.findUnique({
    where: { idempotencyKey },
    select: { id: true, status: true },
  });
  if (existing && existing.status !== "FAILED") {
    return { reviewId: existing.id, reused: true };
  }

  await tx.resumeReview.updateMany({
    where: {
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      applicationId: input.applicationId,
      candidateDocumentId: doc.id,
      freshness: "CURRENT",
      status: { in: ["QUEUED", "ANALYZING", "READY"] },
    },
    data: { freshness: "STALE", status: "STALE" },
  });

  const created = await tx.resumeReview.create({
    data: {
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      applicationId: input.applicationId,
      candidateDocumentId: doc.id,
      documentVersion: doc.versionNumber,
      status: "QUEUED",
      freshness: "CURRENT",
      analysisVersion: RESUME_ANALYSIS_VERSION,
      sourceDataVersion: provisionalSource,
      idempotencyKey,
      requestedById: input.requestedById,
    },
    select: { id: true },
  });

  return { reviewId: created.id, reused: false };
}

export async function claimNextResumeReview(): Promise<string | null> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + RESUME_LEASE_MS);

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "resume_reviews"
    SET
      status = 'ANALYZING'::"ResumeReviewStatus",
      "attemptCount" = "attemptCount" + 1,
      "leaseExpiresAt" = ${leaseUntil},
      "startedAt" = COALESCE("startedAt", ${now}),
      "errorCode" = NULL,
      "errorMessage" = NULL
    WHERE id = (
      SELECT id FROM "resume_reviews"
      WHERE freshness = 'CURRENT'::"IntelligenceResultFreshness"
        AND (
          status = 'QUEUED'::"ResumeReviewStatus"
          OR (
            status = 'ANALYZING'::"ResumeReviewStatus"
            AND "leaseExpiresAt" IS NOT NULL
            AND "leaseExpiresAt" < ${now}
            AND "attemptCount" < "maxAttempts"
          )
        )
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;

  return rows[0]?.id ?? null;
}

export async function processResumeReview(reviewId: string): Promise<boolean> {
  const review = await prisma.resumeReview.findUnique({
    where: { id: reviewId },
    include: {
      candidateDocument: {
        select: {
          id: true,
          storagePath: true,
          mimeType: true,
          versionNumber: true,
        },
      },
    },
  });
  if (!review || review.status !== "ANALYZING") return false;

  try {
    const extract = await ensureCandidateDocumentExtract(prisma, {
      organizationId: review.organizationId,
      candidateId: review.candidateId,
      candidateDocumentId: review.candidateDocumentId,
      storagePath: review.candidateDocument.storagePath,
      mimeType: review.candidateDocument.mimeType,
    });

    const extractRow = await prisma.candidateDocumentExtract.findUnique({
      where: { id: extract.extractId },
      select: {
        id: true,
        extractedText: true,
        parseStatus: true,
        pageCount: true,
        charCount: true,
        errorCode: true,
        contentHash: true,
      },
    });
    if (!extractRow) throw new Error("EXTRACT_MISSING");

    const candidate = await loadCandidateTruth(prisma, review.candidateId);
    let requirements: JobRequirementLite[] = [];
    let requirementSetId: string | null = null;
    let requirementFingerprint = "none";

    if (review.applicationId) {
      const app = await prisma.application.findFirst({
        where: {
          id: review.applicationId,
          organizationId: review.organizationId,
          candidateId: review.candidateId,
        },
        select: { jobId: true },
      });
      if (app) {
        const reqSet = await prisma.jobRequirementSet.findFirst({
          where: {
            organizationId: review.organizationId,
            jobId: app.jobId,
            freshness: "CURRENT",
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, requirements: true },
        });
        if (reqSet) {
          requirementSetId = reqSet.id;
          const fp = fingerprintRequirements(reqSet.requirements);
          requirements = fp.items;
          requirementFingerprint = fp.fingerprint;
        }
      }
    }

    const ats = analyzeAtsReadability({
      parseStatus: extractRow.parseStatus,
      text: extractRow.extractedText,
      pageCount: extractRow.pageCount,
      charCount: extractRow.charCount,
      errorCode: extractRow.errorCode,
    });

    const representation = analyzeResumeRepresentation({
      resumeText: extractRow.extractedText,
      parseOk: extractRow.parseStatus === "SUCCESS",
      candidate,
      requirements,
    });

    const sourceDataVersion = buildSourceDataVersion({
      contentHash: extractRow.contentHash,
      candidate,
      requirementSetId,
      requirementFingerprint,
    });

    await prisma.resumeReview.update({
      where: { id: review.id },
      data: {
        status: "READY",
        freshness: "CURRENT",
        extractId: extractRow.id,
        documentVersion: review.candidateDocument.versionNumber,
        sourceDataVersion,
        atsReadability: ats as object,
        representation: { findings: representation.findings } as object,
        strengths: representation.strengths as object,
        recommendations: representation.recommendations as object,
        overallLabel: representation.overallLabel,
        overallSummary: representation.overallSummary,
        errorCode: null,
        errorMessage: null,
        completedAt: new Date(),
        leaseExpiresAt: null,
      },
    });

    return true;
  } catch {
    const failedPermanently = review.attemptCount >= review.maxAttempts;
    await prisma.resumeReview.update({
      where: { id: review.id },
      data: failedPermanently
        ? {
            status: "FAILED",
            errorCode: "REVIEW_FAILED",
            errorMessage: "We couldn't complete the review.",
            completedAt: new Date(),
            leaseExpiresAt: null,
          }
        : {
            status: "QUEUED",
            errorCode: "REVIEW_RETRY",
            errorMessage: "We couldn't complete the review.",
            leaseExpiresAt: null,
          },
    });
    return false;
  }
}

export async function drainResumeReviewWorker(limit = 3): Promise<{
  claimed: number;
  completed: number;
  failed: number;
}> {
  let claimed = 0;
  let completed = 0;
  let failed = 0;

  for (let i = 0; i < limit; i++) {
    const reviewId = await claimNextResumeReview();
    if (!reviewId) break;
    claimed += 1;
    const ok = await processResumeReview(reviewId);
    if (ok) completed += 1;
    else failed += 1;
  }

  logger.info("Resume review worker drain completed", {
    event: "RESUME_REVIEW_WORKER_DRAIN",
    claimed,
    completed,
    failed,
  });

  return { claimed, completed, failed };
}
