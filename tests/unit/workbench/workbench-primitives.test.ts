import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncUrlParams, getInitialParam } from "@/lib/client/urlSync";

describe("Phase 2 Workbench Primitives — Core Unit Tests", () => {
  describe("1. URL Synchronization Utility (urlSync)", () => {
    let originalWindow: any;

    beforeEach(() => {
      originalWindow = (globalThis as any).window;
    });

    it("safely ignores calls in SSR environments", () => {
      delete (globalThis as any).window;
      expect(() => syncUrlParams({ tab: "ACTIVE" })).not.toThrow();
      expect(getInitialParam("tab", "DEFAULT")).toBe("DEFAULT");
    });

    it("updates browser history without full page navigation", () => {
      const replaceStateSpy = vi.fn();
      (globalThis as any).window = {
        location: { href: "https://apply.citrux.internal/employee/applications" },
        history: { replaceState: replaceStateSpy },
      };

      syncUrlParams({
        tab: "SUBMITTED",
        status: "APPROVED",
        search: "Acme",
        emptyField: "",
        nullField: null,
      });

      expect(replaceStateSpy).toHaveBeenCalledTimes(1);
      const targetUrl = replaceStateSpy.mock.calls[0]?.[2] as string;
      expect(targetUrl).toContain("tab=SUBMITTED");
      expect(targetUrl).toContain("status=APPROVED");
      expect(targetUrl).toContain("search=Acme");
      expect(targetUrl).not.toContain("emptyField");
      expect(targetUrl).not.toContain("nullField");
    });
  });

  describe("2. Tab Keyboard Navigation Calculator", () => {
    function computeNextTabIndex(
      currentIndex: number,
      totalTabs: number,
      key: string
    ): number {
      switch (key) {
        case "ArrowRight":
          return (currentIndex + 1) % totalTabs;
        case "ArrowLeft":
          return (currentIndex - 1 + totalTabs) % totalTabs;
        case "Home":
          return 0;
        case "End":
          return totalTabs - 1;
        default:
          return currentIndex;
      }
    }

    it("cycles through tabs with Arrow keys", () => {
      expect(computeNextTabIndex(0, 4, "ArrowRight")).toBe(1);
      expect(computeNextTabIndex(3, 4, "ArrowRight")).toBe(0); // wrap around
      expect(computeNextTabIndex(0, 4, "ArrowLeft")).toBe(3); // wrap around
      expect(computeNextTabIndex(2, 4, "ArrowLeft")).toBe(1);
    });

    it("jumps to first and last tabs with Home/End keys", () => {
      expect(computeNextTabIndex(2, 5, "Home")).toBe(0);
      expect(computeNextTabIndex(2, 5, "End")).toBe(4);
    });
  });

  describe("3. Multi-token Search Parsing", () => {
    function matchesQuery(text: string, query: string): boolean {
      const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return true;
      const normalized = text.toLowerCase();
      return tokens.every((token) => normalized.includes(token));
    }

    it("matches multi-token search strings with AND logic", () => {
      const text = "Senior Full Stack Engineer at Google Mountain View";
      expect(matchesQuery(text, "senior engineer")).toBe(true);
      expect(matchesQuery(text, "google full")).toBe(true);
      expect(matchesQuery(text, "google amazon")).toBe(false);
    });

    it("normalizes excessive whitespace", () => {
      const text = "QA Lead Engineer";
      expect(matchesQuery(text, "   qa     lead   ")).toBe(true);
      expect(matchesQuery(text, "   ")).toBe(true);
    });
  });
});
