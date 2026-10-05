import { prisma } from "@/lib/db/prisma";
import { logSystemAuditEvent } from "@/lib/audit";
import { AuditAction } from "@/generated/prisma";
import { logger } from "@/lib/logger";
import { ANALYSIS_PURPOSE } from "./constants";
import {
  evaluateExecutionFreshness,
  loadIntelligenceExecutionContext,
  type IntelligenceExecutionContext,
} from "./execution-context";
import { assertValidRunTransition } from "./run-state-machine";
import {
  lockRunningRunForPersist,
  transitionRunningRunFailure,
} from "./run-claim";
import {
  GATE5_EXTRACTION_AUDIT_ALIASES,
  GATE6_ALIGNMENT_AUDIT_ALIASES,
  GATE7_READINESS_AUDIT_ALIASES,
  GATE8_EVIDENCE_AUDIT_ALIASES,
  INTELLIGENCE_AUDIT_ACTIONS,
  sanitizeIntelligenceAuditDetails,
} from "./audit-contract";
import {
  enrichAlignmentEvidencePayload,
  validateAlignmentEvidenceIntegrity,
  validateReadinessEvidenceIntegrity,
} from "./evidence-contract";
import {
  assertJobOnlyExtractionContext,
  assertSnapshotIntegrityForExtraction,
  persistExtractionRequirementSet,
  postProcessExtractionOutput,
} from "./extraction";
import {
  buildAlignmentEvidencePayload,
  computeDeterministicAlignment,
  loadAlignmentCandidateFacts,
  persistApplicationAlignmentResult,
} from "./alignment";
import {
  computeDeterministicReadiness,
  loadReadinessInputView,
  persistApplicationReadinessResult,
} from "./readiness";
import { StructuredRequirementSchema } from "./requirements-contract";
import { ProviderError, isTransientProviderFailure } from "./providers/errors";
import type { AIProvider } from "./providers/interface";
import { NullAIProvider } from "./providers/null-provider";
import { resolveConfiguredAIProvider } from "./providers/service";
import { executeProviderWithGuards } from "./providers/execution-boundary";
import { validateUntrustedProviderResponse } from "./providers/validate-response";
import { sanitizeProviderScopedContext } from "./providers/context-guard";
import { REQUIREMENT_EXTRACTION_PROMPT } from "./prompts/requirement-extraction";

export type PipelineExecuteOptions = {
  provider?: AIProvider;
  actorUserId?: string | null;
  ip?: string;
  /** Known candidate entity ids for truth validation (empty for job-only extraction). */
  knownEntityIds?: Set<string>;
};

export type PipelineExecuteResult = {
  runId: string;
  status: "SUCCEEDED" | "FAILED" | "RETRY_PENDING";
  errorCode?: string;
  durationMs: number;
  requirementSetId?: string;
  alignmentResultId?: string;
  overallScore?: number | null;
  readinessResultId?: string;
  readinessState?: string;
};

function resolveWorkerProvider(override?: AIProvider): AIProvider {
  if (override) return override;
  const configured = resolveConfiguredAIProvider();
  if (configured.status === "READY") return configured.provider;
  return new NullAIProvider();
}

function classifyFailure(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  if (error instanceof ProviderError) {
    return {
      code: error.code,
      message: error.message,
      retryable: isTransientProviderFailure(error),
    };
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("persist") || msg.includes("transaction")) {
      return {
        code: "PERSISTENCE_ERROR",
        message: "Intelligence result persistence failed",
        retryable: true,
      };
    }
  }
  return {
    code: "PROVIDER_ERROR",
    message: "Intelligence pipeline execution failed",
    retryable: false,
  };
}

/**
 * Execute a single RUNNING intelligence run through the Gate 4/5/6/7 pipeline.
 * - JOB_REQUIREMENT_EXTRACTION → AI extract + JobRequirementSet
 * - CANDIDATE_JOB_ALIGNMENT → deterministic alignment (NO LLM)
 * - APPLICATION_READINESS → deterministic readiness advisory (NO LLM)
 * - APPLICATION_INTELLIGENCE → provider analyzeJob payload only (no scoring)
 */
