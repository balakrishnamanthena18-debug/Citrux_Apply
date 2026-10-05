-- Gate 13: extraction sourceDataVersion can exceed 128 chars
-- (snap + purpose + prompt + schema + extract versions).
ALTER TABLE "application_intelligence_runs"
  ALTER COLUMN "sourceDataVersion" TYPE VARCHAR(256);
