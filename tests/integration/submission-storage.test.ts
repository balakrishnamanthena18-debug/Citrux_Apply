import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateSubmissionEvidenceUploadUrlAction,
  getSubmissionEvidenceDownloadUrlAction,
} from "@/lib/submission/actions";
import { generateSubmissionEvidencePath } from "@/lib/storage";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { ApplicationStatus, AuditAction } from "@/generated/prisma";
import { AuthorizationError, InvalidStateTransitionError } from "@/lib/errors";

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

vi.mock("@/lib/storage", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    createSignedSubmissionEvidenceUploadUrl: vi.fn().mockResolvedValue("https://storage.supabase.co/upload-presigned-url"),
    createSignedSubmissionEvidenceDownloadUrl: vi.fn().mockResolvedValue("https://storage.supabase.co/download-presigned-url"),
  };
});

describe("Phase 6 Submission Evidence Storage Integration (tests/integration/submission-storage.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const otherOrgId = "99999999-9999-4999-8999-999999999999";
  const mockEmployeeId = "22222222-2222-4222-8222-222222222222";
  const mockAppId = "33333333-3333-4333-8333-333333333333";
  const mockSubId = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@citrux.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });
  });

  it("generates deterministic tenant-isolated storage path", () => {
    const path = generateSubmissionEvidencePath(
      mockOrgId,
      mockAppId,
      mockSubId,
      "confirmation.png"
    );

    expect(path).toBe(
      `tenants/${mockOrgId}/applications/${mockAppId}/submissions/${mockSubId}-confirmation.png`
    );
  });

  it("generates signed upload URL for staff when application is in READY status", async () => {
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.READY,
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await generateSubmissionEvidenceUploadUrlAction({
      applicationId: mockAppId,
      filename: "proof_screenshot.png",
      mimeType: "image/png",
      fileSizeBytes: 1024 * 500,
    });

    expect(result.success).toBe(true);
    expect(result.uploadUrl).toBe("https://storage.supabase.co/upload-presigned-url");
    expect(result.storagePath).toContain(`tenants/${mockOrgId}/applications/${mockAppId}/submissions/`);
    expect(result.storagePath).toContain("proof_screenshot.png");

    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.APPLICATION_SUBMISSION_EVIDENCE_UPLOADED,
        organizationId: mockOrgId,
      })
    );
  });

  it("rejects signed upload URL request if application is in PREPARING status", async () => {
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            status: ApplicationStatus.PREPARING,
          }),
        },
      };
      return callback(tx as any);
    });

    await expect(
      generateSubmissionEvidenceUploadUrlAction({
        applicationId: mockAppId,
        filename: "proof_screenshot.png",
        mimeType: "image/png",
        fileSizeBytes: 1024 * 500,
      })
    ).rejects.toThrow(InvalidStateTransitionError);
  });

  it("generates signed download URL for staff within the same organization", async () => {
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        applicationSubmission: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockSubId,
            storagePath: `tenants/${mockOrgId}/applications/${mockAppId}/submissions/${mockSubId}-proof.png`,
            application: {
              organizationId: mockOrgId,
            },
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await getSubmissionEvidenceDownloadUrlAction({
      submissionId: mockSubId,
    });

    expect(result.success).toBe(true);
    expect(result.downloadUrl).toBe("https://storage.supabase.co/download-presigned-url");
    expect(result.filename).toBe(`${mockSubId}-proof.png`);
  });

  it("blocks evidence download if submission belongs to a different organization", async () => {
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        applicationSubmission: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockSubId,
            storagePath: `tenants/${otherOrgId}/applications/${mockAppId}/submissions/${mockSubId}-proof.png`,
            application: {
              organizationId: otherOrgId,
            },
          }),
        },
      };
      return callback(tx as any);
    });

    await expect(
      getSubmissionEvidenceDownloadUrlAction({
        submissionId: mockSubId,
      })
    ).rejects.toThrow(AuthorizationError);
  });
});
