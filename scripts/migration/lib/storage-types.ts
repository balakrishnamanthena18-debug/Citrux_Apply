/**
 * Shared types for OOS Seoul → Mumbai Storage migration utilities.
 * No credentials. No network I/O in this module.
 */

export const OOS_STORAGE_BUCKETS = [
  "candidate-documents",
  "submission-evidence",
] as const;

export type OosStorageBucket = (typeof OOS_STORAGE_BUCKETS)[number];

export type ObjectMeta = {
  path: string;
  size: number | null;
  contentType: string | null;
};

export type ManifestStatus =
  | "COPIED"
  | "SKIPPED_IDENTICAL"
  | "FAILED"
  | "TARGET_BUCKET_REQUIRED"
  | "SOURCE_BUCKET_MISSING"
  | "BLOCKED_PUBLIC_BUCKET"
  | "BLOCKED_TARGET_CONFLICT";

export type ManifestEntry = {
  bucket: string;
  path: string;
  sourceSize: number | null;
  targetSize: number | null;
  contentType: string | null;
  status: ManifestStatus;
  error?: string;
};

export type VerifyStatus = "MATCH" | "MISSING" | "MISMATCH" | "EXTRA";

export type VerifyEntry = {
  bucket: string;
  path: string;
  sourceSize: number | null;
  targetSize: number | null;
  sourceContentType: string | null;
  targetContentType: string | null;
  status: VerifyStatus;
  reason?: string;
};

export type BucketInfo = {
  name: string;
  public: boolean;
  fileSizeLimit?: number | null;
  allowedMimeTypes?: string[] | null;
};

/**
 * Injectable Storage adapter — production wraps @supabase/supabase-js;
 * unit tests inject mocks. Never logs bodies, signed URLs, or keys.
 */
export interface StorageAdapter {
  listBuckets(): Promise<BucketInfo[]>;
  getBucket(name: string): Promise<BucketInfo | null>;
  /** Recursive listing of objects under prefix (default ""). */
  listObjects(bucket: string, prefix?: string): Promise<ObjectMeta[]>;
  download(bucket: string, path: string): Promise<Blob | ArrayBuffer | Uint8Array>;
  upload(
    bucket: string,
    path: string,
    body: Blob | ArrayBuffer | Uint8Array,
    options: { contentType?: string | null; upsert: boolean }
  ): Promise<void>;
  /** Metadata-only head/list for a single object path. */
  getObjectMeta(bucket: string, path: string): Promise<ObjectMeta | null>;
}

export type MigrateEnv = {
  SOURCE_SUPABASE_URL: string;
  SOURCE_SUPABASE_SERVICE_ROLE_KEY: string;
  TARGET_SUPABASE_URL: string;
  TARGET_SUPABASE_SERVICE_ROLE_KEY: string;
};

export type RedactedLog = {
  level: "info" | "warn" | "error";
  message: string;
  meta?: Record<string, string | number | boolean | null>;
};
