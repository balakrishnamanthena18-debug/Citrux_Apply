import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { formatApplicationCardDate } from "@/lib/utils/format-application-date";
import { FILTER_TAB_STATES } from "@/lib/utils/status-presenter";

const ROOT = process.cwd();

describe("Applications Workbench hydration invariants", () => {
  it("serializes application dates to ISO strings on the server page", () => {
    const page = readFileSync(
      join(ROOT, "src/app/(dashboard)/candidate/applications/page.tsx"),
      "utf8"
    );

    expect(page).toContain("serializeApplicationForWorkbench");
    expect(page).toContain("toISOString");
    expect(page).toContain("allApps.map(serializeApplicationForWorkbench)");
    // Must not pass raw Prisma rows straight into the client workbench.
    expect(page).not.toContain("as unknown as CandidateApplicationItem[]");
  });

  it("keeps workbench free of locale/timezone browser date APIs", () => {
    const workbench = readFileSync(
      join(ROOT, "src/components/candidate/CandidateApplicationsWorkbench.tsx"),
      "utf8"
    );

    expect(workbench).toContain("formatApplicationCardDate");
    expect(workbench).not.toContain("toLocaleDateString");
    expect(workbench).not.toContain("toLocaleString");
    expect(workbench).not.toContain("typeof window");
    expect(workbench).not.toContain("Date.now(");
    expect(workbench).not.toContain("Math.random(");
  });

  it("formats Date instances and ISO strings identically (SSR == client props)", () => {
    const iso = "2026-09-26T18:05:00.000Z";
    expect(formatApplicationCardDate(new Date(iso))).toBe(
      formatApplicationCardDate(iso)
    );
    expect(formatApplicationCardDate(iso, { year: false })).toBe("Sep 26");
  });

  it("computes deterministic pipeline counts for the same application set", () => {
    const statuses = [
      "SUBMITTED",
      "SUBMITTED",
      "AWAITING_APPROVAL",
      "WITHDRAWN",
      "PREPARING",
    ] as const;

    const counts = {
      ALL: statuses.length,
      AWAITING_ACTION: statuses.filter((s) => s === "AWAITING_APPROVAL").length,
      IN_PROGRESS: statuses.filter((s) =>
        (FILTER_TAB_STATES.IN_PROGRESS as readonly string[]).includes(s)
      ).length,
      SUBMITTED: statuses.filter((s) => s === "SUBMITTED").length,
      HISTORY: statuses.filter((s) =>
        (FILTER_TAB_STATES.HISTORY as readonly string[]).includes(s)
      ).length,
    };

    expect(counts).toEqual({
      ALL: 5,
      AWAITING_ACTION: 1,
      IN_PROGRESS: 1,
      SUBMITTED: 2,
      HISTORY: 1,
    });
  });
});
