import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Task Core PostgreSQL RLS & Schema Contract (tests/integration/task-rls-contract.test.ts)", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../prisma/migrations/20260924030000_phase4_task_core/migration.sql"
  );
  const migrationSql = fs.readFileSync(migrationPath, "utf-8");

  it("1. Verifies FORCE ROW LEVEL SECURITY is enabled on all 3 Task Core tables", () => {
    const taskTables = [
      "tasks",
      "task_checklist_items",
      "task_state_history",
    ];

    for (const table of taskTables) {
      expect(migrationSql).toContain(`ALTER TABLE "public"."${table}" ENABLE ROW LEVEL SECURITY;`);
      expect(migrationSql).toContain(`ALTER TABLE "public"."${table}" FORCE ROW LEVEL SECURITY;`);
    }
  });

  it("2. Verifies Task SECURITY DEFINER helper function has search_path sandboxing", () => {
    expect(migrationSql).toContain("is_task_org_privileged_member");
    expect(migrationSql).toContain("SECURITY DEFINER");
    expect(migrationSql).toContain("SET search_path = public, pg_temp");
  });

  it("3. Verifies table grants are explicitly provided to oos_app_runtime role", () => {
    expect(migrationSql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE');
    expect(migrationSql).toContain('"public"."tasks"');
    expect(migrationSql).toContain('"public"."task_checklist_items"');
    expect(migrationSql).toContain('"public"."task_state_history"');
    expect(migrationSql).toContain('TO oos_app_runtime;');
  });

  it("4. Verifies staff-only isolation policies are present on Task tables", () => {
    expect(migrationSql).toContain('CREATE POLICY tasks_select ON "public"."tasks"');
    expect(migrationSql).toContain('public.is_org_privileged_member("organizationId", public.current_user_id())');
    expect(migrationSql).toContain('CREATE POLICY task_checklist_items_select ON "public"."task_checklist_items"');
    expect(migrationSql).toContain('public.is_task_org_privileged_member("taskId", public.current_user_id())');
  });
});
