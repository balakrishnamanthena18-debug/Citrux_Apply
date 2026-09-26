import { describe, it, expect } from "vitest";
import {
  TaskCreateSchema,
  TaskUpdateSchema,
  TaskAssignSchema,
  TaskStatusTransitionSchema,
  TaskChecklistItemUpdateSchema,
} from "@/lib/validation/task.schemas";

describe("Task Schemas Validation (tests/unit/task-schemas.test.ts)", () => {
  const validUUID = "11111111-1111-4111-8111-111111111111";

  it("1. Validates TaskCreateSchema with valid inputs and defaults", () => {
    const valid = {
      title: "Prepare tailored resume for SWE role",
      description: "Match experience keywords to Stripe listing",
      category: "APPLICATION" as const,
      type: "PREPARE_RESUME" as const,
      priority: "HIGH" as const,
      checklistItems: ["Keyword matching", "Export PDF"],
    };

    const parsed = TaskCreateSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.title).toBe("Prepare tailored resume for SWE role");
      expect(parsed.data.priority).toBe("HIGH");
      expect(parsed.data.checklistItems).toHaveLength(2);
    }
  });

  it("2. Rejects TaskCreateSchema when title is empty or missing", () => {
    const invalid = {
      title: "   ",
      category: "QA",
      type: "RESUME_QA",
    };

    const parsed = TaskCreateSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it("3. Validates TaskAssignSchema with valid UUID or null", () => {
    const assign = {
      taskId: validUUID,
      assignedEmployeeId: validUUID,
    };
    expect(TaskAssignSchema.safeParse(assign).success).toBe(true);

    const unassign = {
      taskId: validUUID,
      assignedEmployeeId: null,
    };
    expect(TaskAssignSchema.safeParse(unassign).success).toBe(true);
  });

  it("4. Validates TaskStatusTransitionSchema for valid status and reason", () => {
    const transition = {
      taskId: validUUID,
      targetStatus: "BLOCKED" as const,
      reason: "Employer job portal undergoing maintenance",
    };

    const parsed = TaskStatusTransitionSchema.safeParse(transition);
    expect(parsed.success).toBe(true);
  });

  it("5. Rejects TaskStatusTransitionSchema when status is invalid", () => {
    const invalid = {
      taskId: validUUID,
      targetStatus: "NOT_A_REAL_STATUS",
    };

    expect(TaskStatusTransitionSchema.safeParse(invalid).success).toBe(false);
  });

  it("6. Validates TaskChecklistItemUpdateSchema", () => {
    const item = {
      checklistItemId: validUUID,
      isCompleted: true,
    };

    const parsed = TaskChecklistItemUpdateSchema.safeParse(item);
    expect(parsed.success).toBe(true);
  });
});
