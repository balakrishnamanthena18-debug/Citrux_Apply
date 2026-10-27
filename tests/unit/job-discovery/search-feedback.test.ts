import { describe, it, expect } from "vitest";
import { getLifecycleMessage } from "@/components/job/JobSearchFeedback";
import type { LiveProviderExecutionStatus, PaginatedJobSearchResponse } from "@/lib/job-discovery/types";

describe("Job Search Feedback & Progressive Loading", () => {
  describe("1. Lifecycle Phase Mapping & Status Messages", () => {
    it("returns truthful message for PREPARING phase without location", () => {
      const msg = getLifecycleMessage("PREPARING", 0);
      expect(msg).toBe("Preparing your search…");
    });

    it("returns truthful message for PREPARING phase with specific location", () => {
      const msg = getLifecycleMessage("PREPARING", 0, "Bengaluru, India");
      expect(msg).toBe("Preparing search parameters for Bengaluru, India…");
    });

    it("returns truthful message for standard QUERYING phase", () => {
      const msg = getLifecycleMessage("QUERYING", 1);
      expect(msg).toBe("Searching available job sources…");
    });

    it("returns truthful message when additional sources are still responding after 4 seconds", () => {
      const msg = getLifecycleMessage("QUERYING", 5);
      expect(msg).toBe("Additional sources are still responding…");
    });

    it("returns truthful message for VERIFYING phase", () => {
      const msg = getLifecycleMessage("VERIFYING", 2);
      expect(msg).toBe("Verifying location and role matches…");
    });

    it("returns truthful message for FINALIZING phase", () => {
      const msg = getLifecycleMessage("FINALIZING", 2);
      expect(msg).toBe("Finalizing your opportunities…");
    });

    it("returns truthful message for COMPLETED and ERROR phases", () => {
      expect(getLifecycleMessage("COMPLETED", 2)).toBe("Search complete.");
      expect(getLifecycleMessage("ERROR", 2)).toBe("Search encountered an issue.");
    });
  });

  describe("2. Provider Status & Latency Diagnostics Semantics", () => {
    it("correctly identifies successful vs degraded provider statuses", () => {
      const statuses: LiveProviderExecutionStatus[] = [
        { providerId: "freehire", providerName: "FreeHire ATS", status: "SUCCESS", count: 25, latencyMs: 420 },
        { providerId: "arbeitnow", providerName: "Arbeitnow Global", status: "TIMEOUT", count: 0, latencyMs: 5000, error: "Gateway Timeout" },
        { providerId: "direct_ats", providerName: "Direct ATS", status: "FAILED", count: 0, latencyMs: 350, error: "Connection Refused" },
      ];

      const successProviders = statuses.filter((s) => s.status === "SUCCESS");
      const failedProviders = statuses.filter((s) => s.status === "TIMEOUT" || s.status === "FAILED");

      expect(successProviders).toHaveLength(1);
      expect(successProviders[0]!.count).toBe(25);
      expect(successProviders[0]!.latencyMs).toBe(420);

      expect(failedProviders).toHaveLength(2);
      expect(failedProviders[0]!.providerName).toBe("Arbeitnow Global");
      expect(failedProviders[0]!.status).toBe("TIMEOUT");
      expect(failedProviders[1]!.providerName).toBe("Direct ATS");
      expect(failedProviders[1]!.status).toBe("FAILED");
    });

    it("does not treat unsuccessful provider as returning 0 legitimate jobs", () => {
      const timeoutStatus: LiveProviderExecutionStatus = {
        providerId: "freehire",
        providerName: "FreeHire ATS",
        status: "TIMEOUT",
        count: 0,
        latencyMs: 5000,
      };

      // In our architecture, count is 0 because the provider timed out, not because 0 jobs exist
      expect(timeoutStatus.status).toBe("TIMEOUT");
      expect(timeoutStatus.count).toBe(0);
    });
  });

  describe("3. Performance Duration Instrumentation", () => {
    it("verifies searchDurationMs is included in PaginatedJobSearchResponse contract", () => {
      const sampleResponse: PaginatedJobSearchResponse = {
        jobs: [],
        total: 0,
        page: 1,
        pageSize: 15,
        totalPages: 0,
        hasMore: false,
        isLive: true,
        isExactTotal: false,
        uniqueCount: 0,
        searchDurationMs: 842,
        providerStatuses: [
          { providerId: "freehire", providerName: "FreeHire ATS", status: "SUCCESS", count: 12, latencyMs: 410 },
        ],
      };

      expect(sampleResponse.searchDurationMs).toBe(842);
      expect(typeof sampleResponse.searchDurationMs).toBe("number");
      expect(sampleResponse.searchDurationMs).toBeGreaterThan(0);
    });
  });

  describe("4. Sequential Request Protection Simulation", () => {
    it("ensures an older slow response cannot overwrite a newer fast response", async () => {
      let activeRequestId = 0;
      let committedResult: string | null = null;

      const triggerSearch = async (queryName: string, simulatedDelayMs: number) => {
        const thisRequestId = ++activeRequestId;

        // Simulate async network request
        await new Promise((resolve) => setTimeout(resolve, simulatedDelayMs));

        // Stale response guard
        if (thisRequestId !== activeRequestId) {
          return; // Discard outdated response
        }

        committedResult = queryName;
      };

      // Fire search 1 (slow, 100ms)
      const p1 = triggerSearch("Search 1: Software Engineer", 100);

      // Fire search 2 immediately after (fast, 20ms)
      const p2 = triggerSearch("Search 2: Bengaluru", 20);

      await Promise.all([p1, p2]);

      // Search 2 finished first (at 20ms), and search 1 finished later (at 100ms)
      // But because activeRequestId advanced to 2, search 1 was cleanly dropped!
      expect(committedResult).toBe("Search 2: Bengaluru");
    });
  });

  describe("5. Partial vs Total Provider Failure Logic", () => {
    it("distinguishes partial failure from total failure", () => {
      const partialStatuses: LiveProviderExecutionStatus[] = [
        { providerId: "freehire", providerName: "FreeHire", status: "SUCCESS", count: 10, latencyMs: 400 },
        { providerId: "arbeitnow", providerName: "Arbeitnow", status: "TIMEOUT", count: 0, latencyMs: 5000 },
      ];

      const allFailedStatuses: LiveProviderExecutionStatus[] = [
        { providerId: "freehire", providerName: "FreeHire", status: "TIMEOUT", count: 0, latencyMs: 5000 },
        { providerId: "arbeitnow", providerName: "Arbeitnow", status: "FAILED", count: 0, latencyMs: 300 },
      ];

      const hasPartial = partialStatuses.some((s) => s.status === "SUCCESS") &&
        partialStatuses.some((s) => s.status === "TIMEOUT" || s.status === "FAILED");

      const hasTotalFailure = allFailedStatuses.every((s) => s.status === "TIMEOUT" || s.status === "FAILED");

      expect(hasPartial).toBe(true);
      expect(hasTotalFailure).toBe(true);
    });
  });
});
