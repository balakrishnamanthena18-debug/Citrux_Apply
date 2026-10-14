import { describe, it, expect } from "vitest";
import { DispatchEngine, type CandidateEmployeeProfile } from "@/lib/wcos/dispatch-engine";
import {
  WcosAvailabilityState,
  WcosProficiencyLevel,
  WcosDispatchMode,
} from "@/lib/wcos/types";

describe("Phase 10H-D — WCOS Dispatch Engine Unit Tests", () => {
  const orgId = "11111111-1111-1111-1111-111111111111";

  const createCandidate = (
    id: string,
    overrides: Partial<CandidateEmployeeProfile> = {}
  ): CandidateEmployeeProfile => ({
    id,
    organizationId: orgId,
    userStatus: "ACTIVE",
    membershipStatus: "ACTIVE",
    teamId: "team-alpha",
    teamName: "Alpha Team",
    availabilityState: WcosAvailabilityState.AVAILABLE,
    dailyCapacityCu: 32,
    allocatedBudgetCu: 28,
    activeWorkloadCu: 10,
    lastAssignedAt: new Date(Date.now() - 3600000),
    capabilities: [
      {
        code: "CAP_RESUME_ENGINEERING",
        proficiency: WcosProficiencyLevel.ADVANCED,
        isActive: true,
      },
    ],
    hasHandledCandidateHistory: false,
    ...overrides,
  });

  it("evaluates hard gates and rejects candidates missing verified capability", () => {
    const candidates = [
      createCandidate("emp-1", {
        capabilities: [
          {
            code: "CAP_CANDIDATE_ONBOARDING",
            proficiency: WcosProficiencyLevel.EXPERT,
            isActive: true,
          },
        ],
      }),
    ];

    expect(() =>
      DispatchEngine.evaluate({
        organizationId: orgId,
        requiredCapabilityCode: "CAP_RESUME_ENGINEERING",
        requiredProficiencyLevel: WcosProficiencyLevel.BASIC,
        estimatedCu: 3,
        candidates,
        idempotencyKey: "test-idemp-1",
      })
    ).toThrowError(/No eligible candidates available/);
  });

  it("evaluates hard gates and rejects candidates with insufficient proficiency", () => {
    const candidates = [
      createCandidate("emp-1", {
        capabilities: [
          {
            code: "CAP_RESUME_ENGINEERING",
            proficiency: WcosProficiencyLevel.BASIC,
            isActive: true,
          },
        ],
      }),
    ];

    expect(() =>
      DispatchEngine.evaluate({
        organizationId: orgId,
        requiredCapabilityCode: "CAP_RESUME_ENGINEERING",
        requiredProficiencyLevel: WcosProficiencyLevel.ADVANCED,
        estimatedCu: 3,
        candidates,
        idempotencyKey: "test-idemp-2",
      })
    ).toThrowError(/No eligible candidates available/);
  });

  it("evaluates hard gates and rejects candidates in LEAVE or INACTIVE states", () => {
    const candidates = [
      createCandidate("emp-leave", {
        availabilityState: WcosAvailabilityState.LEAVE,
      }),
      createCandidate("emp-inactive", {
        availabilityState: WcosAvailabilityState.INACTIVE,
      }),
      createCandidate("emp-unavail", {
        availabilityState: WcosAvailabilityState.UNAVAILABLE,
      }),
    ];

    expect(() =>
      DispatchEngine.evaluate({
        organizationId: orgId,
        requiredCapabilityCode: "CAP_RESUME_ENGINEERING",
        requiredProficiencyLevel: WcosProficiencyLevel.BASIC,
        estimatedCu: 3,
        candidates,
        idempotencyKey: "test-idemp-3",
      })
    ).toThrowError(/No eligible candidates available/);
  });

  it("evaluates hard gates and rejects over-capacity candidates exceeding budget", () => {
    const candidates = [
      createCandidate("emp-overloaded", {
        allocatedBudgetCu: 28,
        activeWorkloadCu: 27, // 27 + 3 = 30 > 28
      }),
    ];

    expect(() =>
      DispatchEngine.evaluate({
        organizationId: orgId,
        requiredCapabilityCode: "CAP_RESUME_ENGINEERING",
        requiredProficiencyLevel: WcosProficiencyLevel.BASIC,
        estimatedCu: 3,
        candidates,
        idempotencyKey: "test-idemp-4",
      })
    ).toThrowError(/No eligible candidates available/);
  });

  it("correctly calculates 100-pt scoring components", () => {
    const candidates = [
      createCandidate("emp-high-scorer", {
        allocatedBudgetCu: 28,
        activeWorkloadCu: 0, // 0 CU workload -> max capacity score
        hasHandledCandidateHistory: true, // Continuity +25
        teamId: "team-alpha", // Team +20
        capabilities: [
          {
            code: "CAP_RESUME_ENGINEERING",
            proficiency: WcosProficiencyLevel.EXPERT, // Expert +15
            isActive: true,
          },
        ],
      }),
    ];

    const result = DispatchEngine.evaluate({
      organizationId: orgId,
      requiredCapabilityCode: "CAP_RESUME_ENGINEERING",
      requiredProficiencyLevel: WcosProficiencyLevel.BASIC,
      estimatedCu: 3,
      assignedTeamId: "team-alpha",
      candidates,
      idempotencyKey: "test-idemp-5",
    });

    expect(result.selectedEmployeeId).toBe("emp-high-scorer");
    expect(result.winningScore.continuityScore).toBe(25.0);
    expect(result.winningScore.teamScore).toBe(20.0);
    expect(result.winningScore.proficiencyScore).toBe(15.0);
    expect(result.winningScore.capacityScore).toBeGreaterThan(30);
    expect(result.winningScore.totalScore).toBeGreaterThan(90);
  });

  it("applies deterministic 3-tier tie-breaking", () => {
    // Both employees have identical score components
    const candidates = [
      createCandidate("emp-b", {
        activeWorkloadCu: 10,
        lastAssignedAt: new Date(100000),
      }),
      createCandidate("emp-a", {
        activeWorkloadCu: 5, // Lower workload wins Tier 1 tie-breaker
        lastAssignedAt: new Date(100000),
      }),
    ];

    const result = DispatchEngine.evaluate({
      organizationId: orgId,
      requiredCapabilityCode: "CAP_RESUME_ENGINEERING",
      requiredProficiencyLevel: WcosProficiencyLevel.BASIC,
      estimatedCu: 3,
      candidates,
      idempotencyKey: "test-idemp-6",
    });

    expect(result.selectedEmployeeId).toBe("emp-a");
  });

  it("honors manager force override with OVERRIDE dispatch mode", () => {
    const candidates = [
      createCandidate("emp-standard", { activeWorkloadCu: 0 }),
      createCandidate("emp-forced", { activeWorkloadCu: 20 }),
    ];

    const result = DispatchEngine.evaluate({
      organizationId: orgId,
      requiredCapabilityCode: "CAP_RESUME_ENGINEERING",
      requiredProficiencyLevel: WcosProficiencyLevel.BASIC,
      estimatedCu: 3,
      candidates,
      forceEmployeeId: "emp-forced",
      dispatchMode: WcosDispatchMode.OVERRIDE,
      idempotencyKey: "test-idemp-7",
    });

    expect(result.selectedEmployeeId).toBe("emp-forced");
    expect(result.dispatchMode).toBe(WcosDispatchMode.OVERRIDE);
    expect(result.tieBreakApplied).toBe("MANAGER_FORCE_OVERRIDE");
  });
});
