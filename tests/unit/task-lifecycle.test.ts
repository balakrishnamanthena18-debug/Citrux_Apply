import { describe, it, expect } from "vitest";
import { ALLOWED_TASK_TRANSITIONS } from "@/lib/task/constants";
import { TaskStatus } from "@/generated/prisma";

describe("Task Lifecycle State Machine (tests/unit/task-lifecycle.test.ts)", () => {
  it("1. Verifies exactly 11 task statuses exist in state machine graph", () => {
    const statuses = Object.keys(ALLOWED_TASK_TRANSITIONS);
    expect(statuses).toHaveLength(11);
  });

  it("2. Verifies terminal states (COMPLETED, CANCELED) have zero outgoing transitions", () => {
    expect(ALLOWED_TASK_TRANSITIONS[TaskStatus.COMPLETED]).toEqual([]);
    expect(ALLOWED_TASK_TRANSITIONS[TaskStatus.CANCELED]).toEqual([]);
  });

  it("3. Verifies BACKLOG valid outgoing transitions (ASSIGNED, CANCELED)", () => {
    expect(ALLOWED_TASK_TRANSITIONS[TaskStatus.BACKLOG]).toContain(TaskStatus.ASSIGNED);
    expect(ALLOWED_TASK_TRANSITIONS[TaskStatus.BACKLOG]).toContain(TaskStatus.CANCELED);
    expect(ALLOWED_TASK_TRANSITIONS[TaskStatus.BACKLOG]).not.toContain(TaskStatus.COMPLETED);
  });

  it("4. Verifies QA review paths (COMPLETED on pass, IN_PROGRESS on rework, ESCALATED on blocker)", () => {
    expect(ALLOWED_TASK_TRANSITIONS[TaskStatus.QA]).toContain(TaskStatus.COMPLETED);
    expect(ALLOWED_TASK_TRANSITIONS[TaskStatus.QA]).toContain(TaskStatus.IN_PROGRESS);
    expect(ALLOWED_TASK_TRANSITIONS[TaskStatus.QA]).toContain(TaskStatus.ESCALATED);
  });

  it("5. Verifies ESCALATED Admin triage paths (ASSIGNED, IN_PROGRESS, CANCELED)", () => {
    expect(ALLOWED_TASK_TRANSITIONS[TaskStatus.ESCALATED]).toContain(TaskStatus.ASSIGNED);
    expect(ALLOWED_TASK_TRANSITIONS[TaskStatus.ESCALATED]).toContain(TaskStatus.IN_PROGRESS);
    expect(ALLOWED_TASK_TRANSITIONS[TaskStatus.ESCALATED]).toContain(TaskStatus.CANCELED);
  });
});
