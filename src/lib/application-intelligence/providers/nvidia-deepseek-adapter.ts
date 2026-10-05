import {
  EXPERIMENTAL_MODEL_ID,
  EXPERIMENTAL_PROVIDER_ID,
  INTELLIGENCE_PROMPT_VERSION,
  INTELLIGENCE_SCHEMA_VERSION,
} from "../constants";
import { REQUIREMENT_EXTRACTION_PROMPT } from "../prompts/requirement-extraction";
import { sanitizeProviderScopedContext } from "./context-guard";
import { ProviderError } from "./errors";
import { postChatCompletion, type ProviderHttpClientOptions } from "./http";
import type { AIProvider } from "./interface";
import type { NvidiaProviderConfig } from "./config";
import type {
  AnalyzeCandidateFitRequest,
  AnalyzeJobRequest,
  ExtractRequirementsRequest,
  GenerateApplicationInsightsRequest,
  ProviderProbeRequest,
  StructuredAIProviderResponse,
} from "./types";

/**
 * DeepSeek-V4-Flash via NVIDIA NIM (OpenAI-compatible chat completions).
 *
 * Domain code must never import this module directly — use AIService /
 * createConfiguredAIProvider only.
 *
 * Gate 3: infrastructure only. Feature pipelines (extraction/alignment/readiness)
 * must not be wired into application actions until later gates.
 */
export class NvidiaDeepSeekAdapter implements AIProvider {
  readonly providerId = EXPERIMENTAL_PROVIDER_ID;
  readonly modelId: string;
  private readonly http: ProviderHttpClientOptions;

  constructor(
    config: NvidiaProviderConfig,
    options?: { fetchImpl?: typeof fetch }
  ) {
    this.modelId = config.modelId || EXPERIMENTAL_MODEL_ID;
    this.http = {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
      fetchImpl: options?.fetchImpl,
    };
  }

  async analyzeJob(
    request: AnalyzeJobRequest
  ): Promise<StructuredAIProviderResponse> {
    return this.structuredCall({
      purpose: "analyze_job",
      organizationId: request.organizationId,
      jobId: request.jobId,
      snapshotId: request.snapshotId,
      scopedContext: request.scopedContext,
      system: `You are an untrusted analysis assistant. Return ONLY valid JSON matching schema ${INTELLIGENCE_SCHEMA_VERSION} kind=alignment-prep. Do not invent candidate facts. Do not include secrets.`,
      user: buildScopedUserPrompt("analyze_job", request.scopedContext, {
        organizationId: request.organizationId,
        jobId: request.jobId,
        snapshotId: request.snapshotId,
      }),
    });
  }

  async extractRequirements(
    request: ExtractRequirementsRequest
  ): Promise<StructuredAIProviderResponse> {
    const jdText = String(
      request.scopedContext.jdText ??
        request.scopedContext.jdExcerpt ??
        request.scopedContext.jobDescription ??
        ""
    );
    const user = REQUIREMENT_EXTRACTION_PROMPT.buildUserPayload({
      snapshotId: request.snapshotId,
      sourceVersionId: String(request.scopedContext.sourceVersionId ?? ""),
      contentHash: String(request.scopedContext.contentHash ?? ""),
      jdText,
    });
    return this.structuredCall({
      purpose: "extract_requirements",
      organizationId: request.organizationId,
      jobId: request.jobId,
      snapshotId: request.snapshotId,
      scopedContext: request.scopedContext,
      system: REQUIREMENT_EXTRACTION_PROMPT.system,
      user,
    });
  }

  async analyzeCandidateFit(
    request: AnalyzeCandidateFitRequest
  ): Promise<StructuredAIProviderResponse> {
    return this.structuredCall({
      purpose: "analyze_candidate_fit",
      organizationId: request.organizationId,
      jobId: request.jobId,
      snapshotId: request.snapshotId,
      scopedContext: request.scopedContext,
      system: `You assist with candidate-job fit suggestions as JSON only (kind=alignment). You must not invent candidate entities. Unknown remains UNKNOWN. Schema ${INTELLIGENCE_SCHEMA_VERSION}.`,
      user: buildScopedUserPrompt("analyze_candidate_fit", request.scopedContext, {
        organizationId: request.organizationId,
        jobId: request.jobId,
        snapshotId: request.snapshotId,
        candidateId: request.candidateId,
        applicationId: request.applicationId,
      }),
    });
  }

