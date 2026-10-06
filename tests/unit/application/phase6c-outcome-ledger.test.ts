/**
 * Phase 6C — Application Outcome Ledger foundation.
 * Contract: docs/engineering/PHASE_6B_EXTERNAL_OUTCOME_PRODUCT_CONTRACT.md (O1–O7)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  CANDIDATE_OUTCOME_LABELS,
  STAFF_OUTCOME_LABELS,
  candidateOutcomeLabel,
} from "@/lib/application/outcome-labels";
import {
  CandidateReportOutcomeSchema,
  StaffCreateOutcomeSchema,
} from "@/lib/validation/outcome.schemas";
import {
  assertHasSubmissionEvidence,
  assertInterviewScheduledOccurredAt,
  createCandidateReportedOutcome,
  createStaffOutcome,
  listOutcomesForCandidate,
  listOutcomesForStaff,
  voidOutcome,
  verifyCandidateReportedOutcome,
} from "@/lib/application/outcome-service";
import { OUTCOME_EVIDENCE_BUCKET, generateOutcomeEvidencePath } from "@/lib/storage";
import { ALLOWED_APPLICATION_TRANSITIONS } from "@/lib/application/constants";
import { ApplicationStatus } from "@/generated/prisma";

const ROOT = join(__dirname, "../../..");
const ORG = "11111111-1111-4111-8111-111111111111";
const APP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "22222222-2222-4222-8222-222222222222";
const CAND_USER = "33333333-3333-4333-8333-333333333333";

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

function staffCtx() {
  return {
    userId: USER,
    organizationId: ORG,
    role: "EMPLOYEE" as const,
    email: "staff@test.com",
    status: "ACTIVE" as const,
    membershipStatus: "ACTIVE" as const,
  };
}

function candidateCtx() {
  return {
    userId: CAND_USER,
    organizationId: ORG,
    role: "CANDIDATE" as const,
    email: "cand@test.com",
    status: "ACTIVE" as const,
    membershipStatus: "ACTIVE" as const,
  };
}

describe("Phase 6C — O1 labels", () => {
  it("freezes candidate-safe labels exactly", () => {
    expect(CANDIDATE_OUTCOME_LABELS).toEqual({
      EMPLOYER_REJECTION: "Employer declined",
      RECRUITER_CONTACT: "Recruiter contacted you",
      INTERVIEW_REQUESTED: "Interview requested",
      INTERVIEW_SCHEDULED: "Interview scheduled",
      OFFER_RECEIVED: "Offer received",
      OTHER: "Other update",
    });
  });

  it("does not expose raw enums via candidate label helper", () => {
    expect(candidateOutcomeLabel("EMPLOYER_REJECTION")).toBe("Employer declined");
    expect(candidateOutcomeLabel("EMPLOYER_REJECTION")).not.toContain(
      "EMPLOYER_REJECTION"
    );
  });

  it("staff labels remain operational", () => {
    expect(STAFF_OUTCOME_LABELS.EMPLOYER_REJECTION).toBe("Employer rejection");
    expect(STAFF_OUTCOME_LABELS.OTHER).toBe("Other external update");
  });
});

describe("Phase 6C — O6 INTERVIEW_SCHEDULED occurredAt", () => {
  it("Zod rejects INTERVIEW_SCHEDULED without occurredAt", () => {
    const r = StaffCreateOutcomeSchema.safeParse({
      applicationId: APP,
      outcomeType: "INTERVIEW_SCHEDULED",
    });
    expect(r.success).toBe(false);
  });

  it("Zod accepts INTERVIEW_SCHEDULED with occurredAt", () => {
    const r = StaffCreateOutcomeSchema.safeParse({
      applicationId: APP,
      outcomeType: "INTERVIEW_SCHEDULED",
      occurredAt: "2026-10-06T12:00:00.000Z",
    });
    expect(r.success).toBe(true);
  });

  it("service helper rejects missing occurredAt", () => {
    expect(() =>
      assertInterviewScheduledOccurredAt("INTERVIEW_SCHEDULED", null)
    ).toThrow(/occurredAt/i);
  });

  it("INTERVIEW_REQUESTED allows null occurredAt", () => {
    expect(() =>
      assertInterviewScheduledOccurredAt("INTERVIEW_REQUESTED", null)
    ).not.toThrow();
  });

  it("candidate report schema also enforces O6", () => {
    const r = CandidateReportOutcomeSchema.safeParse({
      applicationId: APP,
      outcomeType: "INTERVIEW_SCHEDULED",
    });
    expect(r.success).toBe(false);
  });
});

describe("Phase 6C — O7 provenance taxonomy", () => {
  it("schema excludes IMPORTED/EXTERNAL_VERIFIED/SYSTEM_DERIVED", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    const block = schema.slice(
      schema.indexOf("enum ApplicationOutcomeProvenance"),
      schema.indexOf("enum ApplicationOutcomeCorrectionState")
    );
    expect(block).toContain("EMPLOYEE_RECORDED");
    expect(block).toContain("CANDIDATE_REPORTED");
    expect(block).toContain("STAFF_VERIFIED");
    expect(block).not.toContain("IMPORTED");
    expect(block).not.toContain("EXTERNAL_VERIFIED");
    expect(block).not.toContain("SYSTEM_DERIVED");
  });

  it("V1 outcome type enum is exact", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    const block = schema.slice(
      schema.indexOf("enum ApplicationOutcomeType"),
      schema.indexOf("enum ApplicationOutcomeProvenance")
    );
    for (const t of [
      "EMPLOYER_REJECTION",
      "RECRUITER_CONTACT",
      "INTERVIEW_REQUESTED",
      "INTERVIEW_SCHEDULED",
      "OFFER_RECEIVED",
      "OTHER",
    ]) {
      expect(block).toContain(t);
    }
    expect(block).not.toContain("NO_RESPONSE");
    expect(block).not.toContain("ASSESSMENT_REQUESTED");
  });
});

describe("Phase 6C — O5 evidence residency", () => {
  it("uses dedicated outcome-evidence bucket, not career vault", () => {
    expect(OUTCOME_EVIDENCE_BUCKET).toBe("outcome-evidence");
    expect(OUTCOME_EVIDENCE_BUCKET).not.toBe("candidate-documents");
    expect(OUTCOME_EVIDENCE_BUCKET).not.toBe("submission-evidence");
  });

  it("path is application/outcome scoped under tenants", () => {
    const p = generateOutcomeEvidencePath(ORG, APP, "out-1", "Proof.PDF");
    expect(p).toBe(
      `tenants/${ORG}/applications/${APP}/outcomes/out-1-proof.pdf`
    );
    expect(p).not.toContain("documents");
  });
});

describe("Phase 6C — submission prerequisite", () => {
  it("rejects outcomes without submission evidence", () => {
    expect(() => assertHasSubmissionEvidence(0)).toThrow(/submission/i);
  });

  it("allows outcomes when submission count >= 1", () => {
    expect(() => assertHasSubmissionEvidence(1)).not.toThrow();
  });
});

describe("Phase 6C — lifecycle coupling (O4) + history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockStaffTx(opts: {
    status: ApplicationStatus;
    submissions?: number;
    createImpl?: (data: unknown) => unknown;
  }) {
    const created: unknown[] = [];
    const updated: unknown[] = [];
    const history: unknown[] = [];
    const tx = {
      application: {
        findFirst: vi.fn().mockResolvedValue({
          id: APP,
          organizationId: ORG,
          status: opts.status,
          candidateId: "cand",
          assignedEmployeeId: USER,
          assignedTeamKey: null,
          assignedManagerId: null,
          candidate: { userId: CAND_USER },
          _count: { submissions: opts.submissions ?? 1 },
        }),
        update: vi.fn(async ({ data }: { data: unknown }) => {
          updated.push(data);
          return data;
        }),
      },
      membership: {
        findFirst: vi.fn().mockResolvedValue({
          id: "mem-1",
          organizationId: ORG,
          userId: USER,
          status: "ACTIVE",
          role: "EMPLOYEE",
          isTeamLead: false,
          teamLeadOf: null,
          team: null,
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      applicationOutcomeEvent: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = {
            id: "outcome-1",
            ...data,
            recordedAt: data.recordedAt ?? new Date(),
            createdAt: new Date(),
          };
          created.push(row);
          return opts.createImpl ? opts.createImpl(row) : row;
        }),
        update: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      applicationStateHistory: {
        create: vi.fn(async ({ data }: { data: unknown }) => {
          history.push(data);
          return data;
        }),
      },
      _created: created,
      _updated: updated,
      _history: history,
    };
    return tx;
  }

  it("SUBMITTED + RECRUITER_CONTACT remains SUBMITTED", async () => {
    const tx = mockStaffTx({ status: "SUBMITTED" });
    await createStaffOutcome(tx as never, staffCtx(), {
      applicationId: APP,
      outcomeType: "RECRUITER_CONTACT",
    });
    expect(tx.application.update).not.toHaveBeenCalled();
    expect((tx._created[0] as { outcomeType: string }).outcomeType).toBe(
      "RECRUITER_CONTACT"
    );
  });

  it("SUBMITTED + INTERVIEW_REQUESTED remains SUBMITTED", async () => {
    const tx = mockStaffTx({ status: "SUBMITTED" });
    await createStaffOutcome(tx as never, staffCtx(), {
      applicationId: APP,
      outcomeType: "INTERVIEW_REQUESTED",
    });
    expect(tx.application.update).not.toHaveBeenCalled();
  });

  it("SUBMITTED + INTERVIEW_SCHEDULED remains SUBMITTED", async () => {
    const tx = mockStaffTx({ status: "SUBMITTED" });
    await createStaffOutcome(tx as never, staffCtx(), {
      applicationId: APP,
      outcomeType: "INTERVIEW_SCHEDULED",
      occurredAt: new Date("2026-10-10T15:00:00.000Z"),
    });
    expect(tx.application.update).not.toHaveBeenCalled();
  });

  it("SUBMITTED + OFFER_RECEIVED remains SUBMITTED", async () => {
    const tx = mockStaffTx({ status: "SUBMITTED" });
    await createStaffOutcome(tx as never, staffCtx(), {
      applicationId: APP,
      outcomeType: "OFFER_RECEIVED",
    });
    expect(tx.application.update).not.toHaveBeenCalled();
  });

  it("O4: authoritative EMPLOYER_REJECTION couples outcome + REJECTED + history", async () => {
    const { logUserAuditEvent } = await import("@/lib/audit");
    const tx = mockStaffTx({ status: "SUBMITTED" });
    await createStaffOutcome(tx as never, staffCtx(), {
      applicationId: APP,
      outcomeType: "EMPLOYER_REJECTION",
      notes: "Employer closed role",
    });
    expect(tx._created).toHaveLength(1);
    expect((tx._created[0] as { outcomeType: string }).outcomeType).toBe(
      "EMPLOYER_REJECTION"
    );
    expect(tx.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ApplicationStatus.REJECTED }),
      })
    );
    expect(tx._history).toHaveLength(1);
    expect(tx._history[0]).toEqual(
      expect.objectContaining({
        fromStatus: ApplicationStatus.SUBMITTED,
        toStatus: ApplicationStatus.REJECTED,
      })
    );
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "APPLICATION_OUTCOME_CREATED",
        tx,
      })
    );
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "APPLICATION_STATUS_CHANGED",
        tx,
      })
    );
  });

  it("O4: rejects EMPLOYER_REJECTION when not SUBMITTED", async () => {
    const tx = mockStaffTx({ status: "READY" });
    await expect(
      createStaffOutcome(tx as never, staffCtx(), {
        applicationId: APP,
        outcomeType: "EMPLOYER_REJECTION",
      })
    ).rejects.toThrow(/SUBMITTED/);
  });

  it("OTHER defaults candidateVisible false unless staff sets true", async () => {
    const tx = mockStaffTx({ status: "SUBMITTED" });
    await createStaffOutcome(tx as never, staffCtx(), {
      applicationId: APP,
      outcomeType: "OTHER",
    });
    expect((tx._created[0] as { candidateVisible: boolean }).candidateVisible).toBe(
      false
    );

    const tx2 = mockStaffTx({ status: "SUBMITTED" });
    await createStaffOutcome(tx2 as never, staffCtx(), {
      applicationId: APP,
      outcomeType: "OTHER",
      candidateVisible: true,
    });
    expect(
      (tx2._created[0] as { candidateVisible: boolean }).candidateVisible
    ).toBe(true);
  });

  it("candidate report never changes ApplicationStatus", async () => {
    const tx = {
      application: {
        findFirst: vi.fn().mockResolvedValue({
          id: APP,
          organizationId: ORG,
          status: "SUBMITTED",
          candidateId: "cand",
          candidate: { userId: CAND_USER },
          _count: { submissions: 1 },
        }),
        update: vi.fn(),
      },
      applicationOutcomeEvent: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: "cr-1",
          ...data,
          recordedAt: new Date(),
          createdAt: new Date(),
        })),
      },
    };
    await createCandidateReportedOutcome(tx as never, candidateCtx(), {
      applicationId: APP,
      outcomeType: "EMPLOYER_REJECTION",
    });
    expect(tx.application.update).not.toHaveBeenCalled();
    expect(tx.applicationOutcomeEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provenance: "CANDIDATE_REPORTED",
          outcomeType: "EMPLOYER_REJECTION",
        }),
      })
    );
  });

  it("candidate cannot report OTHER", async () => {
    const tx = {
      application: {
        findFirst: vi.fn().mockResolvedValue({
          id: APP,
          organizationId: ORG,
          status: "SUBMITTED",
          candidateId: "cand",
          candidate: { userId: CAND_USER },
          _count: { submissions: 1 },
        }),
      },
      applicationOutcomeEvent: { create: vi.fn() },
    };
    await expect(
      createCandidateReportedOutcome(tx as never, candidateCtx(), {
        applicationId: APP,
        outcomeType: "OTHER" as never,
      })
    ).rejects.toThrow(/OTHER/);
  });

  it("void is correction-only (ACTIVE → VOIDED)", async () => {
    const tx = {
      application: {
        findFirst: vi.fn().mockResolvedValue({
          id: APP,
          organizationId: ORG,
          status: "SUBMITTED",
          candidateId: "cand",
          assignedEmployeeId: USER,
          assignedTeamKey: null,
          assignedManagerId: null,
          candidate: { userId: CAND_USER },
          _count: { submissions: 1 },
        }),
      },
      membership: {
        findFirst: vi.fn().mockResolvedValue({
          id: "mem-1",
          organizationId: ORG,
          userId: USER,
          status: "ACTIVE",
          role: "EMPLOYEE",
          isTeamLead: false,
          teamLeadOf: null,
          team: null,
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      applicationOutcomeEvent: {
        findFirst: vi.fn().mockResolvedValue({
          id: "o1",
          organizationId: ORG,
          applicationId: APP,
          correctionState: "ACTIVE",
        }),
        update: vi.fn(async ({ data }: { data: unknown }) => ({
          id: "o1",
          ...(data as object),
        })),
      },
    };
    const updated = await voidOutcome(tx as never, staffCtx(), {
      outcomeId: "o1",
      reason: "Entered in error",
    });
    expect(updated.correctionState).toBe("VOIDED");
  });

  it("verify of non-rejection creates STAFF_VERIFIED and supersedes original", async () => {
    const tx = {
      application: {
        findFirst: vi.fn().mockResolvedValue({
          id: APP,
          organizationId: ORG,
          status: "SUBMITTED",
          candidateId: "cand",
          assignedEmployeeId: USER,
          assignedTeamKey: null,
          assignedManagerId: null,
          candidate: { userId: CAND_USER },
          _count: { submissions: 1 },
        }),
      },
      membership: {
        findFirst: vi.fn().mockResolvedValue({
          id: "mem-1",
          organizationId: ORG,
          userId: USER,
          status: "ACTIVE",
          role: "EMPLOYEE",
          isTeamLead: false,
          teamLeadOf: null,
          team: null,
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      applicationOutcomeEvent: {
        findFirst: vi.fn().mockResolvedValue({
          id: "cr-1",
          organizationId: ORG,
          applicationId: APP,
          outcomeType: "INTERVIEW_REQUESTED",
          provenance: "CANDIDATE_REPORTED",
          correctionState: "ACTIVE",
          occurredAt: null,
          notes: null,
          candidateVisible: true,
          evidenceText: null,
          evidenceStoragePath: null,
          evidenceShareable: false,
        }),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: "sv-1",
          ...data,
          recordedAt: new Date(),
        })),
        update: vi.fn(),
      },
      applicationStateHistory: { create: vi.fn() },
    };
    const verified = await verifyCandidateReportedOutcome(tx as never, staffCtx(), {
      outcomeId: "cr-1",
    });
    expect(verified.provenance).toBe("STAFF_VERIFIED");
    expect(tx.applicationOutcomeEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          correctionState: "SUPERSEDED",
          supersededById: "sv-1",
        }),
      })
    );
    expect(tx.application.findFirst).toHaveBeenCalled();
  });

  it("active list excludes voided; history includes them", async () => {
    const rows = [
      {
        id: "a",
        outcomeType: "RECRUITER_CONTACT" as const,
        provenance: "EMPLOYEE_RECORDED" as const,
        actorUserId: USER,
        recordedAt: new Date("2026-01-01"),
        occurredAt: null,
        notes: null,
        candidateVisible: true,
        evidenceText: null,
        evidenceStoragePath: null,
        evidenceShareable: false,
        correctionState: "ACTIVE" as const,
      },
      {
        id: "b",
        outcomeType: "OFFER_RECEIVED" as const,
        provenance: "EMPLOYEE_RECORDED" as const,
        actorUserId: USER,
        recordedAt: new Date("2026-01-02"),
        occurredAt: null,
        notes: "x",
        candidateVisible: true,
        evidenceText: null,
        evidenceStoragePath: null,
        evidenceShareable: false,
        correctionState: "VOIDED" as const,
      },
    ];
    const txActive = {
      application: {
        findFirst: vi.fn().mockResolvedValue({
          id: APP,
          organizationId: ORG,
          status: "SUBMITTED",
          candidateId: "c",
          assignedEmployeeId: USER,
          assignedTeamKey: null,
          assignedManagerId: null,
          candidate: { userId: CAND_USER },
          _count: { submissions: 1 },
        }),
      },
      membership: {
        findFirst: vi.fn().mockResolvedValue({
          id: "mem-1",
          organizationId: ORG,
          userId: USER,
          status: "ACTIVE",
          role: "EMPLOYEE",
          isTeamLead: false,
          teamLeadOf: null,
          team: null,
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      applicationOutcomeEvent: {
        findMany: vi.fn().mockImplementation(async ({ where }: { where: { correctionState?: string } }) => {
          if (where.correctionState === "ACTIVE") {
            return rows.filter((r) => r.correctionState === "ACTIVE");
          }
          return rows;
        }),
      },
    };
    const active = await listOutcomesForStaff(txActive as never, staffCtx(), APP);
    expect(active.map((o) => o.id)).toEqual(["a"]);
    const hist = await listOutcomesForStaff(txActive as never, staffCtx(), APP, {
      includeInactive: true,
    });
    expect(hist.map((o) => o.id).sort()).toEqual(["a", "b"]);
  });

  it("candidate list hides OTHER unless candidateVisible", async () => {
    const tx = {
      application: {
        findFirst: vi.fn().mockResolvedValue({
          id: APP,
          organizationId: ORG,
          status: "SUBMITTED",
          candidateId: "c",
          candidate: { userId: CAND_USER },
          _count: { submissions: 1 },
        }),
      },
      applicationOutcomeEvent: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "hidden",
            outcomeType: "OTHER",
            provenance: "EMPLOYEE_RECORDED",
            actorUserId: USER,
            recordedAt: new Date(),
            occurredAt: null,
            notes: "internal",
            candidateVisible: false,
            evidenceText: "secret",
            evidenceStoragePath: null,
            evidenceShareable: false,
            correctionState: "ACTIVE",
          },
          {
            id: "shown",
            outcomeType: "OTHER",
            provenance: "EMPLOYEE_RECORDED",
            actorUserId: USER,
            recordedAt: new Date(),
            occurredAt: null,
            notes: "staff note",
            candidateVisible: true,
            evidenceText: null,
            evidenceStoragePath: null,
            evidenceShareable: false,
            correctionState: "ACTIVE",
          },
        ]),
      },
    };
    // Service applies OR filter in query; mock returns both — presentation filter still drops invisible OTHER
    // Actually listOutcomesForCandidate filters OTHER || candidateVisible in map step after query.
    // The mock returns both; filter keeps only candidateVisible OTHER.
    const listed = await listOutcomesForCandidate(
      tx as never,
      candidateCtx(),
      APP
    );
    expect(listed.map((o) => o.id)).toEqual(["shown"]);
    expect(listed[0]?.label).toBe("Other update");
    expect(listed[0]?.notes).toBeNull();
  });

  it("multiple chronological outcomes all remain (no collapse)", async () => {
    const sequence: Array<{
      outcomeType:
        | "RECRUITER_CONTACT"
        | "INTERVIEW_REQUESTED"
        | "INTERVIEW_SCHEDULED"
        | "OFFER_RECEIVED";
      at: string;
    }> = [
      { outcomeType: "RECRUITER_CONTACT", at: "2026-01-01T00:00:00.000Z" },
      { outcomeType: "INTERVIEW_REQUESTED", at: "2026-01-02T00:00:00.000Z" },
      { outcomeType: "INTERVIEW_SCHEDULED", at: "2026-01-03T00:00:00.000Z" },
      { outcomeType: "OFFER_RECEIVED", at: "2026-01-04T00:00:00.000Z" },
    ];
    const tx = {
      application: {
        findFirst: vi.fn().mockResolvedValue({
          id: APP,
          organizationId: ORG,
          status: "SUBMITTED",
          candidateId: "c",
          assignedEmployeeId: USER,
          assignedTeamKey: null,
          assignedManagerId: null,
          candidate: { userId: CAND_USER },
          _count: { submissions: 1 },
        }),
      },
      membership: {
        findFirst: vi.fn().mockResolvedValue({
          id: "mem-1",
          organizationId: ORG,
          userId: USER,
          status: "ACTIVE",
          role: "EMPLOYEE",
          isTeamLead: false,
          teamLeadOf: null,
          team: null,
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      applicationOutcomeEvent: {
        findMany: vi.fn().mockResolvedValue(
          sequence.map((row, i) => ({
            id: `e${i}`,
            outcomeType: row.outcomeType,
            provenance: "EMPLOYEE_RECORDED",
            actorUserId: USER,
            recordedAt: new Date(row.at),
            occurredAt: new Date(row.at),
            notes: null,
            candidateVisible: true,
            evidenceText: null,
            evidenceStoragePath: null,
            evidenceShareable: false,
            correctionState: "ACTIVE",
          }))
        ),
      },
    };
    const listed = await listOutcomesForStaff(tx as never, staffCtx(), APP);
    expect(listed).toHaveLength(4);
    expect(listed.map((o) => o.outcomeType)).toEqual(
      sequence.map((r) => r.outcomeType)
    );
  });
});

describe("Phase 6C — early REJECTED does not fabricate employer outcome", () => {
  it("DISCOVERED/QUALIFIED → REJECTED remain allowed without outcome creation in transitions", () => {
    expect(ALLOWED_APPLICATION_TRANSITIONS.DISCOVERED).toContain(
      ApplicationStatus.REJECTED
    );
    expect(ALLOWED_APPLICATION_TRANSITIONS.QUALIFIED).toContain(
      ApplicationStatus.REJECTED
    );
    const actions = readFileSync(
      join(ROOT, "src/lib/application/actions.ts"),
      "utf8"
    );
    // Generic transition path must not create ApplicationOutcomeEvent
    expect(actions).not.toContain("applicationOutcomeEvent");
    expect(actions).not.toContain("EMPLOYER_REJECTION");
  });

  it("approval denial path does not create EMPLOYER_REJECTION", () => {
    const actions = readFileSync(
      join(ROOT, "src/lib/application/actions.ts"),
      "utf8"
    );
    const qa = readFileSync(join(ROOT, "src/lib/qa/actions.ts"), "utf8");
    expect(actions + qa).not.toMatch(
      /EMPLOYER_REJECTION[\s\S]{0,80}PREPARING|PREPARING[\s\S]{0,80}EMPLOYER_REJECTION/
    );
  });
});

describe("Phase 6C — O2 void-only migration contract", () => {
  it("migration grants SELECT/INSERT/UPDATE but not DELETE", () => {
    const sql = readFileSync(
      join(
        ROOT,
        "prisma/migrations/20261006140000_phase6c_application_outcome_ledger/migration.sql"
      ),
      "utf8"
    );
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE ON "application_outcome_events"'
    );
    expect(sql).not.toMatch(
      /GRANT[^;]*DELETE[^;]*application_outcome_events/i
    );
    expect(sql).toMatch(/No DELETE grant/i);
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
  });
});

describe("Phase 6D.2 — Outcome Recording & Evidence Upload Flow", () => {
  const mockTx = {
    application: {
      findFirst: vi.fn().mockResolvedValue({
        id: APP,
        organizationId: ORG,
        status: "SUBMITTED",
        candidateId: "cand",
        assignedEmployeeId: USER,
        assignedTeamKey: null,
        assignedManagerId: null,
        candidate: { userId: CAND_USER },
        _count: { submissions: 1 },
      }),
    },
    membership: {
      findFirst: vi.fn().mockResolvedValue({
        id: "mem-1",
        organizationId: ORG,
        userId: USER,
        status: "ACTIVE",
        role: "EMPLOYEE",
        isTeamLead: false,
        teamLeadOf: null,
        team: null,
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    applicationOutcomeEvent: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "out-evidence-1",
        ...data,
        recordedAt: new Date(),
        createdAt: new Date(),
      })),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };

  it("1. Record outcome without evidence succeeds with evidenceStoragePath null", async () => {
    const event = await createStaffOutcome(mockTx as never, staffCtx(), {
      applicationId: APP,
      outcomeType: "INTERVIEW_REQUESTED",
      notes: "HR called candidate directly",
      evidenceStoragePath: null,
    });
    expect(event.outcomeType).toBe("INTERVIEW_REQUESTED");
    expect(mockTx.applicationOutcomeEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evidenceStoragePath: null,
          evidenceShareable: false,
        }),
      })
    );
  });

  it("2. Record outcome with evidence succeeds and stores evidence metadata", async () => {
    const canonicalPath = generateOutcomeEvidencePath(
      ORG,
      APP,
      "out-123",
      "interview_email.pdf"
    );
    const event = await createStaffOutcome(mockTx as never, staffCtx(), {
      applicationId: APP,
      outcomeType: "INTERVIEW_REQUESTED",
      notes: "Attached screenshot of invite",
      evidenceStoragePath: canonicalPath,
      evidenceShareable: true,
    });
    expect(event.outcomeType).toBe("INTERVIEW_REQUESTED");
    expect(mockTx.applicationOutcomeEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evidenceStoragePath: canonicalPath,
          evidenceShareable: true,
        }),
      })
    );
  });

  it("3. Storage helpers use getStorageClient for service-role signed URL generation", () => {
    const storageCode = readFileSync(
      join(ROOT, "src/lib/storage/index.ts"),
      "utf8"
    );
    expect(storageCode).toContain("createSignedOutcomeEvidenceUploadUrl");
    expect(storageCode).toContain("createSignedOutcomeEvidenceDownloadUrl");
    expect(storageCode).toMatch(
      /createSignedOutcomeEvidenceUploadUrl[\s\S]*?getStorageClient\(\)/
    );
    expect(storageCode).toMatch(
      /createSignedOutcomeEvidenceDownloadUrl[\s\S]*?getStorageClient\(\)/
    );
  });
});
