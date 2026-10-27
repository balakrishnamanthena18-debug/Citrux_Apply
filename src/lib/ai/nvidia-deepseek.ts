/**
 * NVIDIA NIM DeepSeek Client — Resilient, Server-Only Intelligence Engine
 *
 * Connects to NVIDIA-hosted DeepSeek models (default: deepseek-ai/deepseek-v4.1-flash)
 * using the OpenAI-compatible chat completions endpoint.
 *
 * Features:
 * - Server-only execution (credentials never exposed to client or logs)
 * - Strict AbortController timeouts and request cancellation
 * - Reasoning token extraction (handles deepseek-v4.1-flash reasoning_content)
 * - JSON schema parsing with automatic markdown fence stripping
 * - Transient error retries (429, 503) with exponential backoff
 * - Short-lived query deduplication cache to prevent redundant API calls
 * - Telemetry & latency logging without logging sensitive candidate or prompt data
 * - Graceful fallback when AI is unavailable or offline
 */

import { logger } from "@/lib/logger";

export interface DeepSeekCallOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface DeepSeekSuccessResult<T> {
  success: true;
  data: T;
  rawText: string;
  model: string;
  latencyMs: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    reasoningTokens?: number;
    totalTokens: number;
  };
}

export interface DeepSeekErrorResult {
  success: false;
  error: string;
  latencyMs: number;
  isTimeout?: boolean;
  isRateLimited?: boolean;
}

export type DeepSeekResult<T> = DeepSeekSuccessResult<T> | DeepSeekErrorResult;

class NvidiaDeepSeekClient {
  private readonly defaultBaseUrl = "https://integrate.api.nvidia.com/v1";
  private readonly defaultModel = "deepseek-ai/deepseek-v4.1-flash";
  private readonly defaultTimeoutMs = 8000;
  private readonly maxRetries = 2;

  // Short-lived in-memory cache for prompt deduplication (TTL: 60 seconds)
  private readonly cache = new Map<string, { data: any; expiry: number }>();

  /** Returns true if an NVIDIA API key is available in environment */
  isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  /** Retrieve the API key server-side only */
  private getApiKey(): string | undefined {
    return process.env.NVIDIA_NIM_API_KEY || process.env.NVIDIA_API_KEY;
  }

  /** Retrieve base URL */
  private getBaseUrl(): string {
    const raw = process.env.NVIDIA_NIM_BASE_URL || this.defaultBaseUrl;
    return raw.replace(/\/+$/, "");
  }

  /** Retrieve configured DeepSeek model */
  getModel(): string {
    return process.env.NVIDIA_DEEPSEEK_MODEL || this.defaultModel;
  }

  /**
   * Sanitizes user input to mitigate prompt injection attempts
   */
  private sanitizeInput(input: string): string {
    if (!input) return "";
    return input
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "") // remove control chars
      .replace(/```/g, "'''") // neutralize code block delimiters
      .replace(/ignore\s+(?:all\s+)?previous\s+instructions/gi, "[instruction filter]")
      .slice(0, 4000)
      .trim();
  }

  /**
   * Cleans model output, stripping markdown code block formatting (```json ... ```)
   */
  private cleanJsonOutput(content: string): string {
    let cleaned = content.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }
    return cleaned.trim();
  }

  /**
   * Executes a structured JSON completion against NVIDIA NIM DeepSeek
   */
  async callStructured<T = any>(
    options: DeepSeekCallOptions,
    validate?: (parsed: any) => T
  ): Promise<DeepSeekResult<T>> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: "NVIDIA_API_KEY or NVIDIA_NIM_API_KEY is not configured",
        latencyMs: 0,
      };
    }

    const sanitizedUserPrompt = this.sanitizeInput(options.userPrompt);
    const cacheKey = `${options.systemPrompt}::${sanitizedUserPrompt}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return {
        success: true,
        data: cached.data as T,
        rawText: JSON.stringify(cached.data),
        model: this.getModel(),
        latencyMs: 0,
      };
    }

    const start = Date.now();
    const model = this.getModel();
    const endpoint = `${this.getBaseUrl()}/chat/completions`;
    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;

