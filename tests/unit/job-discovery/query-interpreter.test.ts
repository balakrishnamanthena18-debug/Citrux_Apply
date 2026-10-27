import { describe, it, expect } from "vitest";
import {
  interpretQueryDeterministic,
  interpretJobSearchQuery,
} from "@/lib/job-discovery/query-interpreter";

describe("DeepSeek & Deterministic Query Interpreter", () => {
  it("interprets 'Bengaluru, Karnataka' as Indian city and state", () => {
    const plan = interpretQueryDeterministic("Bengaluru, Karnataka");
    expect(plan.city).toBe("Bengaluru");
    expect(plan.state).toBe("Karnataka");
    expect(plan.country).toBe("IN");
    expect(plan.intentSummary).toContain("Bengaluru, Karnataka, IN");
  });

  it("interprets 'Hyderabad, Telangana' as Indian city and state", () => {
    const plan = interpretQueryDeterministic("Hyderabad, Telangana");
    expect(plan.city).toBe("Hyderabad");
    expect(plan.state).toBe("Telangana");
    expect(plan.country).toBe("IN");
  });

  it("separates role keywords from location in 'Software Engineer in Bengaluru'", () => {
    const plan = interpretQueryDeterministic("Software Engineer in Bengaluru");
    expect(plan.role?.toLowerCase()).toContain("software engineer");
    expect(plan.city).toBe("Bengaluru");
    expect(plan.country).toBe("IN");
  });

  it("extracts seniority, work mode, and LPA salary", () => {
    const plan = interpretQueryDeterministic(
      "Senior Full Stack Engineer in Bengaluru, hybrid, paying 25 LPA"
    );
    expect(plan.seniority).toBe("SENIOR");
    expect(plan.workArrangement).toBe("HYBRID");
    expect(plan.salaryMin).toBe(2500000);
    expect(plan.salaryCurrency).toBe("INR");
    expect(plan.city).toBe("Bengaluru");
  });

  it("extracts USD salary and remote preference", () => {
    const plan = interpretQueryDeterministic("React Developer remote $150k");
    expect(plan.workArrangement).toBe("REMOTE");
    expect(plan.salaryMin).toBe(150000);
    expect(plan.salaryCurrency).toBe("USD");
  });

  it("handles negative keywords (-intern)", () => {
    const plan = interpretQueryDeterministic("Backend Engineer -intern");
    expect(plan.excludedKeywords).toContain("intern");
  });
});
