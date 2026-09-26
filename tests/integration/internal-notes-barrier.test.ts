import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createInternalNoteAction,
  getInternalNotesAction,
} from "@/lib/communication/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import fs from "fs";
import path from "path";

vi.mock("@/lib/auth/context", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/context");
  return {
    ...actual,
    getAuthenticatedContext: vi.fn(),
  };
});

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

describe("Internal Notes Confidentiality & Information Barrier (tests/integration/internal-notes-barrier.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockStaffUserId = "22222222-2222-4222-8222-222222222222";
  const mockCandidateUserId = "33333333-3333-4333-8333-333333333333";
  const mockCandidateId = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Verifies PostgreSQL Migration enforces FORCE ROW LEVEL SECURITY on internal_notes", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../../prisma/migrations/20260925000002_phase7_communication_core/migration.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf-8");

    expect(sql).toContain('ALTER TABLE "internal_notes" ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE "internal_notes" FORCE ROW LEVEL SECURITY;');
    expect(sql).toContain('CREATE POLICY "internal_notes_staff_select"');
    expect(sql).toContain('public.is_org_privileged_member(organization_id, public.current_user_id())');
  });

  it("2. Staff member successfully records internal note -> audit logged", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockStaffUserId,
      email: "staff@example.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({ id: mockCandidateId }),
        },
        internalNote: {
          create: vi.fn().mockResolvedValue({
            id: "note-1",
            organizationId: mockOrgId,
            authorId: mockStaffUserId,
            candidateId: mockCandidateId,
            body: "Candidate verified against public GitHub repositories.",
          }),
        },
      };
      return callback(tx as any);
    });

    const res = await createInternalNoteAction({
      candidateId: mockCandidateId,
      body: "Candidate verified against public GitHub repositories.",
    });

    expect(res.success).toBe(true);
    expect(res.data?.noteId).toBe("note-1");
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "INTERNAL_NOTE_CREATED",
        entityId: "note-1",
      })
    );
  });

  it("3. Candidate is permanently blocked from creating internal notes (RBAC Gate)", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "cand@example.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    const res = await createInternalNoteAction({
      candidateId: mockCandidateId,
      body: "Attempting candidate unauthorized internal note creation",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Access denied: requires one of [EMPLOYEE, ADMIN]");
  });

  it("4. Candidate is permanently blocked from reading internal notes (RBAC Gate)", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "cand@example.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    const res = await getInternalNotesAction({
      candidateId: mockCandidateId,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Access denied: requires one of [EMPLOYEE, ADMIN]");
  });
});