export async function executeIntelligenceRunPipeline(
  runId: string,
  options: PipelineExecuteOptions = {}
): Promise<PipelineExecuteResult> {
  const started = Date.now();
  const provider = resolveWorkerProvider(options.provider);

  let ctx: IntelligenceExecutionContext;
  try {
    ctx = await loadIntelligenceExecutionContext(prisma, runId);
  } catch (error) {
    const failure = classifyFailure(error);
    // Context load runs after claim — authoritative state is RUNNING.
    await failRun(runId, failure.code, failure.message, true);
    return {
      runId,
      status: "FAILED",
      errorCode: failure.code,
      durationMs: Date.now() - started,
    };
  }

  // Idempotent: already completed
  const current = await prisma.applicationIntelligenceRun.findUnique({
    where: { id: runId },
    select: {
      status: true,
      validatedPayload: true,
      requirementSetId: true,
      analysisPurpose: true,
      alignmentResult: { select: { id: true, overallScore: true } },
      readinessResult: { select: { id: true, readinessState: true } },
    },
  });
  if (
    current?.status === "SUCCEEDED" &&
    (current.validatedPayload ||
      current.requirementSetId ||
      current.alignmentResult ||
      current.readinessResult)
  ) {
    return {
      runId,
      status: "SUCCEEDED",
      durationMs: Date.now() - started,
      requirementSetId: current.requirementSetId ?? undefined,
      alignmentResultId: current.alignmentResult?.id,
      overallScore: current.alignmentResult?.overallScore ?? undefined,
      readinessResultId: current.readinessResult?.id,
      readinessState: current.readinessResult?.readinessState,
    };
  }
  if (current?.status !== "RUNNING") {
    return {
      runId,
      status: "FAILED",
      errorCode: "INVALID_STATE",
      durationMs: Date.now() - started,
    };
  }

  const isExtraction =
    ctx.analysisPurpose === ANALYSIS_PURPOSE.JOB_REQUIREMENT_EXTRACTION;
  const isAlignment =
    ctx.analysisPurpose === ANALYSIS_PURPOSE.CANDIDATE_JOB_ALIGNMENT;
  const isReadiness =
    ctx.analysisPurpose === ANALYSIS_PURPOSE.APPLICATION_READINESS;

  await auditSafe(ctx, AuditAction.APPLICATION_INTELLIGENCE_STARTED, {
    status: "STARTED",
    auditAlias: isExtraction
      ? GATE5_EXTRACTION_AUDIT_ALIASES.started
      : isAlignment
        ? GATE6_ALIGNMENT_AUDIT_ALIASES.started
        : isReadiness
          ? GATE7_READINESS_AUDIT_ALIASES.started
          : INTELLIGENCE_AUDIT_ACTIONS.aiAnalysisStarted,
  });

  const freshness = evaluateExecutionFreshness({
    runFreshness: ctx.freshness,
    requirementSetFreshness: ctx.requirementSet?.freshness,
  });

  try {
    if (isExtraction) {
      return await executeRequirementExtractionBranch(ctx, {
        provider,
        options,
        freshness,
        started,
      });
    }

    if (isAlignment) {
      return await executeDeterministicAlignmentBranch(ctx, {
        options,
        freshness,
        started,
      });
    }

    if (isReadiness) {
      return await executeDeterministicReadinessBranch(ctx, {
        options,
        freshness,
        started,
      });
    }

    return await executeGenericAnalyzeJobBranch(ctx, {
      provider,
      options,
      freshness,
      started,
    });
  } catch (error) {
    const failure = classifyFailure(error);
    const next = await failOrRetry(runId, ctx, failure);

    await auditSafe(ctx, AuditAction.APPLICATION_INTELLIGENCE_FAILED, {
      status: next,
      errorCode: failure.code,
      latencyMs: Date.now() - started,
      auditAlias: isExtraction
        ? GATE5_EXTRACTION_AUDIT_ALIASES.failed
        : isAlignment
          ? GATE6_ALIGNMENT_AUDIT_ALIASES.failed
          : isReadiness
            ? GATE7_READINESS_AUDIT_ALIASES.failed
            : INTELLIGENCE_AUDIT_ACTIONS.aiAnalysisFailed,
    });

    logger.info("Intelligence pipeline ended with failure path", {
      event: "INTELLIGENCE_PIPELINE",
      runId,
      provider: provider.providerId,
      model: provider.modelId,
      durationMs: Date.now() - started,
      attemptNumber: ctx.attemptCount,
      finalStatus: next,
      failureCategory: failure.code,
      analysisPurpose: ctx.analysisPurpose,
    });

    return {
      runId,
      status: next,
      errorCode: failure.code,
      durationMs: Date.now() - started,
    };
  }
}

/**
 * Gate 6 — deterministic candidate↔job alignment.
 * MUST NOT call any LLM / provider adapter.
 */
