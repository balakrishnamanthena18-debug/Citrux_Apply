import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { CandidateProjectSchema } from "@/lib/validation/candidate.schemas";
import {
  CAREER_SECTION_KEYS,
  isCareerSectionKey,
} from "@/lib/candidate/career-sections";

const ROOT = join(__dirname, "../../..");

describe("Phase 3 — Projects & Career Profile Intelligence", () => {
  describe("Project domain contract (existing schema)", () => {
    it("keeps CandidateProject as the sole project model — no parallel schema", () => {
      const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
      expect(schema).toContain("model CandidateProject");
      expect(schema).not.toMatch(/model\s+Project\b/);
      expect(schema).toContain("orderIndex");
      expect(schema).toContain("technologies");
      expect(schema).toContain("highlights");
    });

    it("validates essential project fields and rejects invalid URLs/dates", () => {
      expect(
        CandidateProjectSchema.safeParse({
          title: "Payments Platform",
          role: "Senior Engineer",
          description: "Built payment orchestration.",
          technologies: ["TypeScript", "React"],
          highlights: ["Reduced settlement lag"],
          url: "https://example.com/payments",
          startDate: "2024-01-01",
          endDate: "2025-03-01",
          orderIndex: 0,
        }).success
      ).toBe(true);

      expect(
        CandidateProjectSchema.safeParse({
          title: "Bad URL",
          url: "not-a-url",
        }).success
      ).toBe(false);

      expect(
        CandidateProjectSchema.safeParse({
          title: "Bad dates",
          startDate: "01/2024",
        }).success
      ).toBe(false);

      expect(
        CandidateProjectSchema.safeParse({
          title: "Inverted dates",
          startDate: "2025-06-01",
          endDate: "2024-01-01",
        }).success
      ).toBe(false);

      expect(
        CandidateProjectSchema.safeParse({
          title: "",
        }).success
      ).toBe(false);
    });
  });

  describe("Projects UI & career profile wiring", () => {
    it("keeps Projects inside Career Profile with human candidate language", () => {
      const editor = readFileSync(
        join(ROOT, "src/components/candidate/ProjectEditor.tsx"),
        "utf8"
      );
      const overview = readFileSync(
        join(ROOT, "src/components/candidate/ProfileOverviewSection.tsx"),
        "utf8"
      );
      const health = readFileSync(
        join(ROOT, "src/components/candidate/CandidateProfileHealth.tsx"),
        "utf8"
      );
      const workspace = readFileSync(
        join(ROOT, "src/components/candidate/CandidateCareerWorkspace.tsx"),
        "utf8"
      );

      expect(isCareerSectionKey("projects")).toBe(true);
      expect(CAREER_SECTION_KEYS).toContain("projects");
      expect(workspace).toContain("ProjectEditor");
      expect(editor).toContain("upsertCandidateProjectAction");
      expect(editor).toContain("deleteCandidateProjectAction");
      expect(editor).toContain("Add the work you&apos;re most proud of");
      expect(editor).toContain("+ Add project");
      expect(editor).toContain("What you built");
      expect(editor).toContain("What you achieved");
      expect(editor).toContain("Technologies you used");
      expect(editor).toContain("Source: Your information");
      expect(editor).toContain("Show earlier");
      expect(editor).toContain("Show later");
      expect(editor).toContain("Remove");
      expect(editor).not.toContain("canonical career entity");
      expect(editor).not.toContain("provenance");

      expect(overview).toContain('data-testid="career-evidence-summary"');
      expect(overview).toContain("Your career profile");
      expect(overview).toContain("Career highlights");
      expect(overview).toContain("Featured projects");
      expect(overview).toContain("Profile completeness");

      expect(health).toContain('id: "projects"');
      expect(health).toContain("projectsCount");
      expect(existsSync(join(ROOT, "src/app/(dashboard)/candidate/projects"))).toBe(
        false
      );
    });

    it("surfaces projects on command center and staff candidate view", () => {
      const home = readFileSync(
        join(ROOT, "src/app/(dashboard)/candidate/page.tsx"),
        "utf8"
      );
      const staff = readFileSync(
        join(ROOT, "src/app/(dashboard)/employee/candidates/[id]/page.tsx"),
        "utf8"
      );
      const historyPage = readFileSync(
        join(ROOT, "src/app/(dashboard)/candidate/profile/page.tsx"),
        "utf8"
      );

      expect(home).toContain("projects: { select: { id: true } }");
      expect(home).toContain("projectsCount: candidate.projects.length");
      expect(staff).toContain('data-testid="staff-candidate-projects"');
      expect(staff).toContain("No projects recorded yet.");
      expect(staff).toContain("Source: Candidate provided");
      expect(historyPage).toContain('entityType === "CandidateProject"');
      expect(historyPage).toContain("Updated your projects");
    });
  });

  describe("Phase 2 protection", () => {
    it("Projects UI does not mutate Application Intelligence scoring", () => {
      const editor = readFileSync(
        join(ROOT, "src/components/candidate/ProjectEditor.tsx"),
        "utf8"
      );
      const overview = readFileSync(
        join(ROOT, "src/components/candidate/ProfileOverviewSection.tsx"),
        "utf8"
      );
      expect(editor).not.toContain("application-intelligence");
      expect(overview).not.toContain("application-intelligence");
      expect(editor).not.toContain("enqueueApplicationIntelligence");
      expect(editor).not.toContain("overallScore");
      expect(existsSync(join(ROOT, "src/lib/application-intelligence/scoring-contract.ts"))).toBe(
        true
      );
      expect(existsSync(join(ROOT, "src/lib/application-intelligence/alignment.ts"))).toBe(
        true
      );
    });
  });

  describe("Project → skill relationship limitation", () => {
    it("stores technologies as free-text on CandidateProject (no skill join table)", () => {
      const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
      const projectBlock = schema.slice(
        schema.indexOf("model CandidateProject"),
        schema.indexOf("model CandidateCertification")
      );
      expect(projectBlock).toContain("technologies");
      expect(projectBlock).not.toContain("CandidateSkill");
      expect(schema).not.toContain("CandidateProjectSkill");
    });
  });
});
