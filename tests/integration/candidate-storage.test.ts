import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateCandidateDocumentPath,
  createSignedUploadUrl,
  createSignedDownloadUrl,
} from "@/lib/storage";
import {
  requestDocumentUploadUrlAction,
  registerCandidateDocumentAction,
  getDocumentDownloadUrlAction,
  deleteCandidateDocumentAction,
} from "@/lib/candidate/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { createServerClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireEmployeeOrAdmin: vi.fn(),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServerClient: vi.fn(),
}));

describe("Candidate Document Storage Integration (tests/integration/candidate-storage.test.ts)", () => {
  const mockOrgId = "11111111-1111-1111-1111-111111111111";
  const mockUserId = "22222222-2222-2222-2222-222222222222";
  const mockCandidateId = "33333333-3333-3333-3333-333333333333";
  const mockDocId = "44444444-4444-4444-4444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockUserId,
      email: "candidate@test.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });
  });

  it("1. Generates deterministic storage path adhering to tenant isolation format", () => {
    const path = generateCandidateDocumentPath(mockOrgId, mockCandidateId, mockDocId, 1, "my_resume.pdf");
    expect(path).toBe(`tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/${mockDocId}-v1-my_resume.pdf`);
  });

  it("2. Requests signed upload URL and returns valid token payload", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockUserId,
            organizationId: mockOrgId,
          }),
        },
      };
      return callback(tx as any);
    });

    const mockStorageClient = {
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUploadUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: "https://supabase.co/storage/v1/upload/signed?token=abc", token: "abc", path: `tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/123-v1-resume.pdf` },
            error: null,
          }),
        }),
      },
    };

    vi.mocked(createServerClient).mockResolvedValue(mockStorageClient as any);

    const result = await requestDocumentUploadUrlAction({
      candidateId: mockCandidateId,
      filename: "resume.pdf",
    });

    expect(result.success).toBe(true);
    expect(result.data?.signedUrl).toContain("https://supabase.co/storage/v1/upload");
    expect(result.data?.storagePath).toBeDefined();
  });

  it("3. Registers document metadata in PostgreSQL upon successful storage upload", async () => {
    const storagePath = `tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/${mockDocId}-v1-resume.pdf`;

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockUserId,
            organizationId: mockOrgId,
          }),
        },
        candidateDocument: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockResolvedValue({
            id: mockDocId,
            candidateId: mockCandidateId,
            storagePath,
            title: "Software Engineer Resume",
            documentType: "RESUME",
            fileSizeBytes: 500000,
            mimeType: "application/pdf",
            isDefault: true,
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await registerCandidateDocumentAction({
      candidateId: mockCandidateId,
      documentType: "RESUME",
      title: "Software Engineer Resume",
      fileSizeBytes: 500000,
      mimeType: "application/pdf",
      storagePath,
      isDefault: true,
    });

    expect(result.success).toBe(true);
    expect(result.data?.documentId).toBe(mockDocId);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CANDIDATE_DOCUMENT_UPLOADED",
        entityId: mockDocId,
      })
    );
  });

  it("4. Generates signed private download URL for authorized user", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidateDocument: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockDocId,
            candidateId: mockCandidateId,
            storagePath: `tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/${mockDocId}-v1-resume.pdf`,
            candidate: {
              userId: mockUserId,
              organizationId: mockOrgId,
            },
          }),
        },
      };
      return callback(tx as any);
    });

    const mockStorageClient = {
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: "https://supabase.co/storage/v1/download/signed?token=xyz" },
            error: null,
          }),
        }),
      },
    };

    vi.mocked(createServerClient).mockResolvedValue(mockStorageClient as any);

    const result = await getDocumentDownloadUrlAction(mockDocId);
    expect(result.success).toBe(true);
    expect(result.data?.downloadUrl).toBe("https://supabase.co/storage/v1/download/signed?token=xyz");
  });

  it("5. Deletes candidate document record and logs audit event", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidateDocument: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockDocId,
            candidateId: mockCandidateId,
            storagePath: `tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/${mockDocId}-v1-resume.pdf`,
            candidate: {
              userId: mockUserId,
              organizationId: mockOrgId,
            },
          }),
          delete: vi.fn().mockResolvedValue({ id: mockDocId }),
        },
      };
      return callback(tx as any);
    });

    const result = await deleteCandidateDocumentAction(mockDocId);
    expect(result.success).toBe(true);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CANDIDATE_DOCUMENT_DELETED",
        entityId: mockDocId,
      })
    );
  });
});
