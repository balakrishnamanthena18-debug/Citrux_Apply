/**
 * Phase 6C — Application Outcome Ledger service (append-only).
 * Contract: docs/engineering/PHASE_6B_EXTERNAL_OUTCOME_PRODUCT_CONTRACT.md
 */

import {
  ApplicationStatus,
  AuditAction,
  type ApplicationOutcomeEvent,
  type ApplicationOutcomeType,
  type Prisma,
} from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { logUserAuditEvent } from "@/lib/audit";
import {
  AuthorizationError,
  InvalidStateTransitionError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import {
  candidateOutcomeLabel,
  candidateProvenanceLabel,
  staffOutcomeLabel,
} from "./outcome-labels";
import {
  applicationInStructuralScope,
  resolveAssignmentAuthority,
} from "./assignment-authority";

type Tx = Prisma.TransactionClient;

const CANDIDATE_REPORTABLE: ReadonlySet<ApplicationOutcomeType> = new Set([
  "EMPLOYER_REJECTION",
  "RECRUITER_CONTACT",
  "INTERVIEW_REQUESTED",
  "INTERVIEW_SCHEDULED",
  "OFFER_RECEIVED",
]);

export type OutcomeCreateFields = {
  outcomeType: ApplicationOutcomeType;
  occurredAt?: Date | null;
  notes?: string | null;
  candidateVisible?: boolean;
  evidenceText?: string | null;
  evidenceStoragePath?: string | null;
  evidenceShareable?: boolean;
};

export type OutcomePresentation = {
  id: string;
  outcomeType: ApplicationOutcomeType;
  label: string;
  provenance: ApplicationOutcomeEvent["provenance"];
  provenanceLabel: string;
  recordedAt: string;
  occurredAt: string | null;
  notes: string | null;
  candidateVisible: boolean;
  hasEvidence: boolean;
  evidenceShareable: boolean;
  correctionState: ApplicationOutcomeEvent["correctionState"];
  isActive: boolean;
};

async function loadApplicationForOutcome(
  tx: Tx,
  applicationId: string,
  organizationId: string
) {
  return tx.application.findFirst({
    where: { id: applicationId, organizationId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      candidateId: true,
      assignedEmployeeId: true,
      assignedTeamKey: true,
      assignedManagerId: true,
      candidate: { select: { userId: true } },
      _count: { select: { submissions: true } },
    },
  });
}

/** Authoritative submission prerequisite: at least one ApplicationSubmission row. */
export function assertHasSubmissionEvidence(submissionCount: number): void {
  if (submissionCount < 1) {
    throw new ValidationError(
      "Outcomes require an authoritative external submission record."
    );
  }
}

export function assertInterviewScheduledOccurredAt(
  outcomeType: ApplicationOutcomeType,
  occurredAt: Date | null | undefined
): void {
  if (outcomeType === "INTERVIEW_SCHEDULED") {
    if (!occurredAt || Number.isNaN(occurredAt.getTime())) {
      throw new ValidationError(
        "INTERVIEW_SCHEDULED requires occurredAt (O6)."
      );
    }
  }
}

function resolveStaffCandidateVisible(
  outcomeType: ApplicationOutcomeType,
  explicit?: boolean
): boolean {
  if (outcomeType === "OTHER") {
    // O3: OTHER hidden unless staff explicitly sets true
    return explicit === true;
  }
  if (explicit === false) return false;
  return true;
}

export async function assertStaffCanAccessApplication(
  tx: Tx,
  ctx: AuthenticatedContext,
  applicationId: string
) {
  if (ctx.role !== "EMPLOYEE" && ctx.role !== "ADMIN") {
    throw new AuthorizationError("Staff access required");
  }
  const app = await loadApplicationForOutcome(
    tx,
    applicationId,
    ctx.organizationId
  );
  if (!app) throw new NotFoundError("Application not found");

  if (ctx.role === "ADMIN") {
    return app;
  }

  const profile = await resolveAssignmentAuthority(tx, ctx);
  const allowed = await applicationInStructuralScope(tx, ctx, app, profile);
  if (!allowed) {
    throw new AuthorizationError(
      "You are not authorized to access outcomes for this Application."
    );
  }

  return app;
}

export async function assertCandidateOwnsApplication(
  tx: Tx,
  ctx: AuthenticatedContext,
  applicationId: string
) {
  if (ctx.role !== "CANDIDATE") {
    throw new AuthorizationError("Candidate access required");
  }
  const app = await loadApplicationForOutcome(
    tx,
    applicationId,
    ctx.organizationId
  );
  if (!app || app.candidate.userId !== ctx.userId) {
    throw new NotFoundError("Application not found");
  }
  return app;
}

/**
 * Staff creates EMPLOYEE_RECORDED outcome.
 * EMPLOYER_REJECTION atomically couples to ApplicationStatus.REJECTED (O4).
 */
export async function createStaffOutcome(
  tx: Tx,
  ctx: AuthenticatedContext,
  input: OutcomeCreateFields & { applicationId: string }
): Promise<ApplicationOutcomeEvent> {
  const app = await assertStaffCanAccessApplication(
    tx,
    ctx,
    input.applicationId
  );
  assertHasSubmissionEvidence(app._count.submissions);
  assertInterviewScheduledOccurredAt(input.outcomeType, input.occurredAt);

  const candidateVisible = resolveStaffCandidateVisible(
    input.outcomeType,
    input.candidateVisible
  );
  const recordedAt = new Date();

  if (input.outcomeType === "EMPLOYER_REJECTION") {
    return createAuthoritativeEmployerRejection(tx, ctx, app, {
      ...input,
      candidateVisible,
      recordedAt,
      provenance: "EMPLOYEE_RECORDED",
    });
  }

  const event = await tx.applicationOutcomeEvent.create({
    data: {
      organizationId: ctx.organizationId,
      applicationId: app.id,
      outcomeType: input.outcomeType,
      provenance: "EMPLOYEE_RECORDED",
      actorUserId: ctx.userId,
      recordedAt,
      occurredAt: input.occurredAt ?? null,
      notes: input.notes?.trim() || null,
      candidateVisible,
      evidenceText: input.evidenceText?.trim() || null,
      evidenceStoragePath: input.evidenceStoragePath?.trim() || null,
      evidenceShareable: Boolean(input.evidenceShareable),
      correctionState: "ACTIVE",
    },
  });

  await logUserAuditEvent({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    action: AuditAction.APPLICATION_OUTCOME_CREATED,
    entityType: "ApplicationOutcomeEvent",
    entityId: event.id,
    details: {
      applicationId: app.id,
      outcomeType: event.outcomeType,
      provenance: event.provenance,
    },
    tx,
  });

  return event;
}

async function createAuthoritativeEmployerRejection(
  tx: Tx,
  ctx: AuthenticatedContext,
  app: {
    id: string;
    status: ApplicationStatus;
    organizationId: string;
  },
  args: OutcomeCreateFields & {
    candidateVisible: boolean;
    recordedAt: Date;
    provenance: "EMPLOYEE_RECORDED" | "STAFF_VERIFIED";
    supersedeId?: string;
  }
): Promise<ApplicationOutcomeEvent> {
  if (app.status === "REJECTED") {
    throw new InvalidStateTransitionError(
      "Application is already REJECTED; cannot couple another authoritative employer rejection."
    );
  }
  if (app.status !== "SUBMITTED") {
    throw new InvalidStateTransitionError(
      `Authoritative EMPLOYER_REJECTION requires Application status SUBMITTED (got ${app.status}).`
    );
  }

  const event = await tx.applicationOutcomeEvent.create({
    data: {
      organizationId: ctx.organizationId,
      applicationId: app.id,
      outcomeType: "EMPLOYER_REJECTION",
      provenance: args.provenance,
      actorUserId: ctx.userId,
      recordedAt: args.recordedAt,
      occurredAt: args.occurredAt ?? null,
      notes: args.notes?.trim() || null,
      candidateVisible: args.candidateVisible,
      evidenceText: args.evidenceText?.trim() || null,
      evidenceStoragePath: args.evidenceStoragePath?.trim() || null,
      evidenceShareable: Boolean(args.evidenceShareable),
      correctionState: "ACTIVE",
    },
  });

  await tx.application.update({
    where: { id: app.id },
    data: {
      status: ApplicationStatus.REJECTED,
      rejectionReason:
        args.notes?.trim() || "Employer rejection recorded via outcome ledger",
    },
  });

  await tx.applicationStateHistory.create({
    data: {
      applicationId: app.id,
      fromStatus: ApplicationStatus.SUBMITTED,
      toStatus: ApplicationStatus.REJECTED,
      changedById: ctx.userId,
      reason:
        args.notes?.trim() ||
        "Authoritative EMPLOYER_REJECTION outcome (Phase 6C O4 atomic coupling)",
    },
  });

  if (args.supersedeId) {
    await tx.applicationOutcomeEvent.update({
      where: { id: args.supersedeId },
      data: {
        correctionState: "SUPERSEDED",
        supersededById: event.id,
        voidedAt: args.recordedAt,
        voidedById: ctx.userId,
        voidReason: "Superseded by staff-verified employer rejection",
      },
    });
  }

  await logUserAuditEvent({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    action: AuditAction.APPLICATION_OUTCOME_CREATED,
    entityType: "ApplicationOutcomeEvent",
    entityId: event.id,
    details: {
      applicationId: app.id,
      outcomeType: "EMPLOYER_REJECTION",
      provenance: args.provenance,
      coupledStatus: "REJECTED",
    },
    tx,
  });

  await logUserAuditEvent({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    action: AuditAction.APPLICATION_STATUS_CHANGED,
    entityType: "Application",
    entityId: app.id,
    details: {
      previousStatus: "SUBMITTED",
      newStatus: "REJECTED",
      coupledOutcomeId: event.id,
      outcomeType: "EMPLOYER_REJECTION",
    },
    tx,
  });

  if (args.supersedeId) {
    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.APPLICATION_OUTCOME_SUPERSEDED,
      entityType: "ApplicationOutcomeEvent",
      entityId: args.supersedeId,
      details: { supersededById: event.id },
      tx,
    });
    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.APPLICATION_OUTCOME_VERIFIED,
      entityType: "ApplicationOutcomeEvent",
      entityId: event.id,
      details: { fromOutcomeId: args.supersedeId },
      tx,
    });
  }

  return event;
}

