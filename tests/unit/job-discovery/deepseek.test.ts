import { describe, it, expect, vi, beforeEach } from "vitest";
import { nvidiaDeepSeek } from "@/lib/ai/nvidia-deepseek";

describe("NVIDIA NIM DeepSeek Client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reports configuration status correctly based on environment variables", () => {
    expect(typeof nvidiaDeepSeek.isConfigured()).toBe("boolean");
    expect(typeof nvidiaDeepSeek.getModel()).toBe("string");
    expect(nvidiaDeepSeek.getModel()).toContain("deepseek");
  });

  it("handles missing API key gracefully without crashing", async () => {
    const origKey = process.env.NVIDIA_API_KEY;
    const origNimKey = process.env.NVIDIA_NIM_API_KEY;
    delete process.env.NVIDIA_API_KEY;
    delete process.env.NVIDIA_NIM_API_KEY;

    const res = await nvidiaDeepSeek.callStructured({
      systemPrompt: "test",
      userPrompt: "test",
    });

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain("not configured");
    }

    process.env.NVIDIA_API_KEY = origKey;
    process.env.NVIDIA_NIM_API_KEY = origNimKey;
  });

  it("strips markdown code blocks and extracts structured JSON", async () => {
    // Mock global.fetch to return a markdown JSON block with reasoning
    const mockJson = {
      choices: [
        {
          message: {
            content: "```json\n{\n  \"role\": \"Software Engineer\",\n  \"city\": \"Bengaluru\"\n}\n```",
            reasoning_content: "Thinking about role and location...",
          },
        },
      ],
      usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 },
    };

    const origKey = process.env.NVIDIA_API_KEY;
    process.env.NVIDIA_API_KEY = "test-mock-key";

    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockJson,
    } as any);

    const res = await nvidiaDeepSeek.callStructured({
      systemPrompt: "system",
      userPrompt: "find software engineer in bengaluru",
    });

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data).toEqual({ role: "Software Engineer", city: "Bengaluru" });
      expect(res.model).toBeDefined();
    }

    process.env.NVIDIA_API_KEY = origKey;
  });

  it("handles upstream rate limit (429) gracefully with backoff", async () => {
    const origKey = process.env.NVIDIA_API_KEY;
    process.env.NVIDIA_API_KEY = "test-mock-key";

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Rate limit exceeded",
    } as any);

    const res = await nvidiaDeepSeek.callStructured({
      systemPrompt: "system",
      userPrompt: "rate limit test",
      timeoutMs: 1000,
    });

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.isRateLimited).toBe(true);
    }

    process.env.NVIDIA_API_KEY = origKey;
  });
});
