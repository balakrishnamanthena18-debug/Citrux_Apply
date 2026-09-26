import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Application Core PostgreSQL RLS & Schema Contract (tests/integration/application-rls-contract.test.ts)", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../prisma/migrations/20260924020000_phase3_application_core/migration.sql"
  );
  const migrationSql = fs.readFileSync(migrationPath, "utf-8");

  it("1. Verifies FORCE ROW LEVEL SECURITY is enabled on all 5 Application Core tables", () => {
    const applicationTables = [
      "jobs",
      "applications",
      "application_materials",
      "application_submissions",
      "application_state_history",
    ];

    for (const table of applicationTables) {
      expect(migrationSql).toContain(`ALTER TABLE "public"."${table}" ENABLE ROW LEVEL SECURITY;`);
      expect(migrationSql).toContain(`ALTER TABLE "public"."${table}" FORCE ROW LEVEL SECURITY;`);
    }
  });

  it("2. Verifies Application Core SECURITY DEFINER helper functions have search_path sandboxing", () => {
    const helperFunctions = [
      "is_job_org_privileged_member",
      "is_application_org_privileged_member",
      "application_belongs_to_candidate_user",
    ];

    for (const fn of helperFunctions) {
      expect(migrationSql).toContain(fn);
      expect(migrationSql).toContain("SECURITY DEFINER");
      expect(migrationSql).toContain("SET search_path = public, pg_temp");
    }
  });

  it("3. Verifies table grants are explicitly provided to oos_app_runtime role", () => {
    expect(migrationSql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE');
    expect(migrationSql).toContain('"public"."jobs"');
    expect(migrationSql).toContain('"public"."applications"');
    expect(migrationSql).toContain('"public"."application_materials"');
    expect(migrationSql).toContain('"public"."application_submissions"');
    expect(migrationSql).toContain('"public"."application_state_history"');
    expect(migrationSql).toContain('TO oos_app_runtime;');
  });

  it("4. Verifies partial unique index for reapplication is properly defined", () => {
    expect(migrationSql).toContain('CREATE UNIQUE INDEX "applications_active_candidate_job_idx"');
    expect(migrationSql).toContain('ON "public"."applications"("candidateId", "jobId")');
    expect(migrationSql).toContain('WHERE "status" NOT IN (\'REJECTED\', \'WITHDRAWN\', \'FAILED\');');
  });

  it("5. Verifies Application table isolation policies use application_belongs_to_candidate_user and is_application_org_privileged_member", () => {
    const childTables = [
      "application_materials",
      "application_submissions",
      "application_state_history",
    ];

    for (const table of childTables) {
      expect(migrationSql).toContain(`CREATE POLICY ${table}_select ON "public"."${table}"`);
      expect(migrationSql).toContain(`public.application_belongs_to_candidate_user("applicationId", public.current_user_id())`);
      expect(migrationSql).toContain(`public.is_application_org_privileged_member("applicationId", public.current_user_id())`);
    }
  });
});
