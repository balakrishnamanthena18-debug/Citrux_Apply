-- Migration: Distributed Database-Backed Authentication Rate Limiting (v2.5.0)

CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "key_hash" VARCHAR(64) NOT NULL,
  "action" VARCHAR(50) NOT NULL,
  "window_start" TIMESTAMPTZ(6) NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "locked_until" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

-- Unique index on key_hash for atomic upsert concurrency locks
CREATE UNIQUE INDEX IF NOT EXISTS "rate_limit_buckets_key_hash_key" ON "rate_limit_buckets"("key_hash");

-- Supporting performance indexes
CREATE INDEX IF NOT EXISTS "idx_rate_limit_buckets_action" ON "rate_limit_buckets"("action");
CREATE INDEX IF NOT EXISTS "idx_rate_limit_buckets_locked_until" ON "rate_limit_buckets"("locked_until");
CREATE INDEX IF NOT EXISTS "idx_rate_limit_buckets_window_start" ON "rate_limit_buckets"("window_start");
