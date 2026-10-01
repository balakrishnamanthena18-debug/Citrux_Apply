#!/usr/bin/env npx tsx
/**
 * OOS Storage migration CLI — METHOD B (service-role copy).
 *
 * DO NOT run against production until migration is explicitly authorized.
 *
 * Required env (never commit):
 *   SOURCE_SUPABASE_URL
 *   SOURCE_SUPABASE_SERVICE_ROLE_KEY
 *   TARGET_SUPABASE_URL
 *   TARGET_SUPABASE_SERVICE_ROLE_KEY
 *
 * Safety:
 *   CONFIRM_STORAGE_MIGRATE=YES  — required to perform network copy
 *   CONFIRM_SOURCE_BUCKETS_PRIVATE=YES — required when source bucket admin
 *     APIs are unavailable but object list/download works (verify privacy
 *     out-of-band, e.g. storage.buckets.public = false)
 *   Does NOT create target buckets (prints TARGET BUCKET REQUIRED)
 *   Does NOT delete source objects
 *   Does NOT make buckets public
 *   Does NOT overwrite conflicting target objects (BLOCKED_TARGET_CONFLICT)
 *   Does NOT log credentials, signed URLs, or file bodies
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  migrateOosBuckets,
  requireMigrateEnv,
  summarizeManifest,
  assertAdapterHasNoDelete,
  redactSecrets,
} from "./lib/storage-migrate-core";
import { createSupabaseStorageAdapter } from "./lib/supabase-storage-adapter";
import { OOS_STORAGE_BUCKETS } from "./lib/storage-types";

function main(): void {
  const envCheck = requireMigrateEnv(process.env);
  if (!envCheck.ok) {
    console.error("Missing required environment variables:");
    for (const key of envCheck.missing) {
      console.error(`  - ${key}`);
    }
    process.exit(1);
  }

  if (process.env.CONFIRM_STORAGE_MIGRATE !== "YES") {
    console.error(
      "Refusing to run. Set CONFIRM_STORAGE_MIGRATE=YES only after explicit migration authorization."
    );
    console.error(
      `Expected buckets: ${OOS_STORAGE_BUCKETS.join(", ")}`
    );
    process.exit(2);
  }

  const { value: env } = envCheck;
  const source = createSupabaseStorageAdapter(
    env.SOURCE_SUPABASE_URL,
    env.SOURCE_SUPABASE_SERVICE_ROLE_KEY
  );
  const target = createSupabaseStorageAdapter(
    env.TARGET_SUPABASE_URL,
    env.TARGET_SUPABASE_SERVICE_ROLE_KEY
  );

  if (!assertAdapterHasNoDelete(source) || !assertAdapterHasNoDelete(target)) {
    console.error("Adapter exposes delete/remove — aborting for safety.");
    process.exit(3);
  }

  const secrets = [
    env.SOURCE_SUPABASE_SERVICE_ROLE_KEY,
    env.TARGET_SUPABASE_SERVICE_ROLE_KEY,
  ];

  void (async () => {
    try {
      const manifest = await migrateOosBuckets({
        source,
        target,
        log: (entry) => {
          const line = redactSecrets(
            `[${entry.level}] ${entry.message} ${JSON.stringify(entry.meta ?? {})}`,
            secrets
          );
          if (entry.level === "error") console.error(line);
          else console.log(line);
        },
      });

      const outPath = resolve(
        process.cwd(),
        process.env.STORAGE_MIGRATE_MANIFEST_PATH ||
          "storage-migrate-manifest.json"
      );
      writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), manifest }, null, 2));
      console.log(`Manifest written: ${outPath}`);
      console.log("Summary:", summarizeManifest(manifest));

      const blocked = manifest.some(
        (m) =>
          m.status === "TARGET_BUCKET_REQUIRED" ||
          m.status === "BLOCKED_PUBLIC_BUCKET" ||
          m.status === "SOURCE_BUCKET_MISSING" ||
          m.status === "BLOCKED_TARGET_CONFLICT"
      );
      const failed = manifest.some((m) => m.status === "FAILED");
      if (blocked || failed) process.exit(4);
      process.exit(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(redactSecrets(message, secrets));
      process.exit(5);
    }
  })();
}

main();