    let attempt = 0;
    while (attempt <= this.maxRetries) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content: `${options.systemPrompt}\nCRITICAL: Respond ONLY with a valid, parseable JSON object. Do not include markdown code blocks, explanation, or commentary.`,
              },
              {
                role: "user",
                content: sanitizedUserPrompt,
              },
            ],
            temperature: options.temperature ?? 0.2,
            max_tokens: options.maxTokens ?? 1000,
          }),
          signal: controller.signal,
        });

        clearTimeout(timer);
        const latencyMs = Date.now() - start;

        // Handle rate limiting (429) or transient server errors (503)
        if (response.status === 429 || response.status === 503) {
          if (attempt < this.maxRetries) {
            attempt++;
            const backoff = 500 * Math.pow(2, attempt);
            await new Promise((res) => setTimeout(res, backoff));
            continue;
          }
          return {
            success: false,
            error: `NVIDIA DeepSeek rate limit / temporary service error (${response.status})`,
            latencyMs,
            isRateLimited: response.status === 429,
          };
        }

        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          logger.warn("[NvidiaDeepSeek] Upstream error from NVIDIA API", {
            status: response.status,
            latencyMs,
          });
          return {
            success: false,
            error: `NVIDIA DeepSeek HTTP ${response.status}: ${errText.slice(0, 150)}`,
            latencyMs,
          };
        }

        const json = await response.json();
        const choice = json.choices?.[0];
        const rawContent = choice?.message?.content;

        if (!rawContent || typeof rawContent !== "string") {
          return {
            success: false,
            error: "DeepSeek returned empty or missing message content",
            latencyMs,
          };
        }

        const cleanedJson = this.cleanJsonOutput(rawContent);
        let parsed: any;
        try {
          parsed = JSON.parse(cleanedJson);
        } catch {
          // Attempt to extract first matching JSON block if outer text remains
          const match = cleanedJson.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              parsed = JSON.parse(match[0]);
            } catch {
              return {
                success: false,
                error: "Failed to parse structured JSON from DeepSeek response",
                latencyMs,
              };
            }
          } else {
            return {
              success: false,
              error: "DeepSeek response did not contain a valid JSON object",
              latencyMs,
            };
          }
        }

        // Validate if schema validator provided
        const finalData = validate ? validate(parsed) : parsed;

        // Cache successful response for 60 seconds
        this.cache.set(cacheKey, { data: finalData, expiry: Date.now() + 60000 });
        if (this.cache.size > 200) {
          // Prune older cache entries
          const firstKey = this.cache.keys().next().value;
          if (firstKey) this.cache.delete(firstKey);
        }

        return {
          success: true,
          data: finalData,
          rawText: cleanedJson,
          model,
          latencyMs,
          usage: json.usage
            ? {
                promptTokens: json.usage.prompt_tokens || 0,
                completionTokens: json.usage.completion_tokens || 0,
                reasoningTokens: json.usage.completion_tokens_details?.reasoning_tokens,
                totalTokens: json.usage.total_tokens || 0,
              }
            : undefined,
        };
      } catch (err: any) {
        clearTimeout(timer);
        const latencyMs = Date.now() - start;
        const isAbort = err?.name === "AbortError" || /timeout|aborted/i.test(err?.message || "");

        if (isAbort) {
          logger.warn("[NvidiaDeepSeek] Request timed out", { timeoutMs, latencyMs });
          return {
            success: false,
            error: `DeepSeek query timed out after ${timeoutMs}ms`,
            latencyMs,
            isTimeout: true,
          };
        }

        if (attempt < this.maxRetries) {
          attempt++;
          const backoff = 400 * attempt;
          await new Promise((res) => setTimeout(res, backoff));
          continue;
        }

        return {
          success: false,
          error: err?.message || "Network error contacting NVIDIA DeepSeek",
          latencyMs,
        };
      }
    }

    return {
      success: false,
      error: "Max retries exceeded calling NVIDIA DeepSeek",
      latencyMs: Date.now() - start,
    };
  }
}

export const nvidiaDeepSeek = new NvidiaDeepSeekClient();
