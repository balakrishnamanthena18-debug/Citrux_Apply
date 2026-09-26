import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Phase 5 QA & Approval PostgreSQL RLS & Schema Contract (tests/integration/qa-approval-rls.test.ts)", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../prisma/migrations/20260924040000_phase5_qa_approval_core/migration.sql"
  );
  const migrationSql = fs.readFileSync(migrationPath, "utf-8");

  it("1. Verifies FORCE ROW LEVEL SECURITY is enabled on all QA Core tables", () => {
    const qaTables = ["application_qa_reviews", "application_qa_checklists"];

    for (const table of qaTables) {
      expect(migrationSql).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
      expect(migrationSql).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`);
    }
  });

  it("2. Verifies QA SECURITY DEFINER helper function has search_path sandboxing", () => {
    expect(migrationSql).toContain("is_qa_review_org_privileged_member");
    expect(migrationSql).toContain("SECURITY DEFINER");
    expect(migrationSql).toContain("SET search_path = public, pg_temp");
  });

  it("3. Verifies table grants are explicitly provided to oos_app_runtime role", () => {
    expect(migrationSql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON "application_qa_reviews" TO "oos_app_runtime";');
    expect(migrationSql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON "application_qa_checklists" TO "oos_app_runtime";');
  });

  it("4. Verifies staff-only isolation policies are present on QA tables", () => {
    expect(migrationSql).toContain('CREATE POLICY "application_qa_reviews_staff_select"');
    expect(migrationSql).toContain('public.is_org_privileged_member("organizationId")');
    expect(migrationSql).toContain('CREATE POLICY "application_qa_checklists_staff_select"');
    expect(migrationSql).toContain('public.is_qa_review_org_privileged_member("qaReviewId")');
  });
});
