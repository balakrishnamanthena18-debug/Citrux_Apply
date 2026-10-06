import { createServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sanitizeFilename } from "@/lib/utils/sanitization";

export const CANDIDATE_DOCUMENTS_BUCKET = "candidate-documents";

async function getStorageClient() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return getSupabaseAdminClient();
  }
  return createServerClient();
}

/**
 * Generates a deterministic, tenant-isolated storage path for candidate documents.
 * Format: tenants/{organizationId}/candidates/{candidateId}/documents/{documentId}-v{version}-{sanitizedFilename}
 */
export function generateCandidateDocumentPath(
  organizationId: string,
  candidateId: string,
  documentId: string,
  versionNumber: number,
  originalFilename: string
): string {
  const sanitized = sanitizeFilename(originalFilename).toLowerCase();
  return `tenants/${organizationId}/candidates/${candidateId}/documents/${documentId}-v${versionNumber}-${sanitized}`;
}

/**
 * Verifies whether a given storage path conforms to the canonical candidate storage path pattern.
 * Prevents cross-tenant, cross-candidate, and path-traversal directory escape attacks.
 */
export function isCanonicalCandidateDocumentPath(
  storagePath: string,
  organizationId: string,
  candidateId: string,
  documentId?: string
): boolean {
  if (!storagePath || typeof storagePath !== "string") return false;
  const prefix = `tenants/${organizationId}/candidates/${candidateId}/documents/`;
  if (!storagePath.startsWith(prefix)) return false;
  const remaining = storagePath.slice(prefix.length);
  if (!remaining || remaining.includes("..") || remaining.includes("/") || remaining.includes("\\")) {
    return false;
  }
  if (documentId && remaining.includes("-v")) {
    if (!remaining.startsWith(`${documentId}-v`)) {
      return false;
    }
  }
  return true;
}

/**
 * Verifies that a storage object exists in the candidate documents bucket at the specified path.
 */
export async function verifyCandidateDocumentStorageExists(
  storagePath: string
): Promise<boolean> {
  try {
    const supabase = await getStorageClient();
    const lastSlash = storagePath.lastIndexOf("/");
    if (lastSlash === -1) return false;
    const folder = storagePath.substring(0, lastSlash);
    const filename = storagePath.substring(lastSlash + 1);

    const { data, error } = await supabase.storage
      .from(CANDIDATE_DOCUMENTS_BUCKET)
      .list(folder, { search: filename });

    if (error || !data || !Array.isArray(data)) {
      return false;
    }
    return data.some((item) => item.name === filename);
  } catch {
    return false;
  }
}

/**
 * Generates a short-lived signed URL for downloading a candidate document binary from Supabase Storage.
 * Caller MUST verify authorization before invoking.
 */
export async function createSignedDownloadUrl(
  storagePath: string,
  expiresInSeconds: number = 60
): Promise<string | null> {
  try {
    const supabase = await getStorageClient();
    const { data, error } = await supabase.storage
      .from(CANDIDATE_DOCUMENTS_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      return null;
    }

    return data.signedUrl;
  } catch {
    return null;
  }
}

export async function createSignedUploadUrl(
  storagePath: string
): Promise<{ signedUrl: string; path: string; token: string } | null> {
  try {
    const supabase = await getStorageClient();
    const { data, error } = await supabase.storage
      .from(CANDIDATE_DOCUMENTS_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      return null;
    }

    return {
      signedUrl: data.signedUrl,
      path: data.path,
      token: data.token,
    };
  } catch {
    return null;
  }
}

/**
 * Deletes a candidate document binary from Supabase Storage.
 * Safe operation; returns false if deletion encountered an error.
 */
export async function deleteCandidateDocumentStorage(
  storagePath: string
): Promise<boolean> {
  try {
    const supabase = await getStorageClient();
    const { error } = await supabase.storage
      .from(CANDIDATE_DOCUMENTS_BUCKET)
      .remove([storagePath]);

    if (error) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Downloads candidate document bytes for server-side processing only.
 * Caller MUST verify authorization and must NOT log/return bytes to clients.
 */
export async function downloadCandidateDocumentBytes(
  storagePath: string
): Promise<Buffer | null> {
  try {
    const supabase = await getStorageClient();
    const { data, error } = await supabase.storage
      .from(CANDIDATE_DOCUMENTS_BUCKET)
      .download(storagePath);
    if (error || !data) return null;
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

export const SUBMISSION_EVIDENCE_BUCKET = "submission-evidence";

/**
 * Generates a deterministic, tenant-isolated storage path for submission evidence documents.
 * Format: tenants/{organizationId}/applications/{applicationId}/submissions/{submissionId}-{sanitizedFilename}
 */
export function generateSubmissionEvidencePath(
  organizationId: string,
  applicationId: string,
  submissionId: string,
  originalFilename: string
): string {
  const sanitized = sanitizeFilename(originalFilename).toLowerCase();
  return `tenants/${organizationId}/applications/${applicationId}/submissions/${submissionId}-${sanitized}`;
}

/**
 * Generates a short-lived signed URL for downloading a submission confirmation evidence binary from Supabase Storage.
 * Caller MUST verify staff authorization and tenancy before invoking.
 */
export async function createSignedSubmissionEvidenceDownloadUrl(
  storagePath: string,
  expiresInSeconds: number = 60
): Promise<string | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.storage
    .from(SUBMISSION_EVIDENCE_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}

/**
 * Generates a short-lived signed URL for uploading a submission confirmation evidence binary to Supabase Storage.
 * Caller MUST verify staff authorization and tenancy before invoking.
 */
export async function createSignedSubmissionEvidenceUploadUrl(
  storagePath: string
): Promise<{ signedUrl: string; path: string; token: string } | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.storage
    .from(SUBMISSION_EVIDENCE_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return null;
  }

  return {
    signedUrl: data.signedUrl,
    path: data.path,
    token: data.token,
  };
}
