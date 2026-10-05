import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  NullAIProvider,
  ProviderError,
  NvidiaDeepSeekAdapter,
  resolveConfiguredAIProvider,
  requireConfiguredAIProvider,
  getAIService,
  __resetAIServiceForTests,
  resolveNvidiaProviderConfig,
  sanitizeProviderScopedContext,
  assertProviderScopedContextAllowed,
  validateUntrustedProviderResponse,
  validateProviderStructuredOutput,
  executeProviderWithGuards,
  buildProviderInvocationKey,
  __resetProviderIdempotencyWindowForTests,
  buildSafeProviderAuditDetails,
  parseJsonContent,
  EXPERIMENTAL_MODEL_ID,
  EXPERIMENTAL_PROVIDER_ID,
} from "@/lib/application-intelligence";

vi.mock("@/lib/security/abuse-protection", () => ({
  checkAiGenerationRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 9,
  }),
}));

import { checkAiGenerationRateLimit } from "@/lib/security/abuse-protection";

const ROOT = process.cwd();
const orgId = "11111111-1111-4111-8111-111111111111";
const jobId = "22222222-2222-4222-8222-222222222222";
const snapId = "33333333-3333-4333-8333-333333333333";

function mockFetchJson(payload: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  const status = init?.status ?? 200;
  const body =
    typeof payload === "string"
      ? payload
      : JSON.stringify({
          id: "chatcmpl-test",
          choices: [
            {
              message: {
                role: "assistant",
                content:
                  typeof payload === "object" && payload !== null && "content" in (payload as object)
                    ? String((payload as { content: string }).content)
                    : JSON.stringify(payload),
              },
            },
          ],
          usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
        });

  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (k: string) => (init?.headers ?? { "x-request-id": "req-test-1" })[k.toLowerCase()] ??
        (init?.headers ?? { "x-request-id": "req-test-1" })[k] ??
        null,
    },
    text: async () =>
      status >= 200 && status < 300
        ? body
        : JSON.stringify({ error: { message: "provider error" } }),
  });
}

function mockFetchAssistantContent(content: string, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === "x-request-id" ? "req-abc" : null) },
    text: async () =>
      status >= 200 && status < 300
        ? JSON.stringify({
            choices: [{ message: { content } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          })
        : JSON.stringify({ error: "fail" }),
  });
}

