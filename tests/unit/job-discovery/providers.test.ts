import { describe, it, expect, vi } from "vitest";
import { FreeHireAdapter } from "@/lib/job-discovery/providers/freehire";
import { ArbeitnowAdapter } from "@/lib/job-discovery/providers/arbeitnow";
import { JobicyAdapter } from "@/lib/job-discovery/providers/jobicy";
import { UsaJobsAdapter } from "@/lib/job-discovery/providers/usajobs";
import { DirectAtsAdapter } from "@/lib/job-discovery/providers/direct-ats";

describe("Job Discovery Provider Adapters", () => {
  describe("FreeHireAdapter", () => {
    it("is configured by default and produces normalized jobs from local snapshot fallback", async () => {
      const adapter = new FreeHireAdapter();
      expect(adapter.isConfigured()).toBe(true);

      // Force network offline so snapshot fallback executes deterministically in unit test
      vi.spyOn(adapter as any, "safeFetch").mockRejectedValue(new Error("Network unreachable in unit test"));

      const result = await adapter.fetchJobs({ pageSize: 5 });
      expect(result.jobs.length).toBeGreaterThan(0);
      expect(result.providerId).toBe("freehire");

      const first = result.jobs[0];
      expect(first).toBeDefined();
      expect(first?.title).toBeDefined();
      expect(first?.companyName).toBeDefined();
      expect(first?.canonicalUrl).toBeDefined();
      expect(first?.contentFingerprint).toBeDefined();
    });

    it("filters snapshot jobs by keyword", () => {
      const adapter = new FreeHireAdapter();
      const result = (adapter as any).fetchFromLocalSnapshot({ keywords: "Nurse", pageSize: 5 });
      expect(result.jobs.length).toBeGreaterThan(0);
      expect(
        result.jobs.every((j: any) =>
          j.title.toLowerCase().includes("nurse") ||
          j.companyName.toLowerCase().includes("nurse") ||
          j.jobDescription.toLowerCase().includes("nurse")
        )
      ).toBe(true);
    });
  });

  describe("ArbeitnowAdapter", () => {
    it("provides free multi-industry adapter contract", () => {
      const adapter = new ArbeitnowAdapter();
      expect(adapter.id).toBe("arbeitnow");
      expect(adapter.isConfigured()).toBe(true);
      expect(adapter.category).toBe("OFFICIAL_API");
    });
  });

  describe("JobicyAdapter", () => {
    it("provides remote jobs adapter contract", () => {
      const adapter = new JobicyAdapter();
      expect(adapter.id).toBe("jobicy");
      expect(adapter.isConfigured()).toBe(true);
      expect(adapter.rateLimitPerMinute).toBe(30);
    });
  });

  describe("UsaJobsAdapter", () => {
    it("reports unconfigured when USAJOBS_API_KEY is not in env and provides mock federal vacancies", async () => {
      delete process.env.USAJOBS_API_KEY;
      const adapter = new UsaJobsAdapter();

      expect(adapter.isConfigured()).toBe(false);

      const health = await adapter.checkHealth();
      expect(health.isConfigured).toBe(false);
      expect(health.statusMessage).toContain("Unconfigured");

      const result = await adapter.fetchJobs({ keywords: "Cybersecurity" });
      expect(result.jobs.length).toBeGreaterThan(0);
      expect(result.jobs[0]?.industry).toBe("public_sector");
      expect(result.jobs[0]?.sourceAttribution).toContain("USAJOBS");
    });
  });

  describe("DirectAtsAdapter", () => {
    it("supports direct Greenhouse board integration", () => {
      const adapter = new DirectAtsAdapter();
      expect(adapter.id).toBe("direct_ats");
      expect(adapter.category).toBe("DIRECT_ATS");
      expect(adapter.isConfigured()).toBe(true);
    });
  });

  describe("SSRF Security Controls (BaseJobProvider)", () => {
    it("strictly blocks localhost, 127.0.0.1, and private networks", async () => {
      const adapter = new FreeHireAdapter();

      // Access protected safeFetch via prototype
      const safeFetchFn = (adapter as any).safeFetch.bind(adapter);

      await expect(safeFetchFn("http://localhost:8080/jobs")).rejects.toThrow(/Forbidden/);
      await expect(safeFetchFn("http://127.0.0.1/admin")).rejects.toThrow(/Forbidden/);
      await expect(safeFetchFn("http://169.254.169.254/latest/meta-data")).rejects.toThrow(/Forbidden/);
      await expect(safeFetchFn("http://192.168.1.1/router")).rejects.toThrow(/Forbidden/);
      await expect(safeFetchFn("http://10.0.0.1/internal")).rejects.toThrow(/Forbidden/);
      await expect(safeFetchFn("file:///etc/passwd")).rejects.toThrow(/Forbidden/);
    });
  });
});
