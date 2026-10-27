import { describe, it, expect } from "vitest";
import { calculateDeterministicRelevance } from "@/lib/job-discovery/ai-relevance";

describe("Calibrated Hybrid Relevance Ranking", () => {
  const baseJob = {
    title: "Senior Full Stack Engineer",
    companyName: "Acme Tech",
    jobDescription: "We are seeking a Senior Full Stack Developer proficient in React, Node.js, and PostgreSQL. 5+ years experience required.",
    requiredSkills: ["React", "Node.js", "PostgreSQL"],
    experienceMin: 5,
    workArrangement: "HYBRID",
    city: "Bengaluru",
    state: "Karnataka",
    country: "IN",
  };

  it("calculates high score for matching skills, role, and location", () => {
    const res = calculateDeterministicRelevance(baseJob, {
      query: "Full Stack Engineer",
      requiredSkills: ["React", "Node.js"],
      cities: ["Bengaluru"],
      workArrangements: ["HYBRID"],
    });

    expect(res.overallScore).toBeGreaterThanOrEqual(80);
    expect(res.skillsScore).toBeGreaterThanOrEqual(30); // 35% weight
    expect(res.scoringVersion).toBe("v2-calibrated-deterministic");
    expect(res.reasons.length).toBeGreaterThan(0);
  });

  it("penalizes jobs violating mandatory negative keyword constraints", () => {
    const res = calculateDeterministicRelevance(baseJob, {
      query: "Full Stack",
      excludedKeywords: ["acme"], // Excluded employer
    });

    expect(res.mandatoryConstraintViolated).toBe(true);
    expect(res.overallScore).toBeLessThanOrEqual(25);
    expect(res.reasons.some((r) => r.includes("Contains excluded term"))).toBe(true);
  });

  it("does not severely penalize jobs with unstated salary or unstated experience", () => {
    const jobWithoutSalary = {
      ...baseJob,
      experienceMin: null,
      salaryMin: null,
    };

    const res = calculateDeterministicRelevance(jobWithoutSalary, {
      query: "Senior Full Stack",
      experienceMin: 3,
    });

    // Score remains solid because missing fields are not counted as confirmed failures
    expect(res.overallScore).toBeGreaterThanOrEqual(60);
  });
});