/**
 * Candidate report — always CANDIDATE_REPORTED; never changes ApplicationStatus.
 */
export async function createCandidateReportedOutcome(
  tx: Tx,
  ctx: AuthenticatedContext,
  input: OutcomeCreateFields & { applicationId: string }
): Promise<ApplicationOutcomeEvent> {
  const app = await assertCandidateOwnsApplication(
    tx,
    ctx,
    input.applicationId
  );
  assertHasSubmissionEvidence(app._count.submissions);

  if (input.outcomeType === "OTHER") {
    throw new ValidationError("Candidates cannot report OTHER outcomes.");
  }
  if (!CANDIDATE_REPORTABLE.has(input.outcomeType)) {
    throw new ValidationError("Candidates cannot report this outcome type.");
  }

  assertInterviewScheduledOccurredAt(input.outcomeType, input.occurredAt);

  const recordedAt = new Date();
  const event = await tx.applicationOutcomeEvent.create({
    data: {
      organizationId: ctx.organizationId,
      applicationId: app.id,
      outcomeType: input.outcomeType,
      provenance: "CANDIDATE_REPORTED",
      actorUserId: ctx.userId,
      recordedAt,
      occurredAt: input.occurredAt ?? null,
      notes: input.notes?.trim() || null,
      // Candidate reports are visible to the candidate via provenance RLS;
      // OTHER not allowed; non-OTHER reports use candidateVisible true for clarity.
      candidateVisible: true,
      correctionState: "ACTIVE",
    },
  });

  await logUserAuditEvent({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    action: AuditAction.APPLICATION_OUTCOME_CANDIDATE_REPORTED,
    entityType: "ApplicationOutcomeEvent",
    entityId: event.id,
    details: {
      applicationId: app.id,
      outcomeType: event.outcomeType,
    },
    tx,
  });

  return event;
}

