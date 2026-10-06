-- Phase 5R — Application assignment-time structural snapshot (continuity proof).
-- Additive nullable columns only. No backfill. No ownership/status mutation.
-- Legacy rows remain NULL (= SNAPSHOT_UNKNOWN).
-- Column names follow applications table camelCase convention.

ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "assignedTeamKey" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "assignedManagerId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'applications_assignedManagerId_fkey'
  ) THEN
    ALTER TABLE "applications"
      ADD CONSTRAINT "applications_assignedManagerId_fkey"
      FOREIGN KEY ("assignedManagerId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
