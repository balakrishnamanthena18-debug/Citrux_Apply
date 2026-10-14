/**
 * Phase 10H-D — WCOS Deterministic Dispatch Engine
 * Zero AI/LLM, zero opaque embeddings. Purely deterministic scoring and tie-breaking.
 */

import {
  WcosAvailabilityState,
  WcosProficiencyLevel,
  WcosDispatchMode,
  type HardGateResult,
  type DispatchCandidateScore,
  type DispatchDecisionResult,
} from "./types";

export interface CandidateEmployeeProfile {
  id: string;
  organizationId: string;
  userStatus: string;
  membershipStatus: string;
  teamId?: string | null;
  teamName?: string | null;
  availabilityState: WcosAvailabilityState;
  dailyCapacityCu: number;
  allocatedBudgetCu: number;
  activeWorkloadCu: number;
  lastAssignedAt?: Date | null;
  capabilities: Array<{
    code: string;
    proficiency: WcosProficiencyLevel;
    isActive: boolean;
  }>;
  hasHandledCandidateHistory: boolean;
}

export interface DispatchEvaluationInput {
  organizationId: string;
  requiredCapabilityCode: string;
  requiredProficiencyLevel: WcosProficiencyLevel;
  estimatedCu: number;
  assignedTeamId?: string | null;
  continuityCandidateId?: string | null;
  candidates: CandidateEmployeeProfile[];
  forceEmployeeId?: string;
  dispatchMode?: WcosDispatchMode;
  idempotencyKey: string;
}

const PROFICIENCY_RANK: Record<WcosProficiencyLevel, number> = {
  BASIC: 1,
  INTERMEDIATE: 2,
  ADVANCED: 3,
  EXPERT: 4,
};

const PROFICIENCY_SCORE_WEIGHTS: Record<WcosProficiencyLevel, number> = {
  EXPERT: 15.0,
  ADVANCED: 11.25,
  INTERMEDIATE: 7.5,
  BASIC: 3.75,
};

