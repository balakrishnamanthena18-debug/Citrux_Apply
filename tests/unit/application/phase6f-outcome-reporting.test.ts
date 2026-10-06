/**
 * Phase 6F — Outcome Reporting & Operational Intelligence Unit Tests.
 *
 * Contract: docs/engineering/PHASE_6B_EXTERNAL_OUTCOME_PRODUCT_CONTRACT.md
 * Phase 6E Forensic Audit Contract & Boundaries.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Role } from "@/generated/prisma";
import {
  buildReportingApplicationWhere,
  getOutcomeReportingData,
} from "@/lib/application/outcome-reporting";
import { AuthorizationError } from "@/lib/errors";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const USER_ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_MGR = "66666666-6666-4666-8666-666666666666";
const USER_TL = "33333333-3333-4333-8333-333333333333";
const USER_EMP1 = "11111111-1111-4111-8111-111111111111";
const USER_EMP2 = "22222222-2222-4222-8222-222222222222";
const USER_CAND = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function adminCtx() {
  return {
    userId: USER_ADMIN,
    email: "admin@citrux.com",
    role: Role.ADMIN,
    organizationId: ORG_A,
    status: "ACTIVE" as const,
    membershipStatus: "ACTIVE" as const,
  };
}

function empCtx(userId = USER_EMP1) {
  return {
    userId,
    email: `${userId}@citrux.com`,
    role: Role.EMPLOYEE,
    organizationId: ORG_A,
    status: "ACTIVE" as const,
    membershipStatus: "ACTIVE" as const,
  };
}

function candCtx() {
  return {
    userId: USER_CAND,
    email: "cand@citrux.com",
    role: Role.CANDIDATE,
    organizationId: ORG_A,
    status: "ACTIVE" as const,
    membershipStatus: "ACTIVE" as const,
  };
}

describe("Phase 6F — Outcome Reporting & Operational Intelligence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Role Scoping & Candidate Denial", () => {
    it("rejects candidate access with AuthorizationError", async () => {
      const tx: any = {};
      await expect(
        buildReportingApplicationWhere(tx, candCtx(), {})
      ).rejects.toThrow(AuthorizationError);
    });

    it("admin generates organization-wide where clause", async () => {
      const tx: any = {};
      const where = await buildReportingApplicationWhere(tx, adminCtx(), {});
      expect(where).toEqual({
        AND: [{ organizationId: ORG_A }],
      });
    });

    it("employee scope restricts where clause to assignedEmployeeId", async () => {
      const tx: any = {
        membership: {
          findFirst: vi.fn().mockResolvedValue({
            isTeamLead: false,
            teamLeadOf: null,
            team: null,
          }),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      };

      const where = await buildReportingApplicationWhere(tx, empCtx(), {});
      expect(where.AND).toBeDefined();
      const andList = where.AND as any[];
      expect(andList[0]).toEqual({ organizationId: ORG_A });
      expect(andList[1]).toEqual({
        OR: [{ assignedEmployeeId: USER_EMP1 }],
      });
    });

    it("team lead scope includes team assignees and historical team keys", async () => {
      const tx: any = {
        membership: {
          findFirst: vi.fn().mockResolvedValue({
            isTeamLead: true,
            teamLeadOf: "Team Alpha",
            team: "Team Alpha",
          }),
          findMany: vi.fn().mockImplementation(async ({ where }: any) => {
            if (where?.reportingManagerId) return [];
            return [{ userId: USER_TL }, { userId: USER_EMP1 }];
          }),
          count: vi.fn().mockResolvedValue(0),
        },
      };

      const where = await buildReportingApplicationWhere(tx, empCtx(USER_TL), {});
      expect(where.AND).toBeDefined();
      const andList = where.AND as any[];
      expect(andList[0]).toEqual({ organizationId: ORG_A });
      expect(andList[1]).toEqual({
        OR: [
          { assignedEmployeeId: USER_TL },
          { assignedEmployeeId: { in: [USER_TL, USER_EMP1] } },
          { assignedTeamKey: { in: ["Team Alpha"] } },
        ],
      });
    });

    it("manager scope includes direct report assignees and assignedManagerId snapshot", async () => {
      const tx: any = {
        membership: {
          findFirst: vi.fn().mockResolvedValue({
            isTeamLead: false,
            teamLeadOf: null,
            team: null,
          }),
          findMany: vi.fn().mockImplementation(async ({ where }: any) => {
            if (where?.reportingManagerId) {
              return [{ userId: USER_EMP1 }, { userId: USER_EMP2 }];
            }
            return [];
          }),
          count: vi.fn().mockResolvedValue(2),
        },
      };

      const where = await buildReportingApplicationWhere(tx, empCtx(USER_MGR), {});
      expect(where.AND).toBeDefined();
      const andList = where.AND as any[];
      expect(andList[0]).toEqual({ organizationId: ORG_A });
      expect(andList[1]).toEqual({
        OR: [
          { assignedEmployeeId: USER_MGR },
          { assignedEmployeeId: { in: [USER_EMP1, USER_EMP2] } },
          { assignedManagerId: USER_MGR },
        ],
      });
    });
  });

  describe("2. Metric Calculations & Distinct Application Logic", () => {
    it("correctly computes distinct application metrics and excludes VOIDED / SUPERSEDED", async () => {
      const subDate = new Date("2026-09-01T10:00:00Z");
      const occDate = new Date("2026-09-05T10:00:00Z");

      const mockApps = [
        // App 1: 1 submission, 2 ACTIVE scheduled interviews (must count as 1 app reaching interview scheduled)
        {
          id: "app-1",
          status: "SUBMITTED",
          assignedEmployeeId: USER_EMP1,
          assignedTeamKey: "Team Alpha",
          assignedManagerId: USER_MGR,
          job: { id: "job-1", title: "Frontend Eng", companyName: "Acme Corp" },
          candidate: { id: "c-1", user: { id: "u-1", firstName: "Alex", lastName: "C", email: "alex@c.com" } },
          assignedEmployee: { id: USER_EMP1, firstName: "Emp", lastName: "One", email: "emp1@citrux.com" },
          assignedManager: { id: USER_MGR, firstName: "Mgr", lastName: "One", email: "mgr1@citrux.com" },
          submissions: [{ id: "sub-1", attemptNumber: 1, submittedAt: subDate }],
          outcomeEvents: [
            {
              id: "out-1",
              outcomeType: "INTERVIEW_SCHEDULED",
              provenance: "EMPLOYEE_RECORDED",
              correctionState: "ACTIVE",
              recordedAt: occDate,
              occurredAt: occDate,
              notes: "Interview 1",
              candidateVisible: true,
              evidenceStoragePath: null,
              evidenceText: null,
              evidenceShareable: false,
              actor: { firstName: "Emp", lastName: "One", email: "emp1@citrux.com" },
            },
            {
              id: "out-2",
              outcomeType: "INTERVIEW_SCHEDULED",
              provenance: "EMPLOYEE_RECORDED",
              correctionState: "ACTIVE",
              recordedAt: new Date("2026-09-08T10:00:00Z"),
              occurredAt: new Date("2026-09-08T10:00:00Z"),
              notes: "Interview 2",
              candidateVisible: true,
              evidenceStoragePath: null,
              evidenceText: null,
              evidenceShareable: false,
              actor: { firstName: "Emp", lastName: "One", email: "emp1@citrux.com" },
            },
          ],
        },
        // App 2: 1 submission, 1 VOIDED offer (must NOT count as offer), 0 active outcomes (awaiting outcome)
        {
          id: "app-2",
          status: "SUBMITTED",
          assignedEmployeeId: USER_EMP1,
          assignedTeamKey: "Team Alpha",
          assignedManagerId: USER_MGR,
          job: { id: "job-2", title: "Backend Eng", companyName: "Beta Corp" },
          candidate: { id: "c-2", user: { id: "u-2", firstName: "Bob", lastName: "B", email: "bob@b.com" } },
          assignedEmployee: { id: USER_EMP1, firstName: "Emp", lastName: "One", email: "emp1@citrux.com" },
          assignedManager: { id: USER_MGR, firstName: "Mgr", lastName: "One", email: "mgr1@citrux.com" },
          submissions: [{ id: "sub-2", attemptNumber: 1, submittedAt: subDate }],
          outcomeEvents: [
            {
              id: "out-3",
              outcomeType: "OFFER_RECEIVED",
              provenance: "EMPLOYEE_RECORDED",
              correctionState: "VOIDED",
              recordedAt: occDate,
              occurredAt: occDate,
              notes: "Voided offer",
              candidateVisible: true,
              evidenceStoragePath: null,
              evidenceText: null,
              evidenceShareable: false,
              actor: { firstName: "Emp", lastName: "One", email: "emp1@citrux.com" },
            },
          ],
        },
        // App 3: 1 submission, 1 CANDIDATE_REPORTED employer rejection (must NOT count in authoritative employerRejectionsCount)
        {
          id: "app-3",
          status: "SUBMITTED",
          assignedEmployeeId: USER_EMP2,
          assignedTeamKey: "Team Beta",
          assignedManagerId: USER_MGR,
          job: { id: "job-3", title: "Staff Eng", companyName: "Gamma Corp" },
          candidate: { id: "c-3", user: { id: "u-3", firstName: "Charlie", lastName: "C", email: "charlie@c.com" } },
          assignedEmployee: { id: USER_EMP2, firstName: "Emp", lastName: "Two", email: "emp2@citrux.com" },
          assignedManager: { id: USER_MGR, firstName: "Mgr", lastName: "One", email: "mgr1@citrux.com" },
          submissions: [{ id: "sub-3", attemptNumber: 1, submittedAt: subDate }],
          outcomeEvents: [
            {
              id: "out-4",
              outcomeType: "EMPLOYER_REJECTION",
              provenance: "CANDIDATE_REPORTED",
              correctionState: "ACTIVE",
              recordedAt: occDate,
              occurredAt: null, // Test fallback
              notes: "Candidate claims rejected",
              candidateVisible: true,
              evidenceStoragePath: null,
              evidenceText: null,
              evidenceShareable: false,
              actor: { firstName: "Charlie", lastName: "C", email: "charlie@c.com" },
            },
          ],
        },
        // App 4: 1 submission, 1 STAFF_VERIFIED employer rejection + coupled REJECTED status
        {
          id: "app-4",
          status: "REJECTED",
          assignedEmployeeId: USER_EMP2,
          assignedTeamKey: "Team Beta",
          assignedManagerId: USER_MGR,
          job: { id: "job-4", title: "Product Mgr", companyName: "Delta Corp" },
          candidate: { id: "c-4", user: { id: "u-4", firstName: "Dana", lastName: "D", email: "dana@d.com" } },
          assignedEmployee: { id: USER_EMP2, firstName: "Emp", lastName: "Two", email: "emp2@citrux.com" },
          assignedManager: { id: USER_MGR, firstName: "Mgr", lastName: "One", email: "mgr1@citrux.com" },
          submissions: [{ id: "sub-4", attemptNumber: 1, submittedAt: subDate }],
          outcomeEvents: [
            {
              id: "out-5",
              outcomeType: "EMPLOYER_REJECTION",
              provenance: "STAFF_VERIFIED",
              correctionState: "ACTIVE",
              recordedAt: occDate,
              occurredAt: occDate,
              notes: "Verified rejection",
              candidateVisible: true,
              evidenceStoragePath: null,
              evidenceText: null,
              evidenceShareable: false,
              actor: { firstName: "Emp", lastName: "Two", email: "emp2@citrux.com" },
            },
          ],
        },
      ];

      const tx: any = {
        application: {
          findMany: vi.fn().mockResolvedValue(mockApps),
        },
        membership: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      const result = await getOutcomeReportingData(tx, adminCtx(), {});

      // 4 submitted apps
      expect(result.metrics.submittedApplicationsCount).toBe(4);
      // App 1 has 2 scheduled interview events &rarr; exactly 1 distinct app reaching scheduled interview
      expect(result.metrics.interviewsScheduledCount).toBe(1);
      // App 2 has 1 VOIDED offer &rarr; 0 offers
      expect(result.metrics.offersReceivedCount).toBe(0);
      // App 2 has no active outcomes &rarr; awaitingOutcomeCount = 1
      expect(result.metrics.awaitingOutcomeCount).toBe(1);
      // App 3 has CANDIDATE_REPORTED rejection, App 4 has STAFF_VERIFIED rejection &rarr; exactly 1 authoritative rejection
      expect(result.metrics.employerRejectionsCount).toBe(1);
      // App 3 candidate reported event count = 1
      expect(result.metrics.candidateReportedCount).toBe(1);
      // App 4 staff verified event count = 1
      expect(result.metrics.staffVerifiedCount).toBe(1);

      // Conversion rates
      expect(result.conversion.interviewScheduledRate).toBe(25); // 1 / 4 = 25%
      expect(result.conversion.employerRejectionRate).toBe(25); // 1 / 4 = 25%
      expect(result.conversion.offerRate).toBe(0);

      // Timing & fallback detection (App 3 occurredAt was null)
      expect(result.timing.hasRecordedTimingFallback).toBe(true);
      expect(result.timing.avgDaysToInterviewScheduled).toBe(4); // 2026-09-05 - 2026-09-01 = 4 days
    });
  });

  describe("3. Historical Attribution Continuity", () => {
    it("preserves team attribution via assignedTeamKey snapshot even if staff changed teams", async () => {
      const subDate = new Date("2026-09-01T10:00:00Z");
      const occDate = new Date("2026-09-05T10:00:00Z");

      const mockApps = [
        {
          id: "app-hist-1",
          status: "ACCEPTED",
          assignedEmployeeId: USER_EMP1, // Employee now in Team B
          assignedTeamKey: "Team Alpha (Historical)", // Snapshot proof
          assignedManagerId: USER_MGR,
          job: { id: "job-1", title: "Frontend Eng", companyName: "Acme Corp" },
          candidate: { id: "c-1", user: { id: "u-1", firstName: "Alex", lastName: "C", email: "alex@c.com" } },
          assignedEmployee: { id: USER_EMP1, firstName: "Emp", lastName: "One", email: "emp1@citrux.com" },
          assignedManager: { id: USER_MGR, firstName: "Mgr", lastName: "One", email: "mgr1@citrux.com" },
          submissions: [{ id: "sub-1", attemptNumber: 1, submittedAt: subDate }],
          outcomeEvents: [
            {
              id: "out-1",
              outcomeType: "OFFER_RECEIVED",
              provenance: "EMPLOYEE_RECORDED",
              correctionState: "ACTIVE",
              recordedAt: occDate,
              occurredAt: occDate,
              notes: "Offer received",
              candidateVisible: true,
              evidenceStoragePath: null,
              evidenceText: null,
              evidenceShareable: false,
              actor: { firstName: "Emp", lastName: "One", email: "emp1@citrux.com" },
            },
          ],
        },
      ];

      const tx: any = {
        application: {
          findMany: vi.fn().mockResolvedValue(mockApps),
        },
        membership: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      const result = await getOutcomeReportingData(tx, adminCtx(), {});
      expect(result.teamBreakdown).toBeDefined();
      const teamAlphaItem = result.teamBreakdown!.find((t) => t.dimensionKey === "Team Alpha (Historical)");
      expect(teamAlphaItem).toBeDefined();
      expect(teamAlphaItem!.offersCount).toBe(1);
      expect(teamAlphaItem!.submittedCount).toBe(1);
    });
  });
});
