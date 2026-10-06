"use server";

import { revalidatePath } from "next/cache";
import { AuditAction } from "@/generated/prisma";
import {
  getAuthenticatedContext,
  requireEmployeeOrAdmin,
} from "@/lib/auth/context";
import { logUserAuditEvent } from "@/lib/audit";
import { withRlsContext } from "@/lib/db/rls";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import {
  createSignedOutcomeEvidenceDownloadUrl,
  createSignedOutcomeEvidenceUploadUrl,
  generateOutcomeEvidencePath,
  isCanonicalOutcomeEvidencePath,
} from "@/lib/storage";
import {
  CandidateReportOutcomeSchema,
  GenerateOutcomeEvidenceUploadUrlSchema,
  StaffCreateOutcomeSchema,
  SupersedeOutcomeSchema,
  VerifyOutcomeSchema,
  VoidOutcomeSchema,
} from "@/lib/validation/outcome.schemas";
import {
  assertStaffCanAccessApplication,
  createCandidateReportedOutcome,
  createStaffOutcome,
  listOutcomesForCandidate,
  listOutcomesForStaff,
  supersedeOutcome,
  verifyCandidateReportedOutcome,
  voidOutcome,
} from "./outcome-service";

function revalidateOutcomeViews(applicationId: string) {
  try {
    revalidatePath(`/employee/applications/${applicationId}`);
    revalidatePath(`/candidate/applications/${applicationId}`);
    revalidatePath("/employee/applications");
    revalidatePath("/candidate/applications");
  } catch {
    /* outside Next request */
  }
}

export async function createStaffOutcomeAction(raw: unknown) {
  const parsed = StaffCreateOutcomeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message || "Invalid outcome input"
    );
  }
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const event = await withRlsContext(ctx.userId, async (tx) =>
    createStaffOutcome(tx, ctx, parsed.data)
  );
  revalidateOutcomeViews(parsed.data.applicationId);
  return { success: true as const, outcomeId: event.id };
}

export async function reportCandidateOutcomeAction(raw: unknown) {
  const parsed = CandidateReportOutcomeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message || "Invalid outcome report"
    );
  }
  const ctx = await getAuthenticatedContext();
  if (ctx.role !== "CANDIDATE") {
    throw new AuthorizationError("Only candidates may report outcomes");
  }

  const event = await withRlsContext(ctx.userId, async (tx) =>
    createCandidateReportedOutcome(tx, ctx, parsed.data)
  );
  revalidateOutcomeViews(parsed.data.applicationId);
  return { success: true as const, outcomeId: event.id };
}

export async function verifyOutcomeAction(raw: unknown) {
  const parsed = VerifyOutcomeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message || "Invalid verification input"
    );
  }
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const event = await withRlsContext(ctx.userId, async (tx) =>
    verifyCandidateReportedOutcome(tx, ctx, parsed.data)
  );
  revalidateOutcomeViews(event.applicationId);
  return { success: true as const, outcomeId: event.id };
}

export async function voidOutcomeAction(raw: unknown) {
  const parsed = VoidOutcomeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message || "Invalid void input"
    );
  }
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const event = await withRlsContext(ctx.userId, async (tx) =>
    voidOutcome(tx, ctx, parsed.data)
  );
  revalidateOutcomeViews(event.applicationId);
  return { success: true as const, outcomeId: event.id };
}

export async function supersedeOutcomeAction(raw: unknown) {
  const parsed = SupersedeOutcomeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message || "Invalid supersede input"
    );
  }
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const event = await withRlsContext(ctx.userId, async (tx) =>
    supersedeOutcome(tx, ctx, parsed.data)
  );
  revalidateOutcomeViews(event.applicationId);
  return { success: true as const, outcomeId: event.id };
}

export async function listStaffApplicationOutcomesAction(
  applicationId: string,
  includeInactive = false
) {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);
  return withRlsContext(ctx.userId, async (tx) =>
    listOutcomesForStaff(tx, ctx, applicationId, { includeInactive })
  );
}

export async function listCandidateApplicationOutcomesAction(
  applicationId: string
) {
  const ctx = await getAuthenticatedContext();
  if (ctx.role !== "CANDIDATE") {
    throw new AuthorizationError("Candidate access required");
  }
  return withRlsContext(ctx.userId, async (tx) =>
    listOutcomesForCandidate(tx, ctx, applicationId)
  );
}

export async function generateOutcomeEvidenceUploadUrlAction(raw: unknown) {
  const parsed = GenerateOutcomeEvidenceUploadUrlSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message || "Invalid upload parameters"
    );
  }
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  return withRlsContext(ctx.userId, async (tx) => {
    await assertStaffCanAccessApplication(tx, ctx, parsed.data.applicationId);
    const outcomeId = crypto.randomUUID();
    const storagePath = generateOutcomeEvidencePath(
      ctx.organizationId,
      parsed.data.applicationId,
      outcomeId,
      parsed.data.filename
    );
    const upload = await createSignedOutcomeEvidenceUploadUrl(storagePath);
    if (!upload) {
      throw new ValidationError("Unable to create outcome evidence upload URL");
    }

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.APPLICATION_OUTCOME_EVIDENCE_UPLOADED,
      entityType: "ApplicationOutcomeEvent",
      entityId: outcomeId,
      details: {
        applicationId: parsed.data.applicationId,
        // Audit reference only — never log signed URLs or full private paths
        pathFingerprint: storagePath.split("/").slice(-1)[0],
      },
      tx,
    });

    return {
      success: true as const,
      outcomeId,
      storagePath: upload.path,
      uploadUrl: {
        signedUrl: upload.signedUrl,
        path: upload.path,
        token: upload.token,
      },
    };
  });
}

export async function getOutcomeEvidenceDownloadUrlAction(outcomeId: string) {
  const ctx = await getAuthenticatedContext();

  return withRlsContext(ctx.userId, async (tx) => {
    const event = await tx.applicationOutcomeEvent.findFirst({
      where: { id: outcomeId, organizationId: ctx.organizationId },
      include: { application: { include: { candidate: true } } },
    });
    if (!event || !event.evidenceStoragePath) {
      throw new ValidationError("Evidence not available");
    }

    if (ctx.role === "CANDIDATE") {
      if (event.application.candidate.userId !== ctx.userId) {
        throw new AuthorizationError("Not authorized");
      }
      if (!event.evidenceShareable || !event.candidateVisible) {
        throw new AuthorizationError("Evidence is not shareable");
      }
    } else {
      requireEmployeeOrAdmin(ctx);
      await assertStaffCanAccessApplication(tx, ctx, event.applicationId);
    }

    if (
      !isCanonicalOutcomeEvidencePath(
        event.evidenceStoragePath,
        ctx.organizationId,
        event.applicationId
      )
    ) {
      throw new AuthorizationError("Invalid evidence path");
    }

    const url = await createSignedOutcomeEvidenceDownloadUrl(
      event.evidenceStoragePath,
      60
    );
    if (!url) throw new ValidationError("Unable to create download URL");
    // Return URL to caller only — do not audit the signed URL string
    return { success: true as const, expiresInSeconds: 60, url };
  });
}
