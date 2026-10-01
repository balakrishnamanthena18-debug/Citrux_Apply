/**
 * Pure / injectable Storage migration logic for OOS.
 * DO NOT import production secrets. Network only via StorageAdapter.
 */

import {
  OOS_STORAGE_BUCKETS,
  type BucketInfo,
  type ManifestEntry,
  type MigrateEnv,
  type ObjectMeta,
  type RedactedLog,
  type StorageAdapter,
  type VerifyEntry,
} from "./storage-types";

const SECRET_ENV_KEYS = [
  "SOURCE_SUPABASE_SERVICE_ROLE_KEY",
  "TARGET_SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export function requireMigrateEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>
): { ok: true; value: MigrateEnv } | { ok: false; missing: string[] } {
  const required = [
    "SOURCE_SUPABASE_URL",
    "SOURCE_SUPABASE_SERVICE_ROLE_KEY",
    "TARGET_SUPABASE_URL",
    "TARGET_SUPABASE_SERVICE_ROLE_KEY",
  ] as const;
  const missing = required.filter((k) => !env[k] || String(env[k]).trim() === "");
  if (missing.length > 0) {
    return { ok: false, missing: [...missing] };
  }
  return {
    ok: true,
    value: {
      SOURCE_SUPABASE_URL: String(env.SOURCE_SUPABASE_URL),
      SOURCE_SUPABASE_SERVICE_ROLE_KEY: String(env.SOURCE_SUPABASE_SERVICE_ROLE_KEY),
      TARGET_SUPABASE_URL: String(env.TARGET_SUPABASE_URL),
      TARGET_SUPABASE_SERVICE_ROLE_KEY: String(env.TARGET_SUPABASE_SERVICE_ROLE_KEY),
    },
  };
}

/** Strip credential-like values from strings before logging. */
export function redactSecrets(input: string, secrets: string[] = []): string {
  let out = input;
  for (const secret of secrets) {
    if (!secret || secret.length < 8) continue;
    out = out.split(secret).join("<REDACTED>");
  }
  // Heuristic: JWT-shaped tokens
  out = out.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "<REDACTED_JWT>");
  // Heuristic: signed URL query signatures
  out = out.replace(/([?&](token|signature|sig)=)[^&\s]+/gi, "$1<REDACTED>");
  return out;
}

export function assertNoSecretInLog(
  message: string,
  env: Record<string, string | undefined>
): boolean {
  for (const key of SECRET_ENV_KEYS) {
    const val = env[key];
    if (val && val.length >= 8 && message.includes(val)) {
      return false;
    }
  }
  if (/https?:\/\/[^\s]+token=/i.test(message)) {
    return false;
  }
  return true;
}

export function validatePrivateBucket(bucket: BucketInfo | null, expectedName: string): {
  ok: boolean;
  code?: ManifestEntry["status"];
  message: string;
} {
  if (!bucket) {
    return {
      ok: false,
      code: "TARGET_BUCKET_REQUIRED",
      message: `TARGET BUCKET REQUIRED: ${expectedName}`,
    };
  }
  if (bucket.public === true) {
    return {
      ok: false,
      code: "BLOCKED_PUBLIC_BUCKET",
      message: `Refusing to operate on public bucket: ${expectedName}`,
    };
  }
  return { ok: true, message: `Bucket ${expectedName} is private` };
}

export function objectsEqualForSkip(
  source: ObjectMeta,
  target: ObjectMeta | null
): boolean {
  if (!target) return false;
  if (source.path !== target.path) return false;
  if (source.size == null || target.size == null) return false;
  if (source.size !== target.size) return false;
  if (source.contentType && target.contentType) {
    return source.contentType === target.contentType;
  }
  // If either MIME is unknown but sizes match, treat as identical for idempotent skip
  return true;
}

