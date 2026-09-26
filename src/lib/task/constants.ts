import { TaskStatus } from "@/generated/prisma";

export const ALLOWED_TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  BACKLOG: [TaskStatus.ASSIGNED, TaskStatus.CANCELED],
  ASSIGNED: [
    TaskStatus.IN_PROGRESS,
    TaskStatus.REASSIGNED,
    TaskStatus.BLOCKED,
    TaskStatus.ESCALATED,
    TaskStatus.CANCELED,
  ],
  IN_PROGRESS: [
    TaskStatus.WAITING,
    TaskStatus.READY_FOR_REVIEW,
    TaskStatus.QA,
    TaskStatus.COMPLETED,
    TaskStatus.BLOCKED,
    TaskStatus.REASSIGNED,
    TaskStatus.ESCALATED,
    TaskStatus.CANCELED,
  ],
  WAITING: [TaskStatus.IN_PROGRESS, TaskStatus.ESCALATED, TaskStatus.CANCELED],
  READY_FOR_REVIEW: [
    TaskStatus.QA,
    TaskStatus.IN_PROGRESS,
    TaskStatus.COMPLETED,
    TaskStatus.CANCELED,
  ],
  QA: [
    TaskStatus.COMPLETED,
    TaskStatus.IN_PROGRESS,
    TaskStatus.ESCALATED,
    TaskStatus.CANCELED,
  ],
  BLOCKED: [TaskStatus.IN_PROGRESS, TaskStatus.ESCALATED, TaskStatus.CANCELED],
  REASSIGNED: [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.CANCELED],
  ESCALATED: [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.CANCELED],
  COMPLETED: [], // Terminal
  CANCELED: [],  // Terminal
};