export class DispatchEngine {
  /**
   * Evaluates all candidates through hard eligibility gates, computes 100-pt deterministic scores,
   * applies 3-tier tie-breaking, and returns a fully reconstructable dispatch decision.
   */
  static evaluate(input: DispatchEvaluationInput): DispatchDecisionResult {
    const {
      organizationId,
      requiredCapabilityCode,
      requiredProficiencyLevel,
      estimatedCu,
      assignedTeamId,
      candidates,
      forceEmployeeId,
      dispatchMode = WcosDispatchMode.AUTO,
      idempotencyKey,
    } = input;

    const hardGateFailures: HardGateResult[] = [];
    const scoredCandidates: DispatchCandidateScore[] = [];

    const reqProfRank = PROFICIENCY_RANK[requiredProficiencyLevel] ?? 1;

    for (const cand of candidates) {
      const failedGates: string[] = [];

      // 1. Same Organization Gate
      if (cand.organizationId !== organizationId) {
        failedGates.push("GATE_ORGANIZATION_MISMATCH");
      }

      // 2. Active User / Membership Status Gate
      if (cand.userStatus !== "ACTIVE" || cand.membershipStatus !== "ACTIVE") {
        failedGates.push("GATE_INACTIVE_STAFF_STATUS");
      }

      // 3. Availability State Gate (UNAVAILABLE, LEAVE, INACTIVE cannot take work)
      if (
        cand.availabilityState === WcosAvailabilityState.UNAVAILABLE ||
        cand.availabilityState === WcosAvailabilityState.LEAVE ||
        cand.availabilityState === WcosAvailabilityState.INACTIVE
      ) {
        failedGates.push(`GATE_UNAVAILABLE_STATE_${cand.availabilityState}`);
      }

      // 4. Verified Capability & Proficiency Gate
      const matchedCap = cand.capabilities.find(
        (c) => c.code === requiredCapabilityCode && c.isActive
      );
      if (!matchedCap) {
        failedGates.push(`GATE_MISSING_CAPABILITY_${requiredCapabilityCode}`);
      } else {
        const candProfRank = PROFICIENCY_RANK[matchedCap.proficiency] ?? 1;
        if (candProfRank < reqProfRank) {
          failedGates.push(`GATE_INSUFFICIENT_PROFICIENCY_${matchedCap.proficiency}_VS_${requiredProficiencyLevel}`);
        }
      }

      // 5. Capacity Budget / Utilization Gate (unless force override)
      const isForced = forceEmployeeId && forceEmployeeId === cand.id;
      if (!isForced) {
        const projectedWorkload = cand.activeWorkloadCu + estimatedCu;
        if (cand.allocatedBudgetCu <= 0 || projectedWorkload > cand.allocatedBudgetCu) {
          failedGates.push(`GATE_CAPACITY_OVERLOAD_${projectedWorkload}_EXCEEDS_${cand.allocatedBudgetCu}CU`);
        }
      }

      const passed = failedGates.length === 0 || !!isForced;

      if (!passed) {
        hardGateFailures.push({
          candidateId: cand.id,
          passed: false,
          failedGates,
        });
        continue;
      }

      // If hard gates passed (or forced override), calculate 100-point deterministic score
      // A. Capacity Score (Max 40)
      let capacityScore = 0;
      if (cand.allocatedBudgetCu > 0) {
        const utilizationFraction = (cand.activeWorkloadCu + estimatedCu) / cand.allocatedBudgetCu;
        capacityScore = Math.max(0, Math.min(40, Number((40 * (1 - utilizationFraction)).toFixed(2))));
      }

      // B. Continuity Score (Max 25)
      const continuityScore = cand.hasHandledCandidateHistory ? 25.0 : 0.0;

      // C. Team Scope Score (Max 20)
      let teamScore = 0.0;
      if (assignedTeamId && cand.teamId === assignedTeamId) {
        teamScore = 20.0;
      }

      // D. Proficiency Score (Max 15)
      const matchedProf = matchedCap ? matchedCap.proficiency : requiredProficiencyLevel;
      const proficiencyScore = PROFICIENCY_SCORE_WEIGHTS[matchedProf] ?? 7.5;

      const totalScore = Number(
        (capacityScore + continuityScore + teamScore + proficiencyScore).toFixed(2)
      );

      scoredCandidates.push({
        candidateEmployeeId: cand.id,
        hardGatePassed: true,
        failedGates: [],
        capacityScore,
        continuityScore,
        teamScore,
        proficiencyScore,
        totalScore,
        activeWorkloadCu: cand.activeWorkloadCu,
        allocatedBudgetCu: cand.allocatedBudgetCu,
        lastAssignedAt: cand.lastAssignedAt,
      });
    }

    if (scoredCandidates.length === 0) {
      throw new Error(
        `WCOS Dispatch Failed: No eligible candidates available for capability '${requiredCapabilityCode}'. Hard gate rejections: ${JSON.stringify(hardGateFailures)}`
      );
    }

    // If forced override specified and candidate is in scored list, choose immediately
    if (forceEmployeeId) {
      const forced = scoredCandidates.find((c) => c.candidateEmployeeId === forceEmployeeId);
      if (forced) {
        return {
          selectedEmployeeId: forced.candidateEmployeeId,
          candidatePoolCount: candidates.length,
          eligiblePoolCount: scoredCandidates.length,
          hardGateFailures,
          scores: scoredCandidates,
          winningScore: forced,
          tieBreakApplied: "MANAGER_FORCE_OVERRIDE",
          dispatchMode: WcosDispatchMode.OVERRIDE,
          algorithmVersion: "v1.0",
          idempotencyKey,
        };
      }
    }

    // Sort by Total Score (Descending), then apply 3-tier deterministic tie-breaker
    let tieBreakReason: string | null = null;

    scoredCandidates.sort((a, b) => {
      if (Math.abs(b.totalScore - a.totalScore) > 0.001) {
        return b.totalScore - a.totalScore;
      }

      // Tier 1: Lowest active CU
      if (a.activeWorkloadCu !== b.activeWorkloadCu) {
        tieBreakReason = "TIER_1_LOWEST_ACTIVE_CU";
        return a.activeWorkloadCu - b.activeWorkloadCu;
      }

      // Tier 2: Longest idle (earliest lastAssignedAt)
      const timeA = a.lastAssignedAt ? a.lastAssignedAt.getTime() : 0;
      const timeB = b.lastAssignedAt ? b.lastAssignedAt.getTime() : 0;
      if (timeA !== timeB) {
        tieBreakReason = "TIER_2_LONGEST_IDLE";
        return timeA - timeB;
      }

      // Tier 3: Lexicographical User UUID
      tieBreakReason = "TIER_3_LEXICOGRAPHICAL_UUID";
      return a.candidateEmployeeId.localeCompare(b.candidateEmployeeId);
    });

    const winner = scoredCandidates[0];
    if (!winner) {
      throw new Error("WCOS Dispatch Failed: Unable to select winning candidate.");
    }

    return {
      selectedEmployeeId: winner.candidateEmployeeId,
      candidatePoolCount: candidates.length,
      eligiblePoolCount: scoredCandidates.length,
      hardGateFailures,
      scores: scoredCandidates,
      winningScore: winner,
      tieBreakApplied: scoredCandidates.length > 1 ? tieBreakReason : null,
      dispatchMode,
      algorithmVersion: "v1.0",
      idempotencyKey,
    };
  }
}
