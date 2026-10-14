import { describe, it, expect } from "vitest";
import { HELP_DICTIONARY, getHelpTopic, HelpTopicKey } from "@/lib/help/dictionary";

describe("OOS Enterprise Contextual Help System", () => {
  describe("Domain Dictionary Truth & Structure", () => {
    it("defines valid structure for all help topics", () => {
      const keys = Object.keys(HELP_DICTIONARY) as HelpTopicKey[];
      expect(keys.length).toBeGreaterThanOrEqual(15);

      for (const key of keys) {
        const topic = HELP_DICTIONARY[key];
        expect(topic).toBeDefined();
        expect(topic.title).toBeTruthy();
        expect(typeof topic.title).toBe("string");
        expect(topic.whatItMeans).toBeTruthy();
        expect(typeof topic.whatItMeans).toBe("string");
        expect(["CANDIDATE", "STAFF", "ADMIN", "UNIVERSAL"]).toContain(topic.audience);
      }
    });

    it("returns correct topic definition via getHelpTopic helper", () => {
      const topic = getHelpTopic("active_pipeline");
      expect(topic).toBeDefined();
      expect(topic?.title).toBe("Active Pipeline");
      expect(topic?.whatItMeans).toContain("All applications currently in flight");
      expect(topic?.whyItMatters).toBeTruthy();
      expect(topic?.whatToDo).toBeTruthy();
    });

    it("returns undefined for unknown topic keys gracefully", () => {
      // @ts-expect-error Testing invalid runtime key
      const unknownTopic = getHelpTopic("non_existent_topic_key_123");
      expect(unknownTopic).toBeUndefined();
    });
  });

  describe("Candidate Privacy Boundaries", () => {
    it("ensures candidate-facing topics do not leak internal operational secrets", () => {
      const candidateTopics = Object.entries(HELP_DICTIONARY).filter(
        ([, def]) => def.audience === "CANDIDATE"
      );

      expect(candidateTopics.length).toBeGreaterThan(0);

      // Sensitive terms forbidden in candidate explanations
      const forbiddenTokens = [
        "qa scorecard",
        "internal margin",
        "employee performance",
        "staff penalty",
        "confidential notes",
        "private score",
        "hidden rating",
        "profit margin",
      ];

      for (const [key, def] of candidateTopics) {
        const allText = `${def.title} ${def.whatItMeans} ${def.whyItMatters || ""} ${def.whatToDo || ""}`.toLowerCase();

        for (const token of forbiddenTokens) {
          expect(allText.includes(token)).toBe(false);
        }
      }
    });

    it("truthfully explains candidate consent boundaries for application approvals", () => {
      const approvalTopic = getHelpTopic("awaiting_approval");
      expect(approvalTopic).toBeDefined();
      expect(approvalTopic?.whatItMeans).toContain("Tailored materials");
      expect(approvalTopic?.whyItMatters).toContain("candidate consent boundary");
    });

    it("truthfully reflects submission receipts and employer portal intake", () => {
      const submittedTopic = getHelpTopic("submitted_applications");
      expect(submittedTopic).toBeDefined();
      expect(submittedTopic?.whatItMeans).toContain("submission desk has successfully completed");
      expect(submittedTopic?.whyItMatters).toContain("receipt");
    });
  });

  describe("Staff & Governance Boundaries", () => {
    it("truthfully explains WCOS capacity and SLA deadline rules", () => {
      const slaTopic = getHelpTopic("task_sla_deadline");
      expect(slaTopic).toBeDefined();
      expect(slaTopic?.whatItMeans).toContain("deterministic completion deadline");
      expect(slaTopic?.whyItMatters).toContain("reassignment does not reset");

      const capacityTopic = getHelpTopic("capacity_units");
      expect(capacityTopic).toBeDefined();
      expect(capacityTopic?.title).toBe("Capacity Units (CU)");
      expect(capacityTopic?.whatItMeans).toContain("cognitive and operational workload");
    });

    it("truthfully reflects CBOS contract immutability and invoice rules", () => {
      const invoiceTopic = getHelpTopic("invoice_immutability");
      expect(invoiceTopic).toBeDefined();
      expect(invoiceTopic?.whatItMeans).toContain("immutable");
      expect(invoiceTopic?.whyItMatters).toContain("credit memo");
    });

    it("truthfully reflects Admin role and server-side policy enforcement", () => {
      const roleTopic = getHelpTopic("role_permissions");
      expect(roleTopic).toBeDefined();
      expect(roleTopic?.whatItMeans).toContain("authorized to view or mutate");
      expect(roleTopic?.whyItMatters).toContain("Row-Level Security (RLS)");
    });
  });
});
