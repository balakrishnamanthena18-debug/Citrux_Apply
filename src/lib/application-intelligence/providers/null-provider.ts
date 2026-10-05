import { NULL_MODEL_ID, NULL_PROVIDER_ID } from "../constants";
import { ProviderError } from "./errors";
import type { AIProvider } from "./interface";
import type {
  AnalyzeCandidateFitRequest,
  AnalyzeJobRequest,
  ExtractRequirementsRequest,
  GenerateApplicationInsightsRequest,
  StructuredAIProviderResponse,
} from "./types";

/**
 * Non-executing provider for tests and local development without credentials.
 * Never performs network I/O. Never fabricates production intelligence.
 */
export class NullAIProvider implements AIProvider {
  readonly providerId = NULL_PROVIDER_ID;
  readonly modelId = NULL_MODEL_ID;

  private reject(operation: string): never {
    throw new ProviderError(
      "CONFIGURATION_REQUIRED",
      `NullAIProvider refuses AI execution (${operation})`,
      { retryable: false, details: { operation } }
    );
  }

  async analyzeJob(_request: AnalyzeJobRequest): Promise<StructuredAIProviderResponse> {
    this.reject("analyzeJob");
  }

  async extractRequirements(
    _request: ExtractRequirementsRequest
  ): Promise<StructuredAIProviderResponse> {
    this.reject("extractRequirements");
  }

  async analyzeCandidateFit(
    _request: AnalyzeCandidateFitRequest
  ): Promise<StructuredAIProviderResponse> {
    this.reject("analyzeCandidateFit");
  }

  async generateApplicationInsights(
    _request: GenerateApplicationInsightsRequest
  ): Promise<StructuredAIProviderResponse> {
    this.reject("generateApplicationInsights");
  }
}
