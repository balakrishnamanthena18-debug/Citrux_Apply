import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("RLS Non-Recursion Architecture Verification (tests/integration/rls-recursion.test.ts)", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../prisma/migrations/20260924000000_phase1_identity_rbac/migration.sql"
  );
  const migrationSql = fs.readFileSync(migrationPath, "utf-8");

  it("verifies is_org_privileged_member executes with SECURITY DEFINER to bypass table RLS recursion", () => {
    const fnDef = migrationSql.match(
      /CREATE OR REPLACE FUNCTION public\.is_org_privileged_member[\s\S]*?LANGUAGE sql STABLE/i
    );
    expect(fnDef).not.toBeNull();
    const sql = fnDef![0];
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public, pg_temp");
  });

  it("verifies is_org_admin executes with SECURITY DEFINER to bypass table RLS recursion", () => {
    const fnDef = migrationSql.match(
      /CREATE OR REPLACE FUNCTION public\.is_org_admin[\s\S]*?LANGUAGE sql STABLE/i
    );
    expect(fnDef).not.toBeNull();
    const sql = fnDef![0];
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public, pg_temp");
  });

  it("verifies get_user_active_org_ids executes with SECURITY DEFINER", () => {
    const fnDef = migrationSql.match(
      /CREATE OR REPLACE FUNCTION public\.get_user_active_org_ids[\s\S]*?LANGUAGE sql STABLE/i
    );
    expect(fnDef).not.toBeNull();
    const sql = fnDef![0];
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public, pg_temp");
  });

  it("verifies memberships policy uses SECURITY DEFINER helper to prevent recursive policy evaluations", () => {
    expect(migrationSql).toContain("CREATE POLICY memberships_select ON public.memberships");
    expect(migrationSql).toContain('public.is_org_privileged_member("organizationId", public.current_user_id())');
  });
});