async function executeDeterministicAlignmentBranch(
  ctx: IntelligenceExecutionContext,
  input: {
    options: PipelineExecuteOptions;
    freshness: "CURRENT" | "STALE" | "RECOMPUTE_REQUIRED";
    started: number;
  }
): Promise<PipelineExecuteResult> {
  const { options, freshness, started } = input;

  if (!ctx.candidateId || !ctx.applicationId) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Alignment requires candidate and application scope",
      { retryable: false }
    );
  }
  if (!ctx.requirementSetId || !ctx.requirementSet) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Alignment requires a bound JobRequirementSet for the run snapshot",
      { retryable: false }
    );
  }
  if (ctx.requirementSet.snapshotId !== ctx.snapshotId) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Requirement set is not bound to the run snapshot",
      { retryable: false }
    );
  }

  const [candidate, job, requirementSetRow, runMeta] = await Promise.all([
    loadAlignmentCandidateFacts(prisma, {
      organizationId: ctx.organizationId,
      candidateId: ctx.candidateId,
    }),
    prisma.job.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId },
      select: {
        id: true,
        organizationId: true,
        location: true,
        isRemote: true,
        employmentType: true,
        salaryMin: true,
        salaryMax: true,
        salaryCurrency: true,
        visibility: true,
        ownerCandidateId: true,
      },
    }),
    prisma.jobRequirementSet.findFirst({
      where: {
        id: ctx.requirementSetId,
        organizationId: ctx.organizationId,
        jobId: ctx.jobId,
        snapshotId: ctx.snapshotId,
      },
      select: {
        id: true,
        snapshotId: true,
        freshness: true,
        requirements: true,
      },
    }),
    prisma.applicationIntelligenceRun.findUnique({
      where: { id: ctx.runId },
      select: { createdAt: true, requestedById: true },
    }),
  ]);

  if (!job) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Job not found for alignment",
      { retryable: false }
    );
  }
  if (!requirementSetRow) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Requirement set not found for alignment snapshot",
      { retryable: false }
    );
  }

  const requirements = (Array.isArray(requirementSetRow.requirements)
    ? requirementSetRow.requirements
    : []
  ).map((raw) => StructuredRequirementSchema.parse(raw));

  // Pin asOf to run.createdAt — never wall-clock at execution time.
  const asOf = runMeta?.createdAt ?? new Date(0);

  const alignment = computeDeterministicAlignment({
    requirements,
    requirementSetId: requirementSetRow.id,
    snapshotId: ctx.snapshotId,
    candidate,
    job: {
      jobId: job.id,
      organizationId: job.organizationId,
      location: job.location,
      isRemote: job.isRemote,
      employmentType: job.employmentType,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      visibility: job.visibility as "GLOBAL" | "CANDIDATE_PRIVATE",
      ownerCandidateId: job.ownerCandidateId,
    },
    asOf,
  });

  // Gate 8 — validate explainability chain before persist (no decision mutation).
  const evidencePreview = enrichAlignmentEvidencePayload(
    buildAlignmentEvidencePayload(alignment)
  );
  const evidenceCheck = validateAlignmentEvidenceIntegrity({
    organizationId: ctx.organizationId,
    candidateId: ctx.candidateId,
    jobId: ctx.jobId,
    applicationId: ctx.applicationId,
    snapshotId: ctx.snapshotId,
    requirementSetId: requirementSetRow.id,
    evidence: evidencePreview,
    snapshotText: ctx.snapshot.sourceText,
    allowedRequirementIds: new Set(requirements.map((r) => r.id)),
  });
  if (!evidenceCheck.ok) {
    throw new ProviderError(
      "SCHEMA_VALIDATION_ERROR",
      evidenceCheck.message,
      { retryable: false, details: { code: evidenceCheck.code } }
    );
  }

  const envelope = {
    kind: "alignment" as const,
    analysisPurpose: ANALYSIS_PURPOSE.CANDIDATE_JOB_ALIGNMENT,
    scoringVersion: alignment.scoringVersion,
    normalizationVersion: alignment.normalizationVersion,
    requirementSetId: alignment.requirementSetId,
    snapshotId: alignment.snapshotId,
    candidateFactVersion: alignment.candidateFactVersion,
    overallScore: alignment.overallScore,
    unknownDimensions: alignment.breakdown.unknownDimensions,
    validatedAt: asOf.toISOString(),
    freshness,
    llmCalls: 0,
    explainabilityVersion: evidencePreview.explainabilityVersion,
  };

  let alignmentResultId: string | undefined;
  await prisma.$transaction(async (tx) => {
    const lock = await lockRunningRunForPersist(tx, ctx.runId);
    if (!lock.ok) {
      if (lock.reason === "SUCCEEDED") {
        const existing = await tx.applicationIntelligenceRun.findUnique({
          where: { id: ctx.runId },
          select: { alignmentResult: { select: { id: true } } },
        });
        alignmentResultId = existing?.alignmentResult?.id;
        return;
      }
      throw new ProviderError(
        "PERMANENT_CLIENT_ERROR",
        `Cannot persist: run lease lost (${lock.reason})`,
        { retryable: false }
      );
    }

    const persisted = await persistApplicationAlignmentResult(tx, {
      organizationId: ctx.organizationId,
      applicationId: ctx.applicationId!,
      runId: ctx.runId,
      freshness,
      result: alignment,
      actorUserId: options.actorUserId ?? runMeta?.requestedById,
    });
    alignmentResultId = persisted.id;

    assertValidRunTransition("RUNNING", "SUCCEEDED");
    await tx.applicationIntelligenceRun.update({
      where: { id: ctx.runId },
      data: {
        status: "SUCCEEDED",
        validationStatus: "PASSED",
        validatedPayload: envelope as object,
        freshness,
        completedAt: new Date(),
        leaseExpiresAt: null,
        errorCode: null,
        errorMessage: null,
        // Deterministic path — record null provider semantics
        provider: "deterministic",
        model: "scoring.v1",
      },
    });
  });

  await auditSafe(ctx, AuditAction.APPLICATION_INTELLIGENCE_COMPLETED, {
    status: "SUCCEEDED",
    latencyMs: Date.now() - started,
    alignmentResultId,
    overallScore: alignment.overallScore,
    scoringVersion: alignment.scoringVersion,
    normalizationVersion: alignment.normalizationVersion,
    requirementSetId: alignment.requirementSetId,
    auditAlias: GATE6_ALIGNMENT_AUDIT_ALIASES.completed,
    evidenceAuditAlias: GATE8_EVIDENCE_AUDIT_ALIASES.created,
    explanationAuditAlias: GATE8_EVIDENCE_AUDIT_ALIASES.explanationGenerated,
    llmCalls: 0,
  });

  logger.info("Deterministic alignment pipeline succeeded", {
    event: "INTELLIGENCE_PIPELINE",
    runId: ctx.runId,
    durationMs: Date.now() - started,
    attemptNumber: ctx.attemptCount,
    finalStatus: "SUCCEEDED",
    analysisPurpose: ctx.analysisPurpose,
    overallScore: alignment.overallScore,
    llmCalls: 0,
  });

  return {
    runId: ctx.runId,
    status: "SUCCEEDED",
    durationMs: Date.now() - started,
    requirementSetId: alignment.requirementSetId,
    alignmentResultId,
    overallScore: alignment.overallScore,
  };
}