/**
 * Staff verifies a CANDIDATE_REPORTED event → new STAFF_VERIFIED event + supersede original.
 * EMPLOYER_REJECTION verification uses O4 atomic coupling.
 */
export async function verifyCandidateReportedOutcome(
  tx: Tx,
  ctx: AuthenticatedContext,
  input: {
    outcomeId: string;
    notes?: string | null;
    candidateVisible?: boolean;
    evidenceText?: string | null;
    evidenceStoragePath?: string | null;
    evidenceShareable?: boolean;
    occurredAt?: Date | null;
  }
): Promise<ApplicationOutcomeEvent> {
  const existing = await tx.applicationOutcomeEvent.findFirst({
    where: { id: input.outcomeId, organizationId: ctx.organizationId },
  });
  if (!existing) throw new NotFoundError("Outcome not found");

  await assertStaffCanAccessApplication(tx, ctx, existing.applicationId);

  if (existing.provenance !== "CANDIDATE_REPORTED") {
    throw new ValidationError("Only CANDIDATE_REPORTED outcomes can be verified.");
  }
  if (existing.correctionState !== "ACTIVE") {
    throw new ValidationError("Only ACTIVE outcomes can be verified.");
  }

  const occurredAt = input.occurredAt ?? existing.occurredAt;
  assertInterviewScheduledOccurredAt(existing.outcomeType, occurredAt);

  const app = await loadApplicationForOutcome(
    tx,
    existing.applicationId,
    ctx.organizationId
  );
  if (!app) throw new NotFoundError("Application not found");

  const candidateVisible = resolveStaffCandidateVisible(
    existing.outcomeType,
    input.candidateVisible ?? existing.candidateVisible
  );
  const recordedAt = new Date();

  if (existing.outcomeType === "EMPLOYER_REJECTION") {
    return createAuthoritativeEmployerRejection(tx, ctx, app, {
      outcomeType: "EMPLOYER_REJECTION",
      occurredAt,
      notes: input.notes ?? existing.notes,
      evidenceText: input.evidenceText ?? existing.evidenceText,
      evidenceStoragePath:
        input.evidenceStoragePath ?? existing.evidenceStoragePath,
      evidenceShareable:
        input.evidenceShareable ?? existing.evidenceShareable,
      candidateVisible,
      recordedAt,
      provenance: "STAFF_VERIFIED",
      supersedeId: existing.id,
    });
  }

  const verified = await tx.applicationOutcomeEvent.create({
    data: {
      organizationId: ctx.organizationId,
      applicationId: existing.applicationId,
      outcomeType: existing.outcomeType,
      provenance: "STAFF_VERIFIED",
      actorUserId: ctx.userId,
      recordedAt,
      occurredAt,
      notes: input.notes?.trim() || existing.notes,
      candidateVisible,
      evidenceText: input.evidenceText?.trim() || existing.evidenceText,
      evidenceStoragePath:
        input.evidenceStoragePath?.trim() || existing.evidenceStoragePath,
      evidenceShareable: Boolean(
        input.evidenceShareable ?? existing.evidenceShareable
      ),
      correctionState: "ACTIVE",
    },
  });

  await tx.applicationOutcomeEvent.update({
    where: { id: existing.id },
    data: {
      correctionState: "SUPERSEDED",
      supersededById: verified.id,
      voidedAt: recordedAt,
      voidedById: ctx.userId,
      voidReason: "Superseded by staff verification",
    },
  });

  await logUserAuditEvent({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    action: AuditAction.APPLICATION_OUTCOME_SUPERSEDED,
    entityType: "ApplicationOutcomeEvent",
    entityId: existing.id,
    details: { supersededById: verified.id },
    tx,
  });

  await logUserAuditEvent({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    action: AuditAction.APPLICATION_OUTCOME_VERIFIED,
    entityType: "ApplicationOutcomeEvent",
    entityId: verified.id,
    details: {
      fromOutcomeId: existing.id,
      outcomeType: verified.outcomeType,
    },
    tx,
  });

  return verified;
}