export function classifyVerify(
  source: ObjectMeta | undefined,
  target: ObjectMeta | undefined
): VerifyEntry {
  if (source && !target) {
    return {
      bucket: "",
      path: source.path,
      sourceSize: source.size,
      targetSize: null,
      sourceContentType: source.contentType,
      targetContentType: null,
      status: "MISSING",
      reason: "Target object missing",
    };
  }
  if (!source && target) {
    return {
      bucket: "",
      path: target.path,
      sourceSize: null,
      targetSize: target.size,
      sourceContentType: null,
      targetContentType: target.contentType,
      status: "EXTRA",
      reason: "Extra object on target",
    };
  }
  if (!source || !target) {
    return {
      bucket: "",
      path: "",
      sourceSize: null,
      targetSize: null,
      sourceContentType: null,
      targetContentType: null,
      status: "MISMATCH",
      reason: "Invalid comparison",
    };
  }
  const sizeMismatch =
    source.size != null && target.size != null && source.size !== target.size;
  const mimeMismatch =
    !!source.contentType &&
    !!target.contentType &&
    source.contentType !== target.contentType;
  if (sizeMismatch || mimeMismatch) {
    return {
      bucket: "",
      path: source.path,
      sourceSize: source.size,
      targetSize: target.size,
      sourceContentType: source.contentType,
      targetContentType: target.contentType,
      status: "MISMATCH",
      reason: [
        sizeMismatch ? "size" : null,
        mimeMismatch ? "contentType" : null,
      ]
        .filter(Boolean)
        .join("+"),
    };
  }
  return {
    bucket: "",
    path: source.path,
    sourceSize: source.size,
    targetSize: target.size,
    sourceContentType: source.contentType,
    targetContentType: target.contentType,
    status: "MATCH",
  };
}

export function compareObjectMaps(
  bucket: string,
  sourceObjects: ObjectMeta[],
  targetObjects: ObjectMeta[]
): VerifyEntry[] {
  const sourceMap = new Map(sourceObjects.map((o) => [o.path, o]));
  const targetMap = new Map(targetObjects.map((o) => [o.path, o]));
  const paths = new Set([...sourceMap.keys(), ...targetMap.keys()]);
  const results: VerifyEntry[] = [];
  for (const path of [...paths].sort()) {
    const entry = classifyVerify(sourceMap.get(path), targetMap.get(path));
    entry.bucket = bucket;
    entry.path = path;
    results.push(entry);
  }
  return results;
}

/**
 * Migrates one bucket. Does NOT create target buckets.
 * Never deletes source. Never makes buckets public.
 */
