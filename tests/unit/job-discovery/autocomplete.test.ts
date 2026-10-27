import { describe, it, expect, vi, beforeEach } from "vitest";
import { JobDiscoveryAutocompleteEngine } from "@/lib/job-discovery/autocomplete";
import { prisma } from "@/lib/db/prisma";
import { GET } from "@/app/api/jobs/autocomplete/route";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    job: {
      findMany: vi.fn(),
    },
    discoveredJob: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn().mockResolvedValue({
    userId: "mock-user-id",
    orgId: "mock-org-id",
    role: "EMPLOYEE",
  }),
  requireAdmin: vi.fn(),
  requireEmployeeOrAdmin: vi.fn(),
}));

describe("Job Discovery Location-Aware Autocomplete Engine", () => {
  let engine: JobDiscoveryAutocompleteEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new JobDiscoveryAutocompleteEngine();
    (prisma.job.findMany as any).mockResolvedValue([]);
    (prisma.discoveredJob.findMany as any).mockResolvedValue([]);
  });

  describe("Main Search Box Autocomplete", () => {
    it("suggests job titles, skills, employers, and locations for tech search", async () => {
      const results = await engine.searchAutocomplete({
        query: "React",
        type: "main",
        limit: 8,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(8);

      const categories = results.map((r) => r.category);
      expect(categories).toContain("skill"); // React is a canonical skill

      const reactSkill = results.find((r) => r.text.toLowerCase() === "react");
      expect(reactSkill).toBeDefined();
      expect(reactSkill?.badgeLabel).toBe("Skill");
    });

    it("suggests occupational job titles with high relevance score", async () => {
      const results = await engine.searchAutocomplete({
        query: "Software Engineer",
        type: "main",
        limit: 8,
      });

      const titleMatch = results.find(
        (r) => r.category === "title" && r.text.toLowerCase().includes("software engineer")
      );
      expect(titleMatch).toBeDefined();
      expect(titleMatch?.badgeLabel).toBe("Job Title");
    });

    it("suggests verified employers / companies", async () => {
      const results = await engine.searchAutocomplete({
        query: "Stripe",
        type: "main",
        limit: 8,
      });

      const employerMatch = results.find(
        (r) => r.category === "employer" && r.text.toLowerCase().includes("stripe")
      );
      expect(employerMatch).toBeDefined();
      expect(employerMatch?.badgeLabel).toBe("Company");
    });

    it("prioritizes locations matching selected country affinity", async () => {
      const usResults = await engine.searchAutocomplete({
        query: "San",
        type: "main",
        country: "US",
        limit: 8,
      });

      const usLoc = usResults.find(
        (r) => r.category === "location" && r.country === "US"
      );
      expect(usLoc).toBeDefined();
      expect(usLoc?.text).toMatch(/San Francisco|San Jose|San Diego/i);
    });

    it("respects the bounded suggestion limit strictly", async () => {
      const results = await engine.searchAutocomplete({
        query: "e",
        type: "main",
        limit: 5,
      });

      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe("Location-Specific State / Region Autocomplete", () => {
    it("suggests US states when country is US", async () => {
      const results = await engine.searchAutocomplete({
        query: "Cal",
        type: "state",
        country: "US",
        limit: 8,
      });

      expect(results.length).toBeGreaterThan(0);
      const cal = results.find((r) => r.text === "California");
      expect(cal).toBeDefined();
      expect(cal?.country).toBe("US");
      expect(cal?.badgeLabel).toBe("State / Region");
    });

    it("suggests Indian states when country is IN", async () => {
      const results = await engine.searchAutocomplete({
        query: "Karn",
        type: "state",
        country: "IN",
        limit: 8,
      });

      const karnataka = results.find((r) => r.text === "Karnataka");
      expect(karnataka).toBeDefined();
      expect(karnataka?.country).toBe("IN");
    });

    it("suggests German states when country is DE", async () => {
      const results = await engine.searchAutocomplete({
        query: "Bav",
        type: "state",
        country: "DE",
        limit: 8,
      });

      const bavaria = results.find((r) => r.text === "Bavaria");
      expect(bavaria).toBeDefined();
      expect(bavaria?.country).toBe("DE");
    });

    it("suggests Canadian provinces when country is CA", async () => {
      const results = await engine.searchAutocomplete({
        query: "Ont",
        type: "state",
        country: "CA",
        limit: 8,
      });

      const ontario = results.find((r) => r.text === "Ontario");
      expect(ontario).toBeDefined();
      expect(ontario?.country).toBe("CA");
    });
  });

  describe("Location-Specific City Autocomplete", () => {
    it("suggests cities filtered by both country and state", async () => {
      const results = await engine.searchAutocomplete({
        query: "San",
        type: "city",
        country: "US",
        state: "California",
        limit: 8,
      });

      expect(results.length).toBeGreaterThan(0);
      const sf = results.find((r) => r.text === "San Francisco");
      const sj = results.find((r) => r.text === "San Jose");
      expect(sf || sj).toBeDefined();
      expect(results.every((r) => r.country === "US")).toBe(true);
      expect(results.every((r) => r.state === "California")).toBe(true);
      expect(results[0]?.badgeLabel).toBe("City");
    });

    it("suggests Indian cities filtered by country IN and state Karnataka", async () => {
      const results = await engine.searchAutocomplete({
        query: "Beng",
        type: "city",
        country: "IN",
        state: "Karnataka",
        limit: 8,
      });

      const blr = results.find((r) => r.text === "Bengaluru");
      expect(blr).toBeDefined();
      expect(blr?.country).toBe("IN");
      expect(blr?.state).toBe("Karnataka");
    });

    it("suggests UK cities when country is GB", async () => {
      const results = await engine.searchAutocomplete({
        query: "Lon",
        type: "city",
        country: "GB",
        limit: 8,
      });

      const london = results.find((r) => r.text === "London");
      expect(london).toBeDefined();
      expect(london?.country).toBe("GB");
    });
  });

  describe("Database Integration & Real Data Merging", () => {
    it("incorporates verified job titles from database catalog", async () => {
      (prisma.job.findMany as any).mockResolvedValueOnce([
        { title: "Lead Quantum Engineer", companyName: "Q-Lab" },
      ]);

      const results = await engine.searchAutocomplete({
        query: "Quantum",
        type: "main",
        limit: 8,
      });

      const match = results.find((r) => r.text.includes("Quantum"));
      expect(match).toBeDefined();
      expect(match?.source).toBe("catalog");
    });

    it("incorporates verified employers from database catalog", async () => {
      (prisma.job.findMany as any).mockImplementation(async (args: any) => {
        if (args?.where?.companyName) {
          return [{ companyName: "DeepMind Tech Labs" }];
        }
        return [];
      });

      const results = await engine.searchAutocomplete({
        query: "DeepMind",
        type: "main",
        limit: 8,
      });

      const match = results.find((r) => r.text.includes("DeepMind"));
      expect(match).toBeDefined();
      expect(match?.badgeLabel).toBe("Company");
    });

    it("handles database exceptions gracefully without crashing", async () => {
      (prisma.job.findMany as any).mockRejectedValueOnce(
        new Error("Database connection pool exhausted")
      );

      const results = await engine.searchAutocomplete({
        query: "Python",
        type: "main",
        limit: 8,
      });

      // Still returns taxonomy results
      expect(results.length).toBeGreaterThan(0);
      const python = results.find((r) => r.text === "Python");
      expect(python).toBeDefined();
    });
  });

  describe("GET /api/jobs/autocomplete Route", () => {
    it("returns 200 with suggestions array", async () => {
      const req = new NextRequest("http://localhost:3000/api/jobs/autocomplete?q=React&type=main&limit=5");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty("suggestions");
      expect(Array.isArray(json.suggestions)).toBe(true);
      expect(json.suggestions.length).toBeLessThanOrEqual(5);
    });

    it("returns location-specific state suggestions via route", async () => {
      const req = new NextRequest("http://localhost:3000/api/jobs/autocomplete?q=Cal&type=state&country=US");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.suggestions.some((s: any) => s.text === "California")).toBe(true);
    });

    it("returns 401 Unauthorized when user context fails authentication", async () => {
      const { getAuthenticatedContext } = await import("@/lib/auth/context");
      (getAuthenticatedContext as any).mockRejectedValueOnce(
        Object.assign(new Error("User is not authenticated"), { name: "AuthenticationError" })
      );

      const req = new NextRequest("http://localhost:3000/api/jobs/autocomplete?q=React");
      const res = await GET(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("bounds excessive limit parameter to max allowed threshold", async () => {
      const req = new NextRequest("http://localhost:3000/api/jobs/autocomplete?q=Engineer&limit=9999");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.suggestions.length).toBeLessThanOrEqual(25);
    });
  });
});
