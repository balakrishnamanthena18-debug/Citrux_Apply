import { EXPERIMENTAL_PROVIDER_ID } from "../constants";
import type { AIProvider } from "./interface";
import type {
  AnalyzeCandidateFitRequest,
  AnalyzeJobRequest,
  ExtractRequirementsRequest,
  GenerateApplicationInsightsRequest,
  StructuredAIProviderResponse,
} from "./types";
import { ProviderError } from "./errors";

/**
 * Deterministic test provider. Never used in production registration.
 * Returns schema-valid structured payloads without network I/O.
 */
export class MockAIProvider implements AIProvider {
  readonly providerId = "mock";
  readonly modelId = "mock-model";

  constructor(
    private readonly mode:
      | "valid_requirements"
      | "valid_alignment"
      | "malformed"
      | "truth_fail"
      | "timeout"
      | "rate_limited"
      | "server_error" = "valid_requirements"
  ) {}

  async analyzeJob(
    request: AnalyzeJobRequest
  ): Promise<StructuredAIProviderResponse> {
    return this.respond(request.snapshotId, request.scopedContext);
  }

  async extractRequirements(
    request: ExtractRequirementsRequest
  ): Promise<StructuredAIProviderResponse> {
    return this.respond(request.snapshotId, request.scopedContext);
  }

  async analyzeCandidateFit(
    request: AnalyzeCandidateFitRequest
  ): Promise<StructuredAIProviderResponse> {
    return this.respond(request.snapshotId, request.scopedContext);
  }

  async generateApplicationInsights(
    request: GenerateApplicationInsightsRequest
  ): Promise<StructuredAIProviderResponse> {
    return this.respond(request.snapshotId, request.scopedContext);
  }

  private async respond(
    snapshotId: string,
    scopedContext?: Record<string, unknown>
  ): Promise<StructuredAIProviderResponse> {
    if (this.mode === "timeout") {
      throw new ProviderError("TIMEOUT", "mock timeout", { retryable: true });
    }
    if (this.mode === "rate_limited") {
      throw new ProviderError("RATE_LIMITED", "mock 429", {
        retryable: true,
        httpStatus: 429,
      });
    }
    if (this.mode === "server_error") {
      throw new ProviderError("PROVIDER_ERROR", "mock 500", {
        retryable: true,
        httpStatus: 500,
      });
    }
    if (this.mode === "malformed") {
      return {
        providerId: this.providerId,
        modelId: this.modelId,
        payload: { not: "a valid schema" },
        requestId: "mock-req",
      };
    }
    if (this.mode === "truth_fail") {
      return {
        providerId: this.providerId,
        modelId: this.modelId,
        requestId: "mock-req",
        payload: {
          kind: "alignment",
          fitItems: [
            {
              label: "Invented",
              category: "REQUIRED_SKILLS",
              status: "MATCHED",
              evidence: [
                {
                  entityType: "CandidateSkill",
                  entityId: "99999999-9999-4999-8999-999999999999",
                  provenance: "CANDIDATE_PROVIDED",
                  summary: "fabricated",
                },
              ],
            },
          ],
          dimensionScores: [],
        },
      };
    }
    if (this.mode === "valid_alignment") {
      return {
        providerId: this.providerId,
        modelId: this.modelId,
        requestId: "mock-req",
        payload: {
          kind: "alignment",
          fitItems: [
            {
              label: "Unknown skill",
              category: "REQUIRED_SKILLS",
              status: "UNKNOWN",
              evidence: [],
            },
          ],
          dimensionScores: [],
        },
      };
    }

    // valid_requirements — evidence must appear in provided JD text when present
    void snapshotId;
    void EXPERIMENTAL_PROVIDER_ID;
    const jdText = String(
      scopedContext?.jdText ?? scopedContext?.jdExcerpt ?? "TypeScript"
    );
    const evidence =
      jdText.toLowerCase().includes("typescript")
        ? "TypeScript"
        : jdText.slice(0, Math.min(40, jdText.length)).trim() || "TypeScript";
    const value = jdText.toLowerCase().includes("typescript")
      ? "TypeScript"
      : evidence;

    return {
      providerId: this.providerId,
      modelId: this.modelId,
      requestId: "mock-req",
      latencyMs: 1,
      payload: {
        kind: "requirements",
        requirements: [
          {
            category: "REQUIRED_SKILL",
            value,
            importance: "REQUIRED",
            confidence: 0.9,
            sourceEvidence: evidence,
          },
        ],
      },
    };
  }
}