async function executeRequirementExtractionBranch(
  ctx: IntelligenceExecutionContext,
  input: {
    provider: AIProvider;
    options: PipelineExecuteOptions;
    freshness: "CURRENT" | "STALE" | "RECOMPUTE_REQUIRED";
    started: number;
  }
): Promise<PipelineExecuteResult> {
  const { provider, options, freshness, started } = input;

  // Integrity already checked in load; re-assert before AI (defense in depth).
  assertSnapshotIntegrityForExtraction({
    snapshot: ctx.snapshot,
    expectedJobId: ctx.jobId,
    expectedOrganizationId: ctx.organizationId,
    expectedSnapshotId: ctx.snapshotId,
  });

  const scopedContext = sanitizeProviderScopedContext({
    purpose: ANALYSIS_PURPOSE.JOB_REQUIREMENT_EXTRACTION,
    promptVersion: REQUIREMENT_EXTRACTION_PROMPT.version,
    schemaVersion: REQUIREMENT_EXTRACTION_PROMPT.schemaVersion,
    snapshotId: ctx.snapshotId,
    sourceVersionId: ctx.snapshot.sourceVersionId,
    contentHash: ctx.snapshot.contentHash,
    // Full JD text capped by context-guard size — never candidate fields
    jdText: ctx.snapshot.sourceText.slice(0, 20_000),
    promptSystem: REQUIREMENT_EXTRACTION_PROMPT.system,
  });
  assertJobOnlyExtractionContext(scopedContext);

  if (ctx.candidateId != null || ctx.applicationId != null) {
    throw new ProviderError(
      "CONTEXT_BOUNDARY_VIOLATION",
      "Extraction run must not carry candidate/application ids",
      { retryable: false }
    );
  }

  const execution = await executeProviderWithGuards(
    provider,
    {
      organizationId: ctx.organizationId,
      actorUserId: options.actorUserId ?? ctx.organizationId,
      ip: options.ip ?? "0.0.0.0",
      purpose: "extract_requirements",
      jobId: ctx.jobId,
      snapshotId: ctx.snapshotId,
      sourceDataVersion: `${ctx.sourceDataVersion}|attempt:${ctx.attemptCount}`,
      skipDuplicateSuppression: true,
      knownEntityIds: new Set(),
    },
    () =>
      provider.extractRequirements({
        kind: "extract_requirements",
        organizationId: ctx.organizationId,
        jobId: ctx.jobId,
        snapshotId: ctx.snapshotId,
        scopedContext,
      })
  );

  const validated =
    execution.validated ??
    validateUntrustedProviderResponse(execution.response, new Set());

  if (validated.kind !== "requirements") {
    throw new ProviderError(
      "SCHEMA_VALIDATION_ERROR",
      "Extraction provider must return kind=requirements",
      { retryable: false }
    );
  }

  const requirements = postProcessExtractionOutput({
    snapshotId: ctx.snapshotId,
    snapshotText: ctx.snapshot.sourceText,
    output: validated.data,
  });

  // Stale stamp: still persist bound to THIS snapshot, never rebind to newer JD.
  const envelope = {
    kind: "requirements" as const,
    providerId: validated.providerId,
    modelId: validated.modelId,
    requestId: validated.requestId ?? null,
    validatedAt: new Date().toISOString(),
    freshness,
    analysisPurpose: ANALYSIS_PURPOSE.JOB_REQUIREMENT_EXTRACTION,
    promptVersion: ctx.promptVersion,
    schemaVersion: ctx.schemaVersion,
    requirementCount: requirements.length,
    data: validated.data,
  };

  let requirementSetId: string | undefined;
  await prisma.$transaction(async (tx) => {
    const lock = await lockRunningRunForPersist(tx, ctx.runId);
    if (!lock.ok) {
      if (lock.reason === "SUCCEEDED") {
        const existing = await tx.applicationIntelligenceRun.findUnique({
          where: { id: ctx.runId },
          select: { requirementSetId: true },
        });
        requirementSetId = existing?.requirementSetId ?? undefined;
        return;
      }
      throw new ProviderError(
        "PERMANENT_CLIENT_ERROR",
        `Cannot persist: run lease lost (${lock.reason})`,
        { retryable: false }
      );
    }

    const actorUserId =
      options.actorUserId ??
      (
        await tx.applicationIntelligenceRun.findUnique({
          where: { id: ctx.runId },
          select: { requestedById: true },
        })
      )?.requestedById;

    if (!actorUserId) {
      throw new ProviderError(
        "PERMANENT_CLIENT_ERROR",
        "Extraction persistence requires requestedBy actor",
        { retryable: false }
      );
    }

    const persisted = await persistExtractionRequirementSet(tx, {
      organizationId: ctx.organizationId,
      jobId: ctx.jobId,
      snapshotId: ctx.snapshotId,
      runId: ctx.runId,
      actorUserId,
      requirements,
    });
    requirementSetId = persisted.requirementSetId;

    assertValidRunTransition("RUNNING", "SUCCEEDED");
    await tx.applicationIntelligenceRun.update({
      where: { id: ctx.runId },
      data: {
        status: "SUCCEEDED",
        validationStatus: "PASSED",
        validatedPayload: envelope as object,
        providerRequestId: execution.response.requestId ?? null,
        provider: provider.providerId,
        model: provider.modelId,
        freshness,
        completedAt: new Date(),
        leaseExpiresAt: null,
        errorCode: null,
        errorMessage: null,
        requirementSetId: persisted.requirementSetId,
      },
    });
  });

  await auditSafe(ctx, AuditAction.APPLICATION_INTELLIGENCE_COMPLETED, {
    status: "SUCCEEDED",
    requestId: execution.response.requestId,
    latencyMs: Date.now() - started,
    requirementSetId,
    requirementCount: requirements.length,
    auditAlias: GATE5_EXTRACTION_AUDIT_ALIASES.completed,
  });

  logger.info("Requirement extraction pipeline succeeded", {
    event: "INTELLIGENCE_PIPELINE",
    runId: ctx.runId,
    provider: provider.providerId,
    model: provider.modelId,
    durationMs: Date.now() - started,
    attemptNumber: ctx.attemptCount,
    finalStatus: "SUCCEEDED",
    analysisPurpose: ctx.analysisPurpose,
    requirementSetId,
  });

  return {
    runId: ctx.runId,
    status: "SUCCEEDED",
    durationMs: Date.now() - started,
    requirementSetId,
  };
}

