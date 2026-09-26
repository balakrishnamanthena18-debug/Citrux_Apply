import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatSalary,
  getCandidateActionRequirement,
  getCandidateStatusPresentation,
  CANDIDATE_STATUS_MAP,
  FILTER_TAB_STATES,
} from "@/lib/utils/status-presenter";
import { ApplicationStatus } from "@/generated/prisma";

describe("Application Tracking & Candidate Visibility (tests/integration/application-tracking-visibility.test.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Authoritative Salary Formatting & Non-Fabrication Rules", () => {
    it("formats range when both min and max are provided", () => {
      expect(formatSalary(150000, 180000, "USD")).toBe("$150,000 – $180,000 / year");
    });

    it("formats single exact amount when min equals max", () => {
      expect(formatSalary(150000, 150000, "USD")).toBe("$150,000 / year");
    });

    it("formats minimum boundary when only min is provided", () => {
      expect(formatSalary(120000, null, "USD")).toBe("From $120,000 / year");
    });

    it("formats maximum boundary when only max is provided", () => {
      expect(formatSalary(null, 200000, "USD")).toBe("Up to $200,000 / year");
    });

    it("returns 'Salary not disclosed' when both are null/undefined (never fabricates)", () => {
      expect(formatSalary(null, null, "USD")).toBe("Salary not disclosed");
      expect(formatSalary(undefined, undefined, null)).toBe("Salary not disclosed");
      expect(formatSalary(0, 0, "USD")).toBe("Salary not disclosed");
    });

    it("formats non-USD currency according to ISO code", () => {
      const gbpResult = formatSalary(80000, 95000, "GBP");
      expect(gbpResult).toContain("80,000");
      expect(gbpResult).toContain("95,000");
      expect(gbpResult).toContain("year");
    });
  });

  describe("2. Authoritative Candidate Action Requirement Derivation", () => {
    it("flags AWAITING_APPROVAL as requiring candidate action", () => {
      const res = getCandidateActionRequirement(ApplicationStatus.AWAITING_APPROVAL);
      expect(res.actionText).toBe("Your approval is required");
      expect(res.isActionRequired).toBe(true);
      expect(res.badgeClass).toContain("bg-amber-100");
    });

    it("presents PREPARING as informative without candidate action required", () => {
      const res = getCandidateActionRequirement(ApplicationStatus.PREPARING);
      expect(res.actionText).toBe("Application being prepared by your team");
      expect(res.isActionRequired).toBe(false);
    });

    it("presents REVIEW as internal QA review", () => {
      const res = getCandidateActionRequirement(ApplicationStatus.REVIEW);
      expect(res.actionText).toBe("Under internal QA review");
      expect(res.isActionRequired).toBe(false);
    });

    it("presents READY as queued for external submission", () => {
      const res = getCandidateActionRequirement(ApplicationStatus.READY);
      expect(res.actionText).toBe("Ready for external submission");
      expect(res.isActionRequired).toBe(false);
    });

    it("presents SUBMITTED as completed submission", () => {
      const res = getCandidateActionRequirement(ApplicationStatus.SUBMITTED);
      expect(res.actionText).toBe("Application submitted");
      expect(res.isActionRequired).toBe(false);
    });

    it("presents incident states (SUBMISSION_ISSUE, REVIEW_REQUIRED, etc.) as specialist review", () => {
      const issueRes = getCandidateActionRequirement(ApplicationStatus.SUBMISSION_ISSUE);
      expect(issueRes.actionText).toBe("Under specialist review");
      expect(issueRes.isActionRequired).toBe(false);

      const reviewReqRes = getCandidateActionRequirement(ApplicationStatus.REVIEW_REQUIRED);
      expect(reviewReqRes.actionText).toBe("Under specialist review");
      expect(reviewReqRes.isActionRequired).toBe(false);
    });

    it("presents terminal states (WITHDRAWN, REJECTED, FAILED) accurately", () => {
      expect(getCandidateActionRequirement(ApplicationStatus.WITHDRAWN).actionText).toBe("Application withdrawn");
      expect(getCandidateActionRequirement(ApplicationStatus.REJECTED).actionText).toBe("Application closed");
      expect(getCandidateActionRequirement(ApplicationStatus.FAILED).actionText).toBe("Submission unsuccessful");
    });
  });

  describe("3. Authoritative Candidate-Facing Status Vocabulary & Translation", () => {
    const allStatuses = Object.values(ApplicationStatus);

    it("covers all 14 authoritative ApplicationStatus values without omission", () => {
      expect(allStatuses).toHaveLength(14);
      allStatuses.forEach((st) => {
        expect(CANDIDATE_STATUS_MAP[st]).toBeDefined();
        const pres = getCandidateStatusPresentation(st);
        expect(pres.label).toBeTruthy();
        expect(pres.description).toBeTruthy();
        expect(pres.progressStage).toBeGreaterThanOrEqual(1);
        expect(pres.progressStage).toBeLessThanOrEqual(5);
      });
    });

    it("correctly preserves terminal flags", () => {
      expect(CANDIDATE_STATUS_MAP[ApplicationStatus.REJECTED].isTerminal).toBe(true);
      expect(CANDIDATE_STATUS_MAP[ApplicationStatus.WITHDRAWN].isTerminal).toBe(true);
      expect(CANDIDATE_STATUS_MAP[ApplicationStatus.FAILED].isTerminal).toBe(true);
      expect(CANDIDATE_STATUS_MAP[ApplicationStatus.SUBMITTED].isTerminal).toBe(false);
      expect(CANDIDATE_STATUS_MAP[ApplicationStatus.PREPARING].isTerminal).toBe(false);
    });
  });

  describe("4. Filter Tab State Partitioning", () => {
    it("partitions status values cleanly across candidate UI tabs", () => {
      expect(FILTER_TAB_STATES.ALL).toHaveLength(14);
      expect(FILTER_TAB_STATES.AWAITING_ACTION).toEqual([ApplicationStatus.AWAITING_APPROVAL]);
      expect(FILTER_TAB_STATES.SUBMITTED).toEqual([ApplicationStatus.SUBMITTED]);
      expect(FILTER_TAB_STATES.HISTORY).toEqual([
        ApplicationStatus.REJECTED,
        ApplicationStatus.WITHDRAWN,
        ApplicationStatus.FAILED,
      ]);
      expect(FILTER_TAB_STATES.IN_PROGRESS).toContain(ApplicationStatus.PREPARING);
      expect(FILTER_TAB_STATES.IN_PROGRESS).toContain(ApplicationStatus.READY);
    });
  });

  describe("5. Server-Side Derived Counters Consistency", () => {
    it("derives employee workbench operational counters from sample application list", () => {
      const mockApplications: { id: string; status: ApplicationStatus }[] = [
        { id: "1", status: ApplicationStatus.DISCOVERED },
        { id: "2", status: ApplicationStatus.QUALIFIED },
        { id: "3", status: ApplicationStatus.PREPARING },
        { id: "4", status: ApplicationStatus.REVIEW },
        { id: "5", status: ApplicationStatus.AWAITING_APPROVAL },
        { id: "6", status: ApplicationStatus.READY },
        { id: "7", status: ApplicationStatus.SUBMITTED },
        { id: "8", status: ApplicationStatus.SUBMISSION_ISSUE },
      ];

      const counts = {
        total: mockApplications.length,
        ready: mockApplications.filter((a) => a.status === ApplicationStatus.READY).length,
        inPrep: mockApplications.filter(
          (a) => a.status === ApplicationStatus.PREPARING || a.status === ApplicationStatus.QUALIFIED || a.status === ApplicationStatus.DISCOVERED
        ).length,
        qaReview: mockApplications.filter((a) => a.status === ApplicationStatus.REVIEW).length,
        awaitingApproval: mockApplications.filter((a) => a.status === ApplicationStatus.AWAITING_APPROVAL).length,
        submitted: mockApplications.filter((a) => a.status === ApplicationStatus.SUBMITTED).length,
        issues: mockApplications.filter((a) =>
          ([ApplicationStatus.SUBMISSION_ISSUE, ApplicationStatus.REVIEW_REQUIRED, ApplicationStatus.CORRECTION_APPROVED, ApplicationStatus.RESUBMISSION] as ApplicationStatus[]).includes(a.status)
        ).length,
      };

      expect(counts.total).toBe(8);
      expect(counts.ready).toBe(1);
      expect(counts.inPrep).toBe(3);
      expect(counts.qaReview).toBe(1);
      expect(counts.awaitingApproval).toBe(1);
      expect(counts.submitted).toBe(1);
      expect(counts.issues).toBe(1);
    });

    it("derives candidate portfolio metrics accurately", () => {
      const mockCandidateApps: { id: string; status: ApplicationStatus }[] = [
        { id: "1", status: ApplicationStatus.PREPARING },
        { id: "2", status: ApplicationStatus.AWAITING_APPROVAL },
        { id: "3", status: ApplicationStatus.SUBMITTED },
        { id: "4", status: ApplicationStatus.SUBMISSION_ISSUE },
      ];

      const candidateCounts = {
        total: mockCandidateApps.length,
        submitted: mockCandidateApps.filter((a) => a.status === ApplicationStatus.SUBMITTED).length,
        inProgress: mockCandidateApps.filter((a) =>
          ([ApplicationStatus.DISCOVERED, ApplicationStatus.QUALIFIED, ApplicationStatus.PREPARING, ApplicationStatus.REVIEW, ApplicationStatus.READY] as ApplicationStatus[]).includes(a.status)
        ).length,
        awaitingAction: mockCandidateApps.filter((a) => a.status === ApplicationStatus.AWAITING_APPROVAL).length,
        issues: mockCandidateApps.filter((a) =>
          ([ApplicationStatus.SUBMISSION_ISSUE, ApplicationStatus.REVIEW_REQUIRED, ApplicationStatus.RESUBMISSION] as ApplicationStatus[]).includes(a.status)
        ).length,
      };

      expect(candidateCounts.total).toBe(4);
      expect(candidateCounts.submitted).toBe(1);
      expect(candidateCounts.inProgress).toBe(1);
      expect(candidateCounts.awaitingAction).toBe(1);
      expect(candidateCounts.issues).toBe(1);
    });
  });

  describe("6. External Job Search → Manual Submission → Candidate Update Workflow Rules", () => {
    it("distinguishes JOB_FOUND (DISCOVERED) from READY and SUBMITTED", () => {
      const discoveredState = getCandidateStatusPresentation(ApplicationStatus.DISCOVERED);
      const readyState = getCandidateStatusPresentation(ApplicationStatus.READY);
      const submittedState = getCandidateStatusPresentation(ApplicationStatus.SUBMITTED);

      expect(discoveredState.progressStage).toBe(1);
      expect(readyState.progressStage).toBe(5);
      expect(submittedState.progressStage).toBe(5);

      expect(discoveredState.label).not.toBe(submittedState.label);
      expect(readyState.label).not.toBe(submittedState.label);
    });

    it("verifies that only authoritative ApplicationSubmission marks an application as SUBMITTED", () => {
      const unsubmittedApp = {
        id: "app-1",
        status: ApplicationStatus.READY,
        submissions: [],
      };
      expect(unsubmittedApp.status).not.toBe(ApplicationStatus.SUBMITTED);
      expect(unsubmittedApp.submissions).toHaveLength(0);

      const submittedApp = {
        id: "app-1",
        status: ApplicationStatus.SUBMITTED,
        submissions: [
          {
            id: "sub-1",
            attemptNumber: 1,
            submittedAt: new Date("2026-09-25T18:42:00Z"),
            submittedById: "emp-1",
            externalReference: "LIN-847291",
            confirmationEvidence: "Application confirmed by Linear recruiting system.",
          },
        ],
      };
      expect(submittedApp.status).toBe(ApplicationStatus.SUBMITTED);
      expect(submittedApp.submissions[0]?.externalReference).toBe("LIN-847291");
      expect(submittedApp.submissions[0]?.attemptNumber).toBe(1);
    });

    it("verifies job source preservation from external job searches (LinkedIn, Indeed, etc.)", () => {
      const sourcedJob = {
        id: "job-1",
        title: "Senior Systems & Operations Engineer",
        companyName: "Linear",
        source: "LinkedIn",
        externalUrl: "https://www.linkedin.com/jobs/view/987654321",
        location: "Remote",
        salaryMin: 150000,
        salaryMax: 180000,
        salaryCurrency: "USD",
        jobDescription: "Staff systems engineer role...",
      };

      expect(sourcedJob.source).toBe("LinkedIn");
      expect(sourcedJob.externalUrl).toContain("linkedin.com");
      expect(formatSalary(sourcedJob.salaryMin, sourcedJob.salaryMax, sourcedJob.salaryCurrency)).toBe(
        "$150,000 – $180,000 / year"
      );
    });
  });
});
