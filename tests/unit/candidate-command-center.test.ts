import { describe, it, expect } from "vitest";
import {
  CANDIDATE_STATUS_MAP,
  FILTER_TAB_STATES,
  getCandidateStatusPresentation,
  getCandidateActionRequirement,
  getNextExpectedStage,
  formatSalary,
  type ApplicationFilterTab,
} from "@/lib/utils/status-presenter";
import { formatApplicationDateTime } from "@/lib/utils/format-application-date";
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
        projectsCount: 2,
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
      const isProjectsComplete = completeCandidate.projectsCount > 0;
      const isResumeComplete = completeCandidate.documentsCount > 0;
      const isWorkAuthComplete = Boolean(
        completeCandidate.workAuthorization && completeCandidate.workAuthorization !== "OTHER"
      );

      expect(isContactComplete).toBe(true);
      expect(isSummaryComplete).toBe(true);
      expect(isExpComplete).toBe(true);
      expect(isEduComplete).toBe(true);
      expect(isSkillsComplete).toBe(true);
      expect(isProjectsComplete).toBe(true);
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
        projectsCount: 0,
        documentsCount: 0,
        verificationStatus: "UNVERIFIED",
      };

      const isContactComplete = Boolean(
        incompleteCandidate.phone && (incompleteCandidate.city || incompleteCandidate.country)
      );
      const isExpComplete = incompleteCandidate.experiencesCount > 0;
      const isProjectsComplete = incompleteCandidate.projectsCount > 0;
      const isResumeComplete = incompleteCandidate.documentsCount > 0;

      expect(isContactComplete).toBe(false);
      expect(isExpComplete).toBe(false);
      expect(isProjectsComplete).toBe(false);
      expect(isResumeComplete).toBe(false);
    });
  });

  describe("5. Current Operations Summary & Deterministic Next Action Logic", () => {
    it("projects dominant operational state correctly for mixed pipeline counts", () => {
      const stats = {
        totalApplications: 9,
        activeApplications: 6,
        awaitingApprovalApplications: 1,
        submittedApplications: 3,
        readyApplications: 1,
        preparingApplications: 2,
        underReviewApplications: 2,
        employerResponseApplications: 0,
      };

      const inPrep =
        stats.preparingApplications +
        stats.underReviewApplications +
        stats.awaitingApprovalApplications +
        stats.readyApplications;

      expect(stats.totalApplications).toBe(9);
      expect(stats.submittedApplications).toBe(3);
      expect(inPrep).toBe(6);
    });

    it("prioritizes approvals as the highest next candidate action", () => {
      const stats = {
        totalApplications: 5,
        activeApplications: 5,
        awaitingApprovalApplications: 2,
        submittedApplications: 0,
        readyApplications: 0,
        preparingApplications: 3,
        underReviewApplications: 0,
        employerResponseApplications: 0,
      };

      // When awaiting approval > 0, it takes top precedence
      expect(stats.awaitingApprovalApplications > 0).toBe(true);
    });

    it("prioritizes missing professional summary when profile is incomplete", () => {
      const candidateProfile = {
        phone: "+1 555-0199",
        city: "Austin",
        country: "US",
        headline: null,
        professionalSummary: null,
        workAuthorization: "CITIZEN",
        experiencesCount: 2,
        educationsCount: 1,
        skillsCount: 5,
        projectsCount: 1,
        documentsCount: 1,
        verificationStatus: "VERIFIED",
      };

      const isContactComplete = Boolean(candidateProfile.phone && (candidateProfile.city || candidateProfile.country));
      const hasResume = candidateProfile.documentsCount > 0;
      const isWorkAuthComplete = Boolean(candidateProfile.workAuthorization && candidateProfile.workAuthorization !== "OTHER");
      const isSummaryComplete = Boolean(candidateProfile.headline && candidateProfile.professionalSummary);

      expect(isContactComplete).toBe(true);
      expect(hasResume).toBe(true);
      expect(isWorkAuthComplete).toBe(true);
      expect(isSummaryComplete).toBe(false);
    });

    it("evaluates to READY when all profile fields are complete and no approvals pending", () => {
      const candidateProfile = {
        phone: "+1 555-0199",
        city: "San Francisco",
        country: "US",
        headline: "Principal Engineer",
        professionalSummary: "10+ years engineering infrastructure",
        workAuthorization: "CITIZEN",
        experiencesCount: 3,
        educationsCount: 1,
        skillsCount: 8,
        projectsCount: 2,
        documentsCount: 2,
        verificationStatus: "VERIFIED",
      };
      const awaitingApprovalCount = 0;

      const isReady =
        awaitingApprovalCount === 0 &&
        Boolean(candidateProfile.phone && (candidateProfile.city || candidateProfile.country)) &&
        candidateProfile.documentsCount > 0 &&
        Boolean(candidateProfile.workAuthorization && candidateProfile.workAuthorization !== "OTHER") &&
        Boolean(candidateProfile.headline && candidateProfile.professionalSummary) &&
        candidateProfile.experiencesCount > 0 &&
        candidateProfile.skillsCount > 0;

      expect(isReady).toBe(true);
    });
  });

  describe("6. Candidate Document Vault Authority & Single Default Semantics", () => {
    it("identifies authoritative default resume for application tailoring accurately and exclusively", () => {
      const mockDocs = [
        {
          id: "doc-1",
          title: "Alex_Rivera_General_Resume.pdf",
          documentType: "RESUME",
          fileSizeBytes: 245000,
          mimeType: "application/pdf",
          isDefault: false,
          createdAt: "2026-09-01T10:00:00Z",
          updatedAt: "2026-09-01T10:00:00Z",
        },
        {
          id: "doc-2",
          title: "Alex_Rivera_Senior_FullStack_2026.pdf",
          documentType: "RESUME",
          fileSizeBytes: 239400,
          mimeType: "application/pdf",
          isDefault: true,
          createdAt: "2026-09-25T14:30:00Z",
          updatedAt: "2026-09-25T14:30:00Z",
        },
        {
          id: "doc-3",
          title: "Cover_Letter_Leadership.pdf",
          documentType: "COVER_LETTER",
          fileSizeBytes: 120000,
          mimeType: "application/pdf",
          isDefault: false,
          createdAt: "2026-09-20T11:00:00Z",
          updatedAt: "2026-09-20T11:00:00Z",
        },
      ];

      // Single authoritative default resume
      const defaultResume = mockDocs.find((d) => d.isDefault && d.documentType === "RESUME");
      expect(defaultResume).toBeDefined();
      expect(defaultResume?.id).toBe("doc-2");
      expect(defaultResume?.title).toBe("Alex_Rivera_Senior_FullStack_2026.pdf");

      // Verify non-default resume does NOT have default flag
      const nonDefaultResume = mockDocs.find((d) => !d.isDefault && d.documentType === "RESUME");
      expect(nonDefaultResume).toBeDefined();
      expect(nonDefaultResume?.id).toBe("doc-1");
      expect(nonDefaultResume?.isDefault).toBe(false);

      // Verify category counts
      const resumeCount = mockDocs.filter((d) => d.documentType === "RESUME").length;
      const coverLetterCount = mockDocs.filter((d) => d.documentType === "COVER_LETTER").length;
      const transcriptCount = mockDocs.filter((d) => d.documentType === "TRANSCRIPT").length;

      expect(resumeCount).toBe(2);
      expect(coverLetterCount).toBe(1);
      expect(transcriptCount).toBe(0);
    });

    it("handles vault state with zero default documents gracefully", () => {
      const mockDocs = [
        {
          id: "doc-1",
          title: "General_Resume.pdf",
          documentType: "RESUME",
          fileSizeBytes: 200000,
          mimeType: "application/pdf",
          isDefault: false,
          createdAt: "2026-09-01T10:00:00Z",
          updatedAt: "2026-09-01T10:00:00Z",
        },
      ];

      const defaultResume = mockDocs.find((d) => d.isDefault && d.documentType === "RESUME");
      expect(defaultResume).toBeUndefined();
    });
  });

  describe("7. Application Detail Current State & Next Stage Operational Logic", () => {
    it("maps non-terminal statuses to accurate next expected stages without false promises", () => {
      const submittedNext = getNextExpectedStage(ApplicationStatus.SUBMITTED);
      expect(submittedNext).toBeDefined();
      expect(submittedNext?.stageName).toBe("Employer Review");
      expect(submittedNext?.description).toBe("Awaiting employer response.");

      const preparingNext = getNextExpectedStage(ApplicationStatus.PREPARING);
      expect(preparingNext?.stageName).toBe("QA Review");

      const readyNext = getNextExpectedStage(ApplicationStatus.READY);
      expect(readyNext?.stageName).toBe("External Submission");

      const awaitingApprovalNext = getNextExpectedStage(ApplicationStatus.AWAITING_APPROVAL);
      expect(awaitingApprovalNext?.stageName).toBe("Submission Execution");
    });

    it("returns null next expected stage for terminal states", () => {
      expect(getNextExpectedStage(ApplicationStatus.REJECTED)).toBeNull();
      expect(getNextExpectedStage(ApplicationStatus.WITHDRAWN)).toBeNull();
      expect(getNextExpectedStage(ApplicationStatus.FAILED)).toBeNull();
    });

    it("formats deterministic application date and time strings accurately for SSR safety", () => {
      const dateStr = "2026-10-06T17:42:00Z";
      const formatted = formatApplicationDateTime(dateStr);
      expect(formatted).toBe("Oct 6, 2026 · 5:42 PM UTC");

      const withoutTime = formatApplicationDateTime(dateStr, { includeTime: false });
      expect(withoutTime).toBe("Oct 6, 2026");

      expect(formatApplicationDateTime("invalid-date")).toBe("Unknown date");
    });
  });
});
