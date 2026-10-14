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
  WcosReservationStatus,
  TaskStatus,
  TaskPriority,
  TaskCategory,
  TaskType,
  Role,
} from "@/lib/wcos/types";
import { AuthorizationError, ConflictError } from "@/lib/errors";
import type { AuthenticatedContext } from "@/lib/auth/context";

describe("Phase 10H-D — WCOS Adversarial Security & Invariant Verification", () => {
  let orgAId: string;
  let orgBId: string;
  let adminOrgAUserId: string;
  let adminOrgBUserId: string;
  let employeeOrgAId: string;
  let candidateUserId: string;
  let adminOrgAContext: AuthenticatedContext;
  let adminOrgBContext: AuthenticatedContext;
  let candidateContext: AuthenticatedContext;
  let capabilityCode = "CAP_QA_COMPLIANCE";

  beforeEach(async () => {
    // 1. Create Organization A
    const orgA = await prisma.organization.create({
      data: {
        name: `Org A ${Date.now()}`,
        slug: `org-a-${Date.now()}-${randomUUID().slice(0, 6)}`,
      },
    });
    orgAId = orgA.id;

    // 2. Create Organization B
    const orgB = await prisma.organization.create({
      data: {
        name: `Org B ${Date.now()}`,
        slug: `org-b-${Date.now()}-${randomUUID().slice(0, 6)}`,
      },
    });
    orgBId = orgB.id;

    // 3. Admin A
    adminOrgAUserId = randomUUID();
    await prisma.user.create({
      data: {
        id: adminOrgAUserId,
        email: `admin-a-${Date.now()}@test.com`,
        status: "ACTIVE",
        memberships: {
          create: {
            organizationId: orgAId,
            role: Role.ADMIN,
            status: "ACTIVE",
          },
        },
      },
    });
    adminOrgAContext = {
      userId: adminOrgAUserId,
      email: "admin-a@test.com",
      organizationId: orgAId,
      role: Role.ADMIN,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };

    // 4. Admin B
    adminOrgBUserId = randomUUID();
    await prisma.user.create({
      data: {
        id: adminOrgBUserId,
        email: `admin-b-${Date.now()}@test.com`,
        status: "ACTIVE",
        memberships: {
          create: {
            organizationId: orgBId,
            role: Role.ADMIN,
            status: "ACTIVE",
          },
        },
      },
    });
    adminOrgBContext = {
      userId: adminOrgBUserId,
      email: "admin-b@test.com",
      organizationId: orgBId,
      role: Role.ADMIN,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };

    // 5. Employee in Org A
    employeeOrgAId = randomUUID();
    await prisma.user.create({
      data: {
        id: employeeOrgAId,
        email: `emp-a-${Date.now()}@test.com`,
        status: "ACTIVE",
        memberships: {
          create: {
            organizationId: orgAId,
            role: Role.EMPLOYEE,
            status: "ACTIVE",
          },
        },
      },
    });

    // 6. Candidate User
    candidateUserId = randomUUID();
    await prisma.user.create({
      data: {
        id: candidateUserId,
        email: `cand-${Date.now()}@test.com`,
        status: "ACTIVE",
        memberships: {
          create: {
            organizationId: orgAId,
            role: Role.CANDIDATE,
            status: "ACTIVE",
          },
        },
      },
    });
    candidateContext = {
      userId: candidateUserId,
      email: "cand@test.com",
      organizationId: orgAId,
      role: Role.CANDIDATE,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };

    // 7. Register capability in Org A
    await WcosService.registerCapabilityDefinition(adminOrgAContext, {
      code: capabilityCode,
      name: "QA Compliance",
    });

    await WcosService.assignEmployeeCapability(adminOrgAContext, {
      employeeId: employeeOrgAId,
      capabilityCode,
      proficiency: WcosProficiencyLevel.ADVANCED,
    });
  });

  it("ADVERSARIAL: prevents cross-tenant dispatch and enrollment", async () => {
    // Create Task in Org A
    const taskA = await prisma.task.create({
      data: {
        organizationId: orgAId,
        title: "Org A Task",
        category: TaskCategory.QA,
        type: TaskType.APPLICATION_QA,
        status: TaskStatus.BACKLOG,
        createdById: adminOrgAUserId,
      },
    });

    // Admin B attempts to enroll Org A task -> must fail
    await expect(
      WcosService.enrollTask(adminOrgBContext, {
        taskId: taskA.id,
        workType: WcosWorkDemandType.DEMAND_APPLICATION_QA,
        requiredCapabilityCode: capabilityCode,
      })
    ).rejects.toThrowError(/not found in organization/);

    // Enroll in Org A
    await WcosService.enrollTask(adminOrgAContext, {
      taskId: taskA.id,
      workType: WcosWorkDemandType.DEMAND_APPLICATION_QA,
      requiredCapabilityCode: capabilityCode,
    });

    // Admin B attempts to dispatch Org A task -> must fail
    await expect(
      WcosService.dispatchTask(adminOrgBContext, {
        taskId: taskA.id,
        idempotencyKey: `adv-disp-${taskA.id}`,
      })
    ).rejects.toThrowError(/not found/);
  });

  it("ADVERSARIAL: prevents unauthorized Candidate role from performing WCOS actions", async () => {
    const taskA = await prisma.task.create({
      data: {
        organizationId: orgAId,
        title: "Org A Task 2",
        category: TaskCategory.QA,
        type: TaskType.APPLICATION_QA,
        status: TaskStatus.BACKLOG,
        createdById: adminOrgAUserId,
      },
    });

    // Candidate attempts to enroll work item
    await expect(
      WcosService.enrollTask(candidateContext, {
        taskId: taskA.id,
        workType: WcosWorkDemandType.DEMAND_APPLICATION_QA,
        requiredCapabilityCode: capabilityCode,
      })
    ).rejects.toThrow(AuthorizationError);

    // Candidate attempts to configure queue
    await expect(
      WcosService.createQueue(candidateContext, {
        name: "Hacker Queue",
        slug: "hacker-queue",
      })
    ).rejects.toThrow(AuthorizationError);
  });

  it("ADVERSARIAL: enforces capability verification and blocks unverified employees", async () => {
    // Create new employee WITHOUT verified capability
    const unverifiedEmpId = randomUUID();
    await prisma.user.create({
      data: {
        id: unverifiedEmpId,
        email: `unverified-${Date.now()}@test.com`,
        status: "ACTIVE",
        memberships: {
          create: {
            organizationId: orgAId,
            role: Role.EMPLOYEE,
            status: "ACTIVE",
          },
        },
      },
    });

    const task = await prisma.task.create({
      data: {
        organizationId: orgAId,
        title: "Specialist QA Task",
        category: TaskCategory.QA,
        type: TaskType.APPLICATION_QA,
        status: TaskStatus.BACKLOG,
        createdById: adminOrgAUserId,
      },
    });

    await WcosService.enrollTask(adminOrgAContext, {
      taskId: task.id,
      workType: WcosWorkDemandType.DEMAND_APPLICATION_QA,
      requiredCapabilityCode: capabilityCode,
      requiredProficiencyLevel: WcosProficiencyLevel.ADVANCED,
    });

    // Deactivate employeeOrgAId availability so only unverified employee is in pool
    await WcosService.setEmployeeAvailability(adminOrgAContext, {
      employeeId: employeeOrgAId,
      state: WcosAvailabilityState.UNAVAILABLE,
    });

    // Dispatch must fail because unverified employee lacks capability
    await expect(
      WcosService.dispatchTask(adminOrgAContext, {
        taskId: task.id,
        idempotencyKey: `disp-unver-${task.id}`,
      })
    ).rejects.toThrowError(/No eligible candidates available/);
  });

  it("ADVERSARIAL: prevents duplicate active reservations on same Task", async () => {
    const task = await prisma.task.create({
      data: {
        organizationId: orgAId,
        title: "Reservation Conflict Task",
        category: TaskCategory.QA,
        type: TaskType.APPLICATION_QA,
        status: TaskStatus.BACKLOG,
        createdById: adminOrgAUserId,
      },
    });

    await WcosService.enrollTask(adminOrgAContext, {
      taskId: task.id,
      workType: WcosWorkDemandType.DEMAND_APPLICATION_QA,
      requiredCapabilityCode: capabilityCode,
      capacityUnitsEstimated: 3,
    });

    // First dispatch succeeds
    await WcosService.dispatchTask(adminOrgAContext, {
      taskId: task.id,
      idempotencyKey: `disp-res-${task.id}-1`,
    });

    // Second dispatch on same task must fail with ConflictError
    await expect(
      WcosService.dispatchTask(adminOrgAContext, {
        taskId: task.id,
        idempotencyKey: `disp-res-${task.id}-2`,
      })
    ).rejects.toThrow(ConflictError);
  });

  it("ADVERSARIAL: prevents negative capacity drift in database", async () => {
    // Attempting to update capacity profile with negative workload that exceeds 0
    await expect(
      prisma.wcosCapacityProfile.create({
        data: {
          organizationId: orgAId,
          employeeId: employeeOrgAId,
          effectiveDate: new Date("2026-05-01"),
          dailyCapacityCu: 32,
          allocatedBudgetCu: 28,
          activeWorkloadCu: -5, // Violates check constraint chk_wcos_cap_non_negative
        },
      })
    ).rejects.toThrow();
  });
});
