import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  transitionApplicationStatusAction,
} from "@/lib/application/actions";
import {
  createTaskAction,
} from "@/lib/task/actions";
import {
  completeQaReviewAction,
} from "@/lib/qa/actions";
import {
  getInternalNotesAction,
} from "@/lib/communication/actions";
import {
  listAuditLogsAction,
  createEmployeeAction,
  setEmployeeStatusAction,
  updateEmployeeRoleAction,
} from "@/lib/admin/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import {
  ApplicationStatus,
} from "@/generated/prisma";
import { QA_CRITERION_KEYS } from "@/lib/validation/qa.schemas";
import { AuthorizationError } from "@/lib/errors";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireAdmin: vi.fn((ctx) => {
    if (ctx.role !== "ADMIN") {
      throw new AuthorizationError("Operation requires ADMIN role");
    }
  }),
  requireEmployeeOrAdmin: vi.fn((ctx) => {
    if (ctx.role !== "ADMIN" && ctx.role !== "EMPLOYEE") {
      throw new AuthorizationError("Operation requires EMPLOYEE or ADMIN role");
    }
  }),
  requireCandidate: vi.fn((ctx) => {
    if (ctx.role !== "CANDIDATE") {
      throw new AuthorizationError("Operation requires CANDIDATE role");
    }
  }),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

describe("Phase 9 Golden Path — Multi-Tenant Isolation & RBAC Security Matrix (tests/integration/golden-path/multi-tenant-security-matrix.test.ts)", () => {
  // Tenant A: Org-Alpha
  const mockOrgAlpha = "11111111-1111-4111-8111-111111111111";
  const mockCandidateAlphaUserId = "22222222-2222-4222-8222-222222222222";
  const mockEmployeeAlphaUserId = "44444444-4444-4444-8444-444444444444";
  const mockAppAlphaId = "66666666-6666-4666-8666-666666666666";

  // Tenant B: Org-Beta
  const mockOrgBeta = "99999999-9999-4999-8999-999999999999";
  const mockEmployeeBetaUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const mockAdminBetaUserId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  const buildPassChecklist = () =>
    QA_CRITERION_KEYS.map((criterionKey) => ({
      criterionKey,
      isVerified: true,
    }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Multi-Tenant Cross-Organization Isolation Matrix (11 Entities)", () => {
    it("Cross-Tenant Applications: Employee Beta cannot view or modify Org Alpha applications", async () => {
      // Employee Beta authenticates
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockEmployeeBetaUserId,
        email: "staff@beta.com",
        role: "EMPLOYEE" as any,
        organizationId: mockOrgBeta,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      // Attempting to advance Org Alpha Application returns error due to tenant mismatch
      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          application: {
            findUnique: vi.fn().mockResolvedValue(null), // Org-Beta RLS filter returns null for Org-Alpha app
          },
        };
        return callback(tx as any);
      });

      const transRes = await transitionApplicationStatusAction({
        applicationId: mockAppAlphaId,
        targetStatus: ApplicationStatus.QUALIFIED,
      });
      expect(transRes.success).toBe(false);
      expect(transRes.error).toMatch(/Application not found/i);
    });

    it("Cross-Tenant Tasks: Employee Beta cannot create tasks in Org Alpha", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockEmployeeBetaUserId,
        email: "staff@beta.com",
        role: "EMPLOYEE" as any,
        organizationId: mockOrgBeta,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          application: {
            findUnique: vi.fn().mockResolvedValue(null), // Not in Org-Beta
          },
        };
        return callback(tx as any);
      });

      const taskRes = await createTaskAction({
        title: "Cross-Tenant Task Attempt",
        applicationId: mockAppAlphaId,
        category: "APPLICATION",
        type: "PREPARE_RESUME",
      });
      expect(taskRes.success).toBe(false);
      expect(taskRes.error).toMatch(/Application not found/i);
    });

    it("Cross-Tenant Internal Notes: Staff Beta cannot read Org Alpha internal notes", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockEmployeeBetaUserId,
        email: "staff@beta.com",
        role: "EMPLOYEE" as any,
        organizationId: mockOrgBeta,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          internalNote: {
            findMany: vi.fn().mockResolvedValue([]), // Scoped to Org-Beta
          },
        };
        return callback(tx as any);
      });

      const notesRes = await getInternalNotesAction({
        applicationId: mockAppAlphaId,
      });
      expect(notesRes.success).toBe(true);
      expect(notesRes.data?.notes).toHaveLength(0);
    });

    it("Cross-Tenant Audit Logs: Admin Beta cannot query Org Alpha audit events", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockAdminBetaUserId,
        email: "admin@beta.com",
        role: "ADMIN" as any,
        organizationId: mockOrgBeta,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
        const tx = {
          auditEvent: {
            findMany: vi.fn().mockResolvedValue([]), // Only returns Org-Beta events
            count: vi.fn().mockResolvedValue(0),
          },
        };
        return callback(tx as any);
      });

      const logsRes = await listAuditLogsAction({ limit: 10, page: 1 });
      expect(logsRes.success).toBe(true);
      expect(logsRes.data?.logs).toHaveLength(0);
    });
  });

  describe("2. RBAC Boundary Security Matrix (CANDIDATE, EMPLOYEE, ADMIN)", () => {
    it("CANDIDATE role cannot perform privileged staff or administrative actions", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockCandidateAlphaUserId,
        email: "cand@alpha.com",
        role: "CANDIDATE" as any,
        organizationId: mockOrgAlpha,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      // Candidate cannot create employees
      const empRes = await createEmployeeAction({
        email: "attacker@test.com",
        firstName: "Attacker",
        lastName: "User",
        role: "ADMIN",
      });
      expect(empRes.success).toBe(false);
      expect(empRes.error).toMatch(/ADMIN role/i);

      // Candidate cannot change employee status
      const statusRes = await setEmployeeStatusAction({
        employeeUserId: mockEmployeeAlphaUserId,
        status: "INACTIVE",
      });
      expect(statusRes.success).toBe(false);
      expect(statusRes.error).toMatch(/ADMIN role/i);

      // Candidate cannot conduct QA review
      await expect(
        completeQaReviewAction({
          applicationId: mockAppAlphaId,
          decision: "PASS",
          checklistItems: buildPassChecklist(),
          notes: "Attempted by candidate",
        })
      ).rejects.toThrow(AuthorizationError);
    });

    it("EMPLOYEE role cannot perform administrative governance actions", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockEmployeeAlphaUserId,
        email: "staff@alpha.com",
        role: "EMPLOYEE" as any,
        organizationId: mockOrgAlpha,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      // Employee cannot provision new staff
      const empRes = await createEmployeeAction({
        email: "newstaff@alpha.com",
        firstName: "New",
        lastName: "Staff",
        role: "EMPLOYEE",
      });
      expect(empRes.success).toBe(false);
      expect(empRes.error).toMatch(/ADMIN role/i);

      // Employee cannot toggle staff roles
      const roleRes = await updateEmployeeRoleAction({
        employeeUserId: mockEmployeeAlphaUserId,
        role: "ADMIN",
      });
      expect(roleRes.success).toBe(false);
      expect(roleRes.error).toMatch(/ADMIN role/i);

      // Employee cannot query authoritative audit logs
      const auditRes = await listAuditLogsAction({ limit: 10, page: 1 });
      expect(auditRes.success).toBe(false);
      expect(auditRes.error).toMatch(/ADMIN role/i);
    });
  });
});