export async function migrateBucket(params: {
  bucket: string;
  source: StorageAdapter;
  target: StorageAdapter;
  log?: (entry: RedactedLog) => void;
}): Promise<ManifestEntry[]> {
  const { bucket, source, target, log } = params;
  const manifest: ManifestEntry[] = [];

  const sourceBuckets = await source.listBuckets();
  let sourceBucket =
    sourceBuckets.find((b) => b.name === bucket) ??
    (await source.getBucket(bucket));

  // Some Supabase projects allow object list/download via service role but
  // deny bucket admin APIs (listBuckets/getBucket return empty/not found).
  // In that case, prove object-plane access and require an explicit private confirm.
  if (!sourceBucket) {
    try {
      await source.listObjects(bucket, "");
      if (process.env.CONFIRM_SOURCE_BUCKETS_PRIVATE === "YES") {
        sourceBucket = {
          name: bucket,
          public: false,
          fileSizeLimit: null,
          allowedMimeTypes: null,
        };
        log?.({
          level: "warn",
          message:
            "Source bucket admin metadata unavailable; proceeding under CONFIRM_SOURCE_BUCKETS_PRIVATE=YES",
          meta: { bucket },
        });
      }
    } catch {
      // fall through to SOURCE_BUCKET_MISSING
    }
  }

  if (!sourceBucket) {
    manifest.push({
      bucket,
      path: "*",
      sourceSize: null,
      targetSize: null,
      contentType: null,
      status: "SOURCE_BUCKET_MISSING",
      error: `Source bucket missing: ${bucket}`,
    });
    return manifest;
  }

  const sourcePrivate = validatePrivateBucket(sourceBucket, bucket);
  if (!sourcePrivate.ok) {
    manifest.push({
      bucket,
      path: "*",
      sourceSize: null,
      targetSize: null,
      contentType: null,
      status: sourcePrivate.code!,
      error: sourcePrivate.message,
    });
    return manifest;
  }

  const targetBucket = await target.getBucket(bucket);
  const targetPrivate = validatePrivateBucket(targetBucket, bucket);
  if (!targetPrivate.ok) {
    manifest.push({
      bucket,
      path: "*",
      sourceSize: null,
      targetSize: null,
      contentType: null,
      status: targetPrivate.code!,
      error: targetPrivate.message,
    });
    log?.({
      level: "error",
      message: targetPrivate.message,
      meta: { bucket },
    });
    return manifest;
  }

  const objects = await source.listObjects(bucket, "");
  log?.({
    level: "info",
    message: "Enumerated source objects",
    meta: { bucket, count: objects.length },
  });

  for (const obj of objects) {
    try {
      const existing = await target.getObjectMeta(bucket, obj.path);
      if (objectsEqualForSkip(obj, existing)) {
        manifest.push({
          bucket,
          path: obj.path,
          sourceSize: obj.size,
          targetSize: existing!.size,
          contentType: obj.contentType,
          status: "SKIPPED_IDENTICAL",
        });
        continue;
      }

      // Target exists with different size/MIME — STOP (do not overwrite).
      if (existing) {
        manifest.push({
          bucket,
          path: obj.path,
          sourceSize: obj.size,
          targetSize: existing.size,
          contentType: obj.contentType,
          status: "BLOCKED_TARGET_CONFLICT",
          error:
            "Target object exists with conflicting metadata; refusing overwrite",
        });
        log?.({
          level: "error",
          message: "BLOCKED_TARGET_CONFLICT — refusing overwrite",
          meta: { bucket },
        });
        return manifest;
      }

      const body = await source.download(bucket, obj.path);
      await target.upload(bucket, obj.path, body, {
        contentType: obj.contentType,
        upsert: false,
      });

      const after = await target.getObjectMeta(bucket, obj.path);
      const sizeOk =
        obj.size == null || after?.size == null || obj.size === after.size;
      const mimeOk =
        !obj.contentType ||
        !after?.contentType ||
        obj.contentType === after.contentType;

      if (!after || !sizeOk || !mimeOk) {
        manifest.push({
          bucket,
          path: obj.path,
          sourceSize: obj.size,
          targetSize: after?.size ?? null,
          contentType: obj.contentType,
          status: "FAILED",
          error: !after
            ? "Upload completed but target meta missing"
            : !sizeOk
              ? "Size mismatch after upload"
              : "Content-type mismatch after upload",
        });
        continue;
      }

      manifest.push({
        bucket,
        path: obj.path,
        sourceSize: obj.size,
        targetSize: after.size,
        contentType: obj.contentType,
        status: "COPIED",
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown migration error";
      manifest.push({
        bucket,
        path: obj.path,
        sourceSize: obj.size,
        targetSize: null,
        contentType: obj.contentType,
        status: "FAILED",
        error: redactSecrets(message),
      });
    }
  }

  return manifest;
}

export async function migrateOosBuckets(params: {
  source: StorageAdapter;
  target: StorageAdapter;
  buckets?: readonly string[];
  log?: (entry: RedactedLog) => void;
}): Promise<ManifestEntry[]> {
  const buckets = params.buckets ?? OOS_STORAGE_BUCKETS;
  const all: ManifestEntry[] = [];
  for (const bucket of buckets) {
    const entries = await migrateBucket({
      bucket,
      source: params.source,
      target: params.target,
      log: params.log,
    });
    all.push(...entries);
  }
  return all;
}

export async function verifyOosBuckets(params: {
  source: StorageAdapter;
  target: StorageAdapter;
  buckets?: readonly string[];
}): Promise<VerifyEntry[]> {
  const buckets = params.buckets ?? OOS_STORAGE_BUCKETS;
  const results: VerifyEntry[] = [];
  for (const bucket of buckets) {
    const sourceObjects = await params.source.listObjects(bucket, "");
    const targetObjects = await params.target.listObjects(bucket, "");
    results.push(...compareObjectMaps(bucket, sourceObjects, targetObjects));
  }
  return results;
}

export function summarizeManifest(entries: ManifestEntry[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const e of entries) {
    summary[e.status] = (summary[e.status] ?? 0) + 1;
  }
  return summary;
}

export function summarizeVerify(entries: VerifyEntry[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const e of entries) {
    summary[e.status] = (summary[e.status] ?? 0) + 1;
  }
  return summary;
}

/** Source deletion must never be exposed by adapters used here. */
export function assertAdapterHasNoDelete(adapter: object): boolean {
  return !("delete" in adapter) && !("remove" in adapter);
}
