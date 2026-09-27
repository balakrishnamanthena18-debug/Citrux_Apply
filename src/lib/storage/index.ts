import { createServerClient } from "@/lib/supabase/server";
import { sanitizeFilename } from "@/lib/utils/sanitization";

export const CANDIDATE_DOCUMENTS_BUCKET = "candidate-documents";

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
 * Generates a short-lived signed URL for downloading a candidate document binary from Supabase Storage.
 * Caller MUST verify authorization before invoking.
 */
export async function createSignedDownloadUrl(
  storagePath: string,
  expiresInSeconds: number = 60
): Promise<string | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.storage
    .from(CANDIDATE_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}

export async function createSignedUploadUrl(
  storagePath: string
): Promise<{ signedUrl: string; path: string; token: string } | null> {
  const supabase = await createServerClient();
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
