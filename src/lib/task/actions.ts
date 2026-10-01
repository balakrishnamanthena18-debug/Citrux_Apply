"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedContext, requireEmployeeOrAdmin, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import {
  TaskCreateSchema,
  TaskUpdateSchema,
  TaskAssignSchema,
  TaskStatusTransitionSchema,
  TaskChecklistItemUpdateSchema,
  TaskGovernancePolicySchema,
  type TaskCreateInput,
  type TaskUpdateInput,
  type TaskAssignInput,
  type TaskStatusTransitionInput,
  type TaskChecklistItemUpdateInput,
  type TaskGovernancePolicyInput,
  type TaskGovernancePolicyOutput,
} from "@/lib/validation/task.schemas";
import { TaskStatus, Role, TaskChecklistItem, AuditAction } from "@/generated/prisma";
import { ALLOWED_TASK_TRANSITIONS } from "./constants";
import {
  verifyTaskPermission,
  getTaskGovernancePolicy,
  DEFAULT_TASK_GOVERNANCE_POLICY,
} from "./governance";
import {
  AuthorizationError,
  InvalidStateTransitionError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

function revalidateTaskViews(taskId?: string) {
  try {
    revalidatePath("/employee/tasks");
    revalidatePath("/admin/tasks");
    revalidatePath("/admin/tasks/escalations");
    revalidatePath("/employee");
    revalidatePath("/admin");
    if (taskId) {
      revalidatePath(`/employee/tasks/${taskId}`);
    }
  } catch {
    // Safe fallback when executed outside Next.js request context
  }
}

/**
 * Creates a new operational task with optional checklist items and context associations.
 * Restricted to EMPLOYEE and ADMIN roles.
 */
export async function createTaskAction(
  input: TaskCreateInput
): Promise<ActionResult<{ taskId: string }>> {
  const parsed = TaskCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    const task = await withRlsContext(ctx.userId, async (tx) => {
      // 0. Verify Task Creation Governance Access
      await verifyTaskPermission(tx, ctx, "create");

      // 1. Verify Assignee if provided
      if (parsed.data.assignedEmployeeId) {
        const staff = await tx.membership.findFirst({
          where: {
            userId: parsed.data.assignedEmployeeId,
            organizationId: ctx.organizationId,
            role: { in: [Role.EMPLOYEE, Role.ADMIN] },
            status: "ACTIVE",
          },
        });
        if (!staff) {
          throw new ValidationError("Assigned user is not an active staff member in this organization");
        }
      }

      // 2. Verify Candidate Linkage if provided
      if (parsed.data.candidateId) {
        const cand = await tx.candidate.findUnique({
          where: { id: parsed.data.candidateId, organizationId: ctx.organizationId },
        });
        if (!cand) throw new NotFoundError("Referenced candidate not found in organization");
      }

      // 3. Verify Job Linkage if provided
      if (parsed.data.jobId) {
        const job = await tx.job.findUnique({
          where: { id: parsed.data.jobId, organizationId: ctx.organizationId },
        });
        if (!job) throw new NotFoundError("Referenced job not found in organization");
      }

      // 4. Verify Application Linkage if provided
      if (parsed.data.applicationId) {
        const app = await tx.application.findUnique({
          where: { id: parsed.data.applicationId, organizationId: ctx.organizationId },
        });
        if (!app) throw new NotFoundError("Referenced application not found in organization");
      }

      const initialStatus = parsed.data.assignedEmployeeId
        ? TaskStatus.ASSIGNED
        : TaskStatus.BACKLOG;

      // 5. Create Task Record
      const createdTask = await tx.task.create({
        data: {
          organizationId: ctx.organizationId,
          title: parsed.data.title,
          description: parsed.data.description || null,
          category: parsed.data.category,
          type: parsed.data.type,
          status: initialStatus,
          priority: parsed.data.priority,
          dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
          assignedEmployeeId: parsed.data.assignedEmployeeId || null,
          candidateId: parsed.data.candidateId || null,
          jobId: parsed.data.jobId || null,
          applicationId: parsed.data.applicationId || null,
          createdById: ctx.userId,
        },
      });

      // 6. Create Initial Checklist Items
      if (parsed.data.checklistItems && parsed.data.checklistItems.length > 0) {
        await tx.taskChecklistItem.createMany({
          data: parsed.data.checklistItems.map((desc, idx) => ({
            taskId: createdTask.id,
            description: desc,
            orderIndex: idx,
          })),
        });
      }

      // 7. Record Initial State History
      await tx.taskStateHistory.create({
        data: {
          taskId: createdTask.id,
          fromStatus: initialStatus,
          toStatus: initialStatus,
          changedById: ctx.userId,
          reason: "Task created",
        },
      });

      return createdTask;
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "TASK_CREATED",
      entityType: "Task",
      entityId: task.id,
      details: {
        title: task.title,
        category: task.category,
        type: task.type,
        assignedEmployeeId: task.assignedEmployeeId,
      },
    });

    revalidateTaskViews(task.id);
    return { success: true, data: { taskId: task.id } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create task" };
  }
}

/**
 * Updates basic metadata of an operational task (title, description, priority, due date).
 * Restricted to EMPLOYEE and ADMIN roles.
 */
export async function updateTaskAction(
  input: TaskUpdateInput
): Promise<ActionResult> {
  const parsed = TaskUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    await withRlsContext(ctx.userId, async (tx) => {
      const task = await tx.task.findUnique({
        where: { id: parsed.data.taskId, organizationId: ctx.organizationId },
      });
      if (!task) throw new NotFoundError("Task not found");

      await tx.task.update({
        where: { id: task.id },
        data: {
          title: parsed.data.title !== undefined ? parsed.data.title : task.title,
          description: parsed.data.description !== undefined ? parsed.data.description : task.description,
          priority: parsed.data.priority !== undefined ? parsed.data.priority : task.priority,
          dueDate: parsed.data.dueDate !== undefined ? (parsed.data.dueDate ? new Date(parsed.data.dueDate) : null) : task.dueDate,
        },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "TASK_UPDATED",
      entityType: "Task",
      entityId: parsed.data.taskId,
    });

    revalidateTaskViews(parsed.data.taskId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update task" };
  }
}

/**
 * Assigns or reassigns an operational task to a staff member.
 * Task assignment represents operational ownership and NOT an authorization boundary.
 */
export async function assignTaskAction(
  input: TaskAssignInput
): Promise<ActionResult> {
  const parsed = TaskAssignSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    const result = await withRlsContext(ctx.userId, async (tx) => {
      // 0. Verify Task Assignment Governance Access
      await verifyTaskPermission(tx, ctx, "assign");

      const task = await tx.task.findUnique({
        where: { id: parsed.data.taskId, organizationId: ctx.organizationId },
      });
      if (!task) throw new NotFoundError("Task not found");

      if (parsed.data.assignedEmployeeId) {
        const staff = await tx.membership.findFirst({
          where: {
            userId: parsed.data.assignedEmployeeId,
            organizationId: ctx.organizationId,
            role: { in: [Role.EMPLOYEE, Role.ADMIN] },
            status: "ACTIVE",
          },
        });
        if (!staff) {
          throw new ValidationError("Target user is not an active staff member in this organization");
        }
      }

      let newStatus = task.status;
      const isReassignment = task.assignedEmployeeId && parsed.data.assignedEmployeeId && task.assignedEmployeeId !== parsed.data.assignedEmployeeId;

      if (!parsed.data.assignedEmployeeId) {
        newStatus = TaskStatus.BACKLOG;
      } else if (task.status === TaskStatus.BACKLOG) {
        newStatus = TaskStatus.ASSIGNED;
      } else if (isReassignment && (task.status === TaskStatus.ASSIGNED || task.status === TaskStatus.IN_PROGRESS)) {
        newStatus = TaskStatus.REASSIGNED;
      }

      await tx.task.update({
        where: { id: task.id },
        data: {
          assignedEmployeeId: parsed.data.assignedEmployeeId || null,
          status: newStatus,
        },
      });

      if (newStatus !== task.status || isReassignment) {
        await tx.taskStateHistory.create({
          data: {
            taskId: task.id,
            fromStatus: task.status,
            toStatus: newStatus,
            changedById: ctx.userId,
            reason: isReassignment ? `Reassigned to employee ${parsed.data.assignedEmployeeId}` : `Assigned to employee ${parsed.data.assignedEmployeeId}`,
          },
        });
      }

      return { isReassignment, newStatus };
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: result.isReassignment ? "TASK_REASSIGNED" : "TASK_ASSIGNED",
      entityType: "Task",
      entityId: parsed.data.taskId,
      details: {
        assignedEmployeeId: parsed.data.assignedEmployeeId,
        newStatus: result.newStatus,
      },
    });

    revalidateTaskViews(parsed.data.taskId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to assign task" };
  }
}

/**
 * Transitions task lifecycle status according to the locked 11-state transition matrix.
 * Enforces mandatory reasons for WAITING, BLOCKED, and ESCALATED.
 * Enforces checklist completion requirements for QA tasks.
 */
export async function transitionTaskStatusAction(
  input: TaskStatusTransitionInput
): Promise<ActionResult> {
  const parsed = TaskStatusTransitionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    await withRlsContext(ctx.userId, async (tx) => {
      const task = await tx.task.findUnique({
        where: { id: parsed.data.taskId, organizationId: ctx.organizationId },
        include: { checklistItems: true },
      });
      if (!task) throw new NotFoundError("Task not found");

      // 1. Verify Transition Graph
      const allowedNext = ALLOWED_TASK_TRANSITIONS[task.status as TaskStatus];
      if (!allowedNext || !allowedNext.includes(parsed.data.targetStatus)) {
        throw new InvalidStateTransitionError(
          `Invalid task lifecycle transition: cannot transition from ${task.status} to ${parsed.data.targetStatus}`
        );
      }

      // 2. Enforce Mandatory Reason Validation
      if (parsed.data.targetStatus === TaskStatus.BLOCKED && !parsed.data.reason?.trim()) {
        throw new ValidationError("A reason is mandatory when placing a task into BLOCKED status");
      }
      if (parsed.data.targetStatus === TaskStatus.WAITING && !parsed.data.reason?.trim()) {
        throw new ValidationError("A reason is mandatory when placing a task into WAITING status");
      }
      if (parsed.data.targetStatus === TaskStatus.ESCALATED && !parsed.data.reason?.trim()) {
        throw new ValidationError("An escalation reason is mandatory when escalating a task");
      }

      // 3. Enforce Checklist Completion for QA and Checked Tasks
      if (parsed.data.targetStatus === TaskStatus.COMPLETED) {
        const hasIncompleteChecklist = task.checklistItems.some((item: TaskChecklistItem) => !item.isCompleted);
        if (hasIncompleteChecklist) {
          throw new ValidationError("All checklist items must be completed before completing this task");
        }
      }

      // 4. Verify Governance Authority for Terminal & Escalation Statuses
      if (parsed.data.targetStatus === TaskStatus.CANCELED) {
        await verifyTaskPermission(tx, ctx, "cancel");
      } else if (parsed.data.targetStatus === TaskStatus.ESCALATED) {
        await verifyTaskPermission(tx, ctx, "escalate");
      } else if (parsed.data.targetStatus === TaskStatus.COMPLETED) {
        await verifyTaskPermission(tx, ctx, "complete", {
          assignedEmployeeId: task.assignedEmployeeId,
        });
      }

      // 5. Update Task Record
      const isTerminal = parsed.data.targetStatus === TaskStatus.COMPLETED || parsed.data.targetStatus === TaskStatus.CANCELED;

      await tx.task.update({
        where: { id: task.id },
        data: {
          status: parsed.data.targetStatus,
          blockedReason: parsed.data.targetStatus === TaskStatus.BLOCKED ? parsed.data.reason : (parsed.data.targetStatus === TaskStatus.IN_PROGRESS ? null : task.blockedReason),
          waitingReason: parsed.data.targetStatus === TaskStatus.WAITING ? parsed.data.reason : (parsed.data.targetStatus === TaskStatus.IN_PROGRESS ? null : task.waitingReason),
          escalationReason: parsed.data.targetStatus === TaskStatus.ESCALATED ? parsed.data.reason : task.escalationReason,
          completedAt: isTerminal ? new Date() : null,
          completedById: isTerminal ? ctx.userId : null,
        },
      });

      // 5. Record State History
      await tx.taskStateHistory.create({
        data: {
          taskId: task.id,
          fromStatus: task.status,
          toStatus: parsed.data.targetStatus,
          changedById: ctx.userId,
          reason: parsed.data.reason || null,
        },
      });
    });

    let auditAction: any = "TASK_STATUS_CHANGED";
    if (parsed.data.targetStatus === TaskStatus.COMPLETED) auditAction = "TASK_COMPLETED";
    else if (parsed.data.targetStatus === TaskStatus.CANCELED) auditAction = "TASK_CANCELED";
    else if (parsed.data.targetStatus === TaskStatus.ESCALATED) auditAction = "TASK_ESCALATED";

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: auditAction,
      entityType: "Task",
      entityId: parsed.data.taskId,
      details: {
        targetStatus: parsed.data.targetStatus,
        reason: parsed.data.reason,
      },
    });

    revalidateTaskViews(parsed.data.taskId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to transition task status" };
  }
}

/**
 * Updates completion status of a checklist item.
 * Restricted to EMPLOYEE and ADMIN roles.
 */
export async function updateTaskChecklistItemAction(
  input: TaskChecklistItemUpdateInput
): Promise<ActionResult> {
  const parsed = TaskChecklistItemUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    await withRlsContext(ctx.userId, async (tx) => {
      const item = await tx.taskChecklistItem.findUnique({
        where: { id: parsed.data.checklistItemId },
        include: { task: true },
      });
      if (!item || item.task.organizationId !== ctx.organizationId) {
        throw new NotFoundError("Checklist item not found in organization");
      }

      await tx.taskChecklistItem.update({
        where: { id: item.id },
        data: {
          isCompleted: parsed.data.isCompleted,
          completedAt: parsed.data.isCompleted ? new Date() : null,
          completedById: parsed.data.isCompleted ? ctx.userId : null,
        },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "TASK_CHECKLIST_UPDATED",
      entityType: "TaskChecklistItem",
      entityId: parsed.data.checklistItemId,
      details: { isCompleted: parsed.data.isCompleted },
    });

    revalidateTaskViews();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update checklist item" };
  }
}

/**
 * Bulk cancels active operational tasks when candidate consent is revoked.
 * Preserves completed and historical records.
 */
export async function cancelTasksOnConsentRevocationAction(
  candidateId: string
): Promise<ActionResult<{ canceledCount: number }>> {
  try {
    const ctx = await getAuthenticatedContext();

    const count = await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { id: candidateId, organizationId: ctx.organizationId },
      });
      if (!candidate) throw new NotFoundError("Candidate not found");

      if (ctx.role === "CANDIDATE" && candidate.userId !== ctx.userId) {
        throw new AuthorizationError("Unauthorized consent operation");
      }

      const activeTasks = await tx.task.findMany({
        where: {
          candidateId: candidate.id,
          status: {
            notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELED],
          },
        },
      });

      for (const t of activeTasks) {
        await tx.task.update({
          where: { id: t.id },
          data: {
            status: TaskStatus.CANCELED,
            completedAt: new Date(),
            completedById: ctx.userId,
          },
        });

        await tx.taskStateHistory.create({
          data: {
            taskId: t.id,
            fromStatus: t.status,
            toStatus: TaskStatus.CANCELED,
            changedById: ctx.userId,
            reason: "Candidate consent revoked: task canceled",
          },
        });
      }

      return activeTasks.length;
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "TASK_CANCELED",
      entityType: "Candidate",
      entityId: candidateId,
      details: { canceledCount: count, reason: "Consent revoked" },
    });

    revalidateTaskViews();
    return { success: true, data: { canceledCount: count } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to cancel tasks on consent revocation" };
  }
}

