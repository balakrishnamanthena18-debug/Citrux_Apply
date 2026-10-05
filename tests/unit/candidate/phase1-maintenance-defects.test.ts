import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { formatApplicationCardDate } from "@/lib/utils/format-application-date";

const ROOT = process.cwd();

describe("Phase 1 maintenance — application card date hydration", () => {
  it("formats dates deterministically in UTC (SSR == client)", () => {
    const iso = "2026-10-04T22:30:00.000Z";
    const fromString = formatApplicationCardDate(iso);
    const fromDate = formatApplicationCardDate(new Date(iso));

    expect(fromString).toBe("Oct 4, 2026");
    expect(fromDate).toBe("Oct 4, 2026");
    expect(formatApplicationCardDate(iso, { year: false })).toBe("Oct 4");
  });

  it("returns Unknown date for invalid input", () => {
    expect(formatApplicationCardDate("not-a-date")).toBe("Unknown date");
  });

  it("does not use locale-dependent toLocaleDateString in application cards", () => {
    const card = readFileSync(
      join(ROOT, "src/components/candidate/CandidateApplicationCard.tsx"),
      "utf8"
    );
    const workbench = readFileSync(
      join(ROOT, "src/components/candidate/CandidateApplicationsWorkbench.tsx"),
      "utf8"
    );

    expect(card).toContain("formatApplicationCardDate");
    expect(workbench).toContain("formatApplicationCardDate");
    expect(card).not.toContain("toLocaleDateString");
    expect(workbench).not.toContain("toLocaleDateString");
  });
});

describe("Phase 1 maintenance — mobile Sign Out visibility", () => {
  it("hides the bottom tab bar while the More drawer is open", () => {
    const shell = readFileSync(
      join(ROOT, "src/components/navigation/AppShell.tsx"),
      "utf8"
    );

    expect(shell).toContain("!mobileMenuOpen");
    expect(shell).toMatch(/\{!mobileMenuOpen &&\s*\(\s*<MobileBottomNav/);
  });

  it("exposes a labeled, accessible Sign Out control on mobile only", () => {
    const sidebar = readFileSync(
      join(ROOT, "src/components/navigation/AppSidebar.tsx"),
      "utf8"
    );

    expect(sidebar).toContain('aria-label="Sign out"');
    expect(sidebar).toContain("<span>Sign out</span>");
    expect(sidebar).toContain("isMobile && (");
    expect(sidebar).toContain("safe-area-inset-bottom");
    expect(sidebar).toContain("min-h-11");

    // Desktop keeps the compact icon control; labeled block is mobile-gated.
    expect(sidebar).toContain("{!isMobile && (");
    expect(sidebar).toContain("{isMobile && (");
  });
});
