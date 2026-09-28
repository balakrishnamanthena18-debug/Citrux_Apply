import { describe, it, expect } from "vitest";
import {
  CandidateDocumentUploadSchema,
  CandidateDocumentUploadSelfSchema,
} from "@/lib/validation/candidate.schemas";
import {
  generateCandidateDocumentPath,
  isCanonicalCandidateDocumentPath,
} from "@/lib/storage";

describe("Candidate Document Vault Upload Unit & Security Matrix", () => {
  const mockOrgId = "11111111-1111-1111-1111-111111111111";
  const mockCandidateId = "22222222-2222-2222-2222-222222222222";
  const mockDocId = "33333333-3333-3333-3333-333333333333";

  describe("CandidateDocumentUploadSelfSchema Validation", () => {
    it("1. Accepts valid candidate self-service document payload with server-bound documentId & filename", () => {
      const result = CandidateDocumentUploadSelfSchema.safeParse({
        documentId: mockDocId,
        filename: "resume.pdf",
        documentType: "RESUME",
        title: "Senior Fullstack Resume 2026",
        fileSizeBytes: 2 * 1024 * 1024, // 2MB
        mimeType: "application/pdf",
        isDefault: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.documentId).toBe(mockDocId);
        expect(result.data.filename).toBe("resume.pdf");
        expect(result.data.title).toBe("Senior Fullstack Resume 2026");
        expect(result.data.documentType).toBe("RESUME");
        expect(result.data.isDefault).toBe(true);
      }
    });

    it("2. Rejects files larger than 50 MB threshold", () => {
      const result = CandidateDocumentUploadSelfSchema.safeParse({
        documentId: mockDocId,
        filename: "giant.pdf",
        documentType: "RESUME",
        title: "Giant File",
        fileSizeBytes: 51 * 1024 * 1024, // 51MB (exceeds 50MB)
        mimeType: "application/pdf",
        isDefault: false,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error?.issues[0]?.message).toContain("50 MB");
      }
    });

    it("3. Rejects empty or negative file size", () => {
      const zeroSizeResult = CandidateDocumentUploadSelfSchema.safeParse({
        documentId: mockDocId,
        filename: "empty.txt",
        documentType: "OTHER",
        title: "Empty File",
        fileSizeBytes: 0,
        mimeType: "text/plain",
      });
      expect(zeroSizeResult.success).toBe(false);

      const negativeSizeResult = CandidateDocumentUploadSelfSchema.safeParse({
        documentId: mockDocId,
        filename: "negative.txt",
        documentType: "OTHER",
        title: "Negative File",
        fileSizeBytes: -100,
        mimeType: "text/plain",
      });
      expect(negativeSizeResult.success).toBe(false);
    });

    it("4. Rejects invalid or unsupported documentType enum", () => {
      const result = CandidateDocumentUploadSelfSchema.safeParse({
        documentId: mockDocId,
        filename: "doc.pdf",
        documentType: "INVALID_TYPE" as any,
        title: "Unknown doc",
        fileSizeBytes: 1024,
        mimeType: "application/pdf",
      });

      expect(result.success).toBe(false);
    });

    it("5. Rejects missing or invalid documentId UUID", () => {
      const missingDocId = CandidateDocumentUploadSelfSchema.safeParse({
        filename: "doc.pdf",
        documentType: "RESUME",
        title: "My Resume",
        fileSizeBytes: 1024,
        mimeType: "application/pdf",
      });
      expect(missingDocId.success).toBe(false);

      const invalidDocId = CandidateDocumentUploadSelfSchema.safeParse({
        documentId: "not-a-valid-uuid",
        filename: "doc.pdf",
        documentType: "RESUME",
        title: "My Resume",
        fileSizeBytes: 1024,
        mimeType: "application/pdf",
      });
      expect(invalidDocId.success).toBe(false);
    });

    it("6. CandidateDocumentUploadSelfSchema prevents browser from injecting arbitrary candidateId", () => {
      const payloadWithInjectedId = {
        candidateId: "attacker-target-candidate-id",
        documentId: mockDocId,
        filename: "transcript.pdf",
        documentType: "TRANSCRIPT",
        title: "Academic Transcript",
        fileSizeBytes: 1024,
        mimeType: "application/pdf",
      };

      const parsed = CandidateDocumentUploadSelfSchema.parse(payloadWithInjectedId);
      // In CandidateDocumentUploadSelfSchema, candidateId is not a recognized field
      expect((parsed as any).candidateId).toBeUndefined();
    });
  });

  describe("Storage Path Determinism, Canonical Invariants & Tenant Isolation", () => {
    it("7. Sanitizes special characters, path traversals, and spaces in filenames", () => {
      const unsanitized = "../../../evil-file / test %20 resume.PDF";
      const path = generateCandidateDocumentPath(mockOrgId, mockCandidateId, mockDocId, 1, unsanitized);

      expect(path).not.toContain("../");
      expect(path).not.toContain("..");
      expect(path).toContain(`tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/`);
      expect(path.endsWith(".pdf")).toBe(true);
    });

    it("8. isCanonicalCandidateDocumentPath verifies valid paths and rejects path traversal or cross-tenant injections", () => {
      const validPath = `tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/${mockDocId}-v1-resume.pdf`;
      expect(isCanonicalCandidateDocumentPath(validPath, mockOrgId, mockCandidateId, mockDocId)).toBe(true);

      // Wrong organization
      const otherOrg = "99999999-9999-9999-9999-999999999999";
      expect(isCanonicalCandidateDocumentPath(validPath, otherOrg, mockCandidateId, mockDocId)).toBe(false);

      // Wrong candidate
      const otherCandidate = "88888888-8888-8888-8888-888888888888";
      expect(isCanonicalCandidateDocumentPath(validPath, mockOrgId, otherCandidate, mockDocId)).toBe(false);

      // Wrong document ID
      const otherDocId = "77777777-7777-7777-7777-777777777777";
      expect(isCanonicalCandidateDocumentPath(validPath, mockOrgId, mockCandidateId, otherDocId)).toBe(false);

      // Path traversal attack
      const traversalPath = `tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/../other/file.pdf`;
      expect(isCanonicalCandidateDocumentPath(traversalPath, mockOrgId, mockCandidateId)).toBe(false);
    });
  });
});
