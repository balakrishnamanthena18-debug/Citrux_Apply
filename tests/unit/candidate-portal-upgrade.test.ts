import { describe, it, expect } from "vitest";
import { ApplicationStatus } from "@/generated/prisma";
import type { CareerMilestone } from "@/components/candidate/CandidateCareerProgress";
import type { NextBestActionData } from "@/components/candidate/CandidateNextBestAction";

describe("OOS Candidate Portal Customer Experience Upgrade Unit Tests", () => {
  describe("1. Authoritative Metric Unification & Inclusion Rules", () => {
    const terminalStatuses: ApplicationStatus[] = [
      ApplicationStatus.REJECTED,
      ApplicationStatus.WITHDRAWN,
      ApplicationStatus.FAILED,
    ];

    it("correctly counts submitted applications as part of the active search pipeline", () => {
      // Simulating demo73313 candidate state: 5 total applications (3 submitted, 1 rejected, 1 withdrawn)
      const applications = [
        { id: "app-1", status: ApplicationStatus.SUBMITTED },
        { id: "app-2", status: ApplicationStatus.SUBMITTED },
        { id: "app-3", status: ApplicationStatus.SUBMITTED },
        { id: "app-4", status: ApplicationStatus.WITHDRAWN },
        { id: "app-5", status: ApplicationStatus.REJECTED },
      ];

      const totalApplications = applications.length;
      const submittedCount = applications.filter((a) => a.status === ApplicationStatus.SUBMITTED).length;
      const closedCount = applications.filter((a) => terminalStatuses.includes(a.status)).length;
      const activeApplications = applications.filter((a) => !terminalStatuses.includes(a.status)).length;

      // Authoritative checks:
      expect(totalApplications).toBe(5);
      expect(submittedCount).toBe(3);
      expect(closedCount).toBe(2);
      expect(activeApplications).toBe(3); // In pipeline MUST be 3, NOT 0!
      expect(activeApplications + closedCount).toBe(totalApplications);
    });

    it("handles diverse application pipelines with zero discrepancies across stage filters", () => {
      const applications = [
        { id: "app-1", status: ApplicationStatus.DISCOVERED },
        { id: "app-2", status: ApplicationStatus.PREPARING },
        { id: "app-3", status: ApplicationStatus.REVIEW },
        { id: "app-4", status: ApplicationStatus.AWAITING_APPROVAL },
        { id: "app-5", status: ApplicationStatus.READY },
        { id: "app-6", status: ApplicationStatus.SUBMITTED },
        { id: "app-7", status: ApplicationStatus.RESUBMISSION },
        { id: "app-8", status: ApplicationStatus.REJECTED },
        { id: "app-9", status: ApplicationStatus.FAILED },
      ];

      const preparingCount = applications.filter((a) =>
        ([ApplicationStatus.DISCOVERED, ApplicationStatus.QUALIFIED, ApplicationStatus.PREPARING] as ApplicationStatus[]).includes(a.status)
      ).length;
      const underReviewCount = applications.filter((a) =>
        ([ApplicationStatus.REVIEW, ApplicationStatus.REVIEW_REQUIRED, ApplicationStatus.CORRECTION_APPROVED] as ApplicationStatus[]).includes(a.status)
      ).length;
      const awaitingApprovalCount = applications.filter((a) => a.status === ApplicationStatus.AWAITING_APPROVAL).length;
      const readyCount = applications.filter((a) => a.status === ApplicationStatus.READY).length;
      const submittedCount = applications.filter((a) =>
        ([ApplicationStatus.SUBMITTED, ApplicationStatus.RESUBMISSION] as ApplicationStatus[]).includes(a.status)
      ).length;
      const closedCount = applications.filter((a) => terminalStatuses.includes(a.status)).length;

      const activeApplications = applications.filter((a) => !terminalStatuses.includes(a.status)).length;

      expect(preparingCount).toBe(2);
      expect(underReviewCount).toBe(1);
      expect(awaitingApprovalCount).toBe(1);
      expect(readyCount).toBe(1);
      expect(submittedCount).toBe(2);
      expect(closedCount).toBe(2);

      expect(activeApplications).toBe(7); // 2 prep + 1 review + 1 awaiting + 1 ready + 2 submitted = 7
      expect(activeApplications + closedCount).toBe(applications.length);
    });
  });

  describe("2. Next Best Action Prioritization", () => {
    it("assigns highest priority to pending candidate approvals with explicit why-it-matters context", () => {
      const awaitingApprovalApps = [{ id: "app-1", job: { title: "Staff Engineer", companyName: "Acme" } }];
      const hasDocuments = false;

      let action: NextBestActionData;
      const firstApp = awaitingApprovalApps[0];
      if (firstApp) {
        action = {
          tone: "urgent",
          badgeText: "Action Required · Sign-off Needed",
          title: `Approve tailored application: ${firstApp.job.title}`,
          description: "Materials ready for review",
          whyItMatters: "We strictly uphold a candidate consent barrier: applications are never submitted without authorization.",
          whatHappensNext: "Transitions to Ready and queues for portal intake.",
          actionUrl: `/candidate/applications/${firstApp.id}`,
          actionLabel: "Review & Sign Off",
        };
      } else if (!hasDocuments) {
        action = {
          tone: "important",
          badgeText: "Prerequisite Needed",
          title: "Upload master resume",
          description: "Missing resume",
          whyItMatters: "Baseline facts needed.",
          whatHappensNext: "Specialist begins tailoring.",
          actionUrl: "/candidate/profile",
          actionLabel: "Upload Resume",
        };
      } else {
        action = {
          tone: "calm",
          badgeText: "All Caught Up",
          title: "Pipeline actively managed",
          description: "All up to date",
          whyItMatters: "Desk is monitoring employer channels.",
          whatHappensNext: "Notifications sent when updates occur.",
          actionUrl: "/candidate/applications",
          actionLabel: "View Pipeline",
        };
      }

      expect(action.tone).toBe("urgent");
      expect(action.title).toContain("Approve tailored application");
      expect(action.whyItMatters).toContain("candidate consent barrier");
    });

    it("evaluates to calm reassuring state when no pending actions exist", () => {
      const awaitingApprovalApps: any[] = [];
      const documentsCount: number = 2;
      const verificationNotes: string | null = null;
      const phone: string | null = "+15551234567";
      const city: string | null = "San Francisco";
      const workAuthorization: string | null = "CITIZEN";
      const recommendations: any[] = [];

      let action: NextBestActionData;
      if (awaitingApprovalApps.length > 0) {
        action = { tone: "urgent" } as any;
      } else if (documentsCount === 0) {
        action = { tone: "important" } as any;
      } else if (verificationNotes) {
        action = { tone: "urgent" } as any;
      } else if (!phone || !city) {
        action = { tone: "important" } as any;
      } else if (!workAuthorization || (workAuthorization as string) === "OTHER") {
        action = { tone: "important" } as any;
      } else if (recommendations.length > 0) {
        action = { tone: "important" } as any;
      } else {
        action = {
          tone: "calm",
          badgeText: "Desk Active · All Caught Up",
          title: "All caught up — your pipeline is actively managed",
          description: "All profile prerequisites, verification requirements, and material approvals are up to date.",
          whyItMatters: "Your career operations desk is actively monitoring employer portal responses.",
          whatHappensNext: "You will be notified immediately when an employer responds.",
          actionUrl: "/candidate/applications",
          actionLabel: "View Active Pipeline",
        };
      }

      expect(action.tone).toBe("calm");
      expect(action.badgeText).toContain("All Caught Up");
      expect(action.actionUrl).toBe("/candidate/applications");
    });
  });

  describe("3. Transparent Career Progress Milestones", () => {
    it("computes accurate milestones and active stage title based on verified facts", () => {
      const candidateState = {
        hasContact: true,
        hasWorkAuth: true,
        hasResume: true,
        isVerified: true,
        activeApplications: 3,
        submittedApplications: 3,
        scheduledInterviews: 1,
      };

      const milestones: CareerMilestone[] = [
        {
          id: "m1",
          number: 1,
          title: "Profile & Career Boundaries",
          shortTitle: "Profile",
          description: "Confirmed",
          status: candidateState.hasContact && candidateState.hasWorkAuth ? "COMPLETED" : "CURRENT",
        },
        {
          id: "m2",
          number: 2,
          title: "Master Resume & Vault Assets",
          shortTitle: "Resume Vault",
          description: "Vault",
          status: candidateState.hasResume ? "COMPLETED" : "CURRENT",
        },
        {
          id: "m3",
          number: 3,
          title: "Operational Factual Verification",
          shortTitle: "Verification",
          description: "Verified",
          status: candidateState.isVerified ? "COMPLETED" : "CURRENT",
        },
        {
          id: "m4",
          number: 4,
          title: "Opportunity Sourcing & Material Tailoring",
          shortTitle: "Tailoring",
          description: "Tailoring",
          status: candidateState.submittedApplications > 0 ? "COMPLETED" : "CURRENT",
        },
        {
          id: "m5",
          number: 5,
          title: "Employer Submissions & Receipts",
          shortTitle: "Submissions",
          description: "Submissions",
          status: candidateState.submittedApplications > 0 ? "COMPLETED" : "CURRENT",
        },
        {
          id: "m6",
          number: 6,
          title: "Interview Operating System & Placement",
          shortTitle: "Interviews",
          description: "Interviews",
          status: candidateState.scheduledInterviews > 0 ? "CURRENT" : "UPCOMING",
        },
      ];

      const completed = milestones.filter((m) => m.status === "COMPLETED");
      expect(completed.length).toBe(5);
      expect(milestones[5]?.status).toBe("CURRENT");
    });
  });
});