describe("Gate 3 — provider interface + NullAIProvider", () => {
  beforeEach(() => {
    __resetAIServiceForTests();
    __resetProviderIdempotencyWindowForTests();
    vi.mocked(checkAiGenerationRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 9,
    });
  });

  it("default AIService uses NullAIProvider and refuses execution", async () => {
    const provider = getAIService().getProvider();
    expect(provider.providerId).toBe("null");
    await expect(
      provider.extractRequirements({
        kind: "extract_requirements",
        organizationId: orgId,
        jobId,
        snapshotId: snapId,
        scopedContext: { __synthetic: true },
      })
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("NullAIProvider never fabricates intelligence payloads", async () => {
    const provider = new NullAIProvider();
    await expect(
      provider.analyzeJob({
        kind: "analyze_job",
        organizationId: orgId,
        jobId,
        snapshotId: snapId,
        scopedContext: {},
      })
    ).rejects.toMatchObject({ code: "CONFIGURATION_REQUIRED" });
  });
});

describe("Gate 3 — configuration + credentials", () => {
  it("reports CONFIGURATION_REQUIRED when API key missing", () => {
    const status = resolveNvidiaProviderConfig({
      env: { NVIDIA_API_KEY: undefined },
    });
    expect(status.status).toBe("CONFIGURATION_REQUIRED");
    expect(resolveConfiguredAIProvider({ env: {} }).status).toBe(
      "CONFIGURATION_REQUIRED"
    );
    expect(() =>
      requireConfiguredAIProvider({ env: { NVIDIA_API_KEY: undefined } })
    ).toThrow(ProviderError);
  });

  it("resolves READY config without exposing key in describe path", () => {
    const status = resolveNvidiaProviderConfig({
      env: {
        NVIDIA_API_KEY: "nvapi-test-placeholder-not-real",
        NVIDIA_API_BASE_URL: "https://integrate.api.nvidia.com/v1",
      },
    });
    expect(status.status).toBe("READY");
    if (status.status === "READY") {
      expect(status.config.modelId).toBe(EXPERIMENTAL_MODEL_ID);
      expect(status.config.providerId).toBe(EXPERIMENTAL_PROVIDER_ID);
      expect(JSON.stringify(status)).toContain("nvapi-test-placeholder-not-real");
      // Audit helper must strip secrets
      const audit = buildSafeProviderAuditDetails({
        organizationId: orgId,
        purpose: "provider_probe",
        providerId: status.config.providerId,
        modelId: status.config.modelId,
        status: "SUCCEEDED",
      });
      expect(JSON.stringify(audit)).not.toMatch(/nvapi-|apiKey|Authorization/i);
    }
  });
});

describe("Gate 3 — NVIDIA adapter with mocked HTTP", () => {
  it("parses valid structured JSON response", async () => {
    const payload = {
      kind: "requirements",
      requirements: [
        {
          category: "REQUIRED_SKILL",
          value: "TypeScript",
          importance: "REQUIRED",
          confidence: 0.9,
          sourceEvidence: "TypeScript required",
        },
      ],
    };
    const fetchImpl = mockFetchAssistantContent(JSON.stringify(payload));
    const adapter = requireConfiguredAIProvider({
      env: { NVIDIA_API_KEY: "nvapi-test-placeholder-not-real" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const response = await adapter.extractRequirements({
      kind: "extract_requirements",
      organizationId: orgId,
      jobId,
      snapshotId: snapId,
      scopedContext: { jdText: "TypeScript required" },
    });

    expect(response.providerId).toBe(EXPERIMENTAL_PROVIDER_ID);
    expect(response.payload).toEqual(payload);
    expect(response.requestId).toBe("req-abc");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0]!;
    expect(String(call[0])).toContain("/chat/completions");
    // Transport uses Bearer auth; audit helpers must never include the raw key.
    expect((call[1] as { headers: Record<string, string> }).headers.Authorization).toMatch(
      /^Bearer nvapi-test-placeholder-not-real$/
    );
    const audit = buildSafeProviderAuditDetails({
      organizationId: orgId,
      purpose: "extract_requirements",
      providerId: response.providerId,
      modelId: response.modelId,
      status: "SUCCEEDED",
      requestId: response.requestId,
    });
    expect(JSON.stringify(audit)).not.toMatch(/nvapi-test-placeholder-not-real/);
  });

  it("rejects malformed JSON content", async () => {
    const fetchImpl = mockFetchAssistantContent("not-json{{{");
    const adapter = requireConfiguredAIProvider({
      env: { NVIDIA_API_KEY: "nvapi-test-placeholder-not-real" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      adapter.probeConnectivity({
        kind: "provider_probe",
        organizationId: orgId,
        syntheticPrompt: 'Return a JSON object {"ok":true}',
      })
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("classifies auth / rate limit / server errors and retries transient only", async () => {
    const fetch401 = mockFetchAssistantContent("{}", 401);
    const adapter401 = requireConfiguredAIProvider({
      env: { NVIDIA_API_KEY: "nvapi-test-placeholder-not-real" },
      fetchImpl: fetch401 as unknown as typeof fetch,
    });
    await expect(
      adapter401.probeConnectivity({
        kind: "provider_probe",
        organizationId: orgId,
        syntheticPrompt: 'Return JSON {"probe":true}',
      })
    ).rejects.toMatchObject({ code: "AUTHENTICATION_ERROR", retryable: false });
    expect(fetch401).toHaveBeenCalledTimes(1);

    const fetch410 = mockFetchAssistantContent("{}", 410);
    const adapter410 = requireConfiguredAIProvider({
      env: { NVIDIA_API_KEY: "nvapi-test-placeholder-not-real" },
      fetchImpl: fetch410 as unknown as typeof fetch,
    });
    await expect(
      adapter410.probeConnectivity({
        kind: "provider_probe",
        organizationId: orgId,
        syntheticPrompt: 'Return JSON {"probe":true}',
      })
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR", httpStatus: 410 });

    let attempts = 0;
    const fetch500 = vi.fn().mockImplementation(async () => {
      attempts += 1;
      return {
        ok: false,
        status: 500,
        headers: { get: () => null },
        text: async () => "boom",
      };
    });
    const adapter500 = requireConfiguredAIProvider({
      env: { NVIDIA_API_KEY: "nvapi-test-placeholder-not-real" },
      fetchImpl: fetch500 as unknown as typeof fetch,
    });
    await expect(
      adapter500.probeConnectivity({
        kind: "provider_probe",
        organizationId: orgId,
        syntheticPrompt: 'Return JSON {"probe":true}',
      })
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR", retryable: true });
    expect(attempts).toBeGreaterThan(1);

    const fetch429 = mockFetchAssistantContent("{}", 429);
    const adapter429 = requireConfiguredAIProvider({
      env: { NVIDIA_API_KEY: "nvapi-test-placeholder-not-real" },
      fetchImpl: fetch429 as unknown as typeof fetch,
    });
    await expect(
      adapter429.probeConnectivity({
        kind: "provider_probe",
        organizationId: orgId,
        syntheticPrompt: 'Return JSON {"probe":true}',
      })
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("times out via AbortError and classifies TIMEOUT", async () => {
    const fetchImpl = vi.fn().mockImplementation((_url, init: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    const adapter = new NvidiaDeepSeekAdapter(
      {
        providerId: EXPERIMENTAL_PROVIDER_ID,
        modelId: EXPERIMENTAL_MODEL_ID,
        apiKey: "nvapi-test-placeholder-not-real",
        baseUrl: "https://integrate.api.nvidia.com/v1",
        timeoutMs: 10,
        maxRetries: 0,
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch }
    );
    await expect(
      adapter.probeConnectivity({
        kind: "provider_probe",
        organizationId: orgId,
        syntheticPrompt: 'Return JSON {"probe":true}',
      })
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});

describe("Gate 3 — structured + truth validation", () => {
  it("accepts valid requirements schema and rejects invalid enums", () => {
    const ok = validateProviderStructuredOutput({
      providerId: EXPERIMENTAL_PROVIDER_ID,
      modelId: EXPERIMENTAL_MODEL_ID,
      payload: {
        kind: "requirements",
        requirements: [
          {
            category: "REQUIRED_SKILL",
            value: "React",
            importance: "REQUIRED",
            confidence: 1,
            sourceEvidence: "React",
          },
        ],
      },
    });
    expect(ok.kind).toBe("requirements");

    expect(() =>
      validateProviderStructuredOutput({
        providerId: EXPERIMENTAL_PROVIDER_ID,
        modelId: EXPERIMENTAL_MODEL_ID,
        payload: {
          kind: "requirements",
          requirements: [
            {
              category: "NOT_REAL",
              value: "x",
              importance: "REQUIRED",
              confidence: 1,
              sourceEvidence: "x",
            },
          ],
        },
      })
    ).toThrow(ProviderError);
  });

  it("rejects fabricated candidate entity ids via truth validation", () => {
    expect(() =>
      validateUntrustedProviderResponse(
        {
          providerId: EXPERIMENTAL_PROVIDER_ID,
          modelId: EXPERIMENTAL_MODEL_ID,
          payload: {
            kind: "alignment",
            fitItems: [
              {
                label: "Secret",
                category: "REQUIRED_SKILLS",
                status: "MATCHED",
                evidence: [
                  {
                    entityType: "CandidateSkill",
                    entityId: "99999999-9999-4999-8999-999999999999",
                    provenance: "CANDIDATE_PROVIDED",
                    summary: "invented",
                  },
                ],
              },
            ],
            dimensionScores: [],
          },
        },
        new Set(["11111111-1111-4111-8111-111111111111"])
      )
    ).toThrow(/truth validation/i);
  });
});

describe("Gate 3 — context boundary + rate limit + idempotency", () => {
  it("blocks forbidden context keys and secrets", () => {
    expect(() =>
      assertProviderScopedContextAllowed({ apiKey: "x" })
    ).toThrow(/forbidden/i);
    expect(() =>
      sanitizeProviderScopedContext({
        jdText: "ok",
        NVIDIA_API_KEY: "secret",
      })
    ).not.toThrow();
    expect(
      sanitizeProviderScopedContext({
        jdText: "ok",
        NVIDIA_API_KEY: "secret",
      })
    ).toEqual({ jdText: "ok" });
  });

  it("enforces AI_GENERATION rate limit before invoke", async () => {
    vi.mocked(checkAiGenerationRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 30,
    });
    await expect(
      executeProviderWithGuards(
        new NullAIProvider(),
        {
          organizationId: orgId,
          purpose: "provider_probe",
          actorUserId: "user-1",
          ip: "127.0.0.1",
          skipIntelligenceValidation: true,
        },
        async () => {
          throw new Error("should not run");
        }
      )
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("suppresses duplicate invocations in idempotency window", async () => {
    const key = buildProviderInvocationKey({
      purpose: "provider_probe",
      snapshotId: snapId,
      providerId: EXPERIMENTAL_PROVIDER_ID,
      modelId: EXPERIMENTAL_MODEL_ID,
    });
    expect(key).toHaveLength(64);

    const fetchImpl = mockFetchAssistantContent(JSON.stringify({ probe: true }));
    const adapter = requireConfiguredAIProvider({
      env: { NVIDIA_API_KEY: "nvapi-test-placeholder-not-real" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await executeProviderWithGuards(
      adapter,
      {
        organizationId: orgId,
        purpose: "provider_probe",
        snapshotId: snapId,
        skipIntelligenceValidation: true,
      },
      () =>
        adapter.probeConnectivity({
          kind: "provider_probe",
          organizationId: orgId,
          syntheticPrompt: 'Return JSON {"probe":true}',
        })
    );

    await expect(
      executeProviderWithGuards(
        adapter,
        {
          organizationId: orgId,
          purpose: "provider_probe",
          snapshotId: snapId,
          skipIntelligenceValidation: true,
        },
        () =>
          adapter.probeConnectivity({
            kind: "provider_probe",
            organizationId: orgId,
            syntheticPrompt: 'Return JSON {"probe":true}',
          })
      )
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("Gate 3 — security verification", () => {
  it("forbids NEXT_PUBLIC NVIDIA keys and hard-coded nvapi secrets in source", () => {
    const envSrc = readFileSync(join(ROOT, "src/lib/env.ts"), "utf8");
    expect(envSrc).not.toMatch(/NEXT_PUBLIC_NVIDIA/);

    const providerDir = join(ROOT, "src/lib/application-intelligence/providers");
    for (const f of readdirSync(providerDir)) {
      if (!f.endsWith(".ts")) continue;
      const src = readFileSync(join(providerDir, f), "utf8");
      expect(src).not.toMatch(/nvapi-[A-Za-z0-9]{20,}/);
      expect(src).not.toMatch(/NEXT_PUBLIC_NVIDIA/);
      expect(src).not.toMatch(/from\s+["']openai["']/);
    }

    const example = readFileSync(join(ROOT, ".env.example"), "utf8");
    expect(example).not.toMatch(/nvapi-[A-Za-z0-9]{20,}/);
  });

  it("provider replacement does not require domain changes", () => {
    const service = getAIService();
    const original = service.getProvider();
    expect(original.providerId).toBe("null");
    const fake = new NullAIProvider();
    service.setProvider(fake);
    expect(service.getProvider()).toBe(fake);
  });

  it("parseJsonContent strips markdown fences", () => {
    expect(parseJsonContent("```json\n{\"ok\":true}\n```")).toEqual({ ok: true });
  });
});

describe("Gate 3 — optional real smoke test", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs synthetic probe only when explicitly opted in", async () => {
    const key = process.env.NVIDIA_API_KEY?.trim();
    const optIn = process.env.RUN_NVIDIA_SMOKE === "1";

    if (!optIn || !key) {
      // Default CI/local suite: NOT RUN (avoids live network + env leakage).
      expect(
        resolveConfiguredAIProvider({
          env: { NVIDIA_API_KEY: undefined, NVIDIA_API_BASE_URL: undefined },
        }).status
      ).toBe("CONFIGURATION_REQUIRED");
      return;
    }

    // Synthetic probe only — no candidate/job/application data.
    const provider = new NvidiaDeepSeekAdapter({
      providerId: EXPERIMENTAL_PROVIDER_ID,
      modelId: EXPERIMENTAL_MODEL_ID,
      apiKey: key,
      baseUrl:
        process.env.NVIDIA_API_BASE_URL?.replace(/\/$/, "") ||
        "https://integrate.api.nvidia.com/v1",
      timeoutMs: 20_000,
      maxRetries: 0,
    });

    try {
      const result = await provider.probeConnectivity({
        kind: "provider_probe",
        organizationId: orgId,
        syntheticPrompt:
          'Return a JSON object with a single field test equal to the string ok. Example: {"test":"ok"}',
      });
      expect(result.providerId).toBe(EXPERIMENTAL_PROVIDER_ID);
      expect(result.payload).toBeTruthy();
      expect(JSON.stringify(result)).not.toContain(key);
    } catch (error) {
      // Architecture gate must not fail solely due to NVIDIA capacity/EOL/timeout.
      expect(error).toBeInstanceOf(ProviderError);
      const code = (error as ProviderError).code;
      expect([
        "TIMEOUT",
        "NETWORK_ERROR",
        "PROVIDER_ERROR",
        "RATE_LIMITED",
        "INVALID_RESPONSE",
      ]).toContain(code);
      expect(code).not.toBe("AUTHENTICATION_ERROR");
    }
  }, 30_000);
});
