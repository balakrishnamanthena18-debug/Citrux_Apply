import crypto from "crypto";
import { checkAiGenerationRateLimit } from "@/lib/security/abuse-protection";
import {
  INTELLIGENCE_PROMPT_VERSION,
  INTELLIGENCE_SCHEMA_VERSION,
} from "../constants";
import {
  INTELLIGENCE_AUDIT_ACTIONS,
  sanitizeIntelligenceAuditDetails,
} from "../audit-contract";
import { ProviderError } from "./errors";
import type { AIProvider } from "./interface";
import type {
  ProviderInvocationPurpose,
  StructuredAIProviderResponse,
} from "./types";
import { validateUntrustedProviderResponse } from "./validate-response";

export type ProviderExecutionMeta = {
  organizationId: string;
  actorUserId?: string | null;
  ip?: string;
  purpose: ProviderInvocationPurpose;
  applicationId?: string;
  candidateId?: string;
  jobId?: string;
  snapshotId?: string;
  sourceDataVersion?: string;
  /** When true, skip Zod/truth validation (probe-only). */
  skipIntelligenceValidation?: boolean;
  /** Worker retries must not be blocked by the short in-process window. */
  skipDuplicateSuppression?: boolean;
  knownEntityIds?: Set<string>;
};

export type ProviderExecutionResult = {
  response: StructuredAIProviderResponse;
  validated?: ReturnType<typeof validateUntrustedProviderResponse>;
  idempotencyKey: string;
  audit: {
    requested: string;
    started: string;
    succeeded: string;
    failed: string;
  };
};

const recentInvocations = new Map<string, number>();
const IDEMPOTENCY_WINDOW_MS = 15_000;

/**
 * Idempotency key aligned with ApplicationIntelligenceRun identity factors.
 */
export function buildProviderInvocationKey(parts: {
  purpose: string;
  snapshotId?: string;
  sourceDataVersion?: string;
  providerId: string;
  modelId: string;
  schemaVersion?: string;
  promptVersion?: string;
  applicationId?: string;
}): string {
  const material = [
    parts.purpose,
    parts.applicationId ?? "",
    parts.snapshotId ?? "",
    parts.sourceDataVersion ?? "",
    parts.providerId,
    parts.modelId,
    parts.schemaVersion ?? INTELLIGENCE_SCHEMA_VERSION,
    parts.promptVersion ?? INTELLIGENCE_PROMPT_VERSION,
  ].join("|");
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 64);
}

export function assertProviderInvocationNotDuplicate(
  idempotencyKey: string,
  now = Date.now()
): void {
  const prev = recentInvocations.get(idempotencyKey);
  if (prev != null && now - prev < IDEMPOTENCY_WINDOW_MS) {
    throw new ProviderError(
      "RATE_LIMITED",
      "Duplicate AI provider invocation suppressed by idempotency window",
      { retryable: false, details: { idempotencyKey } }
    );
  }
  recentInvocations.set(idempotencyKey, now);
  // Opportunistic cleanup
  if (recentInvocations.size > 500) {
    for (const [k, ts] of recentInvocations) {
      if (now - ts > IDEMPOTENCY_WINDOW_MS) recentInvocations.delete(k);
    }
  }
}

/** Test helper */
export function __resetProviderIdempotencyWindowForTests(): void {
  recentInvocations.clear();
}

/**
 * Rate-limit + idempotency + invoke + optional Zod/truth validation.
 * Does NOT persist. Does NOT mutate Application/Candidate.
 */
export async function executeProviderWithGuards(
  provider: AIProvider,
  meta: ProviderExecutionMeta,
  invoke: () => Promise<StructuredAIProviderResponse>
): Promise<ProviderExecutionResult> {
  const rate = await checkAiGenerationRateLimit({
    userId: meta.actorUserId,
    ip: meta.ip ?? "0.0.0.0",
  });
  if (!rate.allowed) {
    throw new ProviderError("RATE_LIMITED", "AI generation rate limit exceeded", {
      retryable: true,
      details: { retryAfterSeconds: rate.retryAfterSeconds },
    });
  }

  const idempotencyKey = buildProviderInvocationKey({
    purpose: meta.purpose,
    snapshotId: meta.snapshotId,
    sourceDataVersion: meta.sourceDataVersion,
    providerId: provider.providerId,
    modelId: provider.modelId,
    applicationId: meta.applicationId,
  });
  if (!meta.skipDuplicateSuppression) {
    assertProviderInvocationNotDuplicate(idempotencyKey);
  }

  const audit = {
    requested: INTELLIGENCE_AUDIT_ACTIONS.aiAnalysisRequested,
    started: INTELLIGENCE_AUDIT_ACTIONS.aiAnalysisStarted,
    succeeded: INTELLIGENCE_AUDIT_ACTIONS.aiAnalysisSucceeded,
    failed: INTELLIGENCE_AUDIT_ACTIONS.aiAnalysisFailed,
  };

  try {
    const response = await invoke();
    const validated = meta.skipIntelligenceValidation
      ? undefined
      : validateUntrustedProviderResponse(
          response,
          meta.knownEntityIds ?? new Set()
        );

    return { response, validated, idempotencyKey, audit };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("PROVIDER_ERROR", "AI provider execution failed", {
      retryable: false,
      cause: error,
    });
  }
}

export function buildSafeProviderAuditDetails(input: {
  organizationId: string;
  purpose: string;
  providerId: string;
  modelId: string;
  status: "REQUESTED" | "STARTED" | "SUCCEEDED" | "FAILED";
  applicationId?: string;
  candidateId?: string;
  jobId?: string;
  snapshotId?: string;
  requestId?: string | null;
  errorCode?: string;
  latencyMs?: number;
}): Record<string, unknown> {
  return sanitizeIntelligenceAuditDetails({
    organizationId: input.organizationId,
    purpose: input.purpose,
    provider: input.providerId,
    model: input.modelId,
    status: input.status,
    applicationId: input.applicationId,
    candidateId: input.candidateId,
    jobId: input.jobId,
    snapshotId: input.snapshotId,
    requestId: input.requestId ?? undefined,
    errorCode: input.errorCode,
    latencyMs: input.latencyMs,
    schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
    promptVersion: INTELLIGENCE_PROMPT_VERSION,
  });
}
