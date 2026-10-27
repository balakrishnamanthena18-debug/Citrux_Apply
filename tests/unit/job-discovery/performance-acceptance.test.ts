import { describe, it, expect, vi } from "vitest";
import { liveJobSearchEngine } from "@/lib/job-discovery/live-search";
import { jobProviderRegistry } from "@/lib/job-discovery/registry";
import { nvidiaDeepSeek } from "@/lib/ai/nvidia-deepseek";
import type { JobProviderAdapter, ProviderSearchParams, ProviderFetchResult } from "@/lib/job-discovery/types";

describe("Performance Acceptance & Timeout Audit", () => {
  // Increase timeout for live network provider roundtrips
  const AUDIT_TIMEOUT_MS = 25000;

  it("Scenario 1: Direct city search (Bengaluru)", async () => {
    const t0 = performance.now();
    const result = await liveJobSearchEngine.searchLiveJobs({
      cities: ["Bengaluru"],
      page: 1,
      pageSize: 15,
    });
    const totalElapsedMs = Math.round(performance.now() - t0);

    console.log("=== SCENARIO 1: Direct City Search (Bengaluru) ===");
    console.log(`Total Wall-Clock Time: ${totalElapsedMs}ms`);
    console.log(`Engine Reported Duration: ${result.searchDurationMs}ms`);
    console.log(`AI Interpreted: ${result.interpretedPlan?.isAiInterpreted ?? false}`);
    console.log(`Total Jobs Found: ${result.jobs.length}`);
    console.log(`Verified Matching Count: ${result.verifiedMatchingCount}`);
    console.log(`Provider Statuses:`);
    expect(result.searchDurationMs).toBeDefined();
    expect(result.searchDurationMs).toBeGreaterThan(0);
    expect(result.providerStatuses).toBeDefined();
    expect(result.providerStatuses!.length).toBeGreaterThan(0);
    result.providerStatuses?.forEach((ps) => {
      console.log(`  - ${ps.providerName}: status=${ps.status}, count=${ps.count}, latency=${ps.latencyMs}ms`);
    });
  }, AUDIT_TIMEOUT_MS);

  it("Scenario 2: City plus role search (Software Engineer in Hyderabad)", async () => {
    const t0 = performance.now();
    const result = await liveJobSearchEngine.searchLiveJobs({
      query: "Software Engineer in Hyderabad",
      page: 1,
      pageSize: 15,
    });
    const totalElapsedMs = Math.round(performance.now() - t0);

    console.log("\n=== SCENARIO 2: City Plus Role Search (Software Engineer in Hyderabad) ===");
    console.log(`Total Wall-Clock Time: ${totalElapsedMs}ms`);
    console.log(`Engine Reported Duration: ${result.searchDurationMs}ms`);
    console.log(`AI Interpreted: ${result.interpretedPlan?.isAiInterpreted ?? false}`);
    console.log(`Interpreted Role: "${result.interpretedPlan?.role}"`);
    console.log(`Interpreted City: "${result.interpretedPlan?.city}"`);
    console.log(`Total Jobs Found: ${result.jobs.length}`);
    console.log(`Provider Statuses:`);
    result.providerStatuses?.forEach((ps) => {
      console.log(`  - ${ps.providerName}: status=${ps.status}, count=${ps.count}, latency=${ps.latencyMs}ms`);
    });

    expect(result.searchDurationMs).toBeDefined();
    expect(result.jobs).toBeDefined();
  }, AUDIT_TIMEOUT_MS);

  it("Scenario 3: India-wide role search (Software Engineer, country=IN)", async () => {
    const t0 = performance.now();
    const result = await liveJobSearchEngine.searchLiveJobs({
      query: "Software Engineer",
      countries: ["IN"],
      page: 1,
      pageSize: 15,
    });
    const totalElapsedMs = Math.round(performance.now() - t0);

    console.log("\n=== SCENARIO 3: India-wide Role Search (Software Engineer, country=IN) ===");
    console.log(`Total Wall-Clock Time: ${totalElapsedMs}ms`);
    console.log(`Engine Reported Duration: ${result.searchDurationMs}ms`);
    console.log(`Total Jobs Found: ${result.jobs.length}`);
    console.log(`Provider Statuses:`);
    result.providerStatuses?.forEach((ps) => {
      console.log(`  - ${ps.providerName}: status=${ps.status}, count=${ps.count}, latency=${ps.latencyMs}ms`);
    });

    expect(result.searchDurationMs).toBeDefined();
    expect(result.jobs.length).toBeGreaterThanOrEqual(0);
  }, AUDIT_TIMEOUT_MS);

  it("Scenario 4: Search where one provider times out (Simulated Provider Timeout with AbortSignal cancellation)", async () => {
    // Register a mock provider that intentionally delays longer than the 5000ms timeout
    let wasAborted = false;
    const slowMockProvider: JobProviderAdapter = {
      id: "slow_mock_provider",
      name: "Slow Mock ATS",
      category: "DIRECT_ATS",
      defaultBaseUrl: "https://slow.mock.test",
      rateLimitPerMinute: 60,
      rateLimitDaily: 1000,
      attributionNotice: "Slow Mock ATS",
      isConfigured: () => true,
      checkHealth: async () => ({
        providerId: "slow_mock_provider",
        isHealthy: true,
        isConfigured: true,
        latencyMs: 10,
        statusMessage: "Mock healthy",
        lastChecked: new Date(),
      }),
      fetchJobs: async (params: ProviderSearchParams): Promise<ProviderFetchResult> => {
        return new Promise((resolve, reject) => {
          if (params.signal) {
            params.signal.addEventListener("abort", () => {
              wasAborted = true;
              reject(new Error("Request aborted by caller signal"));
            });
          }
          // Intentionally sleep for 10 seconds (exceeding 5s timeout)
          setTimeout(() => {
            resolve({
              jobs: [],
              totalAvailable: 0,
              hasMore: false,
              providerId: "slow_mock_provider",
              rawCount: 0,
            });
          }, 10000);
        });
      },
    };

    jobProviderRegistry.register(slowMockProvider);

    try {
      const t0 = performance.now();
      const result = await liveJobSearchEngine.searchLiveJobs({
        query: "Developer",
        providerIds: ["freehire", "slow_mock_provider"],
        page: 1,
        pageSize: 15,
      });
      const totalElapsedMs = Math.round(performance.now() - t0);

      console.log("\n=== SCENARIO 4: One Provider Times Out ===");
      console.log(`Total Wall-Clock Time: ${totalElapsedMs}ms`);
      console.log(`Engine Reported Duration: ${result.searchDurationMs}ms`);
      console.log(`Underlying Provider AbortSignal triggered: ${wasAborted}`);
      console.log(`Provider Statuses:`);
      result.providerStatuses?.forEach((ps) => {
        console.log(`  - ${ps.providerName}: status=${ps.status}, count=${ps.count}, latency=${ps.latencyMs}ms, error=${ps.error || "none"}`);
      });

      const slowStatus = result.providerStatuses?.find((ps) => ps.providerId === "slow_mock_provider");
      const freehireStatus = result.providerStatuses?.find((ps) => ps.providerId === "freehire");

      expect(slowStatus).toBeDefined();
      expect(slowStatus!.status).toBe("TIMEOUT");
      expect(wasAborted).toBe(true);

      // Verify that FreeHire results were NOT erased by slow provider timeout
      expect(freehireStatus).toBeDefined();
      expect(freehireStatus!.status).toBe("SUCCESS");
      expect(result.jobs.length).toBeGreaterThan(0);
    } finally {
      jobProviderRegistry.unregister("slow_mock_provider");
    }
  }, AUDIT_TIMEOUT_MS);

  it("Scenario 5: Search where DeepSeek AI times out (Simulated 1800ms AI Timeout)", async () => {
    // Mock nvidiaDeepSeek.callStructured to simulate an upstream timeout
    const originalCallStructured = nvidiaDeepSeek.callStructured.bind(nvidiaDeepSeek);
    vi.spyOn(nvidiaDeepSeek, "callStructured").mockImplementation(async (options: any) => {
      // Simulate timeout
      return {
        success: false,
        error: `DeepSeek query timed out after ${options.timeoutMs || 1800}ms`,
        latencyMs: options.timeoutMs || 1800,
        isTimeout: true,
      };
    });

    try {
      const t0 = performance.now();
      // Use query without high-confidence bypass to force AI call path
      const result = await liveJobSearchEngine.searchLiveJobs({
        query: "Looking for an exciting backend position with competitive compensation",
        providerIds: ["freehire"],
        page: 1,
        pageSize: 15,
      });
      const totalElapsedMs = Math.round(performance.now() - t0);

      console.log("\n=== SCENARIO 5: DeepSeek AI Times Out ===");
      console.log(`Total Wall-Clock Time: ${totalElapsedMs}ms`);
      console.log(`Engine Reported Duration: ${result.searchDurationMs}ms`);
      console.log(`Interpreted Plan AI Status: ${result.interpretedPlan?.isAiInterpreted}`);
      console.log(`Interpreted Summary: "${result.interpretedPlan?.intentSummary}"`);
      console.log(`Total Jobs Returned: ${result.jobs.length}`);

      expect(result.interpretedPlan?.isAiInterpreted).toBe(false);
      expect(result.jobs).toBeDefined();
      // Ensure search did not fail or hang
      expect(result.providerStatuses?.[0]?.status).toBe("SUCCESS");
    } finally {
      vi.restoreAllMocks();
    }
  }, AUDIT_TIMEOUT_MS);
});
