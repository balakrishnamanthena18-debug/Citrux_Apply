/**
 * Phase 10H — Workforce & Capacity Operations System (WCOS) Types & Enums
 * Authoritative specifications:
 * - PHASE_10H_A_WCOS_PRODUCT_CONTRACT.md
 * - PHASE_10H_B_WCOS_DECISION_LOCK_IMPLEMENTATION_READINESS.md
 * - PHASE_10H_C_WCOS_DATA_MODEL_PERSISTENCE_SPECIFICATION.md
 */

import {
  WcosWorkDemandType,
  WcosAvailabilityState,
  WcosProficiencyLevel,
  WcosDispatchMode,
  WcosBlockingCategory,
  WcosReservationStatus,
  WcosEscalationLevel,
  TaskStatus,
  TaskPriority,
  TaskCategory,
  TaskType,
  Role,
  AuditAction,
  type WcosQueue,
  type WcosSlaPolicy,
  type WcosCapacityPolicy,
  type WcosCapacityProfile,
  type WcosAvailabilityRecord,
  type WcosCapabilityDefinition,
  type WcosEmployeeCapability,
  type WcosWorkItem,
  type WcosCapacityReservation,
  type WcosAssignmentHistory,
  type WcosDispatchDecision,
  type WcosBlockingRecord,
  type WcosEscalationRecord,
  type Task,
  type User,
  type Prisma,
} from "@/generated/prisma";

export {
  WcosWorkDemandType,
  WcosAvailabilityState,
  WcosProficiencyLevel,
  WcosDispatchMode,
  WcosBlockingCategory,
  WcosReservationStatus,
  WcosEscalationLevel,
  TaskStatus,
  TaskPriority,
  TaskCategory,
  TaskType,
  Role,
  AuditAction,
  type WcosQueue,
  type WcosSlaPolicy,
  type WcosCapacityPolicy,
  type WcosCapacityProfile,
  type WcosAvailabilityRecord,
  type WcosCapabilityDefinition,
  type WcosEmployeeCapability,
  type WcosWorkItem,
  type WcosCapacityReservation,
  type WcosAssignmentHistory,
  type WcosDispatchDecision,
  type WcosBlockingRecord,
  type WcosEscalationRecord,
  type Task,
  type User,
};

// =========================================================================
// 1. CAPABILITY CODES & CONSTANTS
// =========================================================================

export const WCOS_STANDARD_CAPABILITIES = {
  CAP_CANDIDATE_ONBOARDING: "CAP_CANDIDATE_ONBOARDING",
  CAP_RESUME_ENGINEERING: "CAP_RESUME_ENGINEERING",
  CAP_QA_COMPLIANCE: "CAP_QA_COMPLIANCE",
  CAP_INTERVIEW_COACHING: "CAP_INTERVIEW_COACHING",
  CAP_OFFER_NEGOTIATION: "CAP_OFFER_NEGOTIATION",
  CAP_PLACEMENT_OPS: "CAP_PLACEMENT_OPS",
  CAP_BILLING_OPS: "CAP_BILLING_OPS",
  CAP_OPS_MANAGEMENT: "CAP_OPS_MANAGEMENT",
} as const;

export type WcosStandardCapabilityCode = keyof typeof WCOS_STANDARD_CAPABILITIES;

export const WCOS_CAPACITY_CONSTANTS = {
  MINUTES_PER_CU: 15,
  DEFAULT_STANDARD_DAILY_CU: 32,
  DEFAULT_ALLOCATED_BUDGET_CU: 28,
  DEFAULT_RESERVED_OVERHEAD_CU: 4,
  MAX_SLA_PAUSE_DURATION_MS: 14 * 24 * 60 * 60 * 1000, // 14 Days hard ceiling in ms
};

// =========================================================================
// 2. DISPATCH SCORING INTERFACES
// =========================================================================

export interface HardGateResult {
  candidateId: string;
  passed: boolean;
  failedGates: string[];
}

export interface DispatchCandidateScore {
  candidateEmployeeId: string;
  hardGatePassed: boolean;
  failedGates: string[];
  capacityScore: number;       // Max 40
  continuityScore: number;     // Max 25
  teamScore: number;           // Max 20
  proficiencyScore: number;    // Max 15
  totalScore: number;          // Max 100
  activeWorkloadCu: number;
  allocatedBudgetCu: number;
  lastAssignedAt?: Date | null;
  tieBreakRank?: number;
}

export interface DispatchDecisionResult {
  selectedEmployeeId: string;
  candidatePoolCount: number;
  eligiblePoolCount: number;
  hardGateFailures: HardGateResult[];
  scores: DispatchCandidateScore[];
  winningScore: DispatchCandidateScore;
  tieBreakApplied: string | null;
  dispatchMode: WcosDispatchMode;
  algorithmVersion: string;
  idempotencyKey: string;
}

// =========================================================================
// 3. SERVICE INPUT DTOS
// =========================================================================

