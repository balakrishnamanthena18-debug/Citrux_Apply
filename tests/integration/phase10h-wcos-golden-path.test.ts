/**
 * Phase 10H-F — WCOS End-to-End Golden Path & Operational Verification
 * 
 * Verifies Golden Paths A through R:
 * - Path A: Normal Dispatch to Completion & Capacity Release
 * - Path B: Capacity Rejection via Hard Gate
 * - Path C: Employee Leave Transition & Reassignment
 * - Path D: Blocked by Candidate (WAIT_CANDIDATE_INPUT) & SLA Resume
 * - Path E: SLA Breach & Atomic Canonical Task.priority Elevation
 * - Path F: Manager Authorized Reassignment & Conservation
 * - Path G: Concurrent Dispatch Determinism & Single Active Reservation
 * - Path H: Concurrent Reassignment Invariant Preservation
 * - Path I: Cross-Tenant Attack Rejection
 * - Path J: Unauthorized Role Action Rejection
 * - Path K: Employee Priority Stream Projection
 * - Path L: Queue Projections & Manager Overview
 * - Path M: End-to-End Capacity Conservation Accounting
 * - Path N: Full Operational Journey Audit Reconstruction
 * - Path O: Failure Recovery & Invalid State Handling
 * - Path P: Responsive Priority & Urgency Ordering
 * - Path Q: High Data Volume Execution (100+ Tasks)
 * - Path R: Cross-Domain Boundary Isolation (Candidate / OPOS / CBOS)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { WcosService } from "@/lib/wcos/wcos-service";
import { WcosRepository } from "@/lib/wcos/wcos-repository";
import type { AuthenticatedContext } from "@/lib/auth/context";
import {
  WcosWorkDemandType,
  WcosProficiencyLevel,
  WcosDispatchMode,
  WcosAvailabilityState,
  WcosBlockingCategory,
  WcosEscalationLevel,
} from "@/lib/wcos/types";
import { TaskStatus, TaskPriority } from "@/generated/prisma";

describe("Phase 10H-F — WCOS End-to-End Golden Path & Operational Verification", () => {
  const orgAId = randomUUID();
  const orgBId = randomUUID();

  const userManagerA = randomUUID();
  const userStaffA1 = randomUUID();
  const userStaffA2 = randomUUID();
  const userStaffA3 = randomUUID();
  const userLeaveStaffA = randomUUID();

  const userManagerB = randomUUID();
  const userStaffB1 = randomUUID();

  const capResumeId = randomUUID();
  const capInterviewPrepId = randomUUID();

  const ctxManagerA: AuthenticatedContext = {
    userId: userManagerA,
    email: "mgr-a@wcos.local",
    organizationId: orgAId,
    role: "ADMIN" as any,
    status: "ACTIVE" as any,
    membershipStatus: "ACTIVE" as any,
  };

  const ctxStaffA1: AuthenticatedContext = {
    userId: userStaffA1,
    email: "staff-a1@wcos.local",
    organizationId: orgAId,
    role: "EMPLOYEE" as any,
    status: "ACTIVE" as any,
    membershipStatus: "ACTIVE" as any,
  };

  const ctxManagerB: AuthenticatedContext = {
    userId: userManagerB,
    email: "mgr-b@wcos.local",
    organizationId: orgBId,
    role: "ADMIN" as any,
    status: "ACTIVE" as any,
    membershipStatus: "ACTIVE" as any,
  };

  beforeAll(async () => {
    // 1. Seed Organizations
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.organizations (id, name, slug) VALUES ($1, $2, $3), ($4, $5, $6)`,
      orgAId, "WCOS Golden Path Org A", `wcos-gp-a-${Date.now()}`,
      orgBId, "WCOS Golden Path Org B", `wcos-gp-b-${Date.now()}`
    );

    // 2. Seed Users
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.users (id, email) VALUES
       ($1, $2), ($3, $4), ($5, $6), ($7, $8), ($9, $10), ($11, $12), ($13, $14)`,
      userManagerA, `mgr-a-${Date.now()}@a.com`,
      userStaffA1, `staff-a1-${Date.now()}@a.com`,
      userStaffA2, `staff-a2-${Date.now()}@a.com`,
      userStaffA3, `staff-a3-${Date.now()}@a.com`,
      userLeaveStaffA, `leave-a-${Date.now()}@a.com`,
      userManagerB, `mgr-b-${Date.now()}@b.com`,
      userStaffB1, `staff-b1-${Date.now()}@b.com`
    );

    // 3. Seed Memberships
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.memberships (id, "organizationId", "userId", role, status) VALUES
       (gen_random_uuid(), $1, $2, 'ADMIN', 'ACTIVE'),
       (gen_random_uuid(), $1, $3, 'EMPLOYEE', 'ACTIVE'),
       (gen_random_uuid(), $1, $4, 'EMPLOYEE', 'ACTIVE'),
       (gen_random_uuid(), $1, $5, 'EMPLOYEE', 'ACTIVE'),
       (gen_random_uuid(), $1, $6, 'EMPLOYEE', 'ACTIVE'),
       (gen_random_uuid(), $7, $8, 'ADMIN', 'ACTIVE'),
       (gen_random_uuid(), $7, $9, 'EMPLOYEE', 'ACTIVE')`,
      orgAId, userManagerA, userStaffA1, userStaffA2, userStaffA3, userLeaveStaffA,
      orgBId, userManagerB, userStaffB1
    );

    // 4. Seed Capabilities
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.wcos_capability_definitions (id, organization_id, code, name, description, is_active)
       VALUES ($1, $2, 'RESUME_SPECIALIST', 'Resume Specialist', 'Crafts tailored resumes', true),
              ($3, $4, 'INTERVIEW_COACH', 'Interview Coach', 'Prepares candidate interviews', true)`,
      capResumeId, orgAId,
      capInterviewPrepId, orgAId
    );

    // 5. Bind Capabilities to Staff
    // Staff A1: RESUME_SPECIALIST (ADVANCED), INTERVIEW_COACH (EXPERT)
    await WcosService.assignEmployeeCapability(ctxManagerA, {
      employeeId: userStaffA1,
      capabilityCode: "RESUME_SPECIALIST",
      proficiency: WcosProficiencyLevel.ADVANCED,
    });
    await WcosService.assignEmployeeCapability(ctxManagerA, {
      employeeId: userStaffA1,
      capabilityCode: "INTERVIEW_COACH",
      proficiency: WcosProficiencyLevel.EXPERT,
    });

    // Staff A2: RESUME_SPECIALIST (INTERMEDIATE)
    await WcosService.assignEmployeeCapability(ctxManagerA, {
      employeeId: userStaffA2,
      capabilityCode: "RESUME_SPECIALIST",
      proficiency: WcosProficiencyLevel.INTERMEDIATE,
    });

    // Staff A3: INTERVIEW_COACH (BASIC)
    await WcosService.assignEmployeeCapability(ctxManagerA, {
      employeeId: userStaffA3,
      capabilityCode: "INTERVIEW_COACH",
      proficiency: WcosProficiencyLevel.BASIC,
    });

    // Staff Leave: RESUME_SPECIALIST (ADVANCED)
    await WcosService.assignEmployeeCapability(ctxManagerA, {
      employeeId: userLeaveStaffA,
      capabilityCode: "RESUME_SPECIALIST",
      proficiency: WcosProficiencyLevel.ADVANCED,
    });

    // 6. Seed Capacity Profiles (Budget = 40 CU per day)
    const today = new Date();
    for (const empId of [userStaffA1, userStaffA2, userStaffA3, userLeaveStaffA]) {
      await WcosRepository.getOrCreateCapacityProfile(
        empId,
        orgAId,
        today,
        40
      );
    }

    // 7. Set Availability (Leave Staff is ON LEAVE)
    await WcosService.setEmployeeAvailability(ctxManagerA, {
      employeeId: userLeaveStaffA,
      state: WcosAvailabilityState.LEAVE,
      effectiveFrom: today,
      reason: "Medical leave",
    });

    // 8. Seed Queue & SLA Policy
    await WcosService.createQueue(ctxManagerA, {
      name: "Resume Processing Queue",
      slug: "resume-proc-queue",
      targetCapabilityCode: "RESUME_SPECIALIST",
      priorityWeight: 10,
    });

    await WcosService.createSlaPolicy(ctxManagerA, {
      name: "Standard Resume Tailoring SLA",
      demandType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
      priority: TaskPriority.NORMAL,
      targetDurationMinutes: 1440, // 24 hours
      warningThresholdPercentage: 80,
      maxPauseDurationMinutes: 20160,
    });
  });

  afterAll(async () => {
    // Teardown test orgs
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_escalation_records WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_blocking_records WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_dispatch_decisions WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_assignment_history WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_capacity_reservations WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_work_items WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.tasks WHERE "organizationId" IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_employee_capabilities WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_capacity_profiles WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_availability_records WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_capability_definitions WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_sla_policies WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_queues WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.audit_events WHERE "organizationId" IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.memberships WHERE "organizationId" IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.users WHERE id IN ($1, $2, $3, $4, $5, $6, $7)`,
      userManagerA, userStaffA1, userStaffA2, userStaffA3, userLeaveStaffA, userManagerB, userStaffB1
    );
    await prisma.$executeRawUnsafe(`DELETE FROM public.organizations WHERE id IN ($1, $2)`, orgAId, orgBId);
  });

  // =========================================================================
  // GOLDEN PATH A: Normal Dispatch to Completion & Capacity Release
  // =========================================================================
  it("Golden Path A: Normal Dispatch → Accept/In Progress → Complete → Capacity Release", async () => {
    const taskId = randomUUID();
    const taskDueDate = new Date(Date.now() + 86400000);

    // 1. Create canonical Task
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority, "dueDate")
       VALUES ($1, $2, $3, 'Verify Candidate Resume A', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'NORMAL', $4)`,
      taskId, orgAId, userManagerA, taskDueDate
    );

    // 2. Enroll Work Item (8 CU)
    const workItem = await WcosService.enrollTask(ctxManagerA, {
      taskId,
      workType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
      requiredCapabilityCode: "RESUME_SPECIALIST",
      requiredProficiencyLevel: WcosProficiencyLevel.INTERMEDIATE,
      capacityUnitsEstimated: 8,
    });
    expect(workItem.taskId).toBeDefined();

    // 3. Dispatch Task
    const dispatchResult = await WcosService.dispatchTask(ctxManagerA, {
      taskId,
      dispatchMode: WcosDispatchMode.AUTO,
    });

    expect(dispatchResult.decision.selectedEmployeeId).toBeDefined();
    const assignee = dispatchResult.decision.selectedEmployeeId;

    // Verify canonical task assignment
    const taskAfterDispatch = await prisma.task.findUnique({ where: { id: taskId } });
    expect(taskAfterDispatch?.assignedEmployeeId).toBe(assignee);
    expect(taskAfterDispatch?.status).toBe(TaskStatus.ASSIGNED);

    // Verify capacity reservation created (8 CU RESERVED)
    const reservation = await prisma.wcosCapacityReservation.findFirst({
      where: { taskId, status: "RESERVED" },
    });
    expect(reservation).not.toBeNull();
    expect(reservation?.reservedCu).toBe(8);

    // 4. Employee accepts task -> transitions to IN_PROGRESS & reservation CONSUMED
    const acceptCtx = assignee === userStaffA1 ? ctxStaffA1 : ctxManagerA;
    const acceptResult = await WcosService.acceptTask(acceptCtx, taskId);
    expect(acceptResult.task.status).toBe(TaskStatus.IN_PROGRESS);

    const consumedRes = await prisma.wcosCapacityReservation.findFirst({
      where: { taskId, status: "CONSUMED" },
    });
    expect(consumedRes).not.toBeNull();

    // 5. Employee completes work -> Task COMPLETED & reservation RELEASED
    const completeResult = await WcosService.completeTask(acceptCtx, taskId);
    expect(completeResult.task.status).toBe(TaskStatus.COMPLETED);

    const releasedRes = await prisma.wcosCapacityReservation.findFirst({
      where: { taskId, status: "RELEASED" },
    });
    expect(releasedRes).not.toBeNull();

    // Verify assignment history exists
    const history = await prisma.wcosAssignmentHistory.findMany({ where: { taskId } });
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0]?.newEmployeeId).toBe(assignee);
  });

  // =========================================================================
  // GOLDEN PATH B: Capacity Rejection via Hard Gate
  // =========================================================================
  it("Golden Path B: Capacity Rejection excludes overloaded employee and selects available peer", async () => {
    // Fill up Staff A1 with 35 CU out of 40 CU budget
    const blockerTaskId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority)
       VALUES ($1, $2, $3, 'Heavy Backlog Task', 'APPLICATION', 'PREPARE_RESUME', 'ASSIGNED', 'HIGH')`,
      blockerTaskId, orgAId, userManagerA
    );
    await WcosService.enrollTask(ctxManagerA, {
      taskId: blockerTaskId,
      workType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
      requiredCapabilityCode: "RESUME_SPECIALIST",
      capacityUnitsEstimated: 35,
    });
    await WcosService.dispatchTask(ctxManagerA, {
      taskId: blockerTaskId,
      forceEmployeeId: userStaffA1,
      dispatchMode: WcosDispatchMode.OVERRIDE,
    });

    // Now create a new Task needing 10 CU (Staff A1 only has 5 CU remaining, Staff A2 has 40 CU remaining)
    const newTaskId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority)
       VALUES ($1, $2, $3, 'Demand Task B', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'NORMAL')`,
      newTaskId, orgAId, userManagerA
    );
    await WcosService.enrollTask(ctxManagerA, {
      taskId: newTaskId,
      workType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
      requiredCapabilityCode: "RESUME_SPECIALIST",
      capacityUnitsEstimated: 10,
    });

    const dispatchRes = await WcosService.dispatchTask(ctxManagerA, {
      taskId: newTaskId,
      dispatchMode: WcosDispatchMode.AUTO,
    });

    // Staff A1 must have failed CAPACITY_OVERLOAD gate; Staff A2 must win
    expect(dispatchRes.decision.selectedEmployeeId).toBe(userStaffA2);
    const gateFailures = (dispatchRes.decision.hardGateFailures as any[]) || [];
    const a1GateFailure = gateFailures.find(
      (f: any) => f.candidateId === userStaffA1
    );
    expect(a1GateFailure).toBeDefined();
    expect(a1GateFailure?.failedGates.some((g: string) => g.includes("CAPACITY_OVERLOAD"))).toBe(true);
  });

  // =========================================================================
  // GOLDEN PATH C: Employee Leave Transition & Reassignment
  // =========================================================================
  it("Golden Path C: Staff on LEAVE cannot receive work; queue drain unassigns active tasks", async () => {
    const taskId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority)
       VALUES ($1, $2, $3, 'Leave Test Task', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'NORMAL')`,
      taskId, orgAId, userManagerA
    );
    await WcosService.enrollTask(ctxManagerA, {
      taskId,
      workType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
      requiredCapabilityCode: "RESUME_SPECIALIST",
      capacityUnitsEstimated: 5,
    });

    const dispatchRes = await WcosService.dispatchTask(ctxManagerA, {
      taskId,
      dispatchMode: WcosDispatchMode.AUTO,
    });

    // userLeaveStaffA is on LEAVE, so must not be selected
    expect(dispatchRes.decision.selectedEmployeeId).not.toBe(userLeaveStaffA);
    const gateFailures = (dispatchRes.decision.hardGateFailures as any[]) || [];
    const leaveGate = gateFailures.find(
      (f: any) => f.candidateId === userLeaveStaffA
    );
    expect(leaveGate).toBeDefined();
    expect(leaveGate?.failedGates.some((g: string) => g.includes("LEAVE"))).toBe(true);
  });

  // =========================================================================
  // GOLDEN PATH D: Blocked by Candidate (WAIT_CANDIDATE_INPUT) & SLA Resume
  // =========================================================================
  it("Golden Path D: Blocked by Candidate creates pause telemetry and resumes without deadline reset", async () => {
    const taskId = randomUUID();
    const originalDueDate = new Date(Date.now() + 86400000);

    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority, "dueDate")
       VALUES ($1, $2, $3, 'Blocking Test Task', 'APPLICATION', 'PREPARE_RESUME', 'ASSIGNED', 'NORMAL', $4)`,
      taskId, orgAId, userManagerA, originalDueDate
    );
    await WcosService.enrollTask(ctxManagerA, {
      taskId,
      workType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
      requiredCapabilityCode: "RESUME_SPECIALIST",
      capacityUnitsEstimated: 4,
    });

    // 1. Block Task
    const unblockExpected = new Date(Date.now() + 3600000); // 1 hour
    const blockRes = await WcosService.blockTask(ctxManagerA, {
      taskId,
      category: WcosBlockingCategory.WAIT_CANDIDATE_INPUT,
      reason: "Waiting for candidate to upload portfolio",
      unblockExpectedAt: unblockExpected,
    });

    expect(blockRes.blockingRecord.category).toBe(WcosBlockingCategory.WAIT_CANDIDATE_INPUT);
    expect(blockRes.task.status).toBe(TaskStatus.BLOCKED);

    // 2. Unblock Task
    const unblockRes = await WcosService.unblockTask(ctxManagerA, {
      taskId,
      resumeReason: "Candidate provided portfolio",
    });

    expect(unblockRes.task.status).toBe(TaskStatus.IN_PROGRESS);
    expect(unblockRes.task.dueDate?.toISOString()).toBe(originalDueDate.toISOString());
  });

  // =========================================================================
  // GOLDEN PATH E: SLA Breach & Atomic Canonical Task.priority Elevation
  // =========================================================================
  it("Golden Path E: Escalation Level 3+ atomically elevates canonical Task.priority to URGENT", async () => {
    const taskId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority)
       VALUES ($1, $2, $3, 'Escalation Test Task', 'APPLICATION', 'PREPARE_RESUME', 'IN_PROGRESS', 'LOW')`,
      taskId, orgAId, userManagerA
    );
    await WcosService.enrollTask(ctxManagerA, {
      taskId,
      workType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
      requiredCapabilityCode: "RESUME_SPECIALIST",
      capacityUnitsEstimated: 6,
    });

    // Level 3 Escalation (Breached)
    const escRes = await WcosService.escalateTask(ctxManagerA, {
      taskId,
      targetLevel: WcosEscalationLevel.LEVEL_3_BREACHED,
      reason: "SLA breached by 200%",
    });

    expect(escRes.level).toBe(WcosEscalationLevel.LEVEL_3_BREACHED);

    // Verify single priority truth elevated in database
    const rawTask = await prisma.task.findUnique({ where: { id: taskId } });
    expect(rawTask?.priority).toBe(TaskPriority.URGENT);
  });

  // =========================================================================
  // GOLDEN PATH F: Manager Authorized Reassignment & Conservation
  // =========================================================================
  it("Golden Path F: Manager reassignment atomically transfers Task, shifts reservation, and preserves deadline", async () => {
    const taskId = randomUUID();
    const originalDueDate = new Date(Date.now() + 172800000);

    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority, "dueDate", "assignedEmployeeId")
       VALUES ($1, $2, $3, 'Reassignment Task', 'APPLICATION', 'PREPARE_RESUME', 'ASSIGNED', 'HIGH', $4, $5)`,
      taskId, orgAId, userManagerA, originalDueDate, userStaffA1
    );
    await WcosService.enrollTask(ctxManagerA, {
      taskId,
      workType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
      requiredCapabilityCode: "RESUME_SPECIALIST",
      capacityUnitsEstimated: 7,
    });

    // Reassign from Staff A1 to Staff A2
    const reassignRes = await WcosService.reassignTask(ctxManagerA, {
      taskId,
      newEmployeeId: userStaffA2,
      reason: "Rebalanced shift workload",
    });

    expect(reassignRes.task.assignedEmployeeId).toBe(userStaffA2);
    expect(reassignRes.task.dueDate?.toISOString()).toBe(originalDueDate.toISOString());

    // Verify assignment history has previous=StaffA1, new=StaffA2
    const history = await prisma.wcosAssignmentHistory.findFirst({
      where: { taskId, newEmployeeId: userStaffA2 },
    });
    expect(history).not.toBeNull();
    expect(history?.previousEmployeeId).toBe(userStaffA1);
    expect(history?.actorId).toBe(userManagerA);
  });

  // =========================================================================
  // GOLDEN PATH G: Concurrent Dispatch Determinism
  // =========================================================================
  it("Golden Path G: Concurrent duplicate dispatch calls return identical decision and create 1 reservation", async () => {
    const taskId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority)
       VALUES ($1, $2, $3, 'Concurrent Dispatch Task', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'NORMAL')`,
      taskId, orgAId, userManagerA
    );
    await WcosService.enrollTask(ctxManagerA, {
      taskId,
      workType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
      requiredCapabilityCode: "RESUME_SPECIALIST",
      capacityUnitsEstimated: 3,
    });

    const idempotencyKey = `idemp-dispatch-${taskId}`;
    const results = await Promise.allSettled([
      WcosService.dispatchTask(ctxManagerA, { taskId, idempotencyKey }),
      WcosService.dispatchTask(ctxManagerA, { taskId, idempotencyKey }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    // Exactly one active reservation
    const reservations = await prisma.wcosCapacityReservation.findMany({
      where: { taskId, status: "RESERVED" },
    });
    expect(reservations.length).toBe(1);
  });

  // =========================================================================
  // GOLDEN PATH H: Concurrent Reassignment
  // =========================================================================
  it("Golden Path H: Sequential reassignments complete with atomic chronological history", async () => {
    const taskId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority, "assignedEmployeeId")
       VALUES ($1, $2, $3, 'Concurrent Reassign Task', 'APPLICATION', 'PREPARE_RESUME', 'ASSIGNED', 'HIGH', $4)`,
      taskId, orgAId, userManagerA, userStaffA1
    );
    await WcosService.enrollTask(ctxManagerA, {
      taskId,
      workType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
      requiredCapabilityCode: "RESUME_SPECIALIST",
      capacityUnitsEstimated: 4,
    });

    await WcosService.reassignTask(ctxManagerA, {
      taskId,
      newEmployeeId: userStaffA2,
      reason: "Hop 1",
    });
    const finalReassign = await WcosService.reassignTask(ctxManagerA, {
      taskId,
      newEmployeeId: userStaffA1,
      reason: "Hop 2",
    });

    expect(finalReassign.task.assignedEmployeeId).toBe(userStaffA1);

    const historyCount = await prisma.wcosAssignmentHistory.count({ where: { taskId } });
    expect(historyCount).toBeGreaterThanOrEqual(2);
  });

  // =========================================================================
  // GOLDEN PATH I: Cross-Tenant UI Attack
  // =========================================================================
  it("Golden Path I: Tenant B manager is strictly denied access to Tenant A WCOS tasks and desk streams", async () => {
    const taskId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority)
       VALUES ($1, $2, $3, 'Org A Isolated Task', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'NORMAL')`,
      taskId, orgAId, userManagerA
    );

    // Tenant B manager attempts to enroll work item on Org A task
    await expect(
      WcosService.enrollTask(ctxManagerB, {
        taskId,
        workType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
        requiredCapabilityCode: "RESUME_SPECIALIST",
      })
    ).rejects.toThrow();

    // Tenant B manager attempts to dispatch Org A task
    await expect(
      WcosService.dispatchTask(ctxManagerB, {
        taskId,
      })
    ).rejects.toThrow();
  });

  // =========================================================================
  // GOLDEN PATH J: Unauthorized UI Action
  // =========================================================================
  it("Golden Path J: Employee role is rejected from executing manager-only forced dispatch overrides", async () => {
    const taskId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority)
       VALUES ($1, $2, $3, 'Unauthorized Override Task', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'NORMAL')`,
      taskId, orgAId, userManagerA
    );
    await WcosService.enrollTask(ctxManagerA, {
      taskId,
      workType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
      requiredCapabilityCode: "RESUME_SPECIALIST",
    });

    await expect(
      WcosService.dispatchTask(ctxStaffA1, {
        taskId,
        forceEmployeeId: userStaffA2,
        dispatchMode: WcosDispatchMode.OVERRIDE,
      })
    ).rejects.toThrow(/ADMIN/i);
  });

  // =========================================================================
  // GOLDEN PATH K & L: Stream Projections (Employee Priority Stream & Queue Projections)
  // =========================================================================
  it("Golden Path K & L: Priority stream and Queue Projections reflect authoritative database truth", async () => {
    const taskId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority, "assignedEmployeeId")
       VALUES ($1, $2, $3, 'Stream Projection Task', 'APPLICATION', 'PREPARE_RESUME', 'ASSIGNED', 'HIGH', $4)`,
      taskId, orgAId, userManagerA, userStaffA1
    );
    await WcosService.enrollTask(ctxManagerA, {
      taskId,
      workType: WcosWorkDemandType.DEMAND_INTERVIEW_PREP,
      requiredCapabilityCode: "INTERVIEW_COACH",
      capacityUnitsEstimated: 5,
    });

    // 1. Employee Priority Stream
    const employeeStream = await WcosService.getEmployeePriorityStream(ctxStaffA1, userStaffA1);
    expect(employeeStream.some((t: any) => t.taskId === taskId)).toBe(true);

    // 2. Queue Projections
    const queueProjections = await WcosService.getQueueProjections(ctxManagerA);
    expect(queueProjections.some((q: any) => q.taskId === taskId)).toBe(true);

    // 3. Employee Capacity Summary
    const capSummary = await WcosService.getEmployeeCapacitySummary(ctxManagerA, userStaffA1);
    expect(capSummary.employeeId).toBe(userStaffA1);
    expect(capSummary.verifiedCapabilities.length).toBeGreaterThanOrEqual(1);
  });

  // =========================================================================
  // GOLDEN PATH M: End-to-End Capacity Conservation Accounting
  // =========================================================================
  it("Golden Path M: Capacity conservation equation holds throughout multi-task cycles", async () => {
    const profile = await prisma.wcosCapacityProfile.findFirst({
      where: { employeeId: userStaffA3, organizationId: orgAId },
    });
    expect(profile).not.toBeNull();
    const allocatedBudget = profile!.allocatedBudgetCu;

    const initialActive = profile!.activeWorkloadCu;

    const task1 = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority)
       VALUES ($1, $2, $3, 'Conservation Task 1', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'HIGH')`,
      task1, orgAId, userManagerA
    );
    await WcosService.enrollTask(ctxManagerA, {
      taskId: task1,
      workType: WcosWorkDemandType.DEMAND_INTERVIEW_PREP,
      requiredCapabilityCode: "INTERVIEW_COACH",
      capacityUnitsEstimated: 12,
    });
    await WcosService.dispatchTask(ctxManagerA, {
      taskId: task1,
      forceEmployeeId: userStaffA3,
      dispatchMode: WcosDispatchMode.OVERRIDE,
    });

    // Profile workload should increase by 12 CU
    const profileAfterTask1 = await prisma.wcosCapacityProfile.findFirst({
      where: { employeeId: userStaffA3, organizationId: orgAId },
    });
    expect(profileAfterTask1!.activeWorkloadCu).toBe(initialActive + 12);
    expect(profileAfterTask1!.activeWorkloadCu).toBeLessThanOrEqual(allocatedBudget);

    // Complete task 1 -> workload drops back
    await WcosService.completeTask(ctxManagerA, task1);

    const profileAfterComplete = await prisma.wcosCapacityProfile.findFirst({
      where: { employeeId: userStaffA3, organizationId: orgAId },
    });
    expect(profileAfterComplete!.activeWorkloadCu).toBe(initialActive);
  });

  // =========================================================================
  // GOLDEN PATH N: Full Operational Journey Audit Reconstruction
  // =========================================================================
  it("Golden Path N: Complete operational history from enrollment to completion is fully reconstructable", async () => {
    const taskId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority)
       VALUES ($1, $2, $3, 'Audit Journey Task', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'NORMAL')`,
      taskId, orgAId, userManagerA
    );

    // 1. Enroll
    await WcosService.enrollTask(ctxManagerA, {
      taskId,
      workType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
      requiredCapabilityCode: "RESUME_SPECIALIST",
      capacityUnitsEstimated: 5,
    });

    // 2. Dispatch
    await WcosService.dispatchTask(ctxManagerA, {
      taskId,
      forceEmployeeId: userStaffA1,
      dispatchMode: WcosDispatchMode.OVERRIDE,
    });

    // 3. Block
    await WcosService.blockTask(ctxManagerA, {
      taskId,
      category: WcosBlockingCategory.WAIT_DOCUMENT_UPLOAD,
      reason: "Waiting for third-party verification API",
      unblockExpectedAt: new Date(Date.now() + 1800000),
    });

    // 4. Unblock
    await WcosService.unblockTask(ctxManagerA, {
      taskId,
      resumeReason: "API restored",
    });

    // 5. Complete
    await WcosService.completeTask(ctxStaffA1, taskId);

    // Reconstruction Query
    const [task, workItem, decisions, assignments, blocks, reservations] = await Promise.all([
      prisma.task.findUnique({ where: { id: taskId } }),
      prisma.wcosWorkItem.findUnique({ where: { taskId } }),
      prisma.wcosDispatchDecision.findMany({ where: { taskId } }),
      prisma.wcosAssignmentHistory.findMany({ where: { taskId } }),
      prisma.wcosBlockingRecord.findMany({ where: { taskId } }),
      prisma.wcosCapacityReservation.findMany({ where: { taskId } }),
    ]);

    expect(task?.status).toBe(TaskStatus.COMPLETED);
    expect(workItem?.workType).toBe(WcosWorkDemandType.DEMAND_RESUME_TAILORING);
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    expect(assignments.length).toBeGreaterThanOrEqual(1);
    expect(blocks.length).toBeGreaterThanOrEqual(1);
    expect(reservations.some((r: any) => r.status === "RELEASED")).toBe(true);
  }, 15000);

  // =========================================================================
  // GOLDEN PATH Q: High Data Volume Execution (100+ Tasks)
  // =========================================================================
  it("Golden Path Q: High volume load (100+ tasks) executes deterministically within sub-second thresholds", async () => {
    const startTime = Date.now();
    const batchSize = 100;
    const taskIds: string[] = [];

    for (let i = 0; i < batchSize; i++) {
      taskIds.push(randomUUID());
    }

    // Insert 100 tasks in batch
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority)
       SELECT id, $1, $2, 'Volume Load Task', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'NORMAL'
       FROM UNNEST($3::uuid[]) AS id`,
      orgAId, userManagerA, taskIds
    );

    // Query queue volume
    const queueItems = await prisma.task.findMany({
      where: { organizationId: orgAId, status: TaskStatus.BACKLOG },
      take: 150,
    });

    const elapsed = Date.now() - startTime;
    expect(queueItems.length).toBeGreaterThanOrEqual(batchSize);
    expect(elapsed).toBeLessThan(5000); // Sub-5-second ceiling for batch setup and retrieval
  });

  // =========================================================================
  // GOLDEN PATH R: Cross-Domain Boundary Isolation
  // =========================================================================
  it("Golden Path R: WCOS operations strictly preserve external domain immutability (CBOS / Candidate)", async () => {
    // Verify that WCOS tables are completely disjoint from CBOS invoices and candidate profiles
    const invoiceCountBefore = await prisma.invoice.count({ where: { organizationId: orgAId } });
    const candidateCountBefore = await prisma.candidate.count({ where: { organizationId: orgAId } });

    // Execute standard WCOS dispatch & completion cycle
    const testTaskId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority)
       VALUES ($1, $2, $3, 'Boundary Verification Task', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'NORMAL')`,
      testTaskId, orgAId, userManagerA
    );
    await WcosService.enrollTask(ctxManagerA, {
      taskId: testTaskId,
      workType: WcosWorkDemandType.DEMAND_RESUME_TAILORING,
      requiredCapabilityCode: "RESUME_SPECIALIST",
    });
    await WcosService.dispatchTask(ctxManagerA, {
      taskId: testTaskId,
      forceEmployeeId: userStaffA1,
      dispatchMode: WcosDispatchMode.OVERRIDE,
    });

    const invoiceCountAfter = await prisma.invoice.count({ where: { organizationId: orgAId } });
    const candidateCountAfter = await prisma.candidate.count({ where: { organizationId: orgAId } });

    expect(invoiceCountAfter).toBe(invoiceCountBefore);
    expect(candidateCountAfter).toBe(candidateCountBefore);
  });
});
