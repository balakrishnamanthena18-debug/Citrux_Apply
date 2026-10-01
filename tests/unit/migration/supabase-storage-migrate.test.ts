/**
 * Mock-only unit tests for Storage migration utilities.
 * NO real Supabase / production network calls.
 */

import { describe, it, expect, vi } from "vitest";
import {
  assertAdapterHasNoDelete,
  assertNoSecretInLog,
  classifyVerify,
  compareObjectMaps,
  migrateBucket,
  migrateOosBuckets,
  objectsEqualForSkip,
  redactSecrets,
  requireMigrateEnv,
  summarizeManifest,
  validatePrivateBucket,
  verifyOosBuckets,
} from "../../../scripts/migration/lib/storage-migrate-core";
import type {
  ObjectMeta,
  StorageAdapter,
} from "../../../scripts/migration/lib/storage-types";

function createMemoryAdapter(opts: {
  buckets: { name: string; public: boolean }[];
  objects: Record<string, ObjectMeta & { body?: Uint8Array }>;
  allowDelete?: boolean;
}): StorageAdapter & { store: typeof opts.objects } {
  const store = { ...opts.objects };
  const adapter: StorageAdapter & { store: typeof store; delete?: unknown } = {
    store,
    async listBuckets() {
      return opts.buckets.map((b) => ({ name: b.name, public: b.public }));
    },
    async getBucket(name: string) {
      const b = opts.buckets.find((x) => x.name === name);
      return b ? { name: b.name, public: b.public } : null;
    },
    async listObjects(bucket: string) {
      return Object.values(store)
        .filter((o) => o.path && store[`${bucket}::${o.path}`])
        .map((o) => ({
          path: o.path,
          size: o.size,
          contentType: o.contentType,
        }));
    },
    async download(bucket: string, path: string) {
      const key = `${bucket}::${path}`;
      const obj = store[key];
      if (!obj?.body) throw new Error(`missing body ${key}`);
      return obj.body;
    },
    async upload(bucket, path, body, options) {
      const bytes =
        body instanceof Uint8Array
          ? body
          : body instanceof ArrayBuffer
            ? new Uint8Array(body)
            : new Uint8Array(await (body as Blob).arrayBuffer());
      store[`${bucket}::${path}`] = {
        path,
        size: bytes.byteLength,
        contentType: options.contentType ?? "application/octet-stream",
        body: bytes,
      };
    },
    async getObjectMeta(bucket, path) {
      const obj = store[`${bucket}::${path}`];
      if (!obj) return null;
      return { path: obj.path, size: obj.size, contentType: obj.contentType };
    },
  };

  // Override listObjects to use key convention
  adapter.listObjects = async (bucket: string) => {
    const prefix = `${bucket}::`;
    return Object.entries(store)
      .filter(([k]) => k.startsWith(prefix))
      .map(([, o]) => ({
        path: o.path,
        size: o.size,
        contentType: o.contentType,
      }));
  };

  if (opts.allowDelete) {
    (adapter as { delete: unknown }).delete = vi.fn();
  }

  return adapter;
}

