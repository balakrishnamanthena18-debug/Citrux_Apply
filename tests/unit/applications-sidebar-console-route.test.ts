import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../..");

describe("Applications sidebar → Application Operations Console", () => {
  it("admin sidebar Applications href points to canonical Console route", () => {
    const sidebar = readFileSync(
      join(ROOT, "src/components/navigation/AppSidebar.tsx"),
      "utf8"
    );

    // Locate ADMIN nav Applications item — must not target Oversight
    const adminSection = sidebar.slice(
      sidebar.indexOf("adminNavSections"),
      sidebar.indexOf("employeeNavSections")
    );

    expect(adminSection).toContain('label: "Applications"');
    expect(adminSection).toContain('href: "/employee/applications"');
    expect(adminSection).not.toContain('href: "/admin/applications"');
  });

  it("employee sidebar Applications href remains the Console route", () => {
    const sidebar = readFileSync(
      join(ROOT, "src/components/navigation/AppSidebar.tsx"),
      "utf8"
    );

    const employeeSection = sidebar.slice(
      sidebar.indexOf("employeeNavSections"),
      sidebar.indexOf("candidateNavSections")
    );

    expect(employeeSection).toContain('label: "Applications"');
    expect(employeeSection).toContain('href: "/employee/applications"');
  });

  it("canonical Console page renders Application Operations Console, not Oversight", () => {
    const page = readFileSync(
      join(ROOT, "src/app/(dashboard)/employee/applications/page.tsx"),
      "utf8"
    );
    const workbench = readFileSync(
      join(ROOT, "src/components/application/EmployeeApplicationsWorkbench.tsx"),
      "utf8"
    );
    const legacyAdminPage = readFileSync(
      join(ROOT, "src/app/(dashboard)/admin/applications/page.tsx"),
      "utf8"
    );

    expect(page).toContain("EmployeeApplicationsWorkbench");
    expect(workbench).toContain("Application Operations Console");
    expect(workbench).not.toContain("Application Operations Oversight");
    expect(workbench).toContain("Create Managed Application");

    // Legacy Oversight route must redirect — not render Oversight as primary
    expect(legacyAdminPage).toContain('redirect("/employee/applications")');
    expect(legacyAdminPage).not.toContain(
      'from "@/components/admin/AdminApplicationsWorkbench"'
    );
  });

  it("admin mobile Apps tab targets the Console", () => {
    const mobile = readFileSync(
      join(ROOT, "src/components/navigation/mobileNavItems.tsx"),
      "utf8"
    );
    // After employee block, admin return uses Console href
    const adminBlock = mobile.slice(mobile.lastIndexOf("// ADMIN"));
    expect(adminBlock).toContain('href: "/employee/applications"');
    expect(adminBlock).not.toContain('href: "/admin/applications"');
  });
});
