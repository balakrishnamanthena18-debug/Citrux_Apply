import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  updateCandidateProfileSelfAction,
  deleteCandidateExperienceAction,
  deleteCandidateEducationAction,
  deleteCandidateDocumentAction,
  getDocumentDownloadUrlAction,
} from "@/lib/candidate/actions";
import {
  submitCandidateApprovalAction,
  withdrawApplicationAction,
  transitionApplicationStatusAction,
} from "@/lib/application/actions";
import {
  candidateApproveApplicationAction,
  completeQaReviewAction,
} from "@/lib/qa/actions";
import {
  createConversationAction,
  sendMessageAction,
  markConversationReadAction,
  createInternalNoteAction,
  getInternalNotesAction,
} from "@/lib/communication/actions";
import {
  createPrivacyRequestAction,
  verifyPrivacyRequestAction,
} from "@/lib/privacy/actions";
import {
  createTaskAction,
  updateTaskAction,
} from "@/lib/task/actions";
import {
  getSubmissionEvidenceDownloadUrlAction,
} from "@/lib/submission/actions";
import {
  createEmployeeAction,
  setEmployeeStatusAction,
  updateEmployeeRoleAction,
  listAuditLogsAction,
} from "@/lib/admin/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { Role, ApplicationStatus } from "@/generated/prisma";
import { AuthorizationError } from "@/lib/errors";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireAdmin: vi.fn((ctx) => {
    if (ctx.role !== Role.ADMIN) {
      throw new AuthorizationError("Operation requires ADMIN role");
    }
  }),
  requireEmployeeOrAdmin: vi.fn((ctx) => {
    if (ctx.role !== Role.ADMIN && ctx.role !== Role.EMPLOYEE) {
      throw new AuthorizationError("Operation requires EMPLOYEE or ADMIN role");
    }
  }),
  requireCandidate: vi.fn((ctx) => {
    if (ctx.role !== Role.CANDIDATE) {
      throw new AuthorizationError("Operation requires CANDIDATE role");
    }
  }),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
  logSystemAuditEvent: vi.fn(),
}));

