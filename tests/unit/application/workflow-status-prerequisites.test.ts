import { describe, it, expect } from "vitest";
import { ApplicationStatus, ApplicationApprovalStatus } from "@/generated/prisma";
import { resolveDualTrackWorkflowStatus } from "@/lib/application/workflow-status";
import {
  evaluateApplicationPrerequisites,
  validateSafeExternalUrl,
} from "@/lib/application/prerequisites";

describe("Workflow Status & Prerequisite Evaluator (tests/unit/application/workflow-status-prerequisites.test.ts)", () => {
  describe("Dual-Track Workflow Status Resolver", () => {
    it("1. Resolves INTAKE stage and NOT_STARTED external state for DISCOVERED status", () => {
      const res = resolveDualTrackWorkflowStatus({
        status: ApplicationStatus.DISCOVERED,
      });

      expect(res.internal.stage).toBe("INTAKE");
      expect(res.internal.stepNumber).toBe(1);
      expect(res.external.state).toBe("NOT_STARTED");
      expect(res.primaryAction.id).toBe("qualify");
      expect(res.primaryAction.label).toBe("Qualify Application");
      expect(res.isTerminal).toBe(false);
      expect(res.canWithdraw).toBe(true);
    });

    it("2. Resolves QUALIFICATION stage for QUALIFIED status", () => {
      const res = resolveDualTrackWorkflowStatus({
        status: ApplicationStatus.QUALIFIED,
      });

      expect(res.internal.stage).toBe("QUALIFICATION");
      expect(res.internal.stepNumber).toBe(2);
      expect(res.external.state).toBe("NOT_STARTED");
      expect(res.primaryAction.id).toBe("prepare");
    });

    it("3. Resolves MATERIALS_PREPARATION stage with disabled QA action if materials not attached", () => {
      const resNoMaterials = resolveDualTrackWorkflowStatus({
        status: ApplicationStatus.PREPARING,
        hasMaterials: false,
      });
      expect(resNoMaterials.internal.stage).toBe("MATERIALS_PREPARATION");
      expect(resNoMaterials.primaryAction.disabled).toBe(true);

      const resWithMaterials = resolveDualTrackWorkflowStatus({
        status: ApplicationStatus.PREPARING,
        hasMaterials: true,
      });
      expect(resWithMaterials.primaryAction.disabled).toBe(false);
      expect(resWithMaterials.primaryAction.label).toBe("Submit for QA Review");
    });

    it("4. Resolves QUALITY_REVIEW stage with QA Reviewer actor for REVIEW status", () => {
      const res = resolveDualTrackWorkflowStatus({
        status: ApplicationStatus.REVIEW,
      });

      expect(res.internal.stage).toBe("QUALITY_REVIEW");
      expect(res.internal.stepNumber).toBe(4);
      expect(res.accountableActor).toBe("QA_REVIEWER");
      expect(res.primaryAction.id).toBe("conduct_qa");
    });

    it("5. Resolves APPROVAL stage with Candidate actor for AWAITING_APPROVAL status", () => {
      const res = resolveDualTrackWorkflowStatus({
        status: ApplicationStatus.AWAITING_APPROVAL,
      });

      expect(res.internal.stage).toBe("APPROVAL");
      expect(res.internal.stepNumber).toBe(5);
      expect(res.accountableActor).toBe("CANDIDATE");
      expect(res.primaryAction.disabled).toBe(true);
      expect(res.primaryAction.id).toBe("await_approval");
    });

    it("6. Resolves APPROVED_COMPLETED internal stage and READY_FOR_SUBMISSION external state for READY status", () => {
      const res = resolveDualTrackWorkflowStatus({
        status: ApplicationStatus.READY,
        approvalStatus: ApplicationApprovalStatus.APPROVED,
      });

      expect(res.internal.stage).toBe("APPROVED_COMPLETED");
      expect(res.internal.isCompleted).toBe(true);
      expect(res.external.state).toBe("READY_FOR_SUBMISSION");
      expect(res.external.variant).toBe("info");
      expect(res.primaryAction.id).toBe("record_submission");
      expect(res.primaryAction.targetTab).toBe("submission");
    });

    it("7. Resolves SUBMITTED external state with confirmed submission flag for SUBMITTED status", () => {
      const res = resolveDualTrackWorkflowStatus({
        status: ApplicationStatus.SUBMITTED,
        submissionCount: 1,
      });

      expect(res.external.state).toBe("SUBMITTED");
      expect(res.external.hasConfirmedSubmission).toBe(true);
      expect(res.external.variant).toBe("success");
      expect(res.canWithdraw).toBe(false);
    });

    it("8. Resolves NEEDS_VERIFICATION external state for SUBMISSION_ISSUE and REVIEW_REQUIRED", () => {
      const issueRes = resolveDualTrackWorkflowStatus({
        status: ApplicationStatus.SUBMISSION_ISSUE,
      });
      expect(issueRes.external.state).toBe("NEEDS_VERIFICATION");
      expect(issueRes.primaryAction.id).toBe("manage_incident");

      const reviewReqRes = resolveDualTrackWorkflowStatus({
        status: ApplicationStatus.REVIEW_REQUIRED,
      });
      expect(reviewReqRes.external.state).toBe("NEEDS_VERIFICATION");
    });

    it("9. Handles terminal statuses (WITHDRAWN, FAILED, REJECTED) cleanly", () => {
      const withdrawn = resolveDualTrackWorkflowStatus({
        status: ApplicationStatus.WITHDRAWN,
      });
      expect(withdrawn.internal.stage).toBe("TERMINATED");
      expect(withdrawn.external.state).toBe("WITHDRAWN");
      expect(withdrawn.isTerminal).toBe(true);

      const failed = resolveDualTrackWorkflowStatus({
        status: ApplicationStatus.FAILED,
      });
      expect(failed.internal.stage).toBe("TERMINATED");
      expect(failed.external.state).toBe("FAILED");
      expect(failed.isTerminal).toBe(true);
    });
  });

  describe("Dynamic Prerequisite Evaluator", () => {
    it("10. Authoritatively verifies all gates when complete", () => {
      const evalResult = evaluateApplicationPrerequisites({
        status: ApplicationStatus.READY,
        approvalStatus: ApplicationApprovalStatus.APPROVED,
        candidateStatus: "ACTIVE",
        candidateAuthMode: "MANAGED",
        hasResumeDocument: true,
        resumeDocumentTitle: "Senior_FullStack_Resume_v3.pdf",
        hasPassedQaReview: true,
        isJobActive: true,
        externalJobUrl: "https://jobs.example.com/posting/123",
      });

      expect(evalResult.allMet).toBe(true);
      expect(evalResult.metCount).toBe(5);
      expect(evalResult.totalCount).toBe(5);
      expect(evalResult.gates.every((g) => g.passed)).toBe(true);
    });

    it("11. Fails consent gate when candidate is inactive or paused", () => {
      const evalResult = evaluateApplicationPrerequisites({
        status: ApplicationStatus.PREPARING,
        candidateStatus: "PAUSED",
        candidateAuthMode: "MANAGED",
        hasResumeDocument: true,
        hasPassedQaReview: false,
        isJobActive: true,
        externalJobUrl: "https://jobs.example.com/apply",
      });

      const consentGate = evalResult.gates.find((g) => g.id === "candidate_consent");
      expect(consentGate?.passed).toBe(false);
      expect(consentGate?.status).toBe("BLOCKED");
      expect(evalResult.allMet).toBe(false);
    });

    it("12. Flags pending status for REVIEW_REQUIRED when unapproved", () => {
      const evalResult = evaluateApplicationPrerequisites({
        status: ApplicationStatus.AWAITING_APPROVAL,
        approvalStatus: ApplicationApprovalStatus.PENDING,
        candidateStatus: "ACTIVE",
        candidateAuthMode: "REVIEW_REQUIRED",
        hasResumeDocument: true,
        hasPassedQaReview: true,
        isJobActive: true,
      });

      const consentGate = evalResult.gates.find((g) => g.id === "candidate_consent");
      expect(consentGate?.passed).toBe(false);
      expect(consentGate?.status).toBe("PENDING");
    });
  });

  describe("Safe External URL & SSRF Protection", () => {
    it("13. Accepts valid public HTTPS and HTTP URLs", () => {
      const valid1 = validateSafeExternalUrl("https://careers.google.com/jobs/results/123");
      expect(valid1.isSafe).toBe(true);
      expect(valid1.hostname).toBe("careers.google.com");

      const valid2 = validateSafeExternalUrl("http://jobs.acme.co.uk/apply?id=99");
      expect(valid2.isSafe).toBe(true);
    });

    it("14. Rejects non-HTTP protocols (javascript:, file:, data:, ftp:)", () => {
      const jsUrl = validateSafeExternalUrl("javascript:alert(1)");
      expect(jsUrl.isSafe).toBe(false);
      expect(jsUrl.error).toContain("Prohibited protocol");

      const dataUrl = validateSafeExternalUrl("data:text/html,<script>alert(1)</script>");
      expect(dataUrl.isSafe).toBe(false);
    });

    it("15. Rejects SSRF loopback targets (localhost, 127.0.0.1, ::1)", () => {
      expect(validateSafeExternalUrl("http://localhost:3000/job").isSafe).toBe(false);
      expect(validateSafeExternalUrl("http://127.0.0.1:8080/admin").isSafe).toBe(false);
      expect(validateSafeExternalUrl("http://[::1]/secret").isSafe).toBe(false);
    });

    it("16. Rejects Cloud Metadata IP (169.254.169.254) and Private Subnets", () => {
      expect(validateSafeExternalUrl("http://169.254.169.254/latest/meta-data/").isSafe).toBe(false);
      expect(validateSafeExternalUrl("http://10.0.0.1/private-job").isSafe).toBe(false);
      expect(validateSafeExternalUrl("http://192.168.1.50/apply").isSafe).toBe(false);
      expect(validateSafeExternalUrl("http://172.16.0.10/admin").isSafe).toBe(false);
    });
  });
});
