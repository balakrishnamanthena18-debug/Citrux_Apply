import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Phase 6C — Outcome ledger RLS / schema contract", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../prisma/migrations/20261006140000_phase6c_application_outcome_ledger/migration.sql"
  );
  const migrationSql = fs.readFileSync(migrationPath, "utf-8");
  const schema = fs.readFileSync(
    path.resolve(__dirname, "../../prisma/schema.prisma"),
    "utf-8"
  );

  it("FORCE RLS on application_outcome_events", () => {
    expect(migrationSql).toContain(
      'ALTER TABLE "application_outcome_events" ENABLE ROW LEVEL SECURITY'
    );
    expect(migrationSql).toContain(
      'ALTER TABLE "application_outcome_events" FORCE ROW LEVEL SECURITY'
    );
  });

  it("O2: no DELETE grant on outcome events", () => {
    expect(migrationSql).toContain(
      'GRANT SELECT, INSERT, UPDATE ON "application_outcome_events" TO "oos_app_runtime"'
    );
    expect(migrationSql).not.toMatch(
      /GRANT\s+[^;]*\bDELETE\b[^;]*application_outcome_events/i
    );
  });

  it("candidate SELECT requires visibility or own CANDIDATE_REPORTED", () => {
    expect(migrationSql).toContain("is_outcome_application_candidate_owner");
    expect(migrationSql).toContain('"candidateVisible" = true');
    expect(migrationSql).toContain(`"provenance" = 'CANDIDATE_REPORTED'`);
  });

  it("candidate INSERT only CANDIDATE_REPORTED as self actor", () => {
    expect(migrationSql).toContain("application_outcome_events_insert");
    expect(migrationSql).toContain(`"provenance" = 'CANDIDATE_REPORTED'`);
    expect(migrationSql).toContain("app.current_user_id");
  });

  it("UPDATE restricted to org privileged members", () => {
    expect(migrationSql).toContain("application_outcome_events_update");
    expect(migrationSql).toContain("is_application_org_privileged_member");
  });

  it("helper is SECURITY DEFINER with search_path sandbox", () => {
    expect(migrationSql).toContain(
      "is_outcome_application_candidate_owner(lookup_application_id uuid)"
    );
    expect(migrationSql).toContain("SECURITY DEFINER");
    expect(migrationSql).toContain("SET search_path = public, pg_temp");
  });

  it("Prisma model has no hard-delete cascade semantics for void-only ledger", () => {
    const model = schema.slice(
      schema.indexOf("model ApplicationOutcomeEvent"),
      schema.indexOf("model ApplicationMaterial")
    );
    expect(model).toContain("correctionState");
    expect(model).toContain("supersededById");
    expect(model).toContain("voidedAt");
    expect(model).toContain("evidenceStoragePath");
    expect(model).not.toContain("currentOutcome");
  });

  it("audit actions for outcome lifecycle exist", () => {
    for (const action of [
      "APPLICATION_OUTCOME_CREATED",
      "APPLICATION_OUTCOME_CANDIDATE_REPORTED",
      "APPLICATION_OUTCOME_VERIFIED",
      "APPLICATION_OUTCOME_VOIDED",
      "APPLICATION_OUTCOME_SUPERSEDED",
      "APPLICATION_OUTCOME_EVIDENCE_UPLOADED",
    ]) {
      expect(schema).toContain(action);
      expect(migrationSql).toContain(action);
    }
  });
});
