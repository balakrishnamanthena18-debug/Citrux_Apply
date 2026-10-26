import { describe, it, expect } from "vitest";
import { calculateRelevance } from "@/lib/job-discovery/relevance";

describe("Job Discovery Relevance Engine", () => {
  const sampleJob = {
    title: "Senior Full Stack React Engineer",
    companyName: "Stripe",
    jobDescription: "Build modern financial dashboards with React, TypeScript, Next.js, and GraphQL.",
    requiredSkills: ["React", "TypeScript", "Next.js", "GraphQL"],
    preferredSkills: ["PostgreSQL", "Docker"],
    industry: "finance_banking",
    seniorityLevel: "SENIOR",
    workArrangement: "REMOTE",
    country: "US",
    city: "San Francisco",
    postedAt: new Date(Date.now() - 1 * 86400000), // 1 day ago
  };

  it("calculates high relevance for exact keyword title and skills match", () => {
    const res = calculateRelevance(sampleJob, {
      query: "React Engineer",
      skills: ["React", "TypeScript"],
      industries: ["finance_banking"],
      workArrangements: ["REMOTE"],
      seniorityLevels: ["SENIOR"],
    });

    expect(res.overallScore).toBeGreaterThanOrEqual(85);
    expect(res.reasons.length).toBeGreaterThan(0);
    expect(res.reasons.some((r) => r.includes("title"))).toBe(true);
    expect(res.reasons.some((r) => r.includes("skills"))).toBe(true);
  });

  it("provides transparent breakdown for partial keyword matches", () => {
    const res = calculateRelevance(sampleJob, {
      query: "Java Backend Engineer",
    });

    expect(res.titleScore).toBeLessThan(20);
    expect(res.overallScore).toBeLessThan(60);
  });

  it("incorporates skills overlap accurately", () => {
    const res = calculateRelevance(sampleJob, {
      skills: ["React", "TypeScript", "Next.js", "GraphQL"],
    });

    expect(res.skillsScore).toBe(25); // 100% of requested skills matched
  });

  it("incorporates recency signals for fresh postings", () => {
    const freshJob = {
      ...sampleJob,
      postedAt: new Date(Date.now() - 1 * 86400000), // 1 day old
    };

    const staleJob = {
      ...sampleJob,
      postedAt: new Date(Date.now() - 60 * 86400000), // 60 days old
    };

    const freshRes = calculateRelevance(freshJob, {});
    const staleRes = calculateRelevance(staleJob, {});

    expect(freshRes.freshnessScore).toBeGreaterThan(staleRes.freshnessScore);
  });

  it("does not reject jobs based on protected characteristics", () => {
    // Relevance scoring only evaluates professional attributes (skills, title, experience, location)
    const res = calculateRelevance(sampleJob, {
      query: "Engineer",
    });

    expect(res.overallScore).toBeGreaterThan(0);
    expect(res.reasons.every((r) => !r.includes("age") && !r.includes("gender"))).toBe(true);
  });
});
