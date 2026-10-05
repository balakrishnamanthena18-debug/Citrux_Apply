import { ProviderError, isTransientProviderFailure } from "./errors";

export type ChatCompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionRequest = {
  model: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: false;
  /** DeepSeek V4 Flash reasoning mode per NVIDIA NIM docs. */
  reasoning_effort?: "none" | "high" | "max";
};

export type ChatCompletionResult = {
  content: string;
  requestId: string | null;
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  } | null;
  latencyMs: number;
  httpStatus: number;
};

export type ProviderHttpClientOptions = {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
  fetchImpl?: typeof fetch;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyHttpError(
  status: number,
  bodyText: string,
  requestId: string | null
): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError(
      "AUTHENTICATION_ERROR",
      "AI provider authentication failed",
      { retryable: false, httpStatus: status, requestId }
    );
  }
  if (status === 429) {
    return new ProviderError("RATE_LIMITED", "AI provider rate limited the request", {
      retryable: true,
      httpStatus: status,
      requestId,
    });
  }
  if (status === 408) {
    return new ProviderError("TIMEOUT", "AI provider request timed out", {
      retryable: true,
      httpStatus: status,
      requestId,
    });
  }
  if (status === 410) {
    return new ProviderError(
      "PROVIDER_ERROR",
      "AI provider model is no longer available",
      {
        retryable: false,
        httpStatus: status,
        requestId,
        details: { bodySnippet: bodyText.slice(0, 200) },
      }
    );
  }
  if (status >= 400 && status < 500) {
    return new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "AI provider rejected the request",
      {
        retryable: false,
        httpStatus: status,
        requestId,
        details: { bodySnippet: bodyText.slice(0, 200) },
      }
    );
  }
  return new ProviderError("PROVIDER_ERROR", "AI provider returned a server error", {
    retryable: true,
    httpStatus: status,
    requestId,
  });
}

/**
 * OpenAI-compatible chat completions client for NVIDIA NIM.
 * Bounded retries for transient failures only.
 */
export async function postChatCompletion(
  options: ProviderHttpClientOptions,
  body: ChatCompletionRequest
): Promise<ChatCompletionResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${options.baseUrl.replace(/\/$/, "")}/chat/completions`;
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= options.maxRetries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    const started = Date.now();

    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ ...body, stream: false }),
        signal: controller.signal,
      });

      const requestId =
        response.headers.get("x-request-id") ||
        response.headers.get("request-id") ||
        null;
      const text = await response.text();
      const latencyMs = Date.now() - started;

      if (!response.ok) {
        const err = classifyHttpError(response.status, text, requestId);
        if (err.retryable && attempt < options.maxRetries) {
          lastError = err;
          attempt += 1;
          await sleep(Math.min(250 * 2 ** attempt, 2000));
          continue;
        }
        throw err;
      }

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new ProviderError(
          "INVALID_RESPONSE",
          "AI provider returned non-JSON response",
          { retryable: false, httpStatus: response.status, requestId }
        );
      }

      const content = extractAssistantContent(json);
      const usage = extractUsage(json);

      return {
        content,
        requestId,
        usage,
        latencyMs,
        httpStatus: response.status,
      };
    } catch (error) {
      if (error instanceof ProviderError) {
        if (isTransientProviderFailure(error) && attempt < options.maxRetries) {
          lastError = error;
          attempt += 1;
          await sleep(Math.min(250 * 2 ** attempt, 2000));
          continue;
        }
        throw error;
      }

      if (
        error instanceof Error &&
        (error.name === "AbortError" || /aborted/i.test(error.message))
      ) {
        const timeoutErr = new ProviderError(
          "TIMEOUT",
          "AI provider request timed out",
          { retryable: true }
        );
        if (attempt < options.maxRetries) {
          lastError = timeoutErr;
          attempt += 1;
          continue;
        }
        throw timeoutErr;
      }

      const networkErr = new ProviderError(
        "NETWORK_ERROR",
        "AI provider network error",
        { retryable: true, cause: error }
      );
      if (attempt < options.maxRetries) {
        lastError = networkErr;
        attempt += 1;
        await sleep(Math.min(250 * 2 ** attempt, 2000));
        continue;
      }
      throw networkErr;
    } finally {
      clearTimeout(timer);
    }
  }

  throw (
    lastError ??
    new ProviderError("PROVIDER_ERROR", "AI provider request failed", {
      retryable: false,
    })
  );
}

function extractAssistantContent(json: unknown): string {
  if (!json || typeof json !== "object") {
    throw new ProviderError(
      "INVALID_RESPONSE",
      "AI provider response missing choices",
      { retryable: false }
    );
  }
  const choices = (json as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new ProviderError(
      "INVALID_RESPONSE",
      "AI provider response missing choices",
      { retryable: false }
    );
  }
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new ProviderError(
      "INVALID_RESPONSE",
      "AI provider response missing message content",
      { retryable: false }
    );
  }
  return content;
}

function extractUsage(
  json: unknown
): ChatCompletionResult["usage"] {
  if (!json || typeof json !== "object") return null;
  const usage = (json as { usage?: Record<string, unknown> }).usage;
  if (!usage || typeof usage !== "object") return null;
  return {
    promptTokens:
      typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
    completionTokens:
      typeof usage.completion_tokens === "number"
        ? usage.completion_tokens
        : undefined,
    totalTokens:
      typeof usage.total_tokens === "number" ? usage.total_tokens : undefined,
  };
}