describe("Comprehensive IDOR & Authorization Negative-Path Matrix (tests/integration/auth-idor-negative-matrix.test.ts)", () => {
  // Tenant A: Org Alpha
  const orgAlphaId = "11111111-1111-4111-8111-111111111111";
  const candidateAUserId = "22222222-2222-4222-8222-222222222222";
  const candidateACandId = "33333333-3333-4333-8333-333333333333";
  const candidateAAppId = "66666666-6666-4666-8666-666666666666";
  const candidateAExpId = "77777777-7777-4777-8777-777777777777";
  const candidateAEduId = "88888888-8888-4888-8888-888888888888";
  const candidateADocId = "99999999-9999-4999-8999-999999999999";
  const candidateAConvId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  // Candidate B (Attacker in Org Alpha)
  const candidateBUserId = "44444444-4444-4444-8444-444444444444";
  const candidateBCandId = "55555555-5555-4555-8555-555555555555";

  // Tenant B: Org Beta
  const orgBetaId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const employeeAlphaUserId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const employeeBetaUserId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const adminBetaUserId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const orgAlphaTaskId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const orgAlphaSubId = "12121212-1212-4212-8212-121212121212";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Section 1: Candidate Cross-User IDOR Protections (Candidate B → Candidate A Resources)", () => {
    beforeEach(() => {
      // Authenticated as Candidate B
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: candidateBUserId,
        email: "candB@test.com",
        role: Role.CANDIDATE,
        organizationId: orgAlphaId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });
    });

    it("1. Candidate B cannot mutate Candidate A profile", async () => {
      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          candidate: {
            findUnique: vi.fn().mockResolvedValue({
              id: candidateBCandId,
              userId: candidateBUserId,
              status: "ACTIVE",
            }),
            update: vi.fn().mockResolvedValue({ id: candidateBCandId }),
          },
          application: { findMany: vi.fn().mockResolvedValue([]) },
          applicationIntelligenceRun: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          applicationAlignmentResult: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          applicationReadinessResult: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        };
        return callback(tx as any);
      });

      const res = await updateCandidateProfileSelfAction({
        headline: "Attacker Attempt",
      });
      expect(res.success).toBe(true);
      expect(res.data?.candidateId).toBe(candidateBCandId); // Enforces self ID, never Candidate A
    });

    it("2. Candidate B cannot delete Candidate A work experience", async () => {
      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          candidate: {
            findUnique: vi.fn().mockResolvedValue({
              id: candidateBCandId,
              userId: candidateBUserId,
            }),
          },
          candidateExperience: {
            delete: vi.fn().mockRejectedValue(new Error("Record not found under candidateId")),
          },
        };
        return callback(tx as any);
      });

      const res = await deleteCandidateExperienceAction(candidateAExpId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Record not found/i);
    });

    it("3. Candidate B cannot delete Candidate A education entry", async () => {
      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          candidate: {
            findUnique: vi.fn().mockResolvedValue({
              id: candidateBCandId,
              userId: candidateBUserId,
            }),
          },
          candidateEducation: {
            delete: vi.fn().mockRejectedValue(new Error("Record not found under candidateId")),
          },
        };
        return callback(tx as any);
      });

      const res = await deleteCandidateEducationAction(candidateAEduId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Record not found/i);
    });

    it("4. Candidate B cannot delete Candidate A document", async () => {
      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          candidateDocument: {
            findUnique: vi.fn().mockResolvedValue({
              id: candidateADocId,
              candidate: { userId: candidateAUserId, organizationId: orgAlphaId },
            }),
          },
        };
        return callback(tx as any);
      });

      const res = await deleteCandidateDocumentAction(candidateADocId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Unauthorized document deletion/i);
    });

    it("5. Candidate B cannot generate download URL for Candidate A document", async () => {
      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          candidateDocument: {
            findUnique: vi.fn().mockResolvedValue({
              id: candidateADocId,
              candidate: { userId: candidateAUserId, organizationId: orgAlphaId },
            }),
          },
        };
        return callback(tx as any);
      });

      const res = await getDocumentDownloadUrlAction(candidateADocId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Unauthorized document access/i);
    });

    it("6. Candidate B cannot approve Candidate A application", async () => {
      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          application: {
            findUnique: vi.fn().mockResolvedValue({
              id: candidateAAppId,
              candidate: { userId: candidateAUserId },
              status: ApplicationStatus.AWAITING_APPROVAL,
            }),
          },
        };
        return callback(tx as any);
      });

      const res = await submitCandidateApprovalAction({
        applicationId: candidateAAppId,
        approved: true,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Only the candidate owner can approve/i);
    });

    it("7. Candidate B cannot withdraw Candidate A application", async () => {
      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          application: {
            findUnique: vi.fn().mockResolvedValue({
              id: candidateAAppId,
              candidate: { userId: candidateAUserId },
              status: ApplicationStatus.PREPARING,
            }),
          },
        };
        return callback(tx as any);
      });

      const res = await withdrawApplicationAction(candidateAAppId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Cannot withdraw another candidate's application/i);
    });

    it("8. Candidate B cannot access or send messages in Candidate A conversation", async () => {
      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          conversation: {
            findUnique: vi.fn().mockResolvedValue({
              id: candidateAConvId,
              candidate: { userId: candidateAUserId },
            }),
          },
        };
        return callback(tx as any);
      });

      const res = await sendMessageAction({
        conversationId: candidateAConvId,
        body: "Attempted message injection",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Cannot send message in another candidate's conversation/i);
    });

    it("9. Candidate B cannot mark Candidate A conversation as read", async () => {
      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          conversation: {
            findUnique: vi.fn().mockResolvedValue({
              id: candidateAConvId,
              candidate: { userId: candidateAUserId },
            }),
          },
        };
        return callback(tx as any);
      });

      const res = await markConversationReadAction({
        conversationId: candidateAConvId,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Cannot access another candidate's conversation/i);
    });
  });

  describe("Section 2: Candidate vs Staff/Admin Boundary Protections", () => {
    beforeEach(() => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: candidateBUserId,
        email: "candB@test.com",
        role: Role.CANDIDATE,
        organizationId: orgAlphaId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });
    });

    it("10. Candidate cannot perform staff QA reviews", async () => {
      const qaChecklist: Array<{
        criterionKey:
          | "CANDIDATE_JOB_ALIGNMENT"
          | "RESUME_ACCURACY"
          | "JOB_REQUIREMENTS_MATCH"
          | "SALARY_ALIGNMENT"
          | "LOCATION_AUTHORIZATION"
          | "WORK_AUTHORIZATION"
          | "SCREENING_ANSWERS"
          | "APPLICATION_COMPLETENESS"
          | "CANDIDATE_CONSENT_ACTIVE";
        isVerified: boolean;
      }> = [
        { criterionKey: "CANDIDATE_JOB_ALIGNMENT", isVerified: true },
        { criterionKey: "RESUME_ACCURACY", isVerified: true },
        { criterionKey: "JOB_REQUIREMENTS_MATCH", isVerified: true },
        { criterionKey: "SALARY_ALIGNMENT", isVerified: true },
        { criterionKey: "LOCATION_AUTHORIZATION", isVerified: true },
        { criterionKey: "WORK_AUTHORIZATION", isVerified: true },
        { criterionKey: "SCREENING_ANSWERS", isVerified: true },
        { criterionKey: "APPLICATION_COMPLETENESS", isVerified: true },
        { criterionKey: "CANDIDATE_CONSENT_ACTIVE", isVerified: true },
      ];

      await expect(
        completeQaReviewAction({
          applicationId: candidateAAppId,
          decision: "PASS",
          checklistItems: qaChecklist,
        })
      ).rejects.toThrow(/Operation requires EMPLOYEE or ADMIN role/i);
    });

    it("11. Candidate cannot create operational tasks", async () => {
      const res = await createTaskAction({
        title: "Unauthorized Candidate Task",
        category: "APPLICATION",
        type: "PREPARE_RESUME",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/EMPLOYEE or ADMIN role/i);
    });

    it("12. Candidate cannot create or view internal staff notes", async () => {
      const createRes = await createInternalNoteAction({
        candidateId: candidateACandId,
        body: "Sneaky internal note",
      });
      expect(createRes.success).toBe(false);
      expect(createRes.error).toMatch(/EMPLOYEE or ADMIN role/i);

      const getRes = await getInternalNotesAction({
        candidateId: candidateACandId,
      });
      expect(getRes.success).toBe(false);
      expect(getRes.error).toMatch(/EMPLOYEE or ADMIN role/i);
    });

    it("13. Candidate cannot perform administrative member management", async () => {
      const createEmpRes = await createEmployeeAction({
        email: "newemployee@alpha.com",
        firstName: "New",
        lastName: "Staff",
        role: "EMPLOYEE",
      });
      expect(createEmpRes.success).toBe(false);
      expect(createEmpRes.error).toMatch(/ADMIN role/i);
    });

    it("14. Candidate cannot verify privacy requests", async () => {
      const verifyRes = await verifyPrivacyRequestAction({
        requestId: "34343434-3434-4434-8434-343434343434",
        verificationNotes: "Staff ID verification",
      });
      expect(verifyRes.success).toBe(false);
      expect(verifyRes.error).toMatch(/EMPLOYEE or ADMIN role/i);
    });
  });

  describe("Section 3: Cross-Tenant Isolation (Staff Org Beta → Org Alpha Resources)", () => {
    beforeEach(() => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: employeeBetaUserId,
        email: "staff@beta.com",
        role: Role.EMPLOYEE,
        organizationId: orgBetaId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });
    });

    it("15. Employee Beta cannot mutate Org Alpha task by manipulated ID", async () => {
      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          task: {
            findUnique: vi.fn().mockResolvedValue(null), // Org Beta RLS scope returns null for Org Alpha task
          },
        };
        return callback(tx as any);
      });

      const res = await updateTaskAction({
        taskId: orgAlphaTaskId,
        title: "Malicious Cross-Tenant Task Update",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Task not found/i);
    });

    it("16. Employee Beta cannot download Org Alpha submission confirmation evidence", async () => {
      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          applicationSubmission: {
            findUnique: vi.fn().mockResolvedValue({
              id: orgAlphaSubId,
              application: { organizationId: orgAlphaId },
              storagePath: "org-alpha/evidence.pdf",
            }),
          },
        };
        return callback(tx as any);
      });

      await expect(
        getSubmissionEvidenceDownloadUrlAction({
          submissionId: orgAlphaSubId,
        })
      ).rejects.toThrow(/You do not have access to evidence for this organization/i);
    });

    it("17. Employee Beta cannot invoke Candidate approval actions", async () => {
      await expect(
        candidateApproveApplicationAction({
          applicationId: candidateAAppId,
        })
      ).rejects.toThrow(/Operation requires CANDIDATE role/i);
    });

    it("18. Admin Beta cannot query Org Alpha audit logs", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: adminBetaUserId,
        email: "admin@beta.com",
        role: Role.ADMIN,
        organizationId: orgBetaId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          auditEvent: {
            findMany: vi.fn().mockResolvedValue([]), // Scoped to Org Beta
            count: vi.fn().mockResolvedValue(0),
          },
        };
        return callback(tx as any);
      });

      const res = await listAuditLogsAction({ limit: 10, page: 1 });
      expect(res.success).toBe(true);
      expect(res.data?.logs).toHaveLength(0);
    });
  });
});
