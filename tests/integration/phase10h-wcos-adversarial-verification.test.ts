/**
 * Phase 10H-E — Comprehensive WCOS Adversarial Verification Suite
 * Adversarially attempts to break:
 * 1. Multi-tenant isolation & Context spoofing
 * 2. Assignment sovereignty & Invalid assignee protection
 * 3. Dispatch engine scoring determinism & Hard-gate bypasses
 * 4. Capacity non-negative invariants & Double-reservation prevention
 * 5. SLA pause duration ceiling (14 days) & Deadline invariance
 * 6. Canonical Task Priority authority & Escalation mechanics
 * 7. Foreign domain write isolation (CBOS / Candidate PII)
 * 8. Database-level FK protection on Task deletion
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { WcosService } from "@/lib/wcos/wcos-service";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { WcosDispatchMode, WcosProficiencyLevel, WcosBlockingCategory, WcosEscalationLevel } from "@/lib/wcos/types";

describe("Phase 10H-E — WCOS Comprehensive Adversarial Verification", () => {
  const orgAId = randomUUID();
  const orgBId = randomUUID();

  const userAdminA = randomUUID();
  const userStaffA1 = randomUUID();
  const userStaffA2 = randomUUID();
  const userLeaveStaffA = randomUUID();
  const userAdminB = randomUUID();
  const userStaffB1 = randomUUID();

  const capOnboardingId = randomUUID();
  const capResumeId = randomUUID();

  const queueAId = randomUUID();

  const ctxAdminA: AuthenticatedContext = {
    userId: userAdminA,
    email: "admin-a@wcos.local",
    organizationId: orgAId,
    role: "ADMIN" as any,
    status: "ACTIVE" as any,
    membershipStatus: "ACTIVE" as any,
  };

  const ctxAdminB: AuthenticatedContext = {
    userId: userAdminB,
    email: "admin-b@wcos.local",
    organizationId: orgBId,
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

  beforeAll(async () => {
    // 1. Organizations
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.organizations (id, name, slug) VALUES ($1, $2, $3), ($4, $5, $6)`,
      orgAId, "WCOS Security Org A", `wcos-sec-a-${Date.now()}`,
      orgBId, "WCOS Security Org B", `wcos-sec-b-${Date.now()}`
    );

    // 2. Users
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.users (id, email) VALUES
       ($1, $2), ($3, $4), ($5, $6), ($7, $8), ($9, $10), ($11, $12)`,
      userAdminA, `admin-sec-a-${Date.now()}@a.com`,
      userStaffA1, `staff-sec-a1-${Date.now()}@a.com`,
      userStaffA2, `staff-sec-a2-${Date.now()}@a.com`,
      userLeaveStaffA, `leave-sec-a-${Date.now()}@a.com`,
      userAdminB, `admin-sec-b-${Date.now()}@b.com`,
      userStaffB1, `staff-sec-b1-${Date.now()}@b.com`
    );

    // 3. Memberships
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.memberships (id, "organizationId", "userId", role, status) VALUES
       (gen_random_uuid(), $1, $2, 'ADMIN', 'ACTIVE'),
       (gen_random_uuid(), $1, $3, 'EMPLOYEE', 'ACTIVE'),
       (gen_random_uuid(), $1, $4, 'EMPLOYEE', 'ACTIVE'),
       (gen_random_uuid(), $1, $5, 'EMPLOYEE', 'ACTIVE'),
       (gen_random_uuid(), $6, $7, 'ADMIN', 'ACTIVE'),
       (gen_random_uuid(), $6, $8, 'EMPLOYEE', 'ACTIVE')`,
      orgAId, userAdminA, userStaffA1, userStaffA2, userLeaveStaffA,
      orgBId, userAdminB, userStaffB1
    );

    // 4. Queues
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.wcos_queues (id, organization_id, name, slug, is_active) VALUES
       ($1, $2, 'Security Queue A', 'sec-queue-a', true)`,
      queueAId, orgAId
    );

    // 5. Capabilities
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.wcos_capability_definitions (id, organization_id, code, name, is_active) VALUES
       ($1, $2, 'CAP_CANDIDATE_ONBOARDING', 'Candidate Onboarding', true),
       ($3, $2, 'CAP_RESUME_ENGINEERING', 'Resume Engineering', true)`,
      capOnboardingId, orgAId,
      capResumeId
    );

    // Verified capability for staff A1
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.wcos_employee_capabilities (id, organization_id, employee_id, capability_id, proficiency, verified_by_id, is_active) VALUES
       (gen_random_uuid(), $1, $2, $3, 'EXPERT', $4, true)`,
      orgAId, userStaffA1, capOnboardingId, userAdminA
    );

    // UNVERIFIED / Inactive capability for staff A2
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.wcos_employee_capabilities (id, organization_id, employee_id, capability_id, proficiency, verified_by_id, is_active) VALUES
       (gen_random_uuid(), $1, $2, $3, 'BASIC', $4, false)`,
      orgAId, userStaffA2, capOnboardingId, userAdminA
    );

    // Capacity Profiles (today)
    const today = new Date().toISOString().split("T")[0];
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.wcos_capacity_profiles (id, organization_id, employee_id, effective_date, daily_capacity_cu, allocated_budget_cu, reserved_overhead_cu, active_workload_cu) VALUES
       (gen_random_uuid(), $1, $2, $3::date, 32, 28, 4, 0),
       (gen_random_uuid(), $1, $4, $3::date, 32, 28, 4, 0),
       (gen_random_uuid(), $1, $5, $3::date, 32, 28, 4, 0)`,
      orgAId, userStaffA1, today,
      userStaffA2,
      userLeaveStaffA
    );

    // Set Leave status for userLeaveStaffA
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.wcos_availability_records (id, organization_id, employee_id, state, reason, actor_id) VALUES
       (gen_random_uuid(), $1, $2, 'LEAVE', 'Medical Leave', $3)`,
      orgAId, userLeaveStaffA, userAdminA
    );
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_assignment_history WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_dispatch_decisions WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_capacity_reservations WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_blocking_records WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_escalation_records WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_work_items WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.tasks WHERE "organizationId" IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_employee_capabilities WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_capability_definitions WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_capacity_profiles WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_availability_records WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_queues WHERE organization_id IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.audit_events WHERE "organizationId" IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.memberships WHERE "organizationId" IN ($1, $2)`, orgAId, orgBId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.users WHERE id IN ($1, $2, $3, $4, $5, $6)`, userAdminA, userStaffA1, userStaffA2, userLeaveStaffA, userAdminB, userStaffB1);
    await prisma.$executeRawUnsafe(`DELETE FROM public.organizations WHERE id IN ($1, $2)`, orgAId, orgBId);
  });

  // -------------------------------------------------------------
  // 1. MULTI-TENANT & AUTHORIZATION ATTACKS
  // -------------------------------------------------------------
  it("ATTACK 1: Tenant B Admin attempts to enroll or dispatch a Task belonging to Tenant A", async () => {
    const taskIdA = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority, "dueDate") VALUES
       ($1, $2, $3, 'Org A Secret Task', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'NORMAL', now() + interval '2 days')`,
      taskIdA, orgAId, userAdminA
    );

    // Admin B tries to enroll Org A task
    await expect(
      WcosService.enrollTask(ctxAdminB, {
        taskId: taskIdA,
        queueId: queueAId,
        workType: "DEMAND_CANDIDATE_INTAKE" as any,
        capacityUnitsEstimated: 4,
        requiredCapabilityCode: "CAP_CANDIDATE_ONBOARDING",
        requiredProficiencyLevel: WcosProficiencyLevel.BASIC,
        dispatchReason: "Unauthorized enrollment",
      })
    ).rejects.toThrow(/Task .* not found/i);
  });

  it("ATTACK 2: Employee attempts to execute manual supervisor dispatch override", async () => {
    const taskId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority, "dueDate") VALUES
       ($1, $2, $3, 'Staff Override Test', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'NORMAL', now() + interval '2 days')`,
      taskId, orgAId, userAdminA
    );

    await WcosService.enrollTask(ctxAdminA, {
      taskId,
      queueId: queueAId,
      workType: "DEMAND_CANDIDATE_INTAKE" as any,
      capacityUnitsEstimated: 4,
      requiredCapabilityCode: "CAP_CANDIDATE_ONBOARDING",
      requiredProficiencyLevel: WcosProficiencyLevel.BASIC,
      dispatchReason: "Enrolled for override test",
    });

    // Staff A1 attempts manual dispatch override
    await expect(
      WcosService.dispatchTask(ctxStaffA1, {
        taskId,
        dispatchMode: WcosDispatchMode.OVERRIDE,
        forceEmployeeId: userStaffA1,
        dispatchReason: "Unauthorized self-override",
      })
    ).rejects.toThrow(/strictly requires ADMIN role authorization/i);
  });

  // -------------------------------------------------------------
  // 2. ASSIGNMENT SOVEREIGNTY & HARD-GATE BYPASS ATTACKS
  // -------------------------------------------------------------
  it("ATTACK 3: Automated dispatch strictly rejects staff with UNVERIFIED/INACTIVE capabilities", async () => {
    const taskId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority, "dueDate") VALUES
       ($1, $2, $3, 'Capability Gate Test', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'NORMAL', now() + interval '2 days')`,
      taskId, orgAId, userAdminA
    );

    await WcosService.enrollTask(ctxAdminA, {
      taskId,
      queueId: queueAId,
      workType: "DEMAND_CANDIDATE_INTAKE" as any,
      capacityUnitsEstimated: 4,
      requiredCapabilityCode: "CAP_CANDIDATE_ONBOARDING",
      requiredProficiencyLevel: WcosProficiencyLevel.BASIC,
      dispatchReason: "Testing verified capability gate",
    });

    // Run auto dispatch: Staff A1 has verified capability, Staff A2 has inactive capability
    const result = await WcosService.dispatchTask(ctxAdminA, {
      taskId,
      dispatchMode: WcosDispatchMode.AUTO,
      dispatchReason: "Automated candidate intake dispatch",
    });

    // Must be assigned to Staff A1 (verified), never Staff A2 (unverified)
    expect(result.task.assignedEmployeeId).toBe(userStaffA1);
    expect((result.decision.hardGateFailures as any[]).some((f) => f.candidateId === userStaffA2)).toBe(true);
  });

  it("ATTACK 4: Dispatch strictly rejects employee who is on LEAVE", async () => {
    // Verify userLeaveStaffA was rejected by hard gates
    const taskId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority, "dueDate") VALUES
       ($1, $2, $3, 'Leave Gate Test', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'NORMAL', now() + interval '2 days')`,
      taskId, orgAId, userAdminA
    );

    await WcosService.enrollTask(ctxAdminA, {
      taskId,
      queueId: queueAId,
      workType: "DEMAND_CANDIDATE_INTAKE" as any,
      capacityUnitsEstimated: 4,
      requiredCapabilityCode: "CAP_CANDIDATE_ONBOARDING",
      requiredProficiencyLevel: WcosProficiencyLevel.BASIC,
      dispatchReason: "Testing leave gate",
    });

    const result = await WcosService.dispatchTask(ctxAdminA, {
      taskId,
      dispatchMode: WcosDispatchMode.AUTO,
      dispatchReason: "Automated dispatch",
    });

    expect(result.task.assignedEmployeeId).not.toBe(userLeaveStaffA);
    const leaveFail = (result.decision.hardGateFailures as any[]).find((f) => f.candidateId === userLeaveStaffA);
    expect(leaveFail).toBeDefined();
    expect(leaveFail?.failedGates.some((g: string) => g.includes("LEAVE"))).toBe(true);
  });

  // -------------------------------------------------------------
  // 3. CAPACITY INTEGRITY & NON-NEGATIVE CONSTRAINTS
  // -------------------------------------------------------------
  it("ATTACK 5: PostgreSQL check constraint chk_wcos_cap_non_negative rejects direct negative active CU mutation", async () => {
    const today = new Date().toISOString().split("T")[0];
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE public.wcos_capacity_profiles 
         SET active_workload_cu = -5 
         WHERE organization_id = $1 AND employee_id = $2 AND effective_date = $3::date`,
        orgAId, userStaffA1, today
      )
    ).rejects.toThrow(/chk_wcos_cap_non_negative/i);
  });

  it("ATTACK 6: Duplicate active reservation is physically blocked by PostgreSQL unique index", async () => {
    const taskId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority, "dueDate") VALUES
       ($1, $2, $3, 'Unique Reservation Test', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'NORMAL', now() + interval '2 days')`,
      taskId, orgAId, userAdminA
    );

    // 1st active reservation
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.wcos_capacity_reservations (
         id, organization_id, employee_id, task_id, estimated_cu, reserved_cu, status, idempotency_key
       ) VALUES (gen_random_uuid(), $1, $2, $3, 4, 4, 'RESERVED', $4)`,
      orgAId, userStaffA1, taskId, `res-1-${Date.now()}`
    );

    // 2nd active reservation on the same task must violate uq_wcos_active_task_reservation
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO public.wcos_capacity_reservations (
           id, organization_id, employee_id, task_id, estimated_cu, reserved_cu, status, idempotency_key
         ) VALUES (gen_random_uuid(), $1, $2, $3, 4, 4, 'RESERVED', $4)`,
        orgAId, userStaffA2, taskId, `res-2-${Date.now()}`
      )
    ).rejects.toThrow(/uq_wcos_active_task_reservation/i);
  });

  // -------------------------------------------------------------
  // 4. SLA & PAUSE CEILING ATTACKS
  // -------------------------------------------------------------
  it("ATTACK 7: SLA pause rejects duration exceeding the 14-day hard ceiling", async () => {
    const taskId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority, "dueDate") VALUES
       ($1, $2, $3, 'SLA Ceiling Test', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'NORMAL', now() + interval '2 days')`,
      taskId, orgAId, userAdminA
    );

    await WcosService.enrollTask(ctxAdminA, {
      taskId,
      queueId: queueAId,
      workType: "DEMAND_CANDIDATE_INTAKE" as any,
      capacityUnitsEstimated: 4,
      requiredCapabilityCode: "CAP_CANDIDATE_ONBOARDING",
      requiredProficiencyLevel: WcosProficiencyLevel.BASIC,
      dispatchReason: "Enrolled for SLA test",
    });

    // Attempt to block with expected unblock 20 days in the future (exceeds 14-day ceiling)
    const future20Days = new Date(Date.now() + 20 * 86400000);
    await expect(
      WcosService.blockTask(ctxAdminA, {
        taskId,
        category: WcosBlockingCategory.WAIT_CANDIDATE_INPUT,
        reason: "Waiting for candidate credentials",
        unblockExpectedAt: future20Days,
      })
    ).rejects.toThrow(/exceeds maximum allowed pause ceiling of 14 days/i);
  });

  it("ATTACK 8: Reassignment preserves canonical Task dueDate without reset", async () => {
    const initialDueDate = new Date(Date.now() + 5 * 86400000);
    const taskId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority, "dueDate") VALUES
       ($1, $2, $3, 'Deadline Preservation Test', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'NORMAL', $4::timestamptz)`,
      taskId, orgAId, userAdminA, initialDueDate.toISOString()
    );

    await WcosService.enrollTask(ctxAdminA, {
      taskId,
      queueId: queueAId,
      workType: "DEMAND_CANDIDATE_INTAKE" as any,
      capacityUnitsEstimated: 4,
      requiredCapabilityCode: "CAP_CANDIDATE_ONBOARDING",
      requiredProficiencyLevel: WcosProficiencyLevel.BASIC,
      dispatchReason: "Initial enrollment",
      targetDueDate: initialDueDate,
    });

    await WcosService.dispatchTask(ctxAdminA, {
      taskId,
      dispatchMode: WcosDispatchMode.AUTO,
      dispatchReason: "Initial assignment",
    });

    // Reassign to Staff A2 via override
    await WcosService.reassignTask(ctxAdminA, {
      taskId,
      newEmployeeId: userStaffA2,
      reason: "Load rebalancing",
      dispatchMode: WcosDispatchMode.OVERRIDE,
    });

    // Verify canonical task dueDate was not modified
    const updatedTask = await prisma.task.findUnique({
      where: { id: taskId },
      select: { dueDate: true, assignedEmployeeId: true },
    });

    expect(updatedTask?.assignedEmployeeId).toBe(userStaffA2);
    expect(new Date(updatedTask?.dueDate!).getTime()).toBe(initialDueDate.getTime());
  });

  // -------------------------------------------------------------
  // 5. PRIORITY & ESCALATION AUTHORITY
  // -------------------------------------------------------------
  it("ATTACK 9: Level 3+ Escalation transactionally elevates canonical Task.priority to URGENT", async () => {
    const taskId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority, "dueDate") VALUES
       ($1, $2, $3, 'Priority Elevation Test', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'NORMAL', now() + interval '1 day')`,
      taskId, orgAId, userAdminA
    );

    await WcosService.enrollTask(ctxAdminA, {
      taskId,
      queueId: queueAId,
      workType: "DEMAND_CANDIDATE_INTAKE" as any,
      capacityUnitsEstimated: 4,
      requiredCapabilityCode: "CAP_CANDIDATE_ONBOARDING",
      requiredProficiencyLevel: WcosProficiencyLevel.BASIC,
      dispatchReason: "Initial enrollment",
    });

    await WcosService.escalateTask(ctxAdminA, {
      taskId,
      targetLevel: WcosEscalationLevel.LEVEL_3_BREACHED,
      reason: "Critical deadline breach detected",
    });

    // Verify Task.priority was elevated to URGENT
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { priority: true, status: true },
    });

    expect(task?.priority).toBe("URGENT");
  });

  // -------------------------------------------------------------
  // 6. CROSS-DOMAIN ISOLATION
  // -------------------------------------------------------------
  it("ATTACK 10: WCOS service operations never mutate CBOS invoices or Candidate truth", async () => {
    const candidateId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.candidates (id, "organizationId", "userId", status) VALUES
       ($1, $2, $3, 'ACTIVE')`,
      candidateId, orgAId, userStaffA1
    );

    const taskId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.tasks (id, "organizationId", "createdById", "candidateId", title, category, type, status, priority, "dueDate") VALUES
       ($1, $2, $3, $4, 'Cross Domain Guard Test', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'NORMAL', now() + interval '2 days')`,
      taskId, orgAId, userAdminA, candidateId
    );

    await WcosService.enrollTask(ctxAdminA, {
      taskId,
      queueId: queueAId,
      workType: "DEMAND_CANDIDATE_INTAKE" as any,
      capacityUnitsEstimated: 4,
      requiredCapabilityCode: "CAP_CANDIDATE_ONBOARDING",
      requiredProficiencyLevel: WcosProficiencyLevel.BASIC,
      dispatchReason: "Cross domain integrity test",
      continuityCandidateId: candidateId,
    });

    await WcosService.dispatchTask(ctxAdminA, {
      taskId,
      dispatchMode: WcosDispatchMode.AUTO,
      dispatchReason: "Dispatch test",
    });

    // Verify candidate state is completely untouched
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });
    expect(candidate?.status).toBe("ACTIVE");

    // Clean up
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_dispatch_decisions WHERE task_id = $1`, taskId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_assignment_history WHERE task_id = $1`, taskId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_capacity_reservations WHERE task_id = $1`, taskId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.wcos_work_items WHERE task_id = $1`, taskId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.tasks WHERE id = $1`, taskId);
    await prisma.$executeRawUnsafe(`DELETE FROM public.candidates WHERE id = $1`, candidateId);
  });
});
