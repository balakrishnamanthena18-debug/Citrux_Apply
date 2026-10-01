#!/usr/bin/env npx tsx
/**
 * OOS Storage integrity verification CLI — source vs target metadata compare.
 *
 * DO NOT run against production until migration verification is authorized.
 *
 * Required env:
 *   SOURCE_SUPABASE_URL
 *   SOURCE_SUPABASE_SERVICE_ROLE_KEY
 *   TARGET_SUPABASE_URL
 *   TARGET_SUPABASE_SERVICE_ROLE_KEY
 *
 * Safety:
 *   CONFIRM_STORAGE_VERIFY=YES required
 *   Compares path / size / contentType only
 *   Does NOT download file bodies
 *   Does NOT log credentials or signed URLs
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  requireMigrateEnv,
  summarizeVerify,
  verifyOosBuckets,
  redactSecrets,
} from "./lib/storage-migrate-core";
import { createSupabaseStorageAdapter } from "./lib/supabase-storage-adapter";

function main(): void {
  const envCheck = requireMigrateEnv(process.env);
  if (!envCheck.ok) {
    console.error("Missing required environment variables:");
    for (const key of envCheck.missing) {
      console.error(`  - ${key}`);
    }
    process.exit(1);
  }

  if (process.env.CONFIRM_STORAGE_VERIFY !== "YES") {
    console.error(
      "Refusing to run. Set CONFIRM_STORAGE_VERIFY=YES only after explicit authorization."
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
  const secrets = [
    env.SOURCE_SUPABASE_SERVICE_ROLE_KEY,
    env.TARGET_SUPABASE_SERVICE_ROLE_KEY,
  ];

  void (async () => {
    try {
      // listObjects + getBucket only — no download of bodies in verify path
      const results = await verifyOosBuckets({ source, target });
      const outPath = resolve(
        process.cwd(),
        process.env.STORAGE_VERIFY_REPORT_PATH || "storage-verify-report.json"
      );
      writeFileSync(
        outPath,
        JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)
      );
      console.log(`Report written: ${outPath}`);
      const summary = summarizeVerify(results);
      console.log("Summary:", summary);

      const bad =
        (summary.MISSING ?? 0) + (summary.MISMATCH ?? 0) + (summary.EXTRA ?? 0);
      process.exit(bad > 0 ? 4 : 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(redactSecrets(message, secrets));
      process.exit(5);
    }
  })();
}

main();
