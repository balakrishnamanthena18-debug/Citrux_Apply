/**
 * Phase 10H-D — Workforce & Capacity Operations System (WCOS) Authoritative Service
 * Central service layer governing workforce dispatch, capacity management, SLA telemetry,
 * structured blocking, multi-tier escalation, and live operational projections.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/prisma";
import {
  AuditAction,
  TaskStatus,
  TaskPriority,
  WcosReservationStatus,
  WcosAvailabilityState,
  WcosProficiencyLevel,
  WcosDispatchMode,
  WcosEscalationLevel,
  type WcosWorkItem,
  type WcosCapacityReservation,
  type WcosAssignmentHistory,
  type WcosDispatchDecision,
  type WcosBlockingRecord,
  type WcosEscalationRecord,
  type WcosQueue,
  type WcosSlaPolicy,
  type Prisma,
} from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { logUserAuditEvent } from "@/lib/audit";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ConflictError,
  InvalidStateTransitionError,
} from "@/lib/errors";
import { WcosAuthorization } from "./authorization";
import { WcosLifecycle } from "./lifecycle";
import { WcosRepository } from "./wcos-repository";
import { DispatchEngine, type CandidateEmployeeProfile } from "./dispatch-engine";
import type {
  CreateQueueInput,
  CreateSlaPolicyInput,
  SetCapacityPolicyInput,
  SetCapacityProfileInput,
  SetAvailabilityInput,
  RegisterCapabilityDefinitionInput,
  AssignEmployeeCapabilityInput,
  EnrollWorkItemInput,
  DispatchTaskInput,
  BlockTaskInput,
  UnblockTaskInput,
  ReassignTaskInput,
  EscalateTaskInput,
  WcosQueueItemProjection,
  EmployeePriorityStreamItem,
  EmployeeCapacitySummaryDTO,
} from "./types";

export class WcosService {
  // =========================================================================
  // 1. QUEUES & POLICIES
  // =========================================================================

  static async createQueue(
    context: AuthenticatedContext,
    input: CreateQueueInput
  ): Promise<WcosQueue> {
    WcosAuthorization.assertAdminOnlyAuthority(context, context.organizationId);

    return WcosRepository.createQueue({
      organizationId: context.organizationId,
      name: input.name,
      slug: input.slug.toLowerCase().trim(),
      description: input.description ?? null,
      targetCapabilityCode: input.targetCapabilityCode ?? null,
      assignedTeamId: input.assignedTeamId ?? null,
      priorityWeight: input.priorityWeight ?? 0,
      isActive: input.isActive ?? true,
    });
  }

  static async createSlaPolicy(
    context: AuthenticatedContext,
    input: CreateSlaPolicyInput
  ): Promise<WcosSlaPolicy> {
    WcosAuthorization.assertAdminOnlyAuthority(context, context.organizationId);

    return WcosRepository.createSlaPolicy({
      organizationId: context.organizationId,
      name: input.name,
      demandType: input.demandType,
      priority: input.priority,
      targetDurationMinutes: input.targetDurationMinutes,
      warningThresholdPercentage: input.warningThresholdPercentage ?? 80,
      maxPauseDurationMinutes: input.maxPauseDurationMinutes ?? 20160,
      isActive: input.isActive ?? true,
    });
  }

  static async setCapacityPolicy(
    context: AuthenticatedContext,
    input: SetCapacityPolicyInput
  ) {
    WcosAuthorization.assertAdminOnlyAuthority(context, context.organizationId);

    return WcosRepository.upsertCapacityPolicy({
      organizationId: context.organizationId,
      name: input.name,
      standardDailyCu: input.standardDailyCu ?? 32,
      defaultAllocatedBudgetCu: input.defaultAllocatedBudgetCu ?? 28,
      defaultReservedOverheadCu: input.defaultReservedOverheadCu ?? 4,
      overloadThresholdPct: input.overloadThresholdPct ?? 100,
      isDefault: input.isDefault ?? false,
    });
  }

  // =========================================================================
  // 2. CAPABILITY REGISTRY
  // =========================================================================

  static async registerCapabilityDefinition(
    context: AuthenticatedContext,
    input: RegisterCapabilityDefinitionInput
  ) {
    WcosAuthorization.assertAdminOnlyAuthority(context, context.organizationId);

    return WcosRepository.createCapabilityDefinition({
      organizationId: context.organizationId,
      code: input.code.toUpperCase().trim(),
      name: input.name,
      description: input.description ?? null,
      isActive: input.isActive ?? true,
    });
  }

  static async assignEmployeeCapability(
    context: AuthenticatedContext,
    input: AssignEmployeeCapabilityInput
  ) {
    WcosAuthorization.assertAdminOnlyAuthority(context, context.organizationId);

    const capabilityDef = await WcosRepository.findCapabilityDefinition(
      input.capabilityCode,
      context.organizationId
    );
    if (!capabilityDef) {
      throw new NotFoundError(`Capability definition '${input.capabilityCode}' not found.`);
    }

    return WcosRepository.assignEmployeeCapability({
      organizationId: context.organizationId,
      employeeId: input.employeeId,
      capabilityId: capabilityDef.id,
      proficiency: input.proficiency,
      verifiedById: context.userId,
      isActive: input.isActive ?? true,
    });
  }

  // =========================================================================
  // 3. WORK ITEM ENROLLMENT (1:1 TASK PROJECTION)
  // =========================================================================

  static async enrollTask(
    context: AuthenticatedContext,
    input: EnrollWorkItemInput
  ): Promise<WcosWorkItem> {
    WcosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    return prisma.$transaction(async (tx) => {
      // 1. Verify Task exists in tenant
      const task = await tx.task.findFirst({
        where: { id: input.taskId, organizationId: context.organizationId },
      });
      if (!task) {
        throw new NotFoundError(`Task ${input.taskId} not found in organization.`);
      }

      // 2. Verify 1:1 constraint (no duplicate work item)
      const existingWorkItem = await tx.wcosWorkItem.findFirst({
        where: { taskId: input.taskId },
      });
      if (existingWorkItem) {
        throw new ConflictError(`Task ${input.taskId} is already enrolled in WCOS.`);
      }

      // 3. Resolve SLA Policy and target dates
      let slaPolicyId: string | null = input.slaPolicyId ?? null;
      let targetDurationMinutes = 120; // 2 hours default
      let warningPct = 80;

      if (!slaPolicyId) {
        const matchingPolicy = await tx.wcosSlaPolicy.findFirst({
          where: {
            organizationId: context.organizationId,
            demandType: input.workType,
            priority: task.priority,
            isActive: true,
          },
        });
        if (matchingPolicy) {
          slaPolicyId = matchingPolicy.id;
          targetDurationMinutes = matchingPolicy.targetDurationMinutes;
          warningPct = matchingPolicy.warningThresholdPercentage;
        }
      }

      const now = new Date();
      const targetDurationMs = targetDurationMinutes * 60 * 1000;
      const slaTargetAt = input.targetDueDate
        ? new Date(input.targetDueDate)
        : task.dueDate
        ? task.dueDate
        : new Date(now.getTime() + targetDurationMs);

      const totalSpanMs = slaTargetAt.getTime() - now.getTime();
      const slaWarningAt = new Date(now.getTime() + Math.floor(totalSpanMs * (warningPct / 100)));

      // 4. Create WcosWorkItem
      const workItem = await WcosRepository.createWorkItem(
        {
          taskId: input.taskId,
          organizationId: context.organizationId,
          queueId: input.queueId ?? null,
          workType: input.workType,
          capacityUnitsEstimated: input.capacityUnitsEstimated ?? 3,
          capacityUnitsConsumed: 0,
          requiredCapabilityCode: input.requiredCapabilityCode,
          requiredProficiencyLevel: input.requiredProficiencyLevel ?? WcosProficiencyLevel.BASIC,
          slaPolicyId,
          slaTargetAt,
          slaWarningAt,
          slaPausedDurationMs: BigInt(0),
          dispatchMode: input.dispatchMode ?? WcosDispatchMode.AUTO,
          dispatchReason: input.dispatchReason ?? "Task enrolled into WCOS demand stream",
          continuityCandidateId: input.continuityCandidateId ?? task.candidateId ?? null,
        },
        tx
      );

      // 5. User Audit Log
      await logUserAuditEvent({
        userId: context.userId,
        organizationId: context.organizationId,
        action: AuditAction.WCOS_WORK_DEMAND_ENQUEUED,
        entityType: "WcosWorkItem",
        entityId: input.taskId,
        details: {
          taskId: input.taskId,
          workType: input.workType,
          requiredCapability: input.requiredCapabilityCode,
          slaTargetAt,
          estimatedCu: input.capacityUnitsEstimated ?? 3,
        },
        tx,
      });

      return workItem;
    });
  }

  // =========================================================================
  // 4. DETERMINISTIC DISPATCH ENGINE EXECUTION
  // =========================================================================

  static async dispatchTask(
    context: AuthenticatedContext,
    input: DispatchTaskInput
  ): Promise<{ task: any; workItem: WcosWorkItem; decision: WcosDispatchDecision }> {
    WcosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);
    if (input.dispatchMode === WcosDispatchMode.OVERRIDE || input.dispatchMode === WcosDispatchMode.MANUAL) {
      WcosAuthorization.assertAdminOnlyAuthority(context, context.organizationId);
    }

    return prisma.$transaction(async (tx) => {
      // 1. Lock Task and Work Item
      await WcosRepository.lockTaskAndWorkItem(input.taskId, context.organizationId, tx);

      const task = await tx.task.findFirst({
        where: { id: input.taskId, organizationId: context.organizationId },
      });
      if (!task) {
        throw new NotFoundError(`Task ${input.taskId} not found.`);
      }
      if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.CANCELED) {
        throw new InvalidStateTransitionError(`Cannot dispatch a ${task.status} task.`);
      }

      const workItem = await tx.wcosWorkItem.findFirst({
        where: { taskId: input.taskId, organizationId: context.organizationId },
      });
      if (!workItem) {
        throw new NotFoundError(`WCOS Work item for task ${input.taskId} not found.`);
      }

      // Check for existing active reservation (prevents double active reservations)
      const existingRes = await WcosRepository.findActiveReservation(input.taskId, tx);
      if (existingRes) {
        throw new ConflictError(
          `Task ${input.taskId} already has an active capacity reservation (${existingRes.status}). Reassignment must be used instead.`
        );
      }

      // 2. Fetch candidate staff profiles in tenant
      const employees = await tx.user.findMany({
        where: {
          status: "ACTIVE",
          memberships: {
            some: {
              organizationId: context.organizationId,
              status: "ACTIVE",
              role: { in: ["EMPLOYEE", "ADMIN"] },
            },
          },
        },
        include: {
          memberships: {
            where: { organizationId: context.organizationId, status: "ACTIVE" },
          },
          wcosAvailabilityRecords: {
            where: { organizationId: context.organizationId },
            orderBy: { effectiveFrom: "desc" },
            take: 1,
          },
          wcosCapacityProfiles: {
            where: {
              organizationId: context.organizationId,
              effectiveDate: new Date(new Date().toISOString().split("T")[0] || "1970-01-01"),
            },
            take: 1,
          },
          wcosEmployeeCapabilities: {
            where: { organizationId: context.organizationId, isActive: true },
            include: { capability: true },
          },
          assignedTasks: {
            where: { organizationId: context.organizationId },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      // Fetch candidate continuity history
      let continuityCandidateId = workItem.continuityCandidateId ?? task.candidateId;
      let employeesWithCandidateHistory: Set<string> = new Set();

      if (continuityCandidateId) {
        const previousTasks = await tx.task.findMany({
          where: {
            organizationId: context.organizationId,
            candidateId: continuityCandidateId,
            assignedEmployeeId: { not: null },
          },
          select: { assignedEmployeeId: true },
        });
        previousTasks.forEach((pt) => {
          if (pt.assignedEmployeeId) employeesWithCandidateHistory.add(pt.assignedEmployeeId);
        });
      }

      const candidateProfiles: CandidateEmployeeProfile[] = employees.map((emp) => {
        const mem = emp.memberships[0];
        const avail = emp.wcosAvailabilityRecords[0]?.state ?? WcosAvailabilityState.AVAILABLE;
        const capProfile = emp.wcosCapacityProfiles[0];

        return {
          id: emp.id,
          organizationId: context.organizationId,
          userStatus: emp.status,
          membershipStatus: mem?.status ?? "ACTIVE",
          teamId: mem?.team ?? null,
          teamName: mem?.team ?? null,
          availabilityState: avail,
          dailyCapacityCu: capProfile?.dailyCapacityCu ?? 32,
          allocatedBudgetCu: capProfile?.allocatedBudgetCu ?? 28,
          activeWorkloadCu: capProfile?.activeWorkloadCu ?? 0,
          lastAssignedAt: emp.assignedTasks[0]?.createdAt ?? null,
          capabilities: emp.wcosEmployeeCapabilities.map((ec) => ({
            code: ec.capability.code,
            proficiency: ec.proficiency,
            isActive: ec.isActive,
          })),
          hasHandledCandidateHistory: employeesWithCandidateHistory.has(emp.id),
        };
      });

      // 3. Run Deterministic Dispatch Engine
      const decisionResult = DispatchEngine.evaluate({
        organizationId: context.organizationId,
        requiredCapabilityCode: workItem.requiredCapabilityCode,
        requiredProficiencyLevel: workItem.requiredProficiencyLevel,
        estimatedCu: workItem.capacityUnitsEstimated,
        assignedTeamId: null,
        continuityCandidateId,
        candidates: candidateProfiles,
        forceEmployeeId: input.forceEmployeeId,
        dispatchMode: input.dispatchMode,
        idempotencyKey: input.idempotencyKey || randomUUID(),
      });

      const selectedEmployeeId = decisionResult.selectedEmployeeId;
      const estimatedCu = workItem.capacityUnitsEstimated;

      // 4. Atomically Apply Dispatch Mutations
      // A. Update Task Assigned Employee
      const updatedTask = await tx.task.update({
        where: { id: input.taskId },
        data: {
          assignedEmployeeId: selectedEmployeeId,
          status: task.status === TaskStatus.BACKLOG ? TaskStatus.ASSIGNED : task.status,
        },
      });

      // B. Create Capacity Reservation
      const reservation = await WcosRepository.createCapacityReservation(
        {
          organizationId: context.organizationId,
          employeeId: selectedEmployeeId,
          taskId: input.taskId,
          estimatedCu,
          reservedCu: estimatedCu,
          status: WcosReservationStatus.RESERVED,
          idempotencyKey: input.idempotencyKey ?? randomUUID(),
        },
        tx
      );

      // C. Increment Staff Active Workload CU in Daily Profile
      await WcosRepository.updateCapacityProfileWorkload(
        selectedEmployeeId,
        context.organizationId,
        new Date(),
        estimatedCu,
        tx
      );

      // D. Append Assignment History
      await WcosRepository.createAssignmentHistory(
        {
          organizationId: context.organizationId,
          taskId: input.taskId,
          previousEmployeeId: task.assignedEmployeeId ?? null,
          newEmployeeId: selectedEmployeeId,
          actorId: context.userId,
          reassignmentReason: input.dispatchReason ?? "WCOS Dispatch Engine Assignment",
          dispatchMode: decisionResult.dispatchMode,
          capacityTransferredCu: estimatedCu,
          idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}-assign` : randomUUID(),
        },
        tx
      );

      // E. Persist Dispatch Decision
      const savedDecision = await WcosRepository.createDispatchDecision(
        {
          organizationId: context.organizationId,
          taskId: input.taskId,
          selectedEmployeeId,
          candidatePoolCount: decisionResult.candidatePoolCount,
          eligiblePoolCount: decisionResult.eligiblePoolCount,
          hardGateFailures: decisionResult.hardGateFailures as unknown as Prisma.InputJsonValue,
          capacityScore: decisionResult.winningScore.capacityScore,
          continuityScore: decisionResult.winningScore.continuityScore,
          teamScore: decisionResult.winningScore.teamScore,
          proficiencyScore: decisionResult.winningScore.proficiencyScore,
          totalScore: decisionResult.winningScore.totalScore,
          tieBreakApplied: decisionResult.tieBreakApplied,
          dispatchMode: decisionResult.dispatchMode,
          algorithmVersion: decisionResult.algorithmVersion,
          actorId: context.userId,
          idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}-dec` : randomUUID(),
        },
        tx
      );

      // F. Update Work Item Telemetry
      const updatedWorkItem = await WcosRepository.updateWorkItem(
        input.taskId,
        context.organizationId,
        {
          dispatchMode: decisionResult.dispatchMode,
          dispatchReason: input.dispatchReason ?? "Dispatched by WCOS deterministic engine",
          dispatchScore: decisionResult.winningScore.totalScore,
        },
        tx
      );

      // G. User Audit Log
      await logUserAuditEvent({
        userId: context.userId,
        organizationId: context.organizationId,
        action: AuditAction.WCOS_WORK_ITEM_DISPATCHED,
        entityType: "WcosWorkItem",
        entityId: input.taskId,
        details: {
          taskId: input.taskId,
          assignedEmployeeId: selectedEmployeeId,
          dispatchMode: decisionResult.dispatchMode,
          totalScore: decisionResult.winningScore.totalScore,
          estimatedCu,
        },
        tx,
      });

      return {
        task: updatedTask,
        workItem: updatedWorkItem,
        decision: savedDecision,
      };
    });
  }

  // =========================================================================
  // 5. TASK ACCEPTANCE & PROGRESSION
  // =========================================================================

  static async acceptTask(
    context: AuthenticatedContext,
    taskId: string
  ): Promise<{ task: any; reservation: WcosCapacityReservation }> {
    return prisma.$transaction(async (tx) => {
      await WcosRepository.lockTaskAndWorkItem(taskId, context.organizationId, tx);

      const task = await tx.task.findFirst({
        where: { id: taskId, organizationId: context.organizationId },
      });
      if (!task) {
        throw new NotFoundError(`Task ${taskId} not found.`);
      }

      WcosAuthorization.assertEmployeeSelfOrManagerAccess(
        context,
        task.assignedEmployeeId ?? "",
        context.organizationId
      );

      // Transition Task to IN_PROGRESS
      const updatedTask = await tx.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.IN_PROGRESS },
      });

      // Transition Active Reservation from RESERVED to CONSUMED
      const reservation = await WcosRepository.findActiveReservation(taskId, tx);
      if (!reservation) {
        throw new NotFoundError(`No active reservation found for task ${taskId}.`);
      }

      WcosLifecycle.validateReservationTransition(
        reservation.status,
        WcosReservationStatus.CONSUMED
      );

      const updatedRes = await WcosRepository.updateReservationStatus(
        reservation.id,
        WcosReservationStatus.CONSUMED,
        0,
        tx
      );

      // Audit Log
      await logUserAuditEvent({
        userId: context.userId,
        organizationId: context.organizationId,
        action: AuditAction.WCOS_WORK_ITEM_ACCEPTED,
        entityType: "WcosWorkItem",
        entityId: taskId,
        details: { taskId, acceptedBy: context.userId },
        tx,
      });

      return { task: updatedTask, reservation: updatedRes };
    });
  }

  // =========================================================================
  // 6. STRUCTURED BLOCKING & SLA PAUSE
  // =========================================================================

  static async blockTask(
    context: AuthenticatedContext,
    input: BlockTaskInput
  ): Promise<{ task: any; blockingRecord: WcosBlockingRecord }> {
    return prisma.$transaction(async (tx) => {
      await WcosRepository.lockTaskAndWorkItem(input.taskId, context.organizationId, tx);

      const task = await tx.task.findFirst({
        where: { id: input.taskId, organizationId: context.organizationId },
      });
      if (!task) {
        throw new NotFoundError(`Task ${input.taskId} not found.`);
      }

      WcosAuthorization.assertEmployeeSelfOrManagerAccess(
        context,
        task.assignedEmployeeId ?? "",
        context.organizationId
      );

      const category = WcosLifecycle.validateBlockingCategory(input.category);
      const now = new Date();
      const unblockExpectedAt = new Date(input.unblockExpectedAt);
      const pauseDurationMs = unblockExpectedAt.getTime() - now.getTime();
      const maxPauseMs = 14 * 24 * 60 * 60 * 1000; // 14 days (336 hours)
      if (pauseDurationMs > maxPauseMs) {
        throw new ValidationError("SLA pause duration exceeds maximum allowed pause ceiling of 14 days (336 hours).");
      }

      // Update Task status
      const updatedTask = await tx.task.update({
        where: { id: input.taskId },
        data: {
          status: TaskStatus.BLOCKED,
          blockedReason: input.reason,
        },
      });

      // Update WcosWorkItem blocking telemetry
      await WcosRepository.updateWorkItem(
        input.taskId,
        context.organizationId,
        {
          blockingCategory: category,
          blockedAt: now,
          unblockExpectedAt,
        },
        tx
      );

      // Create Blocking Record
      const blockingRecord = await WcosRepository.createBlockingRecord(
        {
          organizationId: context.organizationId,
          taskId: input.taskId,
          category,
          reason: input.reason,
          actorId: context.userId,
          blockedAt: now,
          unblockExpectedAt,
        },
        tx
      );

      // Audit Log
      await logUserAuditEvent({
        userId: context.userId,
        organizationId: context.organizationId,
        action: AuditAction.WCOS_WORK_ITEM_BLOCKED,
        entityType: "WcosWorkItem",
        entityId: input.taskId,
        details: {
          taskId: input.taskId,
          category,
          reason: input.reason,
          unblockExpectedAt,
        },
        tx,
      });

      return { task: updatedTask, blockingRecord };
    });
  }

  static async unblockTask(
    context: AuthenticatedContext,
    input: UnblockTaskInput
  ): Promise<{ task: any; workItem: WcosWorkItem }> {
    return prisma.$transaction(async (tx) => {
      await WcosRepository.lockTaskAndWorkItem(input.taskId, context.organizationId, tx);

      const task = await tx.task.findFirst({
        where: { id: input.taskId, organizationId: context.organizationId },
      });
      if (!task) {
        throw new NotFoundError(`Task ${input.taskId} not found.`);
      }

      const workItem = await WcosRepository.findWorkItemByTaskId(
        input.taskId,
        context.organizationId,
        tx
      );
      if (!workItem) {
        throw new NotFoundError(`Work item for task ${input.taskId} not found.`);
      }

      if (!workItem.blockedAt) {
        throw new ValidationError(`Task ${input.taskId} is not in a blocked state.`);
      }

      const now = new Date();
      const { elapsedMs, totalPausedDurationMs } = WcosLifecycle.calculateSlaPause(
        workItem.blockedAt,
        now,
        workItem.slaPausedDurationMs
      );

      // Find active blocking record and close it
      const activeBlockRecord = await WcosRepository.findActiveBlockingRecord(input.taskId, tx);
      if (activeBlockRecord) {
        await WcosRepository.unblockRecord(
          activeBlockRecord.id,
          context.userId,
          BigInt(elapsedMs),
          tx
        );
      }

      // Update Task status back to IN_PROGRESS
      const updatedTask = await tx.task.update({
        where: { id: input.taskId },
        data: {
          status: TaskStatus.IN_PROGRESS,
          blockedReason: null,
        },
      });

      // Update Work Item SLA telemetry
      const updatedWorkItem = await WcosRepository.updateWorkItem(
        input.taskId,
        context.organizationId,
        {
          blockingCategory: null,
          blockedAt: null,
          unblockExpectedAt: null,
          slaPausedDurationMs: totalPausedDurationMs,
        },
        tx
      );

      // Audit Log
      await logUserAuditEvent({
        userId: context.userId,
        organizationId: context.organizationId,
        action: AuditAction.WCOS_WORK_ITEM_UNBLOCKED,
        entityType: "WcosWorkItem",
        entityId: input.taskId,
        details: {
          taskId: input.taskId,
          pausedElapsedMs: elapsedMs,
          totalPausedDurationMs: totalPausedDurationMs.toString(),
        },
        tx,
      });

      return { task: updatedTask, workItem: updatedWorkItem };
    });
  }

  // =========================================================================
  // 7. ATOMIC REASSIGNMENT & CAPACITY CONSERVATION
  // =========================================================================

  static async reassignTask(
    context: AuthenticatedContext,
    input: ReassignTaskInput
  ): Promise<{ task: any; newReservation: WcosCapacityReservation }> {
    WcosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    return prisma.$transaction(async (tx) => {
      await WcosRepository.lockTaskAndWorkItem(input.taskId, context.organizationId, tx);

      const task = await tx.task.findFirst({
        where: { id: input.taskId, organizationId: context.organizationId },
      });
      if (!task) {
        throw new NotFoundError(`Task ${input.taskId} not found.`);
      }

      const workItem = await WcosRepository.findWorkItemByTaskId(
        input.taskId,
        context.organizationId,
        tx
      );
      if (!workItem) {
        throw new NotFoundError(`Work item for task ${input.taskId} not found.`);
      }

      const previousEmployeeId = task.assignedEmployeeId;
      const estimatedCu = workItem.capacityUnitsEstimated;

      // 1. Release previous employee's capacity reservation
      const activeRes = await WcosRepository.findActiveReservation(input.taskId, tx);
      if (activeRes) {
        await WcosRepository.updateReservationStatus(
          activeRes.id,
          WcosReservationStatus.RELEASED,
          activeRes.reservedCu,
          tx
        );

        if (previousEmployeeId) {
          await WcosRepository.updateCapacityProfileWorkload(
            previousEmployeeId,
            context.organizationId,
            new Date(),
            -activeRes.reservedCu,
            tx
          );
        }
      }

      // 2. Create new employee's capacity reservation
      const newReservation = await WcosRepository.createCapacityReservation(
        {
          organizationId: context.organizationId,
          employeeId: input.newEmployeeId,
          taskId: input.taskId,
          estimatedCu,
          reservedCu: estimatedCu,
          status: WcosReservationStatus.RESERVED,
          idempotencyKey: input.idempotencyKey ?? randomUUID(),
        },
        tx
      );

      // 3. Increment new employee's active workload CU
      await WcosRepository.updateCapacityProfileWorkload(
        input.newEmployeeId,
        context.organizationId,
        new Date(),
        estimatedCu,
        tx
      );

      // 4. Update canonical Task assignee
      const updatedTask = await tx.task.update({
        where: { id: input.taskId },
        data: {
          assignedEmployeeId: input.newEmployeeId,
        },
      });

      // 5. Append Assignment History
      await WcosRepository.createAssignmentHistory(
        {
          organizationId: context.organizationId,
          taskId: input.taskId,
          previousEmployeeId: previousEmployeeId ?? null,
          newEmployeeId: input.newEmployeeId,
          actorId: context.userId,
          reassignmentReason: input.reason,
          dispatchMode: input.dispatchMode ?? WcosDispatchMode.MANUAL,
          capacityTransferredCu: estimatedCu,
          idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}-hist` : randomUUID(),
        },
        tx
      );

      // 6. Audit Log
      await logUserAuditEvent({
        userId: context.userId,
        organizationId: context.organizationId,
        action: AuditAction.WCOS_WORK_ITEM_REASSIGNED,
        entityType: "WcosWorkItem",
        entityId: input.taskId,
        details: {
          taskId: input.taskId,
          previousEmployeeId,
          newEmployeeId: input.newEmployeeId,
          reason: input.reason,
          capacityTransferredCu: estimatedCu,
        },
        tx,
      });

      return { task: updatedTask, newReservation };
    });
  }

  // =========================================================================
  // 8. TASK COMPLETION & CANCELLATION
  // =========================================================================

  static async completeTask(
    context: AuthenticatedContext,
    taskId: string
  ): Promise<{ task: any; releasedCu: number }> {
    return prisma.$transaction(async (tx) => {
      await WcosRepository.lockTaskAndWorkItem(taskId, context.organizationId, tx);

      const task = await tx.task.findFirst({
        where: { id: taskId, organizationId: context.organizationId },
      });
      if (!task) {
        throw new NotFoundError(`Task ${taskId} not found.`);
      }

      WcosAuthorization.assertEmployeeSelfOrManagerAccess(
        context,
        task.assignedEmployeeId ?? "",
        context.organizationId
      );

      const now = new Date();
      const updatedTask = await tx.task.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.COMPLETED,
          completedAt: now,
          completedById: context.userId,
        },
      });

      let releasedCu = 0;
      const activeRes = await WcosRepository.findActiveReservation(taskId, tx);
      if (activeRes) {
        releasedCu = activeRes.reservedCu;
        await WcosRepository.updateReservationStatus(
          activeRes.id,
          WcosReservationStatus.RELEASED,
          releasedCu,
          tx
        );

        if (task.assignedEmployeeId) {
          await WcosRepository.updateCapacityProfileWorkload(
            task.assignedEmployeeId,
            context.organizationId,
            new Date(),
            -releasedCu,
            tx
          );
        }
      }

      await WcosRepository.updateWorkItem(
        taskId,
        context.organizationId,
        { capacityUnitsConsumed: releasedCu },
        tx
      );

      // Audit Log
      await logUserAuditEvent({
        userId: context.userId,
        organizationId: context.organizationId,
        action: AuditAction.WCOS_WORK_ITEM_COMPLETED,
        entityType: "WcosWorkItem",
        entityId: taskId,
        details: { taskId, completedBy: context.userId, releasedCu },
        tx,
      });

      return { task: updatedTask, releasedCu };
    });
  }

  static async cancelTask(
    context: AuthenticatedContext,
    taskId: string,
    reason: string
  ): Promise<{ task: any }> {
    WcosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    return prisma.$transaction(async (tx) => {
      await WcosRepository.lockTaskAndWorkItem(taskId, context.organizationId, tx);

      const task = await tx.task.findFirst({
        where: { id: taskId, organizationId: context.organizationId },
      });
      if (!task) {
        throw new NotFoundError(`Task ${taskId} not found.`);
      }

      const updatedTask = await tx.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.CANCELED },
      });

      const activeRes = await WcosRepository.findActiveReservation(taskId, tx);
      if (activeRes) {
        await WcosRepository.updateReservationStatus(
          activeRes.id,
          WcosReservationStatus.CANCELLED,
          activeRes.reservedCu,
          tx
        );

        if (task.assignedEmployeeId) {
          await WcosRepository.updateCapacityProfileWorkload(
            task.assignedEmployeeId,
            context.organizationId,
            new Date(),
            -activeRes.reservedCu,
            tx
          );
        }
      }

      // Audit Log
      await logUserAuditEvent({
        userId: context.userId,
        organizationId: context.organizationId,
        action: AuditAction.TASK_CANCELED,
        entityType: "Task",
        entityId: taskId,
        details: { taskId, reason, cancelledBy: context.userId },
        tx,
      });

      return { task: updatedTask };
    });
  }

  // =========================================================================
  // 9. MULTI-TIER ESCALATION
  // =========================================================================

  static async escalateTask(
    context: AuthenticatedContext,
    input: EscalateTaskInput
  ): Promise<WcosEscalationRecord> {
    WcosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    return prisma.$transaction(async (tx) => {
      await WcosRepository.lockTaskAndWorkItem(input.taskId, context.organizationId, tx);

      const workItem = await WcosRepository.findWorkItemByTaskId(
        input.taskId,
        context.organizationId,
        tx
      );
      if (!workItem) {
        throw new NotFoundError(`Work item for task ${input.taskId} not found.`);
      }

      const numericLevel =
        input.targetLevel === WcosEscalationLevel.LEVEL_1_WARNING
          ? 1
          : input.targetLevel === WcosEscalationLevel.LEVEL_2_AT_RISK
          ? 2
          : input.targetLevel === WcosEscalationLevel.LEVEL_3_BREACHED
          ? 3
          : 4;

      const now = new Date();

      // Update Work Item escalation telemetry
      await WcosRepository.updateWorkItem(
        input.taskId,
        context.organizationId,
        {
          escalationLevel: numericLevel,
          lastEscalatedAt: now,
        },
        tx
      );

      // If escalated to Level 3 or 4, elevate canonical Task Priority
      if (numericLevel >= 3) {
        await tx.task.update({
          where: { id: input.taskId },
          data: {
            priority: TaskPriority.URGENT,
          },
        });
      }

      // Create Escalation Record
      const record = await WcosRepository.createEscalationRecord(
        {
          organizationId: context.organizationId,
          taskId: input.taskId,
          level: input.targetLevel,
          triggerReason: input.reason,
          actorId: context.userId,
          idempotencyKey: input.idempotencyKey ?? randomUUID(),
        },
        tx
      );

      // Audit Log
      await logUserAuditEvent({
        userId: context.userId,
        organizationId: context.organizationId,
        action: AuditAction.WCOS_WORK_ITEM_ESCALATED,
        entityType: "WcosWorkItem",
        entityId: input.taskId,
        details: {
          taskId: input.taskId,
          targetLevel: input.targetLevel,
          reason: input.reason,
        },
        tx,
      });

      return record;
    });
  }

  // =========================================================================
  // 10. AVAILABILITY & AUTOMATED QUEUE DRAINING
  // =========================================================================

  static async setEmployeeAvailability(
    context: AuthenticatedContext,
    input: SetAvailabilityInput
  ) {
    WcosAuthorization.assertEmployeeSelfOrManagerAccess(
      context,
      input.employeeId,
      context.organizationId
    );

    return prisma.$transaction(async (tx) => {
      const fromDate = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
      const toDate = input.effectiveTo ? new Date(input.effectiveTo) : null;

      const record = await WcosRepository.createAvailabilityRecord(
        {
          organizationId: context.organizationId,
          employeeId: input.employeeId,
          state: input.state,
          effectiveFrom: fromDate,
          effectiveTo: toDate,
          reason: input.reason ?? null,
          actorId: context.userId,
        },
        tx
      );

      // If employee goes on LEAVE or INACTIVE, drain and unassign their active tasks
      if (
        input.state === WcosAvailabilityState.LEAVE ||
        input.state === WcosAvailabilityState.INACTIVE
      ) {
        const assignedTasks = await tx.task.findMany({
          where: {
            organizationId: context.organizationId,
            assignedEmployeeId: input.employeeId,
            status: { in: [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED] },
          },
        });

        for (const task of assignedTasks) {
          const activeRes = await WcosRepository.findActiveReservation(task.id, tx);
          if (activeRes) {
            await WcosRepository.updateReservationStatus(
              activeRes.id,
              WcosReservationStatus.RELEASED,
              activeRes.reservedCu,
              tx
            );

            await WcosRepository.updateCapacityProfileWorkload(
              input.employeeId,
              context.organizationId,
              new Date(),
              -activeRes.reservedCu,
              tx
            );
          }

          // Unassign task back to BACKLOG for redispatch
          await tx.task.update({
            where: { id: task.id },
            data: {
              assignedEmployeeId: null,
              status: TaskStatus.BACKLOG,
            },
          });

          await WcosRepository.createAssignmentHistory(
            {
              organizationId: context.organizationId,
              taskId: task.id,
              previousEmployeeId: input.employeeId,
              newEmployeeId: context.userId, // fallback system actor
              actorId: context.userId,
              reassignmentReason: `Queue drain due to employee ${input.state} state transition`,
              dispatchMode: WcosDispatchMode.MANUAL,
              capacityTransferredCu: 0,
              idempotencyKey: `drain-${task.id}-${Date.now()}`,
            },
            tx
          );
        }
      }

      return record;
    });
  }

  // =========================================================================
  // 11. DERIVED LIVE PROJECTIONS & DESK STREAM
  // =========================================================================

  static async getQueueProjections(
    context: AuthenticatedContext,
    queueId?: string
  ): Promise<WcosQueueItemProjection[]> {
    WcosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    const now = new Date();

    const tasks = await prisma.task.findMany({
      where: {
        organizationId: context.organizationId,
        status: { in: [TaskStatus.BACKLOG, TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED] },
        wcosWorkItem: queueId ? { queueId } : { isNot: null },
      },
      include: {
        assignedEmployee: { select: { id: true, firstName: true, lastName: true } },
        wcosWorkItem: {
          include: { queue: true },
        },
      },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
    });

    return tasks.map((t) => {
      const wi = t.wcosWorkItem!;
      const { isWarning, isBreached, remainingMs } = WcosLifecycle.evaluateSlaStatus(
        wi.slaTargetAt,
        wi.slaWarningAt,
        wi.slaPausedDurationMs,
        now
      );

      const assignedName = t.assignedEmployee
        ? `${t.assignedEmployee.firstName ?? ""} ${t.assignedEmployee.lastName ?? ""}`.trim()
        : null;

      return {
        taskId: t.id,
        taskTitle: t.title,
        taskStatus: t.status,
        taskPriority: t.priority,
        taskDueDate: t.dueDate,
        assignedEmployeeId: t.assignedEmployeeId,
        assignedEmployeeName: assignedName,
        workType: wi.workType,
        requiredCapabilityCode: wi.requiredCapabilityCode,
        requiredProficiencyLevel: wi.requiredProficiencyLevel,
        capacityUnitsEstimated: wi.capacityUnitsEstimated,
        capacityUnitsConsumed: wi.capacityUnitsConsumed,
        queueId: wi.queueId,
        queueName: wi.queue?.name ?? null,
        slaTargetAt: wi.slaTargetAt,
        slaWarningAt: wi.slaWarningAt,
        slaBreachedAt: wi.slaBreachedAt,
        slaRemainingMs: remainingMs,
        isSlaBreached: isBreached,
        isSlaWarning: isWarning,
        isSlaPaused: !!wi.blockedAt,
        slaPausedDurationMs: Number(wi.slaPausedDurationMs),
        blockingCategory: wi.blockingCategory,
        escalationLevel: wi.escalationLevel,
        createdAt: wi.createdAt,
      };
    });
  }

  static async getEmployeePriorityStream(
    context: AuthenticatedContext,
    employeeId: string
  ): Promise<EmployeePriorityStreamItem[]> {
    WcosAuthorization.assertEmployeeSelfOrManagerAccess(
      context,
      employeeId,
      context.organizationId
    );

    const now = new Date();

    const tasks = await prisma.task.findMany({
      where: {
        organizationId: context.organizationId,
        assignedEmployeeId: employeeId,
        status: { in: [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED] },
        wcosWorkItem: { isNot: null },
      },
      include: {
        wcosWorkItem: true,
      },
    });

    const streamItems: EmployeePriorityStreamItem[] = tasks.map((t) => {
      const wi = t.wcosWorkItem!;
      const { isWarning, isBreached, remainingMs } = WcosLifecycle.evaluateSlaStatus(
        wi.slaTargetAt,
        wi.slaWarningAt,
        wi.slaPausedDurationMs,
        now
      );

      let streamCategory: EmployeePriorityStreamItem["streamCategory"] = "ACTIVE_IN_PROGRESS";
      let streamRank = 3;

      if (isBreached || (t.dueDate && t.dueDate.getTime() < now.getTime())) {
        streamCategory = "OVERDUE";
        streamRank = 1;
      } else if (isWarning || wi.escalationLevel >= 2) {
        streamCategory = "SLA_AT_RISK";
        streamRank = 2;
      } else if (t.status === TaskStatus.IN_PROGRESS) {
        streamCategory = "ACTIVE_IN_PROGRESS";
        streamRank = 3;
      } else if (t.status === TaskStatus.BLOCKED) {
        streamCategory = "BLOCKED";
        streamRank = 4;
      } else if (t.status === TaskStatus.ASSIGNED) {
        streamCategory = "NEWLY_ASSIGNED";
        streamRank = 5;
      }

      return {
        taskId: t.id,
        taskTitle: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        streamCategory,
        streamRank,
        slaTargetAt: wi.slaTargetAt,
        slaRemainingMs: remainingMs,
        isSlaWarning: isWarning,
        isSlaBreached: isBreached,
        escalationLevel: wi.escalationLevel,
        blockingCategory: wi.blockingCategory,
        capacityUnitsEstimated: wi.capacityUnitsEstimated,
        workType: wi.workType,
      };
    });

    // Sort by streamRank ascending (Urgent first), then by remaining SLA ms ascending
    return streamItems.sort((a, b) => {
      if (a.streamRank !== b.streamRank) {
        return a.streamRank - b.streamRank;
      }
      return a.slaRemainingMs - b.slaRemainingMs;
    });
  }

  static async getEmployeeCapacitySummary(
    context: AuthenticatedContext,
    employeeId: string,
    targetDate: Date = new Date()
  ): Promise<EmployeeCapacitySummaryDTO> {
    WcosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    const user = await prisma.user.findFirst({
      where: { id: employeeId },
      include: {
        wcosEmployeeCapabilities: {
          where: { organizationId: context.organizationId, isActive: true },
          include: { capability: true },
        },
      },
    });
    if (!user) {
      throw new NotFoundError(`Employee ${employeeId} not found.`);
    }

    const profile = await WcosRepository.getOrCreateCapacityProfile(
      employeeId,
      context.organizationId,
      targetDate,
      28
    );

    const availability = await WcosRepository.getLatestAvailability(
      employeeId,
      context.organizationId
    );

    const activeTaskCount = await prisma.task.count({
      where: {
        organizationId: context.organizationId,
        assignedEmployeeId: employeeId,
        status: { in: [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED] },
      },
    });

    const availableCu = Math.max(0, profile.allocatedBudgetCu - profile.activeWorkloadCu);
    const utilizationPct =
      profile.allocatedBudgetCu > 0
        ? Math.round((profile.activeWorkloadCu / profile.allocatedBudgetCu) * 100)
        : 100;

    return {
      employeeId,
      employeeName: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
      effectiveDate: profile.effectiveDate.toISOString().split("T")[0] || "1970-01-01",
      dailyCapacityCu: profile.dailyCapacityCu,
      allocatedBudgetCu: profile.allocatedBudgetCu,
      reservedOverheadCu: profile.reservedOverheadCu,
      activeWorkloadCu: profile.activeWorkloadCu,
      availableCu,
      utilizationPercentage: utilizationPct,
      availabilityState: availability,
      activeTaskCount,
      verifiedCapabilities: user.wcosEmployeeCapabilities.map((ec) => ({
        code: ec.capability.code,
        name: ec.capability.name,
        proficiency: ec.proficiency,
      })),
    };
  }
}
