import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { syncUrlParams, getInitialParam } from "@/lib/client/urlSync";

interface TestItem {
  id: string;
  name: string;
  role: string;
  status: "ACTIVE" | "PENDING" | "REJECTED";
  score: number;
  createdAt: string;
}

const mockDataset: TestItem[] = [
  { id: "1", name: "Alice Johnson", role: "Software Engineer", status: "ACTIVE", score: 95, createdAt: "2026-01-15T10:00:00Z" },
  { id: "2", name: "Bob Smith", role: "Product Manager", status: "PENDING", score: 82, createdAt: "2026-02-10T14:30:00Z" },
  { id: "3", name: "Charlie Brown", role: "Frontend Developer", status: "ACTIVE", score: 88, createdAt: "2026-01-20T09:15:00Z" },
  { id: "4", name: "Diana Prince", role: "QA Engineer", status: "REJECTED", score: 76, createdAt: "2026-03-01T11:45:00Z" },
  { id: "5", name: "Evan Wright", role: "Software Engineer", status: "PENDING", score: 91, createdAt: "2026-02-25T16:20:00Z" },
];

describe("Instant Interaction Primitives — Unit Test Suite", () => {
  describe("1. Multi-Token Local Search Logic", () => {
    function filterBySearch<T>(items: T[], query: string, fields: (keyof T)[]): T[] {
      const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return items;

      return items.filter((item) => {
        const itemText = fields
          .map((field) => {
            const val = item[field];
            return val !== null && val !== undefined ? String(val).toLowerCase() : "";
          })
          .join(" ");

        return tokens.every((token) => itemText.includes(token));
      });
    }

    it("filters items matching query across multiple string fields", () => {
      const results = filterBySearch(mockDataset, "engineer", ["name", "role"]);
      expect(results).toHaveLength(3);
      expect(results.map((i) => i.name)).toEqual([
        "Alice Johnson",
        "Diana Prince",
        "Evan Wright",
      ]);
    });

    it("handles multi-token search queries (AND logic across tokens)", () => {
      const results = filterBySearch(mockDataset, "software alice", ["name", "role"]);
      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe("Alice Johnson");
    });

    it("returns all items when search query is empty", () => {
      const results = filterBySearch(mockDataset, "   ", ["name", "role"]);
      expect(results).toHaveLength(5);
    });
  });

  describe("2. Local In-Memory Sorting Logic", () => {
    function sortItems<T>(items: T[], sortKey: keyof T, direction: "asc" | "desc"): T[] {
      return [...items].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        if (aVal === bVal) return 0;
        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;

        if (typeof aVal === "number" && typeof bVal === "number") {
          return direction === "asc" ? aVal - bVal : bVal - aVal;
        }

        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        return direction === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });
    }

    it("sorts items by numerical score in ascending and descending order", () => {
      const desc = sortItems(mockDataset, "score", "desc");
      expect(desc[0]?.score).toBe(95); // Alice
      expect(desc[4]?.score).toBe(76); // Diana

      const asc = sortItems(mockDataset, "score", "asc");
      expect(asc[0]?.score).toBe(76); // Diana
      expect(asc[4]?.score).toBe(95); // Alice
    });

    it("sorts items alphabetically by string name", () => {
      const asc = sortItems(mockDataset, "name", "asc");
      expect(asc[0]?.name).toBe("Alice Johnson");
      expect(asc[4]?.name).toBe("Evan Wright");
    });
  });

  describe("3. Unified Filtering, Tab Switching & Pagination Slicing", () => {
    it("combines active tab filter, search, and pagination slicing", () => {
      const tabFilter = "ACTIVE";
      const filteredByTab = mockDataset.filter((item) => item.status === tabFilter);
      expect(filteredByTab).toHaveLength(2); // Alice and Charlie

      const pageSize = 1;
      const page1 = filteredByTab.slice(0, pageSize);
      const page2 = filteredByTab.slice(pageSize, pageSize * 2);

      expect(page1).toHaveLength(1);
      expect(page1[0]?.name).toBe("Alice Johnson");
      expect(page2).toHaveLength(1);
      expect(page2[0]?.name).toBe("Charlie Brown");
    });
  });

  describe("4. urlSync Soft History Synchronization", () => {
    let originalWindow: any;

    beforeEach(() => {
      originalWindow = (globalThis as any).window;
    });

    afterEach(() => {
      (globalThis as any).window = originalWindow;
      vi.restoreAllMocks();
    });

    it("safely handles SSR when window is undefined", () => {
      delete (globalThis as any).window;
      expect(() => syncUrlParams({ status: "ACTIVE" })).not.toThrow();
      expect(getInitialParam("status", "DEFAULT")).toBe("DEFAULT");
    });

    it("synchronizes query params using replaceState without page reloads", () => {
      const replaceStateMock = vi.fn();
      (globalThis as any).window = {
        location: { href: "https://apply.citrux.internal/employee/applications" },
        history: { replaceState: replaceStateMock },
      };

      syncUrlParams({ status: "ACTIVE", search: "alice", emptyField: null });

      expect(replaceStateMock).toHaveBeenCalledTimes(1);
      const calledUrl = replaceStateMock.mock.calls[0]?.[2] as string;
      expect(calledUrl).toContain("status=ACTIVE");
      expect(calledUrl).toContain("search=alice");
      expect(calledUrl).not.toContain("emptyField");
    });

    it("reads current URL search params correctly in browser environment", () => {
      (globalThis as any).window = {
        location: { href: "https://apply.citrux.internal/employee/applications?tab=REVIEW&q=test" },
      };

      expect(getInitialParam("tab")).toBe("REVIEW");
      expect(getInitialParam("q")).toBe("test");
      expect(getInitialParam("nonexistent", "fallback")).toBe("fallback");
    });
  });
});
