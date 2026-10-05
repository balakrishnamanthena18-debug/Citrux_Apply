import type { AIProvider } from "./interface";
import { NullAIProvider } from "./null-provider";
import { resolveNvidiaProviderConfig } from "./config";
import { NvidiaDeepSeekAdapter } from "./nvidia-deepseek-adapter";
import { ProviderError } from "./errors";

/**
 * Application Intelligence → AI Service → Provider Interface → Adapter
 *
 * Domain code must obtain providers only through this service.
 * Default remains NullAIProvider (no network) until explicitly configured.
 */
export class AIService {
  private provider: AIProvider;

  constructor(provider: AIProvider = new NullAIProvider()) {
    this.provider = provider;
  }

  getProvider(): AIProvider {
    return this.provider;
  }

  /** Swap adapter without changing application domain. */
  setProvider(provider: AIProvider): void {
    this.provider = provider;
  }
}

let defaultService: AIService | null = null;

export function getAIService(): AIService {
  if (!defaultService) {
    defaultService = new AIService(new NullAIProvider());
  }
  return defaultService;
}

/** Test helper — reset singleton. */
export function __resetAIServiceForTests(): void {
  defaultService = null;
}

export type ConfiguredProviderResolution =
  | { status: "READY"; provider: NvidiaDeepSeekAdapter }
  | { status: "CONFIGURATION_REQUIRED"; reason: string };

/**
 * Resolve experimental NVIDIA adapter when credentials exist.
 * Does NOT replace the default AIService singleton.
 * Does NOT silently invent AI output when unconfigured.
 */
export function resolveConfiguredAIProvider(options?: {
  env?: {
    NVIDIA_API_KEY?: string;
    NVIDIA_API_BASE_URL?: string;
  };
  fetchImpl?: typeof fetch;
}): ConfiguredProviderResolution {
  const resolved = resolveNvidiaProviderConfig({ env: options?.env });
  if (resolved.status !== "READY") {
    return {
      status: "CONFIGURATION_REQUIRED",
      reason: resolved.reason,
    };
  }
  return {
    status: "READY",
    provider: new NvidiaDeepSeekAdapter(resolved.config, {
      fetchImpl: options?.fetchImpl,
    }),
  };
}

export function requireConfiguredAIProvider(options?: {
  env?: {
    NVIDIA_API_KEY?: string;
    NVIDIA_API_BASE_URL?: string;
  };
  fetchImpl?: typeof fetch;
}): NvidiaDeepSeekAdapter {
  const resolved = resolveConfiguredAIProvider(options);
  if (resolved.status !== "READY") {
    throw new ProviderError(
      "CONFIGURATION_REQUIRED",
      "AI provider is not configured",
      { retryable: false }
    );
  }
  return resolved.provider;
}