  async generateApplicationInsights(
    request: GenerateApplicationInsightsRequest
  ): Promise<StructuredAIProviderResponse> {
    return this.structuredCall({
      purpose: "generate_application_insights",
      organizationId: request.organizationId,
      jobId: request.jobId,
      snapshotId: request.snapshotId,
      scopedContext: request.scopedContext,
      system: `You generate advisory application insights as JSON only (kind=readiness). Never mutate status, QA, approval, or submission. Schema ${INTELLIGENCE_SCHEMA_VERSION}.`,
      user: buildScopedUserPrompt(
        "generate_application_insights",
        request.scopedContext,
        {
          organizationId: request.organizationId,
          jobId: request.jobId,
          snapshotId: request.snapshotId,
          candidateId: request.candidateId,
          applicationId: request.applicationId,
        }
      ),
    });
  }

  /**
   * Synthetic connectivity probe — no candidate/job/application intelligence.
   */
  async probeConnectivity(
    request: ProviderProbeRequest
  ): Promise<StructuredAIProviderResponse> {
    if (request.kind !== "provider_probe") {
      throw new ProviderError(
        "PERMANENT_CLIENT_ERROR",
        "Invalid probe request",
        { retryable: false }
      );
    }
    if (!request.syntheticPrompt.trim()) {
      throw new ProviderError(
        "PERMANENT_CLIENT_ERROR",
        "Synthetic probe prompt is required",
        { retryable: false }
      );
    }
    // Hard reject accidental intelligence payloads in probe path.
    if (
      /candidate|application|salary|resume|ssn|passport/i.test(
        request.syntheticPrompt
      )
    ) {
      throw new ProviderError(
        "CONTEXT_BOUNDARY_VIOLATION",
        "Probe prompt must be synthetic-only",
        { retryable: false }
      );
    }

    const result = await postChatCompletion(this.http, {
      model: this.modelId,
      temperature: 0,
      top_p: 1,
      max_tokens: 256,
      reasoning_effort: "none",
      messages: [
        {
          role: "system",
          content:
            "Return ONLY a compact JSON object. No markdown. No candidate or job data.",
        },
        { role: "user", content: request.syntheticPrompt },
      ],
    });

    return {
      providerId: this.providerId,
      modelId: this.modelId,
      payload: parseJsonContent(result.content),
      rawText: result.content,
      requestId: result.requestId,
      usage: result.usage,
      latencyMs: result.latencyMs,
    };
  }

  private async structuredCall(input: {
    purpose: string;
    organizationId: string;
    jobId: string;
    snapshotId: string;
    scopedContext: Record<string, unknown>;
    system: string;
    user: string;
  }): Promise<StructuredAIProviderResponse> {
    const scoped = sanitizeProviderScopedContext(input.scopedContext);
    const result = await postChatCompletion(this.http, {
      model: this.modelId,
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: 4096,
      reasoning_effort: "none",
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
    });

    return {
      providerId: this.providerId,
      modelId: this.modelId,
      payload: parseJsonContent(result.content),
      rawText: result.content,
      requestId: result.requestId,
      usage: result.usage,
      latencyMs: result.latencyMs,
    };
  }
}

function buildScopedUserPrompt(
  purpose: string,
  scopedContext: Record<string, unknown>,
  ids: Record<string, string>
): string {
  return JSON.stringify({
    purpose,
    ids,
    scopedContext,
    instructions:
      "Respond with a single JSON object only. No markdown fences. No secrets.",
  });
}

export function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    throw new ProviderError(
      "INVALID_RESPONSE",
      "AI provider returned content that is not valid JSON",
      { retryable: false, details: { contentSnippet: candidate.slice(0, 120) } }
    );
  }
}
