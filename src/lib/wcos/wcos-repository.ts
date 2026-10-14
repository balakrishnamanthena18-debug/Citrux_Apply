/**
 * Phase 10H-D — WCOS Authoritative Repository
 * Provides atomic, tenant-isolated persistence for all WCOS operational data.
 */

import { prisma } from "@/lib/db/prisma";
import {
  type Prisma,
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
  WcosReservationStatus,
  WcosAvailabilityState,
  WcosProficiencyLevel,
  WcosWorkDemandType,
  TaskPriority,
} from "@/generated/prisma";
import { DatabaseError, NotFoundError, ConflictError } from "@/lib/errors";

export class WcosRepository {
  // =========================================================================
  // 1. QUEUES & POLICIES
  // =========================================================================

  static async createQueue(
    data: Prisma.WcosQueueUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosQueue> {
    return tx.wcosQueue.create({ data });
  }

  static async findQueueById(
    id: string,
    organizationId: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosQueue | null> {
    return tx.wcosQueue.findFirst({
      where: { id, organizationId },
    });
  }

  static async listQueues(
    organizationId: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosQueue[]> {
    return tx.wcosQueue.findMany({
      where: { organizationId, isActive: true },
      orderBy: { priorityWeight: "desc" },
    });
  }

  static async createSlaPolicy(
    data: Prisma.WcosSlaPolicyUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosSlaPolicy> {
    return tx.wcosSlaPolicy.create({ data });
  }

  static async findSlaPolicy(
    demandType: WcosWorkDemandType,
    priority: TaskPriority,
    organizationId: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosSlaPolicy | null> {
    return tx.wcosSlaPolicy.findFirst({
      where: { organizationId, demandType, priority, isActive: true },
    });
  }

  static async upsertCapacityPolicy(
    data: Prisma.WcosCapacityPolicyUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosCapacityPolicy> {
    const existing = await tx.wcosCapacityPolicy.findFirst({
      where: { organizationId: data.organizationId },
    });
    if (existing) {
      return tx.wcosCapacityPolicy.update({
        where: { id: existing.id },
        data: {
          standardDailyCu: data.standardDailyCu,
          defaultAllocatedBudgetCu: data.defaultAllocatedBudgetCu,
          defaultReservedOverheadCu: data.defaultReservedOverheadCu,
          overloadThresholdPct: data.overloadThresholdPct,
          isDefault: data.isDefault,
        },
      });
    }
    return tx.wcosCapacityPolicy.create({ data });
  }

  // =========================================================================
  // 2. CAPACITY & AVAILABILITY
  // =========================================================================

  static async getOrCreateCapacityProfile(
    employeeId: string,
    organizationId: string,
    effectiveDate: Date,
    defaultAllocatedBudgetCu: number = 28,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosCapacityProfile> {
    // Truncate to date string YYYY-MM-DD
    const dateStr = effectiveDate.toISOString().split("T")[0] || "1970-01-01";
    const dateOnly = new Date(dateStr);

    const existing = await tx.wcosCapacityProfile.findFirst({
      where: {
        organizationId,
        employeeId,
        effectiveDate: dateOnly,
      },
    });

    if (existing) {
      return existing;
    }

    return tx.wcosCapacityProfile.create({
      data: {
        organizationId,
        employeeId,
        effectiveDate: dateOnly,
        dailyCapacityCu: 32,
        allocatedBudgetCu: defaultAllocatedBudgetCu,
        reservedOverheadCu: 4,
        activeWorkloadCu: 0,
        isActive: true,
      },
    });
  }

  static async updateCapacityProfileWorkload(
    employeeId: string,
    organizationId: string,
    effectiveDate: Date,
    deltaCu: number,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosCapacityProfile> {
    const profile = await this.getOrCreateCapacityProfile(employeeId, organizationId, effectiveDate, 28, tx);
    const newWorkload = profile.activeWorkloadCu + deltaCu;

    if (newWorkload < 0) {
      throw new DatabaseError(
        `Capacity invariant violation: activeWorkloadCu cannot be negative (attempted: ${newWorkload}).`
      );
    }

    return tx.wcosCapacityProfile.update({
      where: { id: profile.id },
      data: {
        activeWorkloadCu: newWorkload,
      },
    });
  }

  static async createAvailabilityRecord(
    data: Prisma.WcosAvailabilityRecordUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosAvailabilityRecord> {
    return tx.wcosAvailabilityRecord.create({ data });
  }

  static async getLatestAvailability(
    employeeId: string,
    organizationId: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosAvailabilityState> {
    const record = await tx.wcosAvailabilityRecord.findFirst({
      where: { organizationId, employeeId },
      orderBy: { effectiveFrom: "desc" },
    });
    return record?.state ?? WcosAvailabilityState.AVAILABLE;
  }

  // =========================================================================
  // 3. CAPABILITIES
  // =========================================================================

  static async createCapabilityDefinition(
    data: Prisma.WcosCapabilityDefinitionUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosCapabilityDefinition> {
    return tx.wcosCapabilityDefinition.create({ data });
  }

  static async findCapabilityDefinition(
    code: string,
    organizationId: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosCapabilityDefinition | null> {
    return tx.wcosCapabilityDefinition.findFirst({
      where: { organizationId, code, isActive: true },
    });
  }

  static async assignEmployeeCapability(
    data: Prisma.WcosEmployeeCapabilityUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosEmployeeCapability> {
    const existing = await tx.wcosEmployeeCapability.findFirst({
      where: {
        organizationId: data.organizationId,
        employeeId: data.employeeId,
        capabilityId: data.capabilityId,
      },
    });

    if (existing) {
      return tx.wcosEmployeeCapability.update({
        where: { id: existing.id },
        data: {
          proficiency: data.proficiency,
          verifiedById: data.verifiedById,
          verifiedAt: new Date(),
          isActive: data.isActive ?? true,
        },
      });
    }

    return tx.wcosEmployeeCapability.create({ data });
  }

  static async listEmployeeCapabilities(
    employeeId: string,
    organizationId: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<Array<WcosEmployeeCapability & { capability: WcosCapabilityDefinition }>> {
    return tx.wcosEmployeeCapability.findMany({
      where: { organizationId, employeeId, isActive: true },
      include: { capability: true },
    });
  }

  // =========================================================================
  // 4. WORK ITEMS & RESERVATIONS
  // =========================================================================

  static async createWorkItem(
    data: Prisma.WcosWorkItemUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosWorkItem> {
    return tx.wcosWorkItem.create({ data });
  }

  static async findWorkItemByTaskId(
    taskId: string,
    organizationId: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosWorkItem | null> {
    return tx.wcosWorkItem.findFirst({
      where: { taskId, organizationId },
    });
  }

  static async updateWorkItem(
    taskId: string,
    organizationId: string,
    data: Prisma.WcosWorkItemUncheckedUpdateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosWorkItem> {
    return tx.wcosWorkItem.update({
      where: { taskId },
      data,
    });
  }

  static async createCapacityReservation(
    data: Prisma.WcosCapacityReservationUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosCapacityReservation> {
    return tx.wcosCapacityReservation.create({ data });
  }

  static async findActiveReservation(
    taskId: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosCapacityReservation | null> {
    return tx.wcosCapacityReservation.findFirst({
      where: {
        taskId,
        status: { in: [WcosReservationStatus.RESERVED, WcosReservationStatus.CONSUMED] },
      },
    });
  }

  static async updateReservationStatus(
    reservationId: string,
    status: WcosReservationStatus,
    releasedCu: number = 0,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosCapacityReservation> {
    return tx.wcosCapacityReservation.update({
      where: { id: reservationId },
      data: {
        status,
        releasedCu,
        releasedAt: new Date(),
      },
    });
  }

  // =========================================================================
  // 5. HISTORY & AUDIT RECORDS
  // =========================================================================

  static async createAssignmentHistory(
    data: Prisma.WcosAssignmentHistoryUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosAssignmentHistory> {
    return tx.wcosAssignmentHistory.create({ data });
  }

  static async listAssignmentHistory(
    taskId: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosAssignmentHistory[]> {
    return tx.wcosAssignmentHistory.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
    });
  }

  static async createDispatchDecision(
    data: Prisma.WcosDispatchDecisionUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosDispatchDecision> {
    return tx.wcosDispatchDecision.create({ data });
  }

  static async findDispatchDecisionByTaskId(
    taskId: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosDispatchDecision | null> {
    return tx.wcosDispatchDecision.findFirst({
      where: { taskId },
      orderBy: { createdAt: "desc" },
    });
  }

  static async createBlockingRecord(
    data: Prisma.WcosBlockingRecordUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosBlockingRecord> {
    return tx.wcosBlockingRecord.create({ data });
  }

  static async findActiveBlockingRecord(
    taskId: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosBlockingRecord | null> {
    return tx.wcosBlockingRecord.findFirst({
      where: { taskId, unblockedAt: null },
      orderBy: { blockedAt: "desc" },
    });
  }

  static async unblockRecord(
    recordId: string,
    unblockActorId: string,
    pausedDurationMs: bigint,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosBlockingRecord> {
    return tx.wcosBlockingRecord.update({
      where: { id: recordId },
      data: {
        unblockedAt: new Date(),
        unblockActorId,
        pausedDurationMs,
      },
    });
  }

  static async createEscalationRecord(
    data: Prisma.WcosEscalationRecordUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosEscalationRecord> {
    return tx.wcosEscalationRecord.create({ data });
  }

  static async listEscalationsForTask(
    taskId: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<WcosEscalationRecord[]> {
    return tx.wcosEscalationRecord.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
    });
  }

  // =========================================================================
  // 6. CONCURRENCY LOCKING
  // =========================================================================

  /**
   * Acquires pessimistic row locks on Task and WcosWorkItem.
   */
  static async lockTaskAndWorkItem(
    taskId: string,
    organizationId: string,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    await tx.$executeRaw`
      SELECT id FROM public.tasks 
      WHERE id = ${taskId}::uuid AND "organizationId" = ${organizationId}::uuid
      FOR UPDATE;
    `;
    await tx.$executeRaw`
      SELECT task_id FROM public.wcos_work_items 
      WHERE task_id = ${taskId}::uuid AND organization_id = ${organizationId}::uuid
      FOR UPDATE;
    `;
  }
}
