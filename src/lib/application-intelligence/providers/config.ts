import { getEnv } from "@/lib/env";
import {
  EXPERIMENTAL_MODEL_ID,
  EXPERIMENTAL_PROVIDER_ID,
} from "../constants";
import { ProviderError } from "./errors";

/** Official NVIDIA NIM OpenAI-compatible base (Design Lock default). */
export const DEFAULT_NVIDIA_API_BASE_URL =
  "https://integrate.api.nvidia.com/v1";

export const PROVIDER_REQUEST_TIMEOUT_MS = 30_000;
export const PROVIDER_MAX_RETRIES = 2;

export type NvidiaProviderConfig = {
  providerId: typeof EXPERIMENTAL_PROVIDER_ID;
  modelId: string;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
};

export type ProviderConfigStatus =
  | { status: "READY"; config: NvidiaProviderConfig }
  | { status: "CONFIGURATION_REQUIRED"; reason: string };

/**
 * Resolve NVIDIA NIM config from server env.
 * Never logs or returns secrets via error messages.
 */
export function resolveNvidiaProviderConfig(options?: {
  env?: {
    NVIDIA_API_KEY?: string;
    NVIDIA_API_BASE_URL?: string;
  };
  timeoutMs?: number;
  maxRetries?: number;
  modelId?: string;
}): ProviderConfigStatus {
  const env = options?.env ?? safeReadEnv();
  const apiKey = env.NVIDIA_API_KEY?.trim();
  if (!apiKey) {
    return {
      status: "CONFIGURATION_REQUIRED",
      reason: "NVIDIA_API_KEY is not configured",
    };
  }

  const baseUrl = (
    env.NVIDIA_API_BASE_URL?.trim() || DEFAULT_NVIDIA_API_BASE_URL
  ).replace(/\/$/, "");

  return {
    status: "READY",
    config: {
      providerId: EXPERIMENTAL_PROVIDER_ID,
      modelId: options?.modelId ?? EXPERIMENTAL_MODEL_ID,
      apiKey,
      baseUrl,
      timeoutMs: options?.timeoutMs ?? PROVIDER_REQUEST_TIMEOUT_MS,
      maxRetries: options?.maxRetries ?? PROVIDER_MAX_RETRIES,
    },
  };
}

export function requireNvidiaProviderConfig(options?: {
  env?: {
    NVIDIA_API_KEY?: string;
    NVIDIA_API_BASE_URL?: string;
  };
  timeoutMs?: number;
  maxRetries?: number;
  modelId?: string;
}): NvidiaProviderConfig {
  const resolved = resolveNvidiaProviderConfig(options);
  if (resolved.status !== "READY") {
    throw new ProviderError(
      "CONFIGURATION_REQUIRED",
      "AI provider is not configured",
      { retryable: false }
    );
  }
  return resolved.config;
}

function safeReadEnv(): {
  NVIDIA_API_KEY?: string;
  NVIDIA_API_BASE_URL?: string;
} {
  try {
    const env = getEnv();
    return {
      NVIDIA_API_KEY: env.NVIDIA_API_KEY,
      NVIDIA_API_BASE_URL: env.NVIDIA_API_BASE_URL,
    };
  } catch {
    // Env may be incomplete in isolated unit tests — fall back to process.env keys only.
    return {
      NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
      NVIDIA_API_BASE_URL: process.env.NVIDIA_API_BASE_URL,
    };
  }
}

/** Redacted view for audits/diagnostics — never includes the key. */
export function describeProviderConfig(config: NvidiaProviderConfig): {
  providerId: string;
  modelId: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  apiKeyConfigured: true;
} {
  return {
    providerId: config.providerId,
    modelId: config.modelId,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    apiKeyConfigured: true,
  };
}
