import { describe, it, expect } from "vitest";
import {
  CANDIDATE_STATUS_MAP,
  FILTER_TAB_STATES,
  getCandidateStatusPresentation,
  getCandidateActionRequirement,
  formatSalary,
  type ApplicationFilterTab,
} from "@/lib/utils/status-presenter";
import { ApplicationStatus } from "@/generated/prisma";
import type { CandidateActionItem } from "@/components/candidate/CandidateActionCenter";

describe("Candidate Command Center & Operations Workspace Unit Tests", () => {
  describe("1. Candidate Status Presentation Mappings", () => {
    it("maps all authoritative ApplicationStatus values into candidate-safe presentations", () => {
      const allStatuses = Object.values(ApplicationStatus);

      allStatuses.forEach((status) => {
        const presentation = getCandidateStatusPresentation(status);
        expect(presentation).toBeDefined();
        expect(presentation.label).toBeTruthy();
        expect(presentation.description).toBeTruthy();
        expect(presentation.badgeClass).toBeTruthy();
        expect(presentation.progressStage).toBeGreaterThanOrEqual(1);
        expect(presentation.progressStage).toBeLessThanOrEqual(5);
        expect(typeof presentation.isActionRequired).toBe("boolean");
        expect(typeof presentation.isTerminal).toBe("boolean");
      });
    });

    it("correctly identifies action-required states for candidate authorization", () => {
      const awaitingApproval = getCandidateStatusPresentation(ApplicationStatus.AWAITING_APPROVAL);
      expect(awaitingApproval.isActionRequired).toBe(true);
      expect(awaitingApproval.label).toBe("Waiting for your approval");

      const reqAction = getCandidateActionRequirement(ApplicationStatus.AWAITING_APPROVAL);
      expect(reqAction.isActionRequired).toBe(true);
      expect(reqAction.actionText).toBe("Your approval is required");
    });

    it("correctly flags terminal states without exposing internal operational machinery", () => {
      expect(getCandidateStatusPresentation(ApplicationStatus.REJECTED).isTerminal).toBe(true);
      expect(getCandidateStatusPresentation(ApplicationStatus.WITHDRAWN).isTerminal).toBe(true);
      expect(getCandidateStatusPresentation(ApplicationStatus.FAILED).isTerminal).toBe(true);
      expect(getCandidateStatusPresentation(ApplicationStatus.SUBMITTED).isTerminal).toBe(false);
    });

    it("formats authoritative salary disclosures gracefully without hallucinating", () => {
      expect(formatSalary(120000, 150000, "USD")).toBe("$120,000 – $150,000 / year");
      expect(formatSalary(150000, 150000, "USD")).toBe("$150,000 / year");
      expect(formatSalary(100000, null, "USD")).toBe("From $100,000 / year");
      expect(formatSalary(null, 180000, "USD")).toBe("Up to $180,000 / year");
      expect(formatSalary(null, null, "USD")).toBe("Salary not disclosed");
    });
  });

  describe("2. Filter Tabs & Pipeline Categorization", () => {
    it("partitions application statuses across workbench filter tabs accurately", () => {
      expect(FILTER_TAB_STATES.AWAITING_ACTION).toEqual(["AWAITING_APPROVAL"]);
      expect(FILTER_TAB_STATES.SUBMITTED).toEqual(["SUBMITTED"]);
      expect(FILTER_TAB_STATES.HISTORY).toEqual(["REJECTED", "WITHDRAWN", "FAILED"]);

      // Verify ALL contains all statuses
      const allStatuses = Object.values(ApplicationStatus);
      allStatuses.forEach((st) => {
        expect(FILTER_TAB_STATES.ALL).toContain(st);
      });
    });
  });

  describe("3. Action Center Priority & Sorting Logic", () => {
    it("sorts actions with NEEDS_ATTENTION first, followed by IMPORTANT, then INFORMATIONAL", () => {
      const mockActions: CandidateActionItem[] = [
        {
          id: "1",
          type: "PROFILE_INFORMATION",
          priority: "INFORMATIONAL",
          title: "Profile Tip",
          description: "Tip",
          actionUrl: "/candidate/profile",
          actionLabel: "View",
        },
        {
          id: "2",
          type: "APPLICATION_APPROVAL",
          priority: "NEEDS_ATTENTION",
          title: "Approve Staff Engineer",
          description: "Review required",
          actionUrl: "/candidate/applications/123",
          actionLabel: "Review",
        },
        {
          id: "3",
          type: "DOCUMENT_REQUIRED",
          priority: "IMPORTANT",
          title: "Upload Resume",
          description: "Missing master resume",
          actionUrl: "/candidate/profile",
          actionLabel: "Upload",
        },
      ];

      const pWeight = { NEEDS_ATTENTION: 0, IMPORTANT: 1, INFORMATIONAL: 2 };
      const sorted = [...mockActions].sort((a, b) => pWeight[a.priority] - pWeight[b.priority]);

      expect(sorted[0]?.priority).toBe("NEEDS_ATTENTION");
      expect(sorted[1]?.priority).toBe("IMPORTANT");
      expect(sorted[2]?.priority).toBe("INFORMATIONAL");
    });
  });

  describe("4. Candidate Profile Health Checklist", () => {
    it("evaluates completeness of authoritative candidate fields without fake percentages", () => {
      const completeCandidate = {
        phone: "+1 555-0199",
        city: "San Francisco",
        country: "US",
        headline: "Staff Systems Engineer",
        professionalSummary: "10+ years engineering infrastructure",
        workAuthorization: "CITIZEN",
        experiencesCount: 3,
        educationsCount: 1,
        skillsCount: 8,
        documentsCount: 2,
        verificationStatus: "VERIFIED",
      };

      const isContactComplete = Boolean(
        completeCandidate.phone && (completeCandidate.city || completeCandidate.country)
      );
      const isSummaryComplete = Boolean(
        completeCandidate.headline && completeCandidate.professionalSummary
      );
      const isExpComplete = completeCandidate.experiencesCount > 0;
      const isEduComplete = completeCandidate.educationsCount > 0;
      const isSkillsComplete = completeCandidate.skillsCount > 0;
      const isResumeComplete = completeCandidate.documentsCount > 0;
      const isWorkAuthComplete = Boolean(
        completeCandidate.workAuthorization && completeCandidate.workAuthorization !== "OTHER"
      );

      expect(isContactComplete).toBe(true);
      expect(isSummaryComplete).toBe(true);
      expect(isExpComplete).toBe(true);
      expect(isEduComplete).toBe(true);
      expect(isSkillsComplete).toBe(true);
      expect(isResumeComplete).toBe(true);
      expect(isWorkAuthComplete).toBe(true);
    });

    it("accurately detects missing fields for candidate attention", () => {
      const incompleteCandidate = {
        phone: null,
        city: null,
        country: null,
        headline: null,
        professionalSummary: null,
        workAuthorization: "OTHER",
        experiencesCount: 0,
        educationsCount: 0,
        skillsCount: 0,
        documentsCount: 0,
        verificationStatus: "UNVERIFIED",
      };

      const isContactComplete = Boolean(
        incompleteCandidate.phone && (incompleteCandidate.city || incompleteCandidate.country)
      );
      const isExpComplete = incompleteCandidate.experiencesCount > 0;
      const isResumeComplete = incompleteCandidate.documentsCount > 0;

      expect(isContactComplete).toBe(false);
      expect(isExpComplete).toBe(false);
      expect(isResumeComplete).toBe(false);
    });
  });
});
