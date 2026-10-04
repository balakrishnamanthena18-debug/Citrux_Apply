import { describe, it, expect } from "vitest";
import { StartApplicationDeskSchema } from "@/lib/validation/application.schemas";

describe("StartApplicationDeskSchema — Candidate → Job → Application", () => {
  const candidateId = "44444444-4444-4444-8444-444444444444";
  const jobId = "55555555-5555-4555-8555-555555555555";

  it("requires candidateId", () => {
    const result = StartApplicationDeskSchema.safeParse({
      jobId,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("candidateId"))).toBe(true);
    }
  });

  it("requires jobId", () => {
    const result = StartApplicationDeskSchema.safeParse({
      candidateId,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("jobId"))).toBe(true);
    }
  });

  it("accepts candidateId + jobId without duplicating job fields", () => {
    const result = StartApplicationDeskSchema.safeParse({
      candidateId,
      jobId,
      internalNotes: "Prep notes",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.candidateId).toBe(candidateId);
      expect(result.data.jobId).toBe(jobId);
      expect(result.data.internalNotes).toBe("Prep notes");
      expect(result.data).not.toHaveProperty("companyName");
      expect(result.data).not.toHaveProperty("title");
    }
  });

  it("rejects invalid UUIDs", () => {
    const result = StartApplicationDeskSchema.safeParse({
      candidateId: "not-a-uuid",
      jobId: "also-bad",
    });
    expect(result.success).toBe(false);
  });
});