/**
 * Gate 7 — deterministic application readiness advisory.
 * MUST NOT call any LLM / provider adapter.
 * MUST NOT mutate Application.status / QA / approval / materials.
 */
async function executeDeterministicReadinessBranch(
  ctx: IntelligenceExecutionContext,
  input: {
    options: PipelineExecuteOptions;
    freshness: "CURRENT" | "STALE" | "RECOMPUTE_REQUIRED";
    started: number;
  }
): Promise<PipelineExecuteResult> {
  const { freshness, started } = input;

  if (!ctx.candidateId || !ctx.applicationId) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Readiness requires candidate and application scope",
      { retryable: false }
    );
  }
  if (!ctx.requirementSetId) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Readiness requires a bound JobRequirementSet",
      { retryable: false }
    );
  }

  const view = await loadReadinessInputView(prisma, {
    organizationId: ctx.organizationId,
    applicationId: ctx.applicationId,
    candidateId: ctx.candidateId,
    jobId: ctx.jobId,
    requirementSetId: ctx.requirementSetId,
    snapshotId: ctx.snapshotId,
  });

  const readiness = computeDeterministicReadiness(view);

  const readinessCheck = validateReadinessEvidenceIntegrity({
    organizationId: ctx.organizationId,
    candidateId: ctx.candidateId,
    applicationId: ctx.applicationId,
    jobId: ctx.jobId,
    alignmentResultId: view.alignment.id,
    requirementSetId: view.requirementSet.id,
    snapshotId: ctx.snapshotId,
    result: readiness,
  });
  if (!readinessCheck.ok) {
    throw new ProviderError(
      "SCHEMA_VALIDATION_ERROR",
      readinessCheck.message,
      { retryable: false, details: { code: readinessCheck.code } }
    );
  }

  const envelope = {
    kind: "readiness" as const,
    analysisPurpose: ANALYSIS_PURPOSE.APPLICATION_READINESS,
    readinessVersion: readiness.readinessVersion,
    readinessState: readiness.readinessState,
    blockerCount: readiness.blockers.length,
    warningCount: readiness.warnings.length,
    unknownCount: readiness.unknowns.length,
    alignmentResultId: readiness.evidence.alignmentResultId,
    requirementSetId: readiness.evidence.requirementSetId,
    snapshotId: readiness.evidence.snapshotId,
    scoringVersion: readiness.evidence.scoringVersion,
    freshness,
    llmCalls: 0,
    explainabilityVersion: "explainability.v1",
  };

  let readinessResultId: string | undefined;
  await prisma.$transaction(async (tx) => {
    const lock = await lockRunningRunForPersist(tx, ctx.runId);
    if (!lock.ok) {
      if (lock.reason === "SUCCEEDED") {
        const existing = await tx.applicationIntelligenceRun.findUnique({
          where: { id: ctx.runId },
          select: { readinessResult: { select: { id: true } } },
        });
        readinessResultId = existing?.readinessResult?.id;
        return;
      }
      throw new ProviderError(
        "PERMANENT_CLIENT_ERROR",
        `Cannot persist: run lease lost (${lock.reason})`,
        { retryable: false }
      );
    }

    const persisted = await persistApplicationReadinessResult(tx, {
      organizationId: ctx.organizationId,
      applicationId: ctx.applicationId!,
      runId: ctx.runId,
      freshness,
      result: readiness,
    });
    readinessResultId = persisted.id;

    assertValidRunTransition("RUNNING", "SUCCEEDED");
    await tx.applicationIntelligenceRun.update({
      where: { id: ctx.runId },
      data: {
        status: "SUCCEEDED",
        validationStatus: "PASSED",
        validatedPayload: envelope as object,
        freshness,
        completedAt: new Date(),
        leaseExpiresAt: null,
        errorCode: null,
        errorMessage: null,
        provider: "deterministic",
        model: "readiness.v1",
      },
    });
  });

  const completedAlias =
    readiness.readinessState === "BLOCKED"
      ? GATE7_READINESS_AUDIT_ALIASES.blocked
      : readiness.readinessState === "REVIEW_REQUIRED"
        ? GATE7_READINESS_AUDIT_ALIASES.reviewRequired
        : GATE7_READINESS_AUDIT_ALIASES.completed;

  await auditSafe(ctx, AuditAction.APPLICATION_INTELLIGENCE_COMPLETED, {
    status: "SUCCEEDED",
    latencyMs: Date.now() - started,
    readinessResultId,
    readinessState: readiness.readinessState,
    readinessVersion: readiness.readinessVersion,
    alignmentResultId: readiness.evidence.alignmentResultId,
    requirementSetId: readiness.evidence.requirementSetId,
    auditAlias: completedAlias,
    evidenceAuditAlias: GATE8_EVIDENCE_AUDIT_ALIASES.validated,
    explanationAuditAlias: GATE8_EVIDENCE_AUDIT_ALIASES.explanationGenerated,
    llmCalls: 0,
  });

  logger.info("Deterministic readiness pipeline succeeded", {
    event: "INTELLIGENCE_PIPELINE",
    runId: ctx.runId,
    durationMs: Date.now() - started,
    attemptNumber: ctx.attemptCount,
    finalStatus: "SUCCEEDED",
    analysisPurpose: ctx.analysisPurpose,
    readinessState: readiness.readinessState,
    llmCalls: 0,
  });

  return {
    runId: ctx.runId,
    status: "SUCCEEDED",
    durationMs: Date.now() - started,
    requirementSetId: readiness.evidence.requirementSetId,
    alignmentResultId: readiness.evidence.alignmentResultId,
    readinessResultId,
    readinessState: readiness.readinessState,
  };
}

