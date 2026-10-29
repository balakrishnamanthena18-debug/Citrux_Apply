import { describe, it, expect } from "vitest";
import React from "react";
import fs from "fs";
import path from "path";
import { ApplicationWorkspaceHeader } from "@/components/application/ApplicationWorkspaceHeader";
import { ApplicationNextActionHero } from "@/components/application/ApplicationNextActionHero";
import { ApplicationWorkbenchTabs } from "@/components/application/ApplicationWorkbenchTabs";

describe("Application Workspace UX Simplification & Redesign Tests", () => {
  const headerPath = path.resolve(
    __dirname,
    "../../../src/components/application/ApplicationWorkspaceHeader.tsx"
  );
  const heroPath = path.resolve(
    __dirname,
    "../../../src/components/application/ApplicationNextActionHero.tsx"
  );
  const tabsPath = path.resolve(
    __dirname,
    "../../../src/components/application/ApplicationWorkbenchTabs.tsx"
  );

  const headerContent = fs.readFileSync(headerPath, "utf8");
  const heroContent = fs.readFileSync(heroPath, "utf8");
  const tabsContent = fs.readFileSync(tabsPath, "utf8");

  describe("1. Component Exports and Client Directives", () => {
    it("exports ApplicationWorkspaceHeader as a client component", () => {
      expect(ApplicationWorkspaceHeader).toBeDefined();
      expect(typeof ApplicationWorkspaceHeader).toBe("function");
      expect(headerContent).toContain('"use client";');
    });

    it("exports ApplicationNextActionHero as a client component", () => {
      expect(ApplicationNextActionHero).toBeDefined();
      expect(typeof ApplicationNextActionHero).toBe("function");
      expect(heroContent).toContain('"use client";');
    });

    it("exports ApplicationWorkbenchTabs as a client component", () => {
      expect(ApplicationWorkbenchTabs).toBeDefined();
      expect(typeof ApplicationWorkbenchTabs).toBe("function");
      expect(tabsContent).toContain('"use client";');
    });
  });

  describe("2. Task-First Next-Action Hero State Coverage", () => {
    it("handles PREPARING state with missing materials", () => {
      expect(heroContent).toContain('"Complete application preparation"');
      expect(heroContent).toContain('"Continue Preparation"');
      expect(heroContent).toContain('targetTab: "prep_review"');
    });

    it("handles PREPARING state with attached materials ready for QA", () => {
      expect(heroContent).toContain('"Application materials ready for QA"');
      expect(heroContent).toContain('"Submit for QA Review"');
    });

    it("handles REVIEW state with QA Reviewer accountability", () => {
      expect(heroContent).toContain('"Application awaiting quality review"');
      expect(heroContent).toContain('accountableRole: "QA Reviewer"');
      expect(heroContent).toContain('"Review Application"');
    });

    it("handles AWAITING_APPROVAL state with Candidate accountability and disabled direct submit", () => {
      expect(heroContent).toContain('"Waiting for candidate approval"');
      expect(heroContent).toContain('accountableRole: "Candidate"');
      expect(heroContent).toContain('isActionDisabled: true');
    });

    it("handles READY state with Open Employer Application action", () => {
      expect(heroContent).toContain('"Ready to submit"');
      expect(heroContent).toContain('"Open Employer Application & Submit"');
      expect(heroContent).toContain('targetTab: "submission"');
    });

    it("handles SUBMITTED state with view submission evidence action", () => {
      expect(heroContent).toContain('"Application submitted to employer"');
      expect(heroContent).toContain('"View Submission Evidence"');
    });

    it("handles SUBMISSION_ISSUE state with start incident review action", () => {
      expect(heroContent).toContain('"Submission issue reported"');
      expect(heroContent).toContain('"Start Incident Review"');
    });

    it("handles REVIEW_REQUIRED state with approve correction plan action", () => {
      expect(heroContent).toContain('"Incident review required"');
      expect(heroContent).toContain('"Approve Correction Plan"');
    });

    it("handles RESUBMISSION state with record resubmission action", () => {
      expect(heroContent).toContain('"Resubmission staged"');
      expect(heroContent).toContain('"Record Resubmission"');
    });
  });

  describe("3. Consolidated Actionable Blockers", () => {
    it("prioritizes inactive owner as critical blocker", () => {
      expect(heroContent).toContain('id: "owner_inactive"');
      expect(heroContent).toContain('"Accountable owner is inactive"');
      expect(heroContent).toContain('"Reassign Application"');
    });

    it("prioritizes unsafe destination URL as critical blocker", () => {
      expect(heroContent).toContain('id: "unsafe_url"');
      expect(heroContent).toContain('"Employer destination blocked by security check"');
    });

    it("supports progressive disclosure for secondary blockers", () => {
      expect(heroContent).toContain("showAllBlockers");
      expect(heroContent).toContain("setShowAllBlockers");
    });
  });

  describe("4. Simplified 4-Stage Linear Progression", () => {
    it("defines the 4 internal stages: Preparation, Quality Review, Approval, Ready to Submit", () => {
      expect(heroContent).toContain('{ id: "PREPARATION", label: "Preparation", stepNumber: 1 }');
      expect(heroContent).toContain('{ id: "QUALITY_REVIEW", label: "Quality Review", stepNumber: 2 }');
      expect(heroContent).toContain('{ id: "APPROVAL", label: "Approval", stepNumber: 3 }');
      expect(heroContent).toContain('{ id: "READY", label: "Ready to Submit", stepNumber: 4 }');
    });

    it("keeps external submission status as a distinct status pill", () => {
      expect(heroContent).toContain("External Status:");
      expect(heroContent).toContain("workflow.external.badgeClass");
      expect(heroContent).toContain("workflow.external.label");
    });
  });

  describe("5. Streamlined 4-Tab Workspace", () => {
    it("defines exactly 4 core tabs: overview, prep_review, submission, activity", () => {
      expect(tabsContent).toContain('id: "overview"');
      expect(tabsContent).toContain('label: "Overview"');
      expect(tabsContent).toContain('id: "prep_review"');
      expect(tabsContent).toContain('label: "Preparation & Review"');
      expect(tabsContent).toContain('id: "submission"');
      expect(tabsContent).toContain('label: "Submission Desk"');
      expect(tabsContent).toContain('id: "activity"');
      expect(tabsContent).toContain('label: "Activity & Outcomes"');
    });

    it("normalizes legacy tab names gracefully for backward compatibility", () => {
      expect(tabsContent).toContain('if (rawTab === "materials" || rawTab === "prep_review") return "prep_review";');
      expect(tabsContent).toContain('if (rawTab === "interviews" || rawTab === "timeline" || rawTab === "activity") return "activity";');
    });

    it("supports legacy slot props gracefully", () => {
      expect(tabsContent).toContain("const resolvedPrepReviewContent = prepReviewSlot || materialsSlot;");
      expect(tabsContent).toContain("const resolvedActivityContent =");
    });
  });
});
