export type AIProviderRequestBase = {
  organizationId: string;
  candidateId?: string;
  applicationId?: string;
  jobId: string;
  snapshotId: string;
  /** Pre-authorized, isolation-filtered context only. */
  scopedContext: Record<string, unknown>;
};

export type AnalyzeJobRequest = AIProviderRequestBase & {
  kind: "analyze_job";
};

export type ExtractRequirementsRequest = AIProviderRequestBase & {
  kind: "extract_requirements";
};

export type AnalyzeCandidateFitRequest = AIProviderRequestBase & {
  kind: "analyze_candidate_fit";
  candidateId: string;
  applicationId: string;
};

export type GenerateApplicationInsightsRequest = AIProviderRequestBase & {
  kind: "generate_application_insights";
  candidateId: string;
  applicationId: string;
};

/** Synthetic connectivity probe — no candidate/job intelligence. */
export type ProviderProbeRequest = {
  kind: "provider_probe";
  organizationId: string;
  /** Must be synthetic-only; never candidate/job PII. */
  syntheticPrompt: string;
};

export type StructuredAIProviderResponse = {
  providerId: string;
  modelId: string;
  /** Opaque structured payload; must pass Zod + truth validation before persist. */
  payload: unknown;
  rawText?: string;
  requestId?: string | null;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  } | null;
  latencyMs?: number;
};

export type ProviderInvocationPurpose =
  | "analyze_job"
  | "extract_requirements"
  | "analyze_candidate_fit"
  | "generate_application_insights"
  | "provider_probe";