async function executeGenericAnalyzeJobBranch(
  ctx: IntelligenceExecutionContext,
  input: {
    provider: AIProvider;
    options: PipelineExecuteOptions;
    freshness: "CURRENT" | "STALE" | "RECOMPUTE_REQUIRED";
    started: number;
  }
): Promise<PipelineExecuteResult> {
  const { provider, options, freshness, started } = input;

  const scopedContext = sanitizeProviderScopedContext({
    purpose: "pipeline_execution",
    snapshotId: ctx.snapshotId,
    sourceVersionId: ctx.snapshot.sourceVersionId,
    contentHash: ctx.snapshot.contentHash,
    jdExcerpt: ctx.snapshot.sourceText.slice(0, 1500),
  });

  const execution = await executeProviderWithGuards(
    provider,
    {
      organizationId: ctx.organizationId,
      actorUserId: options.actorUserId ?? ctx.organizationId,
      ip: options.ip ?? "0.0.0.0",
      purpose: "analyze_job",
      applicationId: ctx.applicationId ?? undefined,
      candidateId: ctx.candidateId ?? undefined,
      jobId: ctx.jobId,
      snapshotId: ctx.snapshotId,
      sourceDataVersion: `${ctx.sourceDataVersion}|attempt:${ctx.attemptCount}`,
      skipDuplicateSuppression: true,
      knownEntityIds: options.knownEntityIds ?? new Set(),
    },
    () =>
      provider.analyzeJob({
        kind: "analyze_job",
        organizationId: ctx.organizationId,
        jobId: ctx.jobId,
        snapshotId: ctx.snapshotId,
        scopedContext,
        ...(ctx.candidateId ? { candidateId: ctx.candidateId } : {}),
        ...(ctx.applicationId ? { applicationId: ctx.applicationId } : {}),
      })
  );

  const validated =
    execution.validated ??
    validateUntrustedProviderResponse(
      execution.response,
      options.knownEntityIds ?? new Set()
    );

  const envelope = {
    kind: validated.kind,
    providerId: validated.providerId,
    modelId: validated.modelId,
    requestId: validated.requestId ?? null,
    validatedAt: new Date().toISOString(),
    freshness,
    data: validated.data,
  };

  await persistSuccessfulRun(ctx.runId, {
    envelope,
    providerRequestId: execution.response.requestId ?? null,
    providerId: provider.providerId,
    modelId: provider.modelId,
    freshness,
  });

  await auditSafe(ctx, AuditAction.APPLICATION_INTELLIGENCE_COMPLETED, {
    status: "SUCCEEDED",
    requestId: execution.response.requestId,
    latencyMs: Date.now() - started,
    auditAlias: INTELLIGENCE_AUDIT_ACTIONS.aiAnalysisSucceeded,
  });

  logger.info("Intelligence pipeline succeeded", {
    event: "INTELLIGENCE_PIPELINE",
    runId: ctx.runId,
    provider: provider.providerId,
    model: provider.modelId,
    durationMs: Date.now() - started,
    attemptNumber: ctx.attemptCount,
    finalStatus: "SUCCEEDED",
  });

  return {
    runId: ctx.runId,
    status: "SUCCEEDED",
    durationMs: Date.now() - started,
  };
}

