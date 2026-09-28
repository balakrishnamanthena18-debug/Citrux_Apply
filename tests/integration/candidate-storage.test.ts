import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateCandidateDocumentPath,
  createSignedUploadUrl,
  createSignedDownloadUrl,
  isCanonicalCandidateDocumentPath,
} from "@/lib/storage";
import {
  requestDocumentUploadUrlAction,
  requestCandidateDocumentUploadUrlSelfAction,
  registerCandidateDocumentAction,
  registerCandidateDocumentSelfAction,
  getDocumentDownloadUrlAction,
  getCandidateDocumentViewUrlAction,
  deleteCandidateDocumentAction,
} from "@/lib/candidate/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { createServerClient } from "@/lib/supabase/server";
import { AuditAction } from "@/generated/prisma";

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

describe("Candidate Document Storage Integration & Forensic Path Boundaries (tests/integration/candidate-storage.test.ts)", () => {
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

  it("4. Generates signed private download URL for authorized user with canonical path", async () => {
    const validCanonicalPath = `tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/${mockDocId}-v1-resume.pdf`;

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidateDocument: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockDocId,
            candidateId: mockCandidateId,
            storagePath: validCanonicalPath,
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

  it("5. Download refuses a document with an invalid/non-canonical storagePath", async () => {
    const maliciousPath = `tenants/other-org/candidates/other-candidate/documents/victim.pdf`;

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidateDocument: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockDocId,
            candidateId: mockCandidateId,
            storagePath: maliciousPath,
            candidate: {
              userId: mockUserId,
              organizationId: mockOrgId,
            },
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await getDocumentDownloadUrlAction(mockDocId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid document storage path invariant");
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SECURITY_ALERT_INVALID_STORAGE_PATH",
      })
    );
  });

  it("6. Deletes candidate document record and logs audit event when path is canonical", async () => {
    const validCanonicalPath = `tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/${mockDocId}-v1-resume.pdf`;

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidateDocument: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockDocId,
            candidateId: mockCandidateId,
            storagePath: validCanonicalPath,
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

  it("7. Delete refuses a document with an invalid/non-canonical storagePath", async () => {
    const maliciousPath = `tenants/other-org/candidates/other-candidate/documents/victim.pdf`;

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidateDocument: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockDocId,
            candidateId: mockCandidateId,
            storagePath: maliciousPath,
            candidate: {
              userId: mockUserId,
              organizationId: mockOrgId,
            },
          }),
          delete: vi.fn(),
        },
      };
      return callback(tx as any);
    });

    const result = await deleteCandidateDocumentAction(mockDocId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid document storage path invariant");
  });

  it("8. Self-service requestCandidateDocumentUploadUrlSelfAction generates server-bound documentId and canonical path", async () => {
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
            data: {
              signedUrl: "https://supabase.co/storage/v1/upload/signed?token=self_token",
              token: "self_token",
              path: `tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/doc-v1-transcript.pdf`,
            },
            error: null,
          }),
        }),
      },
    };

    vi.mocked(createServerClient).mockResolvedValue(mockStorageClient as any);

    const result = await requestCandidateDocumentUploadUrlSelfAction({
      filename: "transcript.pdf",
    });

    expect(result.success).toBe(true);
    expect(result.data?.documentId).toBeDefined();
    expect(result.data?.filename).toBe("transcript.pdf");
    expect(result.data?.signedUrl).toContain("https://supabase.co/storage/v1/upload");
    expect(result.data?.storagePath).toContain(`tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/`);
  });

  it("9. Self-service registerCandidateDocumentSelfAction verifies storage object presence before creating DB row", async () => {
    const expectedFilename = `${mockDocId}-v1-resume.pdf`;
    const canonicalStoragePath = `tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/${expectedFilename}`;

    const mockStorageClient = {
      storage: {
        from: vi.fn().mockReturnValue({
          list: vi.fn().mockResolvedValue({
            data: [{ name: expectedFilename }],
            error: null,
          }),
        }),
      },
    };
    vi.mocked(createServerClient).mockResolvedValue(mockStorageClient as any);

    const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const createMock = vi.fn().mockResolvedValue({
      id: mockDocId,
      candidateId: mockCandidateId,
      storagePath: canonicalStoragePath,
      title: "Master Resume 2026",
      documentType: "RESUME",
      fileSizeBytes: 1024 * 500,
      mimeType: "application/pdf",
      versionNumber: 1,
      isDefault: true,
      createdAt: new Date("2026-09-27T10:00:00Z"),
      updatedAt: new Date("2026-09-27T10:00:00Z"),
    });

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
          findUnique: vi.fn().mockResolvedValue(null),
          updateMany: updateManyMock,
          create: createMock,
        },
      };
      return callback(tx as any);
    });

    // Even if client attempts to pass a malicious storagePath, server derives canonical path
    const result = await registerCandidateDocumentSelfAction({
      documentId: mockDocId,
      filename: "resume.pdf",
      documentType: "RESUME",
      title: "Master Resume 2026",
      storagePath: "malicious-injected-path",
      fileSizeBytes: 1024 * 500,
      mimeType: "application/pdf",
      isDefault: true,
    });

    expect(result.success).toBe(true);
    expect(result.data?.document.id).toBe(mockDocId);
    expect(result.data?.document.storagePath).toBe(canonicalStoragePath);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storagePath: canonicalStoragePath, // Strictly uses server-derived canonical path!
        }),
      })
    );
  });

  it("10. Self-service registerCandidateDocumentSelfAction rejects registration if storage object does NOT exist", async () => {
    // Mock storage returning empty list (file does not exist in bucket)
    const mockStorageClient = {
      storage: {
        from: vi.fn().mockReturnValue({
          list: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      },
    };
    vi.mocked(createServerClient).mockResolvedValue(mockStorageClient as any);

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
          create: vi.fn(),
        },
      };
      return callback(tx as any);
    });

    const result = await registerCandidateDocumentSelfAction({
      documentId: mockDocId,
      filename: "missing-file.pdf",
      documentType: "RESUME",
      title: "Missing Resume",
      fileSizeBytes: 1024 * 500,
      mimeType: "application/pdf",
      isDefault: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Upload could not be verified");
  });

  it("11. Self-service registerCandidateDocumentSelfAction handles repeated registration idempotently", async () => {
    const expectedFilename = `${mockDocId}-v1-resume.pdf`;
    const canonicalStoragePath = `tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/${expectedFilename}`;

    const mockStorageClient = {
      storage: {
        from: vi.fn().mockReturnValue({
          list: vi.fn().mockResolvedValue({
            data: [{ name: expectedFilename }],
            error: null,
          }),
        }),
      },
    };
    vi.mocked(createServerClient).mockResolvedValue(mockStorageClient as any);

    const existingDoc = {
      id: mockDocId,
      candidateId: mockCandidateId,
      storagePath: canonicalStoragePath,
      title: "Master Resume 2026",
      documentType: "RESUME",
      fileSizeBytes: 1024 * 500,
      mimeType: "application/pdf",
      versionNumber: 1,
      isDefault: true,
      createdAt: new Date("2026-09-27T10:00:00Z"),
      updatedAt: new Date("2026-09-27T10:00:00Z"),
    };

    const createMock = vi.fn();

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
          findUnique: vi.fn().mockResolvedValue(existingDoc),
          create: createMock,
        },
      };
      return callback(tx as any);
    });

    const result = await registerCandidateDocumentSelfAction({
      documentId: mockDocId,
      filename: "resume.pdf",
      documentType: "RESUME",
      title: "Master Resume 2026",
      fileSizeBytes: 1024 * 500,
      mimeType: "application/pdf",
      isDefault: true,
    });

    expect(result.success).toBe(true);
    expect(result.data?.document.id).toBe(mockDocId);
    expect(createMock).not.toHaveBeenCalled(); // Idempotent: no duplicate create
  });

  it("12. Returns sanitized error message when storage signed URL generation fails", async () => {
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
            data: null,
            error: { message: "Bucket candidate-documents not found" },
          }),
        }),
      },
    };
    vi.mocked(createServerClient).mockResolvedValue(mockStorageClient as any);

    const result = await requestCandidateDocumentUploadUrlSelfAction({
      filename: "transcript.pdf",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unable to prepare secure upload. Please try again.");
  });

  it("13. Rejects upload URL request when candidate profile does not exist", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };
      return callback(tx as any);
    });

    const result = await requestCandidateDocumentUploadUrlSelfAction({
      filename: "transcript.pdf",
    });

    expect(result.success).toBe(false);
    // The action sanitizes all errors to prevent information leakage about candidate existence
    expect(result.error).toBe("Unable to prepare secure upload. Please try again.");
  });

  it("14. AuditAction enum contains SECURITY_ALERT_INVALID_STORAGE_PATH and CANDIDATE_DOCUMENT_VIEWED", () => {
    expect(AuditAction.SECURITY_ALERT_INVALID_STORAGE_PATH).toBe("SECURITY_ALERT_INVALID_STORAGE_PATH");
    expect(AuditAction.CANDIDATE_DOCUMENT_VIEWED).toBe("CANDIDATE_DOCUMENT_VIEWED");
    expect(AuditAction.CANDIDATE_DOCUMENT_DELETED).toBe("CANDIDATE_DOCUMENT_DELETED");
    expect(AuditAction.CANDIDATE_DOCUMENT_UPLOADED).toBe("CANDIDATE_DOCUMENT_UPLOADED");
  });

  it("15. View URL action generates preview signed URL and logs CANDIDATE_DOCUMENT_VIEWED", async () => {
    const validCanonicalPath = `tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/${mockDocId}-v1-resume.pdf`;

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidateDocument: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockDocId,
            candidateId: mockCandidateId,
            storagePath: validCanonicalPath,
            title: "Senior FullStack Resume",
            mimeType: "application/pdf",
            fileSizeBytes: 150000,
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
          list: vi.fn().mockResolvedValue({
            data: [{ name: `${mockDocId}-v1-resume.pdf` }],
            error: null,
          }),
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: "https://supabase.co/storage/v1/preview/signed?token=preview123" },
            error: null,
          }),
        }),
      },
    };

    vi.mocked(createServerClient).mockResolvedValue(mockStorageClient as any);

    const result = await getCandidateDocumentViewUrlAction(mockDocId);

    expect(result.success).toBe(true);
    expect(result.data?.viewUrl).toBe("https://supabase.co/storage/v1/preview/signed?token=preview123");
    expect(result.data?.title).toBe("Senior FullStack Resume");
    expect(result.data?.mimeType).toBe("application/pdf");
    expect(result.data?.fileSizeBytes).toBe(150000);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CANDIDATE_DOCUMENT_VIEWED,
        entityId: mockDocId,
      })
    );
  });

  it("16. View URL action denies non-canonical path, logs SECURITY_ALERT_INVALID_STORAGE_PATH, and returns sanitized error", async () => {
    const forgedPath = `tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/otherDocId-v1-resume.pdf`;

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidateDocument: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockDocId,
            candidateId: mockCandidateId,
            storagePath: forgedPath,
            candidate: {
              userId: mockUserId,
              organizationId: mockOrgId,
            },
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await getCandidateDocumentViewUrlAction(mockDocId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid document storage path invariant");
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.SECURITY_ALERT_INVALID_STORAGE_PATH,
        entityId: mockDocId,
      })
    );
  });

  it("17. Delete action denies non-canonical path, logs SECURITY_ALERT_INVALID_STORAGE_PATH, and never deletes DB or storage", async () => {
    const forgedPath = `tenants/other-org/candidates/other-cand/documents/forged.pdf`;
    const deleteMock = vi.fn();

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidateDocument: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockDocId,
            candidateId: mockCandidateId,
            storagePath: forgedPath,
            candidate: {
              userId: mockUserId,
              organizationId: mockOrgId,
            },
          }),
          delete: deleteMock,
        },
      };
      return callback(tx as any);
    });

    const result = await deleteCandidateDocumentAction(mockDocId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid document storage path invariant");
    expect(deleteMock).not.toHaveBeenCalled();
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.SECURITY_ALERT_INVALID_STORAGE_PATH,
        entityId: mockDocId,
      })
    );
  });

  it("18. Canonical storage path validation checks all security boundaries strictly", () => {
    const valid = `tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/${mockDocId}-v1-test.pdf`;

    // Valid path
    expect(isCanonicalCandidateDocumentPath(valid, mockOrgId, mockCandidateId, mockDocId)).toBe(true);

    // Path traversal with directory escape
    expect(isCanonicalCandidateDocumentPath(`tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/../../../etc/passwd`, mockOrgId, mockCandidateId)).toBe(false);
    expect(isCanonicalCandidateDocumentPath(`tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/../other/file.pdf`, mockOrgId, mockCandidateId)).toBe(false);

    // Wrong organization
    expect(isCanonicalCandidateDocumentPath(valid, "00000000-0000-0000-0000-000000000000", mockCandidateId, mockDocId)).toBe(false);

    // Wrong candidate
    expect(isCanonicalCandidateDocumentPath(valid, mockOrgId, "00000000-0000-0000-0000-000000000000", mockDocId)).toBe(false);

    // Wrong document ID
    expect(isCanonicalCandidateDocumentPath(valid, mockOrgId, mockCandidateId, "00000000-0000-0000-0000-000000000000")).toBe(false);

    // Subdirectories within documents folder
    expect(isCanonicalCandidateDocumentPath(`tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/subfolder/file.pdf`, mockOrgId, mockCandidateId)).toBe(false);

    // Null or invalid types
    expect(isCanonicalCandidateDocumentPath(null as any, mockOrgId, mockCandidateId)).toBe(false);
    expect(isCanonicalCandidateDocumentPath("", mockOrgId, mockCandidateId)).toBe(false);
  });

  it("19. Audit failure during security denial never converts denial into success", async () => {
    const maliciousPath = `tenants/other-org/candidates/other-candidate/documents/victim.pdf`;

    vi.mocked(logUserAuditEvent).mockRejectedValueOnce(new Error("Database connection lost"));

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidateDocument: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockDocId,
            candidateId: mockCandidateId,
            storagePath: maliciousPath,
            candidate: {
              userId: mockUserId,
              organizationId: mockOrgId,
            },
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await getDocumentDownloadUrlAction(mockDocId);

    // Must remain denied even if audit logging threw an error
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid document storage path invariant");
  });
});
