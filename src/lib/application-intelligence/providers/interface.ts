import type {
  AnalyzeCandidateFitRequest,
  AnalyzeJobRequest,
  ExtractRequirementsRequest,
  GenerateApplicationInsightsRequest,
  StructuredAIProviderResponse,
} from "./types";

/**
 * Provider-agnostic AI interface.
 * Application domain must depend on this interface only — never a vendor SDK.
 *
 * Implementations must return structured payloads; callers must Zod-validate
 * and truth-validate before any persistence.
 */
export interface AIProvider {
  readonly providerId: string;
  readonly modelId: string;

  analyzeJob(request: AnalyzeJobRequest): Promise<StructuredAIProviderResponse>;
  extractRequirements(
    request: ExtractRequirementsRequest
  ): Promise<StructuredAIProviderResponse>;
  analyzeCandidateFit(
    request: AnalyzeCandidateFitRequest
  ): Promise<StructuredAIProviderResponse>;
  generateApplicationInsights(
    request: GenerateApplicationInsightsRequest
  ): Promise<StructuredAIProviderResponse>;
}