async function persistSuccessfulRun(
  runId: string,
  input: {
    envelope: Record<string, unknown>;
    providerRequestId: string | null;
    providerId: string;
    modelId: string;
    freshness: "CURRENT" | "STALE" | "RECOMPUTE_REQUIRED";
  }
): Promise<void> {
  assertValidRunTransition("RUNNING", "SUCCEEDED");
  await prisma.$transaction(async (tx) => {
    const lock = await lockRunningRunForPersist(tx, runId);
    if (!lock.ok) {
      if (lock.reason === "SUCCEEDED") return;
      throw new ProviderError(
        "PERMANENT_CLIENT_ERROR",
        `Cannot persist: run lease lost (${lock.reason})`,
        { retryable: false }
      );
    }
    await tx.applicationIntelligenceRun.update({
      where: { id: runId },
      data: {
        status: "SUCCEEDED",
        validationStatus: "PASSED",
        validatedPayload: input.envelope as object,
        providerRequestId: input.providerRequestId,
        provider: input.providerId,
        model: input.modelId,
        freshness: input.freshness,
        completedAt: new Date(),
        leaseExpiresAt: null,
        errorCode: null,
        errorMessage: null,
      },
    });
  });
}

async function failOrRetry(
  runId: string,
  ctx: IntelligenceExecutionContext,
  failure: { code: string; message: string; retryable: boolean }
): Promise<"FAILED" | "RETRY_PENDING"> {
  const shouldRetry =
    failure.retryable && ctx.attemptCount < ctx.maxAttempts;
  const next = shouldRetry ? "RETRY_PENDING" : "FAILED";
  assertValidRunTransition("RUNNING", next);
  const applied = await transitionRunningRunFailure(runId, next, failure);
  if (!applied) {
    const current = await prisma.applicationIntelligenceRun.findUnique({
      where: { id: runId },
      select: { status: true },
    });
    if (current?.status === "RETRY_PENDING") return "RETRY_PENDING";
    if (current?.status === "FAILED") return "FAILED";
    // SUCCEEDED / QUEUED / RUNNING after lost race — never invent success here
    return "FAILED";
  }
  return next;
}

