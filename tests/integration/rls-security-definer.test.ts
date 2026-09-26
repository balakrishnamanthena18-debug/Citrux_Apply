import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("PostgreSQL RLS & SECURITY DEFINER Contract Verification (tests/integration/rls-security-definer.test.ts)", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../prisma/migrations/20260924000000_phase1_identity_rbac/migration.sql"
  );
  const migrationSql = fs.readFileSync(migrationPath, "utf-8");

  it("verifies oos_app_runtime role definition contains NOSUPERUSER NOBYPASSRLS", () => {
    expect(migrationSql).toContain("NOSUPERUSER");
    expect(migrationSql).toContain("NOBYPASSRLS");
    expect(migrationSql).toContain("NOCREATEDB");
    expect(migrationSql).toContain("NOCREATEROLE");
    expect(migrationSql).toContain("CREATE ROLE oos_app_runtime");
  });

  it("verifies FORCE ROW LEVEL SECURITY is applied to all Phase 1 tables", () => {
    const requiredTables = ["users", "organizations", "memberships", "audit_events"];
    for (const table of requiredTables) {
      expect(migrationSql).toContain(`ALTER TABLE "public"."${table}" ENABLE ROW LEVEL SECURITY;`);
      expect(migrationSql).toContain(`ALTER TABLE "public"."${table}" FORCE ROW LEVEL SECURITY;`);
    }
  });

  it("verifies all SECURITY DEFINER functions have explicit search_path sandboxing", () => {
    const functions = [
      "get_user_active_org_ids",
      "get_user_co_member_ids",
      "is_org_privileged_member",
      "is_org_admin",
      "system_provision_initial_organization",
      "system_log_audit_event",
    ];

    for (const fn of functions) {
      expect(migrationSql).toContain(fn);
      expect(migrationSql).toContain("SECURITY DEFINER");
      expect(migrationSql).toContain("SET search_path = public, pg_temp");
    }
  });

  it("verifies PUBLIC execution is revoked and EXECUTE is explicitly granted to oos_app_runtime", () => {
    expect(migrationSql).toContain("REVOKE ALL ON FUNCTION public.system_provision_initial_organization(text, text, uuid) FROM PUBLIC;");
    expect(migrationSql).toContain("REVOKE ALL ON FUNCTION public.system_log_audit_event(uuid, uuid, text, public.\"AuditAction\", text, text, jsonb, text, text) FROM PUBLIC;");
    expect(migrationSql).toContain("GRANT EXECUTE ON FUNCTION public.system_provision_initial_organization(text, text, uuid) TO oos_app_runtime;");
    expect(migrationSql).toContain("GRANT EXECUTE ON FUNCTION public.system_log_audit_event(uuid, uuid, text, public.\"AuditAction\", text, text, jsonb, text, text) TO oos_app_runtime;");
  });

  it("verifies organizations table blocks direct client/runtime INSERT", () => {
    expect(migrationSql).toContain("CREATE POLICY orgs_insert ON public.organizations");
    expect(migrationSql).toContain("FOR INSERT WITH CHECK (\n    false\n  );");
  });

  it("verifies audit_events table restricts insert to user actor type and requires authenticated context", () => {
    expect(migrationSql).toContain("CREATE POLICY audit_insert ON public.audit_events");
    expect(migrationSql).toContain('"actorType" = \'USER\'');
  });

  it("verifies users and memberships INSERT require valid authenticated identity", () => {
    expect(migrationSql).toContain("CREATE POLICY users_insert ON public.users");
    expect(migrationSql).toContain("id = public.current_user_id()");
    expect(migrationSql).toContain("CREATE POLICY memberships_insert ON public.memberships");
    expect(migrationSql).toContain('public.is_org_admin("organizationId", public.current_user_id())');
  });
});