export async function voidOutcome(
  tx: Tx,
  ctx: AuthenticatedContext,
  input: { outcomeId: string; reason: string }
): Promise<ApplicationOutcomeEvent> {
  const existing = await tx.applicationOutcomeEvent.findFirst({
    where: { id: input.outcomeId, organizationId: ctx.organizationId },
  });
  if (!existing) throw new NotFoundError("Outcome not found");
  await assertStaffCanAccessApplication(tx, ctx, existing.applicationId);

  if (existing.correctionState !== "ACTIVE") {
    throw new ValidationError("Only ACTIVE outcomes can be voided.");
  }

  const updated = await tx.applicationOutcomeEvent.update({
    where: { id: existing.id },
    data: {
      correctionState: "VOIDED",
      voidedAt: new Date(),
      voidedById: ctx.userId,
      voidReason: input.reason.trim(),
    },
  });

  await logUserAuditEvent({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    action: AuditAction.APPLICATION_OUTCOME_VOIDED,
    entityType: "ApplicationOutcomeEvent",
    entityId: updated.id,
    details: { reason: input.reason.trim() },
    tx,
  });

  return updated;
}

export async function supersedeOutcome(
  tx: Tx,
  ctx: AuthenticatedContext,
  input: OutcomeCreateFields & { outcomeId: string; reason: string }
): Promise<ApplicationOutcomeEvent> {
  const existing = await tx.applicationOutcomeEvent.findFirst({
    where: { id: input.outcomeId, organizationId: ctx.organizationId },
  });
  if (!existing) throw new NotFoundError("Outcome not found");
  await assertStaffCanAccessApplication(tx, ctx, existing.applicationId);

  if (existing.correctionState !== "ACTIVE") {
    throw new ValidationError("Only ACTIVE outcomes can be superseded.");
  }

  assertInterviewScheduledOccurredAt(input.outcomeType, input.occurredAt);

  // Authoritative employer rejection supersession uses coupling path
  if (input.outcomeType === "EMPLOYER_REJECTION") {
    const app = await loadApplicationForOutcome(
      tx,
      existing.applicationId,
      ctx.organizationId
    );
    if (!app) throw new NotFoundError("Application not found");
    if (app.status === "SUBMITTED") {
      return createAuthoritativeEmployerRejection(tx, ctx, app, {
        ...input,
        candidateVisible: resolveStaffCandidateVisible(
          input.outcomeType,
          input.candidateVisible
        ),
        recordedAt: new Date(),
        provenance: "EMPLOYEE_RECORDED",
        supersedeId: existing.id,
      });
    }
  }

  const recordedAt = new Date();
  const replacement = await tx.applicationOutcomeEvent.create({
    data: {
      organizationId: ctx.organizationId,
      applicationId: existing.applicationId,
      outcomeType: input.outcomeType,
      provenance: "EMPLOYEE_RECORDED",
      actorUserId: ctx.userId,
      recordedAt,
      occurredAt: input.occurredAt ?? null,
      notes: input.notes?.trim() || null,
      candidateVisible: resolveStaffCandidateVisible(
        input.outcomeType,
        input.candidateVisible
      ),
      evidenceText: input.evidenceText?.trim() || null,
      evidenceStoragePath: input.evidenceStoragePath?.trim() || null,
      evidenceShareable: Boolean(input.evidenceShareable),
      correctionState: "ACTIVE",
    },
  });

  await tx.applicationOutcomeEvent.update({
    where: { id: existing.id },
    data: {
      correctionState: "SUPERSEDED",
      supersededById: replacement.id,
      voidedAt: recordedAt,
      voidedById: ctx.userId,
      voidReason: input.reason.trim(),
    },
  });

  await logUserAuditEvent({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    action: AuditAction.APPLICATION_OUTCOME_SUPERSEDED,
    entityType: "ApplicationOutcomeEvent",
    entityId: existing.id,
    details: {
      supersededById: replacement.id,
      reason: input.reason.trim(),
    },
    tx,
  });

  await logUserAuditEvent({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    action: AuditAction.APPLICATION_OUTCOME_CREATED,
    entityType: "ApplicationOutcomeEvent",
    entityId: replacement.id,
    details: {
      applicationId: existing.applicationId,
      outcomeType: replacement.outcomeType,
      supersedesId: existing.id,
    },
    tx,
  });

  return replacement;
}

