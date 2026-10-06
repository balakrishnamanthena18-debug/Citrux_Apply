import type { Prisma } from "@/generated/prisma";
import { downloadCandidateDocumentBytes } from "@/lib/storage";
import { sha256Hex, RESUME_PARSER_VERSION } from "./constants";
import { extractResumeTextFromBuffer } from "./extract";

/**
 * Idempotent extract persistence keyed by org + document + content hash.
 * Never logs extracted text.
 */
export async function ensureCandidateDocumentExtract(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    candidateId: string;
    candidateDocumentId: string;
    storagePath: string;
    mimeType: string;
  }
): Promise<{
  extractId: string;
  parseStatus: "SUCCESS" | "EMPTY" | "FAILED" | "UNSUPPORTED";
  contentHash: string;
  errorCode: string | null;
}> {
  const bytes = await downloadCandidateDocumentBytes(input.storagePath);
  if (!bytes) {
    const failedHash = sha256Hex(`missing:${input.candidateDocumentId}:${Date.now()}`);
    // Use stable missing hash without timestamp for idempotency of storage-miss
    const contentHash = sha256Hex(`missing:${input.organizationId}:${input.candidateDocumentId}`);
    const existing = await tx.candidateDocumentExtract.findUnique({
      where: {
        organizationId_candidateDocumentId_contentHash: {
          organizationId: input.organizationId,
          candidateDocumentId: input.candidateDocumentId,
          contentHash,
        },
      },
      select: { id: true, parseStatus: true, errorCode: true, contentHash: true },
    });
    if (existing) {
      return {
        extractId: existing.id,
        parseStatus: existing.parseStatus,
        contentHash: existing.contentHash,
        errorCode: existing.errorCode,
      };
    }
    const created = await tx.candidateDocumentExtract.create({
      data: {
        organizationId: input.organizationId,
        candidateId: input.candidateId,
        candidateDocumentId: input.candidateDocumentId,
        contentHash,
        extractedText: "",
        parseStatus: "FAILED",
        parserVersion: RESUME_PARSER_VERSION,
        mimeType: input.mimeType,
        pageCount: null,
        charCount: 0,
        errorCode: "STORAGE_DOWNLOAD_FAILED",
        parsedAt: new Date(),
      },
      select: { id: true },
    });
    void failedHash;
    return {
      extractId: created.id,
      parseStatus: "FAILED",
      contentHash,
      errorCode: "STORAGE_DOWNLOAD_FAILED",
    };
  }

  const contentHash = sha256Hex(bytes);
  const existing = await tx.candidateDocumentExtract.findUnique({
    where: {
      organizationId_candidateDocumentId_contentHash: {
        organizationId: input.organizationId,
        candidateDocumentId: input.candidateDocumentId,
        contentHash,
      },
    },
    select: { id: true, parseStatus: true, errorCode: true, contentHash: true },
  });
  if (existing) {
    return {
      extractId: existing.id,
      parseStatus: existing.parseStatus,
      contentHash: existing.contentHash,
      errorCode: existing.errorCode,
    };
  }

  const extracted = await extractResumeTextFromBuffer({
    buffer: bytes,
    mimeType: input.mimeType,
  });

  const created = await tx.candidateDocumentExtract.create({
    data: {
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      candidateDocumentId: input.candidateDocumentId,
      contentHash,
      extractedText: extracted.text,
      parseStatus: extracted.parseStatus,
      parserVersion: extracted.parserVersion,
      mimeType: input.mimeType,
      pageCount: extracted.pageCount,
      charCount: extracted.charCount,
      errorCode: extracted.errorCode,
      parsedAt: new Date(),
    },
    select: { id: true },
  });

  return {
    extractId: created.id,
    parseStatus: extracted.parseStatus,
    contentHash,
    errorCode: extracted.errorCode,
  };
}
