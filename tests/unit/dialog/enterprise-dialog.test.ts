import { describe, it, expect } from "vitest";
import { ConfirmDialog, AlertDialog, AppDialog, AppToast } from "@/components/ui/dialog";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const SRC_DIR = join(__dirname, "../../../src");

function getAllSourceFiles(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir);
  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      getAllSourceFiles(filePath, fileList);
    } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

describe("Enterprise Dialog & Interaction Design System", () => {
  describe("Component Export Integrity", () => {
    it("exports ConfirmDialog, AlertDialog, AppDialog, and AppToast cleanly", () => {
      expect(ConfirmDialog).toBeDefined();
      expect(AlertDialog).toBeDefined();
      expect(AppDialog).toBeDefined();
      expect(AppToast).toBeDefined();
    });
  });

  describe("Repository-Wide Native Dialog Ban", () => {
    it("ensures zero native confirm() calls exist in src/", () => {
      const allFiles = getAllSourceFiles(SRC_DIR);
      const violations: string[] = [];

      for (const file of allFiles) {
        const content = readFileSync(file, "utf-8");
        // Check for window.confirm( or confirm( (ignoring comments)
        const lines = content.split("\n");
        lines.forEach((line, idx) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
          if (/\b(window\.)?confirm\(/.test(trimmed)) {
            violations.push(`${file}:${idx + 1}: ${trimmed}`);
          }
        });
      }

      expect(violations).toEqual([]);
    });

    it("ensures zero native alert() calls exist in src/", () => {
      const allFiles = getAllSourceFiles(SRC_DIR);
      const violations: string[] = [];

      for (const file of allFiles) {
        const content = readFileSync(file, "utf-8");
        const lines = content.split("\n");
        lines.forEach((line, idx) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
          if (/\b(window\.)?alert\(/.test(trimmed)) {
            violations.push(`${file}:${idx + 1}: ${trimmed}`);
          }
        });
      }

      expect(violations).toEqual([]);
    });

    it("ensures zero native prompt() calls exist in src/", () => {
      const allFiles = getAllSourceFiles(SRC_DIR);
      const violations: string[] = [];

      for (const file of allFiles) {
        const content = readFileSync(file, "utf-8");
        const lines = content.split("\n");
        lines.forEach((line, idx) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
          if (/\b(window\.)?prompt\(/.test(trimmed)) {
            violations.push(`${file}:${idx + 1}: ${trimmed}`);
          }
        });
      }

      expect(violations).toEqual([]);
    });
  });

  describe("DesignationManager Archive Flow", () => {
    it("integrates ConfirmDialog into DesignationManager", () => {
      const path = join(SRC_DIR, "components/admin/DesignationManager.tsx");
      const content = readFileSync(path, "utf-8");

      expect(content).toContain("<ConfirmDialog");
      expect(content).toContain('title={statusConfirmItem?.nextStatus === "ARCHIVED" ? "Archive designation?" : "Reactivate designation?"}');
      expect(content).toContain('confirmLabel={statusConfirmItem?.nextStatus === "ARCHIVED" ? "Archive designation" : "Reactivate designation"}');
      expect(content).toContain('variant={statusConfirmItem?.nextStatus === "ARCHIVED" ? "danger" : "primary"}');
      expect(content).not.toContain("window.confirm");
    });
  });

  describe("Candidate Editors Integration", () => {
    it("integrates enterprise dialogs into EducationEditor", () => {
      const path = join(SRC_DIR, "components/candidate/EducationEditor.tsx");
      const content = readFileSync(path, "utf-8");
      expect(content).toContain("<ConfirmDialog");
      expect(content).toContain("<AlertDialog");
      expect(content).not.toContain("window.confirm");
      expect(content).not.toContain("alert(");
    });

    it("integrates enterprise dialogs into ExperienceEditor", () => {
      const path = join(SRC_DIR, "components/candidate/ExperienceEditor.tsx");
      const content = readFileSync(path, "utf-8");
      expect(content).toContain("<ConfirmDialog");
      expect(content).toContain("<AlertDialog");
      expect(content).not.toContain("window.confirm");
      expect(content).not.toContain("alert(");
    });

    it("integrates enterprise dialogs into CertificationManager", () => {
      const path = join(SRC_DIR, "components/candidate/CertificationManager.tsx");
      const content = readFileSync(path, "utf-8");
      expect(content).toContain("<ConfirmDialog");
      expect(content).toContain("<AlertDialog");
      expect(content).not.toContain("window.confirm");
      expect(content).not.toContain("alert(");
    });

    it("integrates enterprise dialogs into ProjectEditor", () => {
      const path = join(SRC_DIR, "components/candidate/ProjectEditor.tsx");
      const content = readFileSync(path, "utf-8");
      expect(content).toContain("<ConfirmDialog");
      expect(content).not.toContain("window.confirm");
    });

    it("integrates enterprise dialogs into CandidateProfileManager", () => {
      const path = join(SRC_DIR, "components/CandidateProfileManager.tsx");
      const content = readFileSync(path, "utf-8");
      expect(content).toContain("<ConfirmDialog");
      expect(content).not.toContain("!confirm(");
    });

    it("integrates enterprise dialogs into EmployeeCandidateDocuments", () => {
      const path = join(SRC_DIR, "components/EmployeeCandidateDocuments.tsx");
      const content = readFileSync(path, "utf-8");
      expect(content).toContain("<ConfirmDialog");
      expect(content).not.toContain("!confirm(");
    });

    it("integrates enterprise dialogs into AuditInvestigationWorkbench", () => {
      const path = join(SRC_DIR, "components/admin/AuditInvestigationWorkbench.tsx");
      const content = readFileSync(path, "utf-8");
      expect(content).toContain("<AlertDialog");
      expect(content).not.toContain("alert(");
    });
  });
});
