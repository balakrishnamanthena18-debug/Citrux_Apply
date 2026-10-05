/** Phase 2 foundation contract versions. Bump when contracts change. */
export const INTELLIGENCE_SCHEMA_VERSION = "ai-output.v1";
/** Provider prompt contract version (feature prompts still gated until later gates). */
export const INTELLIGENCE_PROMPT_VERSION = "provider.boundary.v1";
export const INTELLIGENCE_SCORING_VERSION = "scoring.v1";
export const JOB_REQUIREMENT_SCHEMA_VERSION = "job-requirements.v1";
export const JOB_REQUIREMENT_EXTRACTION_VERSION = "extract.v1";
export const JOB_REQUIREMENT_NORMALIZATION_VERSION = "normalize.v1";
export const JOB_REQUIREMENT_EXTRACTION_PROMPT_VERSION = "requirement-extraction.v1";
export const INTELLIGENCE_READINESS_VERSION = "readiness.v1";

export const ANALYSIS_PURPOSE = {
  APPLICATION_INTELLIGENCE: "APPLICATION_INTELLIGENCE",
  JOB_REQUIREMENT_EXTRACTION: "JOB_REQUIREMENT_EXTRACTION",
  /** Gate 6 — deterministic candidate↔job alignment (no LLM scoring). */
  CANDIDATE_JOB_ALIGNMENT: "CANDIDATE_JOB_ALIGNMENT",
  /** Gate 7 — deterministic application readiness advisory (no LLM). */
  APPLICATION_READINESS: "APPLICATION_READINESS",
} as const;

export type AnalysisPurpose =
  (typeof ANALYSIS_PURPOSE)[keyof typeof ANALYSIS_PURPOSE];

/** Provider id used when no runtime provider is configured. */
export const NULL_PROVIDER_ID = "null";
export const NULL_MODEL_ID = "none";

/**
 * Reserved experimental first provider (Design Lock).
 * Adapter must not be registered until Gate 3/4; domain never imports vendor SDKs.
 */
export const EXPERIMENTAL_PROVIDER_ID = "nvidia-nim";
/**
 * Design Lock originally named deepseek-ai/deepseek-v4-flash.
 * NVIDIA NIM retired that ID (HTTP 410). Current catalog successor:
 * deepseek-ai/deepseek-v4.1-flash
 */
export const EXPERIMENTAL_MODEL_ID = "deepseek-ai/deepseek-v4.1-flash";
export const EXPERIMENTAL_PROVIDER_ENV_KEY = "NVIDIA_API_KEY";
export const EXPERIMENTAL_PROVIDER_BASE_URL_ENV_KEY = "NVIDIA_API_BASE_URL";

export const READINESS_STATES = [
  "READY",
  "READY_WITH_WARNINGS",
  "REVIEW_REQUIRED",
  "BLOCKED",
  "UNKNOWN",
] as const;

export type ReadinessState = (typeof READINESS_STATES)[number];

export const FIT_STATUSES = ["MATCHED", "PARTIAL", "MISSING", "UNKNOWN"] as const;
export type FitStatus = (typeof FIT_STATUSES)[number];