export async function listOutcomesForStaff(
  tx: Tx,
  ctx: AuthenticatedContext,
  applicationId: string,
  opts?: { includeInactive?: boolean }
): Promise<OutcomePresentation[]> {
  await assertStaffCanAccessApplication(tx, ctx, applicationId);
  const rows = await tx.applicationOutcomeEvent.findMany({
    where: {
      organizationId: ctx.organizationId,
      applicationId,
      ...(opts?.includeInactive
        ? {}
        : { correctionState: "ACTIVE" as const }),
    },
    orderBy: [{ occurredAt: "asc" }, { recordedAt: "asc" }, { id: "asc" }],
  });

  return rows.map((r) => ({
    id: r.id,
    outcomeType: r.outcomeType,
    label: staffOutcomeLabel(r.outcomeType),
    provenance: r.provenance,
    provenanceLabel:
      r.provenance === "CANDIDATE_REPORTED"
        ? "Candidate reported (unverified)"
        : r.provenance === "STAFF_VERIFIED"
          ? "Staff verified"
          : "Staff recorded",
    recordedAt: r.recordedAt.toISOString(),
    occurredAt: r.occurredAt?.toISOString() ?? null,
    notes: r.notes,
    candidateVisible: r.candidateVisible,
    hasEvidence: Boolean(
      (r.evidenceText && r.evidenceText.trim()) || r.evidenceStoragePath
    ),
    evidenceShareable: r.evidenceShareable,
    correctionState: r.correctionState,
    isActive: r.correctionState === "ACTIVE",
  }));
}

