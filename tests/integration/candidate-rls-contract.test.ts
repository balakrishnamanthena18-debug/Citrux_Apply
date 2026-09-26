import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Candidate Core PostgreSQL RLS & Schema Contract (tests/integration/candidate-rls-contract.test.ts)", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../prisma/migrations/20260924010000_phase2_candidate_core/migration.sql"
  );
  const migrationSql = fs.readFileSync(migrationPath, "utf-8");

  it("1. Verifies FORCE ROW LEVEL SECURITY is enabled on all 7 Candidate Core tables", () => {
    const candidateTables = [
      "candidates",
      "candidate_experiences",
      "candidate_educations",
      "candidate_skills",
      "candidate_projects",
      "candidate_certifications",
      "candidate_documents",
    ];

    for (const table of candidateTables) {
      expect(migrationSql).toContain(`ALTER TABLE "public"."${table}" ENABLE ROW LEVEL SECURITY;`);
      expect(migrationSql).toContain(`ALTER TABLE "public"."${table}" FORCE ROW LEVEL SECURITY;`);
    }
  });

  it("2. Verifies Candidate SECURITY DEFINER helper functions have search_path sandboxing", () => {
    const candidateFunctions = [
      "candidate_belongs_to_user",
      "is_candidate_org_privileged_member",
    ];

    for (const fn of candidateFunctions) {
      expect(migrationSql).toContain(fn);
      expect(migrationSql).toContain("SECURITY DEFINER");
      expect(migrationSql).toContain("SET search_path = public, pg_temp");
    }
  });

  it("3. Verifies table grants are explicitly provided to oos_app_runtime", () => {
    expect(migrationSql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE');
    expect(migrationSql).toContain('"public"."candidates"');
    expect(migrationSql).toContain('"public"."candidate_experiences"');
    expect(migrationSql).toContain('"public"."candidate_educations"');
    expect(migrationSql).toContain('"public"."candidate_skills"');
    expect(migrationSql).toContain('"public"."candidate_projects"');
    expect(migrationSql).toContain('"public"."candidate_certifications"');
    expect(migrationSql).toContain('"public"."candidate_documents"');
    expect(migrationSql).toContain('TO oos_app_runtime;');
  });

  it("4. Verifies candidate child table isolation policies use candidate_belongs_to_user and is_candidate_org_privileged_member", () => {
    const childTables = [
      "candidate_experiences",
      "candidate_educations",
      "candidate_skills",
      "candidate_projects",
      "candidate_certifications",
      "candidate_documents",
    ];

    for (const table of childTables) {
      expect(migrationSql).toContain(`CREATE POLICY ${table}_select ON "public"."${table}"`);
      expect(migrationSql).toContain(`public.candidate_belongs_to_user("candidateId", public.current_user_id())`);
      expect(migrationSql).toContain(`public.is_candidate_org_privileged_member("candidateId", public.current_user_id())`);
    }
  });
});
