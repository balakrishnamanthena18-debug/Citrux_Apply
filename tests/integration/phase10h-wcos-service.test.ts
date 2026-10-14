import { config } from "dotenv";
config({ path: ".env" });
import { randomUUID } from "crypto";
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { WcosService } from "@/lib/wcos/wcos-service";
import {
  WcosWorkDemandType,
  WcosAvailabilityState,
  WcosProficiencyLevel,
  WcosDispatchMode,
  WcosBlockingCategory,
  WcosEscalationLevel,
  WcosReservationStatus,
  TaskStatus,
  TaskPriority,
  TaskCategory,
  TaskType,
  Role,
} from "@/lib/wcos/types";
import type { AuthenticatedContext } from "@/lib/auth/context";

describe("Phase 10H-D — WCOS Service Integration & Operational Lifecycle", () => {
  let orgId: string;
  let adminUserId: string;
  let employee1Id: string;
  let employee2Id: string;
  let adminContext: AuthenticatedContext;
  let employee1Context: AuthenticatedContext;
  let capabilityCode = "CAP_RESUME_ENGINEERING";

  beforeEach(async () => {
    // 1. Create Organization
    const org = await prisma.organization.create({
      data: {
        name: `WCOS Test Org ${Date.now()}`,
        slug: `wcos-org-${Date.now()}-${randomUUID().slice(0, 6)}`,
      },
    });
    orgId = org.id;

    // 2. Create Admin User
    adminUserId = randomUUID();
    await prisma.user.create({
      data: {
        id: adminUserId,
        email: `admin-${Date.now()}-${randomUUID().slice(0, 4)}@wcostest.com`,
        status: "ACTIVE",
        memberships: {
          create: {
            organizationId: orgId,
            role: Role.ADMIN,
            status: "ACTIVE",
          },
        },
      },
    });

    adminContext = {
      userId: adminUserId,
      email: "admin@wcostest.com",
      organizationId: orgId,
      role: Role.ADMIN,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };

    // 3. Create Employee 1
    employee1Id = randomUUID();
    await prisma.user.create({
      data: {
        id: employee1Id,
        email: `emp1-${Date.now()}-${randomUUID().slice(0, 4)}@wcostest.com`,
        firstName: "Alice",
        lastName: "Engineer",
        status: "ACTIVE",
        memberships: {
          create: {
            organizationId: orgId,
            role: Role.EMPLOYEE,
            status: "ACTIVE",
            team: "Engineering",
          },
        },
      },
    });

    employee1Context = {
      userId: employee1Id,
      email: "emp1@wcostest.com",
      organizationId: orgId,
      role: Role.EMPLOYEE,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };

    // 4. Create Employee 2
    employee2Id = randomUUID();
    await prisma.user.create({
      data: {
        id: employee2Id,
        email: `emp2-${Date.now()}-${randomUUID().slice(0, 4)}@wcostest.com`,
        firstName: "Bob",
        lastName: "Specialist",
        status: "ACTIVE",
        memberships: {
          create: {
            organizationId: orgId,
            role: Role.EMPLOYEE,
            status: "ACTIVE",
            team: "Engineering",
          },
        },
      },
    });

    // 5. Register Capability and Assign to Employees
    await WcosService.registerCapabilityDefinition(adminContext, {
      code: capabilityCode,
      name: "Resume Engineering Capability",
      description: "Capability for tailoring and engineering candidate resumes",
    });

    await WcosService.assignEmployeeCapability(adminContext, {
      employeeId: employee1Id,
      capabilityCode,
      proficiency: WcosProficiencyLevel.ADVANCED,
    });

    await WcosService.assignEmployeeCapability(adminContext, {
      employeeId: employee2Id,
      capabilityCode,
      proficiency: WcosProficiencyLevel.EXPERT,
    });

    // 6. Create Capacity Policies & Profiles
    await WcosService.setCapacityPolicy(adminContext, {
      name: "Standard Full-Time Policy",
      standardDailyCu: 32,
      defaultAllocatedBudgetCu: 28,
      defaultReservedOverheadCu: 4,
      isDefault: true,
    });
  });

  it("enforces strict 1:1 relationship between Task and WcosWorkItem", async () => {
    // Create Task
    const task = await prisma.task.create({
      data: {
        organizationId: orgId,
        title: "Tailor Resume for John Doe",
        category: TaskCategory.APPLICATION,
        type: TaskType.PREPARE_RESUME,
        status: TaskStatus.BACKLOG,
        priority: TaskPriority.NORMAL,
        createdById: adminUserId,
      },
    });

    // Enroll into WCOS
    const workItem = await WcosService.enrollTask(adminContext, {
      taskId: task.id,
      workType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
      requiredCapabilityCode: capabilityCode,
      requiredProficiencyLevel: WcosProficiencyLevel.INTERMEDIATE,
      capacityUnitsEstimated: 3,
    });

    expect(workItem.taskId).toBe(task.id);
    expect(workItem.workType).toBe(WcosWorkDemandType.DEMAND_RESUME_TAILORING);
    expect(workItem.capacityUnitsEstimated).toBe(3);

    // Attempt duplicate enrollment -> must fail with ConflictError
    await expect(
      WcosService.enrollTask(adminContext, {
        taskId: task.id,
        workType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
        requiredCapabilityCode: capabilityCode,
      })
    ).rejects.toThrowError(/already enrolled/);
  });

  it("atomically executes deterministic dispatch, creates reservation, and writes audit", async () => {
    const task = await prisma.task.create({
      data: {
        organizationId: orgId,
        title: "Tailor Resume Task",
        category: TaskCategory.APPLICATION,
        type: TaskType.PREPARE_RESUME,
        status: TaskStatus.BACKLOG,
        priority: TaskPriority.NORMAL,
        createdById: adminUserId,
      },
    });

    await WcosService.enrollTask(adminContext, {
      taskId: task.id,
      workType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
      requiredCapabilityCode: capabilityCode,
      requiredProficiencyLevel: WcosProficiencyLevel.INTERMEDIATE,
      capacityUnitsEstimated: 3,
    });

    const dispatchIdemp = `dispatch-${task.id}-1`;
    const result = await WcosService.dispatchTask(adminContext, {
      taskId: task.id,
      idempotencyKey: dispatchIdemp,
    });

    // Verify task updated
    expect(result.task.assignedEmployeeId).toBeDefined();
    expect([employee1Id, employee2Id]).toContain(result.task.assignedEmployeeId);
    expect(result.task.status).toBe(TaskStatus.ASSIGNED);

    // Verify Capacity Reservation
    const activeRes = await prisma.wcosCapacityReservation.findFirst({
      where: { taskId: task.id, status: WcosReservationStatus.RESERVED },
    });
    expect(activeRes).toBeDefined();
    expect(activeRes?.employeeId).toBe(result.task.assignedEmployeeId);
    expect(activeRes?.reservedCu).toBe(3);

    // Verify Employee Daily Profile active workload incremented
    const profile = await prisma.wcosCapacityProfile.findFirst({
      where: { organizationId: orgId, employeeId: result.task.assignedEmployeeId! },
    });
    expect(profile?.activeWorkloadCu).toBe(3);

    // Verify Dispatch Decision record
    expect(result.decision.taskId).toBe(task.id);
    expect(result.decision.selectedEmployeeId).toBe(result.task.assignedEmployeeId);
    expect(Number(result.decision.totalScore)).toBeGreaterThan(0);

    // Verify Assignment History
    const history = await prisma.wcosAssignmentHistory.findFirst({
      where: { taskId: task.id },
    });
    expect(history?.newEmployeeId).toBe(result.task.assignedEmployeeId);
    expect(history?.capacityTransferredCu).toBe(3);
  });

  it("handles full lifecycle: accept -> block -> unblock -> reassign -> complete", async () => {
    // 1. Create and enroll Task
    const task = await prisma.task.create({
      data: {
        organizationId: orgId,
        title: "Full Lifecycle Task",
        category: TaskCategory.APPLICATION,
        type: TaskType.PREPARE_RESUME,
        status: TaskStatus.BACKLOG,
        priority: TaskPriority.NORMAL,
        createdById: adminUserId,
      },
    });

    await WcosService.enrollTask(adminContext, {
      taskId: task.id,
      workType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
      requiredCapabilityCode: capabilityCode,
      capacityUnitsEstimated: 4,
    });

    // 2. Dispatch to Employee 1
    await WcosService.dispatchTask(adminContext, {
      taskId: task.id,
      forceEmployeeId: employee1Id,
      idempotencyKey: `disp-${task.id}`,
    });

    // 3. Employee 1 accepts task
    const accepted = await WcosService.acceptTask(employee1Context, task.id);
    expect(accepted.task.status).toBe(TaskStatus.IN_PROGRESS);
    expect(accepted.reservation.status).toBe(WcosReservationStatus.CONSUMED);

    // 4. Employee 1 blocks task for candidate input
    const blocked = await WcosService.blockTask(employee1Context, {
      taskId: task.id,
      category: WcosBlockingCategory.WAIT_CANDIDATE_INPUT,
      reason: "Waiting for candidate portfolio link",
      unblockExpectedAt: new Date(Date.now() + 86400000),
    });
    expect(blocked.task.status).toBe(TaskStatus.BLOCKED);

    // 5. Unblock task
    const unblocked = await WcosService.unblockTask(employee1Context, {
      taskId: task.id,
    });
    expect(unblocked.task.status).toBe(TaskStatus.IN_PROGRESS);
    expect(unblocked.workItem.blockingCategory).toBeNull();

    // 6. Reassign to Employee 2
    const reassigned = await WcosService.reassignTask(adminContext, {
      taskId: task.id,
      newEmployeeId: employee2Id,
      reason: "Reassigned due to workload rebalance",
      idempotencyKey: `reassign-${task.id}-1`,
    });
    expect(reassigned.task.assignedEmployeeId).toBe(employee2Id);

    // Verify Employee 1 workload decreased back to 0, Employee 2 workload increased to 4
    const emp1Profile = await prisma.wcosCapacityProfile.findFirst({
      where: { organizationId: orgId, employeeId: employee1Id },
    });
    const emp2Profile = await prisma.wcosCapacityProfile.findFirst({
      where: { organizationId: orgId, employeeId: employee2Id },
    });
    expect(emp1Profile?.activeWorkloadCu).toBe(0);
    expect(emp2Profile?.activeWorkloadCu).toBe(4);

    // 7. Complete Task
    const completed = await WcosService.completeTask(adminContext, task.id);
    expect(completed.task.status).toBe(TaskStatus.COMPLETED);
    expect(completed.releasedCu).toBe(4);

    // Verify Employee 2 workload returned to 0
    const emp2FinalProfile = await prisma.wcosCapacityProfile.findFirst({
      where: { organizationId: orgId, employeeId: employee2Id },
    });
    expect(emp2FinalProfile?.activeWorkloadCu).toBe(0);
  });

  it("handles escalation and elevates Task priority on level 3", async () => {
    const task = await prisma.task.create({
      data: {
        organizationId: orgId,
        title: "Escalation Test Task",
        category: TaskCategory.APPLICATION,
        type: TaskType.PREPARE_RESUME,
        status: TaskStatus.BACKLOG,
        priority: TaskPriority.NORMAL,
        createdById: adminUserId,
      },
    });

    await WcosService.enrollTask(adminContext, {
      taskId: task.id,
      workType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
      requiredCapabilityCode: capabilityCode,
    });

    const escalation = await WcosService.escalateTask(adminContext, {
      taskId: task.id,
      targetLevel: WcosEscalationLevel.LEVEL_3_BREACHED,
      reason: "SLA breach detected by supervisor",
      idempotencyKey: `esc-${task.id}-1`,
    });

    expect(escalation.level).toBe(WcosEscalationLevel.LEVEL_3_BREACHED);

    // Verify TaskPriority was elevated to URGENT
    const updatedTask = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updatedTask?.priority).toBe(TaskPriority.URGENT);
  });

  it("drains and unassigns active tasks when employee goes on LEAVE", async () => {
    const task = await prisma.task.create({
      data: {
        organizationId: orgId,
        title: "Task For Employee 1",
        category: TaskCategory.APPLICATION,
        type: TaskType.PREPARE_RESUME,
        status: TaskStatus.BACKLOG,
        priority: TaskPriority.NORMAL,
        createdById: adminUserId,
      },
    });

    await WcosService.enrollTask(adminContext, {
      taskId: task.id,
      workType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
      requiredCapabilityCode: capabilityCode,
      capacityUnitsEstimated: 3,
    });

    await WcosService.dispatchTask(adminContext, {
      taskId: task.id,
      forceEmployeeId: employee1Id,
      idempotencyKey: `disp-${task.id}-drain`,
    });

    // Employee 1 sets availability to LEAVE
    await WcosService.setEmployeeAvailability(employee1Context, {
      employeeId: employee1Id,
      state: WcosAvailabilityState.LEAVE,
      reason: "Annual leave",
    });

    // Task should be unassigned and returned to BACKLOG
    const unassignedTask = await prisma.task.findUnique({ where: { id: task.id } });
    expect(unassignedTask?.assignedEmployeeId).toBeNull();
    expect(unassignedTask?.status).toBe(TaskStatus.BACKLOG);

    // Employee 1 workload should be 0
    const profile = await prisma.wcosCapacityProfile.findFirst({
      where: { organizationId: orgId, employeeId: employee1Id },
    });
    expect(profile?.activeWorkloadCu).toBe(0);
  });

  it("derives live Queue Projections and Employee Priority Stream accurately", async () => {
    const task = await prisma.task.create({
      data: {
        organizationId: orgId,
        title: "Queue Projections Test Task",
        category: TaskCategory.APPLICATION,
        type: TaskType.PREPARE_RESUME,
        status: TaskStatus.BACKLOG,
        priority: TaskPriority.HIGH,
        createdById: adminUserId,
      },
    });

    await WcosService.enrollTask(adminContext, {
      taskId: task.id,
      workType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
      requiredCapabilityCode: capabilityCode,
      capacityUnitsEstimated: 3,
    });

    await WcosService.dispatchTask(adminContext, {
      taskId: task.id,
      forceEmployeeId: employee1Id,
      idempotencyKey: `disp-proj-${task.id}`,
    });

    // 1. Get Queue Projections
    const projections = await WcosService.getQueueProjections(adminContext);
    const proj = projections.find((p) => p.taskId === task.id);
    expect(proj).toBeDefined();
    expect(proj?.taskTitle).toBe("Queue Projections Test Task");
    expect(proj?.assignedEmployeeId).toBe(employee1Id);

    // 2. Get Employee Priority Stream
    const stream = await WcosService.getEmployeePriorityStream(employee1Context, employee1Id);
    expect(stream.length).toBeGreaterThanOrEqual(1);
    const streamItem = stream.find((s) => s.taskId === task.id);
    expect(streamItem).toBeDefined();
    expect(streamItem?.streamCategory).toBe("NEWLY_ASSIGNED");

    // 3. Employee Capacity Summary
    const summary = await WcosService.getEmployeeCapacitySummary(adminContext, employee1Id);
    expect(summary.activeWorkloadCu).toBe(3);
    expect(summary.availableCu).toBe(25); // 28 - 3
    expect(summary.verifiedCapabilities.length).toBeGreaterThanOrEqual(1);
  });
});