export async function listOutcomesForCandidate(
  tx: Tx,
  ctx: AuthenticatedContext,
  applicationId: string
): Promise<OutcomePresentation[]> {
  await assertCandidateOwnsApplication(tx, ctx, applicationId);
  const rows = await tx.applicationOutcomeEvent.findMany({
    where: {
      organizationId: ctx.organizationId,
      applicationId,
      correctionState: "ACTIVE",
      OR: [
        { candidateVisible: true },
        { provenance: "CANDIDATE_REPORTED", actorUserId: ctx.userId },
      ],
    },
    orderBy: [{ occurredAt: "asc" }, { recordedAt: "asc" }, { id: "asc" }],
  });

  // O3: OTHER only if candidateVisible (already filtered); never show staff notes for OTHER unless visible
  return rows
    .filter((r) => r.outcomeType !== "OTHER" || r.candidateVisible)
    .map((r) => {
      const isOwnReport =
        r.provenance === "CANDIDATE_REPORTED" && r.actorUserId === ctx.userId;
      const baseLabel = candidateOutcomeLabel(r.outcomeType);
      const prov = candidateProvenanceLabel(r.provenance, isOwnReport);
      return {
        id: r.id,
        outcomeType: r.outcomeType,
        label:
          isOwnReport && r.provenance === "CANDIDATE_REPORTED"
            ? `${prov}: ${baseLabel}`
            : baseLabel,
        provenance: r.provenance,
        provenanceLabel: prov,
        recordedAt: r.recordedAt.toISOString(),
        occurredAt: r.occurredAt?.toISOString() ?? null,
        notes: null, // never expose staff notes to candidates
        candidateVisible: r.candidateVisible,
        hasEvidence: Boolean(
          r.evidenceShareable &&
            ((r.evidenceText && r.evidenceText.trim()) || r.evidenceStoragePath)
        ),
        evidenceShareable: r.evidenceShareable,
        correctionState: r.correctionState,
        isActive: true,
      };
    });
}
