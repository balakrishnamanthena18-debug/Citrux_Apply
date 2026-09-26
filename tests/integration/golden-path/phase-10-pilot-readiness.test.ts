import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseEnv } from "@/lib/env";
import {
  CANDIDATE_DOCUMENTS_BUCKET,
  SUBMISSION_EVIDENCE_BUCKET,
  generateCandidateDocumentPath,
  generateSubmissionEvidencePath,
} from "@/lib/storage";
import { GET } from "@/app/api/health/route";
import { ApplicationStatus, CandidateStatus, TaskStatus, MembershipStatus } from "@/generated/prisma";
import { bulkWithdrawApplicationsOnConsentRevocationAction } from "@/lib/application/actions";
import { cancelTasksOnConsentRevocationAction } from "@/lib/task/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { AuthorizationError } from "@/lib/errors";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireCandidate: vi.fn((ctx) => {
    if (ctx.role !== "CANDIDATE") {
      throw new AuthorizationError("Operation requires CANDIDATE role");
    }
  }),
  requireEmployeeOrAdmin: vi.fn((ctx) => {
    if (ctx.role !== "EMPLOYEE" && ctx.role !== "ADMIN") {
      throw new AuthorizationError("Operation requires EMPLOYEE or ADMIN role");
    }
  }),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
  logSystemAuditEvent: vi.fn(),
}));

describe("Phase 10 — Production Pilot Readiness Verification Suite", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockCandidateUserId = "22222222-2222-4222-8222-222222222222";
  const mockCandidateId = "33333333-3333-4333-8333-333333333333";
  const mockAppAId = "66666666-6666-4666-8666-666666666666";
  const mockAppBId = "66666666-6666-4666-8666-666666666667";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Gate 1: Environment & Secret Configuration Readiness", () => {
    it("validates that required server and public variables parse cleanly without errors", () => {
      const validEnv = {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://postgres.test:6543/postgres?pgbouncer=true",
        DIRECT_URL: "postgresql://postgres.test:5432/postgres",
        NEXT_PUBLIC_SUPABASE_URL: "https://example-oos.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-test",
        SMTP_HOST: "smtp.gmail.com",
        SMTP_PORT: "465",
        SMTP_USER: "ops@citrux.com",
        SMTP_PASS: "app-password-test",
        EMAIL_FROM: "notifications@citrux.com",
      };

      const parsed = parseEnv(validEnv);
      expect(parsed.DATABASE_URL).toBe(validEnv.DATABASE_URL);
      expect(parsed.DIRECT_URL).toBe(validEnv.DIRECT_URL);
      expect(parsed.NEXT_PUBLIC_SUPABASE_URL).toBe(validEnv.NEXT_PUBLIC_SUPABASE_URL);
      expect(parsed.SMTP_HOST).toBe("smtp.gmail.com");
    });

    it("fails fast if required database or Supabase URLs are missing", () => {
      expect(() =>
        parseEnv({
          NODE_ENV: "production",
          DATABASE_URL: "",
          DIRECT_URL: "",
        })
      ).toThrowError(/\[CRITICAL\] Environment configuration validation failed/);
    });
  });

  describe("Gate 3: Supabase Storage Readiness & Bucket Invariants", () => {
    it("uses authoritative private bucket identifiers (No S3)", () => {
      expect(CANDIDATE_DOCUMENTS_BUCKET).toBe("candidate-documents");
      expect(SUBMISSION_EVIDENCE_BUCKET).toBe("submission-evidence");
    });

    it("generates deterministic tenant-isolated paths for candidate documents", () => {
      const path = generateCandidateDocumentPath(
        mockOrgId,
        mockCandidateId,
        "doc-123",
        1,
        "Resume_2026.pdf"
      );
      expect(path).toBe(
        `tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/doc-123-v1-resume_2026.pdf`
      );
      expect(path).not.toContain("..");
    });

    it("generates deterministic tenant-isolated paths for submission evidence", () => {
      const path = generateSubmissionEvidencePath(
        mockOrgId,
        mockAppAId,
        "sub-456",
        "Confirmation Screenshot.png"
      );
      expect(path).toBe(
        `tenants/${mockOrgId}/applications/${mockAppAId}/submissions/sub-456-confirmation_screenshot.png`
      );
      expect(path).not.toContain("..");
    });
  });

  describe("Gate 5: Golden-Path Health Endpoint Verification", () => {
    it("returns HTTP 200 with pass status, no-cache headers, and zero secret leakage", async () => {
      const res = await GET();
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");
      const json = await res.json();
      expect(json.status).toBe("pass");
      expect(json.service).toBe("oos");
      expect(json.DATABASE_URL).toBeUndefined();
      expect(json.DIRECT_URL).toBeUndefined();
      expect(json.SMTP_PASS).toBeUndefined();
    });
  });

  describe("Gate 8: Privacy & Consent Revocation Invariant Verification", () => {
    it("preserves submitted applications while withdrawing unsubmitted applications upon consent revocation", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockCandidateUserId,
        email: "candidate@alpha.com",
        role: "CANDIDATE",
        organizationId: mockOrgId,
        status: CandidateStatus.ACTIVE,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      const updatedAppIds: string[] = [];

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback: any) => {
        const mockTx = {
          candidate: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockCandidateId,
              userId: mockCandidateUserId,
              organizationId: mockOrgId,
            }),
          },
          application: {
            findMany: vi.fn().mockResolvedValue([
              { id: mockAppBId, status: ApplicationStatus.READY, candidateId: mockCandidateId },
            ]),
            update: vi.fn().mockImplementation(async ({ where, data }: any) => {
              updatedAppIds.push(where.id);
              return { id: where.id, ...data };
            }),
          },
          applicationStateHistory: {
            create: vi.fn().mockResolvedValue({ id: "app-hist-withdrawn" }),
          },
        };
        return callback(mockTx);
      });

      const result = await bulkWithdrawApplicationsOnConsentRevocationAction(mockCandidateId);

      expect(result.success).toBe(true);
      expect(result.data?.withdrawnCount).toBe(1);
      expect(updatedAppIds).toContain(mockAppBId);
      expect(updatedAppIds).not.toContain(mockAppAId);
    });

    it("cancels open preparation tasks upon consent revocation", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: mockCandidateUserId,
        email: "candidate@alpha.com",
        role: "CANDIDATE",
        organizationId: mockOrgId,
        status: CandidateStatus.ACTIVE,
        membershipStatus: MembershipStatus.ACTIVE,
      });

      vi.mocked(withRlsContext).mockImplementation(async (_userId, callback: any) => {
        const mockTx = {
          candidate: {
            findUnique: vi.fn().mockResolvedValue({
              id: mockCandidateId,
              userId: mockCandidateUserId,
              organizationId: mockOrgId,
            }),
          },
          task: {
            findMany: vi.fn().mockResolvedValue([
              { id: "task-1", status: TaskStatus.IN_PROGRESS },
              { id: "task-2", status: TaskStatus.BACKLOG },
            ]),
            update: vi.fn().mockResolvedValue({ id: "task-1", status: TaskStatus.CANCELED }),
            updateMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
          taskStateHistory: {
            create: vi.fn().mockResolvedValue({ id: "task-hist-cancel" }),
          },
        };
        return callback(mockTx);
      });

      const taskResult = await cancelTasksOnConsentRevocationAction(mockCandidateId);

      expect(taskResult.success).toBe(true);
      expect(taskResult.data?.canceledCount).toBe(2);
    });
  });
});
