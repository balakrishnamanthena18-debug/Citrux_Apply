/**
 * Supabase Storage adapter for migration utilities.
 * Service-role clients only. Never logs signed URLs or object bodies.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  BucketInfo,
  ObjectMeta,
  StorageAdapter,
} from "./storage-types";

function asClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function toUint8Array(body: Blob | ArrayBuffer | Uint8Array): Uint8Array {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  // Blob in Node 20+
  throw new Error("Unexpected download body type before conversion");
}

export function createSupabaseStorageAdapter(
  url: string,
  serviceRoleKey: string
): StorageAdapter {
  const client = asClient(url, serviceRoleKey);

  async function listRecursive(
    bucket: string,
    prefix: string
  ): Promise<ObjectMeta[]> {
    const results: ObjectMeta[] = [];
    let offset = 0;
    const limit = 100;

    for (;;) {
      const { data, error } = await client.storage.from(bucket).list(prefix, {
        limit,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) {
        throw new Error(`list failed for ${bucket}/${prefix}: ${error.message}`);
      }
      if (!data || data.length === 0) break;

      for (const item of data) {
        const childPath = prefix ? `${prefix}/${item.name}` : item.name;
        // Folders typically lack metadata.id / metadata.size
        const isFolder =
          !item.metadata ||
          (item.id === null && item.metadata === null) ||
          // Supabase marks folders without metadata.size
          (item.metadata &&
            item.metadata.size === undefined &&
            !item.metadata.mimetype &&
            item.id === null);

        if (isFolder && !item.metadata?.mimetype) {
          // Heuristic: if list of name looks like file with extension and has metadata, treat as file
          const nested = await listRecursive(bucket, childPath);
          if (nested.length > 0) {
            results.push(...nested);
            continue;
          }
          // Empty folder — skip
          continue;
        }

        if (item.metadata) {
          results.push({
            path: childPath,
            size:
              typeof item.metadata.size === "number"
                ? item.metadata.size
                : item.metadata.size
                  ? Number(item.metadata.size)
                  : null,
            contentType:
              (item.metadata.mimetype as string | undefined) ??
              (item.metadata.contentType as string | undefined) ??
              null,
          });
        } else {
          // Ambiguous entry: try as folder first
          const nested = await listRecursive(bucket, childPath);
          if (nested.length > 0) {
            results.push(...nested);
          }
        }
      }

      if (data.length < limit) break;
      offset += limit;
    }

    return results;
  }

  const adapter: StorageAdapter = {
    async listBuckets(): Promise<BucketInfo[]> {
      const { data, error } = await client.storage.listBuckets();
      if (error) throw new Error(`listBuckets failed: ${error.message}`);
      return (data ?? []).map((b) => ({
        name: b.name,
        public: Boolean(b.public),
        fileSizeLimit: b.file_size_limit ?? null,
        allowedMimeTypes: b.allowed_mime_types ?? null,
      }));
    },

    async getBucket(name: string): Promise<BucketInfo | null> {
      const { data, error } = await client.storage.getBucket(name);
      if (error) {
        if (/not found|Bucket not found/i.test(error.message)) return null;
        throw new Error(`getBucket(${name}) failed: ${error.message}`);
      }
      if (!data) return null;
      return {
        name: data.name,
        public: Boolean(data.public),
        fileSizeLimit: data.file_size_limit ?? null,
        allowedMimeTypes: data.allowed_mime_types ?? null,
      };
    },

    async listObjects(bucket: string, prefix = ""): Promise<ObjectMeta[]> {
      return listRecursive(bucket, prefix);
    },

    async download(
      bucket: string,
      path: string
    ): Promise<Blob | ArrayBuffer | Uint8Array> {
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error || !data) {
        throw new Error(`download failed for ${bucket}/${path}: ${error?.message}`);
      }
      const ab = await data.arrayBuffer();
      return new Uint8Array(ab);
    },

    async upload(
      bucket: string,
      path: string,
      body: Blob | ArrayBuffer | Uint8Array,
      options: { contentType?: string | null; upsert: boolean }
    ): Promise<void> {
      const bytes =
        body instanceof Uint8Array
          ? body
          : body instanceof ArrayBuffer
            ? new Uint8Array(body)
            : toUint8Array(body);
      const { error } = await client.storage.from(bucket).upload(path, bytes, {
        upsert: options.upsert,
        contentType: options.contentType || undefined,
      });
      if (error) {
        throw new Error(`upload failed for ${bucket}/${path}: ${error.message}`);
      }
    },

    async getObjectMeta(
      bucket: string,
      path: string
    ): Promise<ObjectMeta | null> {
      const lastSlash = path.lastIndexOf("/");
      const folder = lastSlash >= 0 ? path.slice(0, lastSlash) : "";
      const filename = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
      const { data, error } = await client.storage.from(bucket).list(folder, {
        search: filename,
        limit: 100,
      });
      if (error) {
        throw new Error(`getObjectMeta failed for ${bucket}/${path}: ${error.message}`);
      }
      const match = (data ?? []).find((item) => item.name === filename);
      if (!match || !match.metadata) return null;
      return {
        path,
        size:
          typeof match.metadata.size === "number"
            ? match.metadata.size
            : match.metadata.size
              ? Number(match.metadata.size)
              : null,
        contentType:
          (match.metadata.mimetype as string | undefined) ??
          (match.metadata.contentType as string | undefined) ??
          null,
      };
    },
  };

  // Explicitly omit delete/remove to harden against accidental source deletion.
  return Object.freeze(adapter);
}
