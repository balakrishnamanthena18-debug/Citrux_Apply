import { z } from "zod";

export const TaskCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(255),
  description: z.string().trim().max(5000).optional().nullable(),
  category: z.enum(["CANDIDATE", "JOB", "APPLICATION", "QA", "OPERATIONAL"]),
  type: z.enum([
    "COMPLETE_PROFILE",
    "UPLOAD_DOCUMENT",
    "VERIFY_INFORMATION",
    "APPROVE_APPLICATION",
    "PROVIDE_MISSING_INFO",
    "REVIEW_JOB",
    "QUALIFY_JOB",
    "PREPARE_RESUME",
    "PREPARE_COVER_LETTER",
    "PREPARE_SCREENING_ANSWERS",
    "COMPLETE_APPLICATION",
    "VERIFY_APPLICATION",
    "SUBMIT_APPLICATION",
    "RESUME_QA",
    "APPLICATION_QA",
    "SUBMISSION_QA",
    "CANDIDATE_ASSIGNMENT",
    "CANDIDATE_REASSIGNMENT",
    "ESCALATION_HANDLING",
    "SUBMISSION_CORRECTION",
  ]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  dueDate: z.string().datetime().optional().nullable(),
  assignedEmployeeId: z.string().uuid().optional().nullable(),
  candidateId: z.string().uuid().optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
  applicationId: z.string().uuid().optional().nullable(),
  checklistItems: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
});

export const TaskUpdateSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  dueDate: z.string().datetime().optional().nullable(),
});

export const TaskAssignSchema = z.object({
  taskId: z.string().uuid(),
  assignedEmployeeId: z.string().uuid().nullable(),
});

export const TaskStatusTransitionSchema = z.object({
  taskId: z.string().uuid(),
  targetStatus: z.enum([
    "BACKLOG",
    "ASSIGNED",
    "IN_PROGRESS",
    "WAITING",
    "READY_FOR_REVIEW",
    "QA",
    "COMPLETED",
    "BLOCKED",
    "CANCELED",
    "REASSIGNED",
    "ESCALATED",
  ]),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const TaskChecklistItemUpdateSchema = z.object({
  checklistItemId: z.string().uuid(),
  isCompleted: z.boolean(),
});

export const OperationalRoleEnum = z.enum([
  "ADMIN",
  "MANAGER",
  "TEAM_LEAD",
  "EMPLOYEE",
  "CANDIDATE",
]);

export type OperationalRole = z.infer<typeof OperationalRoleEnum>;

export const TaskGovernancePolicySchema = z.object({
  canCreateRoles: z.array(OperationalRoleEnum).min(1, "At least one role must be allowed"),
  canAssignRoles: z.array(OperationalRoleEnum).min(1, "At least one role must be allowed"),
  canCancelRoles: z.array(OperationalRoleEnum).min(1, "At least one role must be allowed"),
  canEscalateRoles: z.array(OperationalRoleEnum).min(1, "At least one role must be allowed"),
  canCompleteRoles: z.array(OperationalRoleEnum).min(1, "At least one role must be allowed"),
});

export type TaskCreateInput = z.input<typeof TaskCreateSchema>;
export type TaskUpdateInput = z.input<typeof TaskUpdateSchema>;
export type TaskAssignInput = z.input<typeof TaskAssignSchema>;
export type TaskStatusTransitionInput = z.input<typeof TaskStatusTransitionSchema>;
export type TaskChecklistItemUpdateInput = z.input<typeof TaskChecklistItemUpdateSchema>;
export type TaskGovernancePolicyInput = z.input<typeof TaskGovernancePolicySchema>;
export type TaskGovernancePolicyOutput = z.infer<typeof TaskGovernancePolicySchema>;

export const DEFAULT_TASK_GOVERNANCE_POLICY: TaskGovernancePolicyOutput = {
  canCreateRoles: ["ADMIN", "MANAGER", "TEAM_LEAD"],
  canAssignRoles: ["ADMIN", "MANAGER", "TEAM_LEAD"],
  canCancelRoles: ["ADMIN", "MANAGER", "TEAM_LEAD"],
  canEscalateRoles: ["ADMIN", "MANAGER", "TEAM_LEAD"],
  canCompleteRoles: ["ADMIN", "MANAGER", "TEAM_LEAD", "EMPLOYEE"],
};