export interface CreateQueueInput {
  name: string;
  slug: string;
  description?: string;
  targetCapabilityCode?: string;
  assignedTeamId?: string;
  priorityWeight?: number;
  isActive?: boolean;
}

export interface CreateSlaPolicyInput {
  name: string;
  demandType: WcosWorkDemandType;
  priority: TaskPriority;
  targetDurationMinutes: number;
  warningThresholdPercentage?: number;
  maxPauseDurationMinutes?: number;
  isActive?: boolean;
}

export interface SetCapacityPolicyInput {
  name: string;
  standardDailyCu?: number;
  defaultAllocatedBudgetCu?: number;
  defaultReservedOverheadCu?: number;
  overloadThresholdPct?: number;
  isDefault?: boolean;
}

export interface SetCapacityProfileInput {
  employeeId: string;
  effectiveDate: Date | string;
  dailyCapacityCu?: number;
  allocatedBudgetCu?: number;
  reservedOverheadCu?: number;
  isActive?: boolean;
}

export interface SetAvailabilityInput {
  employeeId: string;
  state: WcosAvailabilityState;
  effectiveFrom?: Date | string;
  effectiveTo?: Date | string;
  reason?: string;
}

export interface RegisterCapabilityDefinitionInput {
  code: string;
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface AssignEmployeeCapabilityInput {
  employeeId: string;
  capabilityCode: string;
  proficiency: WcosProficiencyLevel;
  isActive?: boolean;
}

export interface EnrollWorkItemInput {
  taskId: string;
  workType: WcosWorkDemandType;
  requiredCapabilityCode: string;
  requiredProficiencyLevel?: WcosProficiencyLevel;
  capacityUnitsEstimated?: number;
  queueId?: string;
  slaPolicyId?: string;
  continuityCandidateId?: string;
  dispatchMode?: WcosDispatchMode;
  dispatchReason?: string;
  targetDueDate?: Date | string;
}

export interface DispatchTaskInput {
  taskId: string;
  forceEmployeeId?: string;
  dispatchMode?: WcosDispatchMode;
  dispatchReason?: string;
  idempotencyKey?: string;
}

export interface BlockTaskInput {
  taskId: string;
  category: WcosBlockingCategory;
  reason: string;
  unblockExpectedAt: Date | string;
}

export interface UnblockTaskInput {
  taskId: string;
  resumeReason?: string;
}

export interface ReassignTaskInput {
  taskId: string;
  newEmployeeId: string;
  reason: string;
  dispatchMode?: WcosDispatchMode;
  idempotencyKey?: string;
}

export interface EscalateTaskInput {
  taskId: string;
  targetLevel: WcosEscalationLevel;
  reason: string;
  idempotencyKey?: string;
}

// =========================================================================
// 4. PROJECTIONS & DESK STREAM DTOS
// =========================================================================

export interface WcosQueueItemProjection {
  taskId: string;
  taskTitle: string;
  taskStatus: TaskStatus;
  taskPriority: TaskPriority;
  taskDueDate: Date | null;
  assignedEmployeeId: string | null;
  assignedEmployeeName: string | null;
  workType: WcosWorkDemandType;
  requiredCapabilityCode: string;
  requiredProficiencyLevel: WcosProficiencyLevel;
  capacityUnitsEstimated: number;
  capacityUnitsConsumed: number;
  queueId: string | null;
  queueName: string | null;
  slaTargetAt: Date;
  slaWarningAt: Date;
  slaBreachedAt: Date | null;
  slaRemainingMs: number;
  isSlaBreached: boolean;
  isSlaWarning: boolean;
  isSlaPaused: boolean;
  slaPausedDurationMs: number;
  blockingCategory: WcosBlockingCategory | null;
  escalationLevel: number;
  createdAt: Date;
}

export type EmployeePriorityStreamCategory =
  | "OVERDUE"
  | "SLA_AT_RISK"
  | "ACTIVE_IN_PROGRESS"
  | "BLOCKED"
  | "WAITING"
  | "NEWLY_ASSIGNED";

export interface EmployeePriorityStreamItem {
  taskId: string;
  taskTitle: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  streamCategory: EmployeePriorityStreamCategory;
  streamRank: number; // Lowest number = highest urgency
  slaTargetAt: Date;
  slaRemainingMs: number;
  isSlaWarning: boolean;
  isSlaBreached: boolean;
  escalationLevel: number;
  blockingCategory: WcosBlockingCategory | null;
  capacityUnitsEstimated: number;
  workType: WcosWorkDemandType;
}

export interface EmployeeCapacitySummaryDTO {
  employeeId: string;
  employeeName: string;
  effectiveDate: string;
  dailyCapacityCu: number;
  allocatedBudgetCu: number;
  reservedOverheadCu: number;
  activeWorkloadCu: number;
  availableCu: number;
  utilizationPercentage: number;
  availabilityState: WcosAvailabilityState;
  activeTaskCount: number;
  verifiedCapabilities: Array<{
    code: string;
    name: string;
    proficiency: WcosProficiencyLevel;
  }>;
}
