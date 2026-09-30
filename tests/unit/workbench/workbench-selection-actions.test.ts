import { describe, it, expect } from "vitest";

describe("Workbench Batch Selection & Row Actions — Unit Test Suite", () => {
  describe("1. Selection State Management", () => {
    function toggleItemSelection(currentSet: Set<string>, id: string): Set<string> {
      const next = new Set(currentSet);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    }

    function toggleSelectAll(allIds: string[], currentSet: Set<string>): Set<string> {
      if (currentSet.size === allIds.length) {
        return new Set();
      }
      return new Set(allIds);
    }

    it("toggles single item selection accurately", () => {
      let selected = new Set<string>();
      selected = toggleItemSelection(selected, "item-1");
      expect(selected.has("item-1")).toBe(true);
      expect(selected.size).toBe(1);

      selected = toggleItemSelection(selected, "item-2");
      expect(selected.has("item-2")).toBe(true);
      expect(selected.size).toBe(2);

      selected = toggleItemSelection(selected, "item-1");
      expect(selected.has("item-1")).toBe(false);
      expect(selected.size).toBe(1);
    });

    it("selects and deselects all items cleanly", () => {
      const allIds = ["item-1", "item-2", "item-3", "item-4"];
      let selected = new Set<string>(["item-1"]);

      selected = toggleSelectAll(allIds, selected);
      expect(selected.size).toBe(4);
      expect(allIds.every((id) => selected.has(id))).toBe(true);

      selected = toggleSelectAll(allIds, selected);
      expect(selected.size).toBe(0);
    });
  });

  describe("2. Optimistic Row Action State Transitions & Rollback", () => {
    interface TaskItem {
      id: string;
      title: string;
      status: "OPEN" | "IN_PROGRESS" | "COMPLETED";
    }

    const initialTasks: TaskItem[] = [
      { id: "t1", title: "Review Resume", status: "OPEN" },
      { id: "t2", title: "QA Verification", status: "IN_PROGRESS" },
    ];

    it("optimistically updates item status and rolls back on server failure", () => {
      let state = [...initialTasks];

      // Optimistic update
      const targetId = "t1";
      const newStatus = "COMPLETED";
      state = state.map((t) => (t.id === targetId ? { ...t, status: newStatus } : t));

      expect(state.find((t) => t.id === "t1")?.status).toBe("COMPLETED");

      // Simulated server action failure -> Rollback
      const serverResult = { success: false, error: "Unauthorized transition" };
      if (!serverResult.success) {
        state = initialTasks;
      }

      expect(state.find((t) => t.id === "t1")?.status).toBe("OPEN");
    });
  });
});