/**
 * Retrieves the current Task Governance Policy for the active organization.
 * Accessible to authenticated staff and administrators.
 */
export async function getTaskGovernancePolicyAction(): Promise<
  ActionResult<TaskGovernancePolicyOutput>
> {
  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    const policy = await withRlsContext(ctx.userId, async (tx) => {
      return getTaskGovernancePolicy(tx, ctx.organizationId);
    });

    return { success: true, data: policy };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Failed to load task governance policy",
    };
  }
}

/**
 * Updates the Task Governance Policy for the organization.
 * Restricted to administrators (ADMIN role). Audited via TASK_GOVERNANCE_POLICY_UPDATED.
 */
export async function updateTaskGovernancePolicyAction(
  input: TaskGovernancePolicyInput
): Promise<ActionResult<TaskGovernancePolicyOutput>> {
  const parsed = TaskGovernancePolicySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Validation failed",
    };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireAdmin(ctx);

    const result = await withRlsContext(ctx.userId, async (tx) => {
      const previousPolicy = await getTaskGovernancePolicy(tx, ctx.organizationId);

      const updated = await tx.taskGovernancePolicy.upsert({
        where: { organizationId: ctx.organizationId },
        create: {
          organizationId: ctx.organizationId,
          canCreateRoles: parsed.data.canCreateRoles,
          canAssignRoles: parsed.data.canAssignRoles,
          canCancelRoles: parsed.data.canCancelRoles,
          canEscalateRoles: parsed.data.canEscalateRoles,
          canCompleteRoles: parsed.data.canCompleteRoles,
        },
        update: {
          canCreateRoles: parsed.data.canCreateRoles,
          canAssignRoles: parsed.data.canAssignRoles,
          canCancelRoles: parsed.data.canCancelRoles,
          canEscalateRoles: parsed.data.canEscalateRoles,
          canCompleteRoles: parsed.data.canCompleteRoles,
        },
      });

      await logUserAuditEvent({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.TASK_GOVERNANCE_POLICY_UPDATED,
        entityType: "TaskGovernancePolicy",
        entityId: updated.id,
        details: {
          previousPolicy,
          newPolicy: parsed.data,
        },
      });

      return parsed.data;
    });

    try {
      revalidatePath("/admin/settings/task-rules");
      revalidatePath("/admin/settings");
      revalidatePath("/employee/tasks");
      revalidatePath("/admin/tasks");
    } catch {
      // Safe fallback
    }

    return { success: true, data: result };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Failed to update task governance policy",
    };
  }
}