async function failRun(
  runId: string,
  code: string,
  message: string,
  fromRunning: boolean
): Promise<void> {
  if (fromRunning) {
    assertValidRunTransition("RUNNING", "FAILED");
    await transitionRunningRunFailure(runId, "FAILED", { code, message });
    return;
  }
  // Non-running failure path is reserved for RETRY_PENDING → FAILED only.
  assertValidRunTransition("RETRY_PENDING", "FAILED");
  await prisma.applicationIntelligenceRun.updateMany({
    where: { id: runId, status: "RETRY_PENDING" },
    data: {
      status: "FAILED",
      validationStatus: "FAILED",
      errorCode: code.slice(0, 64),
      errorMessage: message.slice(0, 500),
      leaseExpiresAt: null,
      completedAt: new Date(),
    },
  });
}

async function auditSafe(
  ctx: IntelligenceExecutionContext,
  action: AuditAction,
  extra: Record<string, unknown>
): Promise<void> {
  try {
    await logSystemAuditEvent({
      organizationId: ctx.organizationId,
      actorType: "SYSTEM",
      action,
      entityType: "ApplicationIntelligenceRun",
      entityId: ctx.runId,
      details: sanitizeIntelligenceAuditDetails({
        runId: ctx.runId,
        applicationId: ctx.applicationId,
        candidateId: ctx.candidateId,
        jobId: ctx.jobId,
        snapshotId: ctx.snapshotId,
        provider: ctx.provider,
        model: ctx.model,
        schemaVersion: ctx.schemaVersion,
        promptVersion: ctx.promptVersion,
        analysisPurpose: ctx.analysisPurpose,
        ...extra,
      }),
    });
  } catch {
    // Audit must not break execution completion paths
  }
}