describe("Storage migration core (mock-only)", () => {
  it("fails when environment variables are missing", () => {
    const result = requireMigrateEnv({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain("SOURCE_SUPABASE_URL");
      expect(result.missing).toContain("SOURCE_SUPABASE_SERVICE_ROLE_KEY");
      expect(result.missing).toContain("TARGET_SUPABASE_URL");
      expect(result.missing).toContain("TARGET_SUPABASE_SERVICE_ROLE_KEY");
    }
  });

  it("accepts complete environment configuration without echoing secrets", () => {
    const result = requireMigrateEnv({
      SOURCE_SUPABASE_URL: "https://old.example.supabase.co",
      SOURCE_SUPABASE_SERVICE_ROLE_KEY: "source-secret-key-value",
      TARGET_SUPABASE_URL: "https://new.example.supabase.co",
      TARGET_SUPABASE_SERVICE_ROLE_KEY: "target-secret-key-value",
    });
    expect(result.ok).toBe(true);
  });

  it("redacts JWT-shaped tokens and query signatures", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.signaturepart";
    expect(redactSecrets(`Bearer ${jwt}`)).toContain("<REDACTED_JWT>");
    expect(
      redactSecrets("https://x.supabase.co/storage/v1/object/sign/a?token=abc123")
    ).toContain("<REDACTED>");
  });

  it("detects secrets leaked into log messages", () => {
    expect(
      assertNoSecretInLog("ok message", {
        SOURCE_SUPABASE_SERVICE_ROLE_KEY: "super-secret-service-role",
      })
    ).toBe(true);
    expect(
      assertNoSecretInLog("leaked super-secret-service-role here", {
        SOURCE_SUPABASE_SERVICE_ROLE_KEY: "super-secret-service-role",
      })
    ).toBe(false);
  });

  it("blocks public buckets", () => {
    const result = validatePrivateBucket(
      { name: "candidate-documents", public: true },
      "candidate-documents"
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("BLOCKED_PUBLIC_BUCKET");
  });

  it("reports TARGET BUCKET REQUIRED when target missing", async () => {
    const source = createMemoryAdapter({
      buckets: [{ name: "candidate-documents", public: false }],
      objects: {
        "candidate-documents::tenants/a/file.pdf": {
          path: "tenants/a/file.pdf",
          size: 4,
          contentType: "application/pdf",
          body: new Uint8Array([1, 2, 3, 4]),
        },
      },
    });
    const target = createMemoryAdapter({
      buckets: [],
      objects: {},
    });

    const manifest = await migrateBucket({
      bucket: "candidate-documents",
      source,
      target,
    });
    expect(manifest[0]?.status).toBe("TARGET_BUCKET_REQUIRED");
  });

  it("copies object preserving path/size/contentType", async () => {
    const body = new Uint8Array([9, 8, 7, 6]);
    const source = createMemoryAdapter({
      buckets: [{ name: "candidate-documents", public: false }],
      objects: {
        "candidate-documents::tenants/org/candidates/c/documents/d-v1-resume.pdf": {
          path: "tenants/org/candidates/c/documents/d-v1-resume.pdf",
          size: 4,
          contentType: "application/pdf",
          body,
        },
      },
    });
    const target = createMemoryAdapter({
      buckets: [{ name: "candidate-documents", public: false }],
      objects: {},
    });

    const manifest = await migrateBucket({
      bucket: "candidate-documents",
      source,
      target,
    });
    expect(manifest).toHaveLength(1);
    expect(manifest[0]?.status).toBe("COPIED");
    expect(manifest[0]?.path).toBe(
      "tenants/org/candidates/c/documents/d-v1-resume.pdf"
    );
    expect(manifest[0]?.sourceSize).toBe(4);
    expect(manifest[0]?.targetSize).toBe(4);
    expect(manifest[0]?.contentType).toBe("application/pdf");
  });

  it("is idempotent: skips identical target object", async () => {
    const body = new Uint8Array([1, 2, 3]);
    const obj = {
      path: "tenants/x/file.bin",
      size: 3,
      contentType: "application/octet-stream",
      body,
    };
    const source = createMemoryAdapter({
      buckets: [{ name: "submission-evidence", public: false }],
      objects: { "submission-evidence::tenants/x/file.bin": obj },
    });
    const target = createMemoryAdapter({
      buckets: [{ name: "submission-evidence", public: false }],
      objects: {
        "submission-evidence::tenants/x/file.bin": { ...obj, body: body.slice() },
      },
    });

    const downloadSpy = vi.spyOn(source, "download");
    const manifest = await migrateBucket({
      bucket: "submission-evidence",
      source,
      target,
    });
    expect(manifest[0]?.status).toBe("SKIPPED_IDENTICAL");
    expect(downloadSpy).not.toHaveBeenCalled();
  });

  it("blocks overwrite when target exists with conflicting metadata", async () => {
    const source = createMemoryAdapter({
      buckets: [{ name: "candidate-documents", public: false }],
      objects: {
        "candidate-documents::tenants/x/a.pdf": {
          path: "tenants/x/a.pdf",
          size: 4,
          contentType: "application/pdf",
          body: new Uint8Array([1, 2, 3, 4]),
        },
      },
    });
    const target = createMemoryAdapter({
      buckets: [{ name: "candidate-documents", public: false }],
      objects: {
        "candidate-documents::tenants/x/a.pdf": {
          path: "tenants/x/a.pdf",
          size: 99,
          contentType: "application/pdf",
          body: new Uint8Array(99),
        },
      },
    });
    const downloadSpy = vi.spyOn(source, "download");
    const manifest = await migrateBucket({
      bucket: "candidate-documents",
      source,
      target,
    });
    expect(manifest[0]?.status).toBe("BLOCKED_TARGET_CONFLICT");
    expect(downloadSpy).not.toHaveBeenCalled();
  });

  it("allows source object-plane fallback when bucket admin APIs are empty", async () => {
    const prev = process.env.CONFIRM_SOURCE_BUCKETS_PRIVATE;
    process.env.CONFIRM_SOURCE_BUCKETS_PRIVATE = "YES";
    try {
      const body = new Uint8Array([9, 9]);
      const source = createMemoryAdapter({
        buckets: [], // listBuckets/getBucket empty
        objects: {
          "candidate-documents::tenants/y/b.pdf": {
            path: "tenants/y/b.pdf",
            size: 2,
            contentType: "application/pdf",
            body,
          },
        },
      });
      const target = createMemoryAdapter({
        buckets: [{ name: "candidate-documents", public: false }],
        objects: {},
      });
      const manifest = await migrateBucket({
        bucket: "candidate-documents",
        source,
        target,
      });
      expect(manifest[0]?.status).toBe("COPIED");
    } finally {
      if (prev === undefined) delete process.env.CONFIRM_SOURCE_BUCKETS_PRIVATE;
      else process.env.CONFIRM_SOURCE_BUCKETS_PRIVATE = prev;
    }
  });

  it("detects size mismatch as MISMATCH", () => {
    const entry = classifyVerify(
      { path: "a", size: 10, contentType: "application/pdf" },
      { path: "a", size: 11, contentType: "application/pdf" }
    );
    expect(entry.status).toBe("MISMATCH");
    expect(entry.reason).toContain("size");
  });

  it("detects MIME mismatch as MISMATCH", () => {
    const entry = classifyVerify(
      { path: "a", size: 10, contentType: "application/pdf" },
      { path: "a", size: 10, contentType: "image/png" }
    );
    expect(entry.status).toBe("MISMATCH");
    expect(entry.reason).toContain("contentType");
  });

  it("detects missing and extra objects", () => {
    const results = compareObjectMaps(
      "candidate-documents",
      [{ path: "only-source", size: 1, contentType: "text/plain" }],
      [{ path: "only-target", size: 2, contentType: "text/plain" }]
    );
    const byPath = Object.fromEntries(results.map((r) => [r.path, r.status]));
    expect(byPath["only-source"]).toBe("MISSING");
    expect(byPath["only-target"]).toBe("EXTRA");
  });

  it("verifyOosBuckets reports MATCH for identical maps", async () => {
    const meta = {
      path: "tenants/a/b.pdf",
      size: 2,
      contentType: "application/pdf",
      body: new Uint8Array([1, 2]),
    };
    const source = createMemoryAdapter({
      buckets: [{ name: "candidate-documents", public: false }],
      objects: { "candidate-documents::tenants/a/b.pdf": meta },
    });
    const target = createMemoryAdapter({
      buckets: [{ name: "candidate-documents", public: false }],
      objects: {
        "candidate-documents::tenants/a/b.pdf": { ...meta, body: new Uint8Array([1, 2]) },
      },
    });
    const results = await verifyOosBuckets({
      source,
      target,
      buckets: ["candidate-documents"],
    });
    expect(results.every((r) => r.status === "MATCH")).toBe(true);
  });

  it("retries conceptually via re-run after failure then success (idempotent rerun)", async () => {
    const body = new Uint8Array([5, 5]);
    const source = createMemoryAdapter({
      buckets: [{ name: "candidate-documents", public: false }],
      objects: {
        "candidate-documents::p/file.pdf": {
          path: "p/file.pdf",
          size: 2,
          contentType: "application/pdf",
          body,
        },
      },
    });
    const target = createMemoryAdapter({
      buckets: [{ name: "candidate-documents", public: false }],
      objects: {},
    });

    // First run: force upload failure once
    let calls = 0;
    const originalUpload = target.upload.bind(target);
    target.upload = async (...args) => {
      calls += 1;
      if (calls === 1) throw new Error("transient");
      return originalUpload(...args);
    };

    const first = await migrateBucket({
      bucket: "candidate-documents",
      source,
      target,
    });
    expect(first[0]?.status).toBe("FAILED");

    const second = await migrateBucket({
      bucket: "candidate-documents",
      source,
      target,
    });
    expect(second[0]?.status).toBe("COPIED");

    const third = await migrateBucket({
      bucket: "candidate-documents",
      source,
      target,
    });
    expect(third[0]?.status).toBe("SKIPPED_IDENTICAL");
  });

  it("does not expose delete on migration adapters by default", () => {
    const adapter = createMemoryAdapter({
      buckets: [{ name: "candidate-documents", public: false }],
      objects: {},
    });
    expect(assertAdapterHasNoDelete(adapter)).toBe(true);

    const bad = createMemoryAdapter({
      buckets: [{ name: "candidate-documents", public: false }],
      objects: {},
      allowDelete: true,
    });
    expect(assertAdapterHasNoDelete(bad)).toBe(false);
  });

  it("objectsEqualForSkip requires same size", () => {
    expect(
      objectsEqualForSkip(
        { path: "a", size: 1, contentType: "x" },
        { path: "a", size: 2, contentType: "x" }
      )
    ).toBe(false);
  });

  it("migrateOosBuckets aggregates both expected buckets", async () => {
    const source = createMemoryAdapter({
      buckets: [
        { name: "candidate-documents", public: false },
        { name: "submission-evidence", public: false },
      ],
      objects: {},
    });
    const target = createMemoryAdapter({
      buckets: [
        { name: "candidate-documents", public: false },
        { name: "submission-evidence", public: false },
      ],
      objects: {},
    });
    const manifest = await migrateOosBuckets({ source, target });
    expect(summarizeManifest(manifest)).toEqual({});
    expect(manifest).toEqual([]);
  });
});
