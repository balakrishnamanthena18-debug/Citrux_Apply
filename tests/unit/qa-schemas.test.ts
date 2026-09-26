import { describe, it, expect } from "vitest";
import {
  CompleteQaReviewSchema,
  CandidateApproveApplicationSchema,
  CandidateRequestRevisionSchema,
  QA_CRITERION_KEYS,
} from "@/lib/validation/qa.schemas";

describe("Phase 5 QA Schemas Unit Tests", () => {
  const validAppId = "11111111-1111-1111-1111-111111111111";

  const buildChecklist = (allVerified: boolean = true) =>
    QA_CRITERION_KEYS.map((criterionKey) => ({
      criterionKey,
      isVerified: allVerified,
    }));

  describe("CompleteQaReviewSchema", () => {
    it("accepts valid QA PASS review with all 9 criteria verified and optional notes", () => {
      const validPass = {
        applicationId: validAppId,
        decision: "PASS",
        notes: null,
        checklistItems: buildChecklist(true),
      };

      const result = CompleteQaReviewSchema.safeParse(validPass);
      expect(result.success).toBe(true);
    });

    it("accepts valid QA FAIL review with non-empty failure notes", () => {
      const validFail = {
        applicationId: validAppId,
        decision: "FAIL",
        notes: "Resume missing required certifications for backend role.",
        checklistItems: buildChecklist(false),
      };

      const result = CompleteQaReviewSchema.safeParse(validFail);
      expect(result.success).toBe(true);
    });

    it("rejects QA FAIL review when notes are missing, empty, or whitespace only", () => {
      const failWithoutNotes = {
        applicationId: validAppId,
        decision: "FAIL",
        notes: "   ",
        checklistItems: buildChecklist(false),
      };

      const result = CompleteQaReviewSchema.safeParse(failWithoutNotes);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("Mandatory failure/rework notes must be provided");
      }
    });

    it("rejects checklist with fewer than 9 criteria", () => {
      const incompleteChecklist = {
        applicationId: validAppId,
        decision: "PASS",
        checklistItems: buildChecklist(true).slice(0, 8),
      };

      const result = CompleteQaReviewSchema.safeParse(incompleteChecklist);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("Exactly 9 QA criteria must be evaluated");
      }
    });

    it("rejects checklist with duplicate criteria keys", () => {
      const duplicateItems = buildChecklist(true).slice(0, 8);
      duplicateItems.push({
        criterionKey: "CANDIDATE_JOB_ALIGNMENT",
        isVerified: true,
      });

      const input = {
        applicationId: validAppId,
        decision: "PASS",
        checklistItems: duplicateItems,
      };

      const result = CompleteQaReviewSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("Every authoritative QA criterion key must appear exactly once");
      }
    });

    it("rejects checklist with unknown criterion key", () => {
      const items = buildChecklist(true).slice(0, 8);
      (items as any).push({
        criterionKey: "UNKNOWN_CRITERION_KEY",
        isVerified: true,
      });

      const input = {
        applicationId: validAppId,
        decision: "PASS",
        checklistItems: items,
      };

      const result = CompleteQaReviewSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("CandidateApproveApplicationSchema", () => {
    it("accepts valid application UUID", () => {
      const result = CandidateApproveApplicationSchema.safeParse({ applicationId: validAppId });
      expect(result.success).toBe(true);
    });

    it("rejects invalid UUID", () => {
      const result = CandidateApproveApplicationSchema.safeParse({ applicationId: "not-a-uuid" });
      expect(result.success).toBe(false);
    });
  });

  describe("CandidateRequestRevisionSchema", () => {
    it("accepts valid revision notes with min 5 characters", () => {
      const result = CandidateRequestRevisionSchema.safeParse({
        applicationId: validAppId,
        revisionNotes: "Please update my graduation date on the resume.",
      });
      expect(result.success).toBe(true);
    });

    it("rejects revision notes shorter than 5 characters", () => {
      const result = CandidateRequestRevisionSchema.safeParse({
        applicationId: validAppId,
        revisionNotes: "Fix",
      });
      expect(result.success).toBe(false);
    });
  });
});
