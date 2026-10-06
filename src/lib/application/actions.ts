"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedContext, requireAdmin, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import {
  JobCreateSchema,
  JobUpdateSchema,
  CandidateJobLeadCreateSchema,
  ShareJobToCatalogSchema,
  ApplicationCreateSchema,
  ApplicationMaterialSchema,
  ApplicationStatusTransitionSchema,
  ApplicationApprovalSchema,
  ApplicationSubmissionSchema,
  ApplicationSubmissionIssueSchema,
  SubmissionCorrectionApprovalSchema,
  ApplicationResubmissionSchema,
  ApplicationAssignSchema,
  StartApplicationDeskSchema,
  type JobCreateInput,
  type JobUpdateInput,
  type CandidateJobLeadCreateInput,
  type ShareJobToCatalogInput,
  type ApplicationCreateInput,
  type ApplicationMaterialInput,
  type ApplicationStatusTransitionInput,
  type ApplicationApprovalInput,
  type ApplicationSubmissionInput,
  type ApplicationSubmissionIssueInput,
  type SubmissionCorrectionApprovalInput,
  type ApplicationResubmissionInput,
  type ApplicationAssignInput,
  type StartApplicationDeskInput,
} from "@/lib/validation/application.schemas";
import {
  ApplicationStatus,
  ApplicationApprovalStatus,
  NotificationType,
  AuditAction,
  Role,
  JobStatus,
  JobVisibility,
  Prisma,
} from "@/generated/prisma";
import { syncJobDescriptionSnapshotAfterJobWrite } from "@/lib/application-intelligence/requirement-set";
import { invalidateCandidateJobMatchesForJob } from "@/lib/job-matching/invalidation";
import { populateJobMatchWorkForJob } from "@/lib/job-matching/population";
import { markApplicationIntelligenceStale } from "@/lib/application-intelligence/runs";
import { assertCanAssignApplication } from "@/lib/application/assignment-authority";
import { buildAssignmentWriteData } from "@/lib/application/assignment-snapshot";
import { freshnessAfterTrigger } from "@/lib/application-intelligence/stale";
import { enqueueResumeReview } from "@/lib/resume-intelligence/worker";
import {
  AuthorizationError,
  ConflictError,
  InvalidStateTransitionError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import {
  assertJobUsableForCandidate,
  catalogJobsWhere,
  deskJobsWhere,
} from "@/lib/job/visibility";

import { ALLOWED_APPLICATION_TRANSITIONS } from "./constants";
import { assertAuthoritativeQaPass } from "@/lib/qa/authority";
import { assertSubmissionEvidence } from "@/lib/submission/evidence";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

function revalidateApplicationViews(applicationId?: string) {
  try {
    // Phase 10: path-scoped revalidation (avoid layout-wide RSC storms)
    revalidatePath("/employee/application-log");
    revalidatePath("/employee/applications");
    revalidatePath("/employee/jobs");
    revalidatePath("/employee/candidates");
    revalidatePath("/employee");
    revalidatePath("/candidate/applications");
    revalidatePath("/candidate");
    revalidatePath("/employee/applications");
    revalidatePath("/admin");
    if (applicationId) {
      revalidatePath(`/employee/applications/${applicationId}`);
      revalidatePath(`/candidate/applications/${applicationId}`);
    }
  } catch {
    // Safe fallback when executed outside Next.js request context
  }
}

// ==========================================
// 1. Job Management Actions
// ==========================================

export async function createJobAction(
  input: JobCreateInput
): Promise<ActionResult<{ jobId: string }>> {
  const parsed = JobCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    // Catalog create path: always GLOBAL (private leads use createCandidateJobLeadAction).
    const visibility = parsed.data.visibility ?? JobVisibility.GLOBAL;
    if (visibility !== JobVisibility.GLOBAL) {
      return {
        success: false,
        error: "Use Create Job Lead for candidate-private jobs",
      };
    }

    const job = await withRlsContext(ctx.userId, async (tx) => {
      const created = await tx.job.create({
        data: {
          organizationId: ctx.organizationId,
          title: parsed.data.title,
          companyName: parsed.data.companyName,
          jobDescription: parsed.data.jobDescription,
          location: parsed.data.location || null,
          isRemote: parsed.data.isRemote,
          employmentType: parsed.data.employmentType,
          salaryMin: parsed.data.salaryMin ?? null,
          salaryMax: parsed.data.salaryMax ?? null,
          salaryCurrency: parsed.data.salaryCurrency,
          source: parsed.data.source || null,
          externalUrl: parsed.data.externalUrl || null,
          qualificationNotes: parsed.data.qualificationNotes || null,
          status: JobStatus.OPEN,
          visibility: JobVisibility.GLOBAL,
          ownerCandidateId: null,
          createdById: ctx.userId,
        },
      });

      await syncJobDescriptionSnapshotAfterJobWrite(
        tx,
        {
          id: created.id,
          organizationId: created.organizationId,
          jobDescription: created.jobDescription,
          externalUrl: created.externalUrl,
          source: created.source,
          updatedAt: created.updatedAt,
        },
        ctx.userId
      );

      // Phase 5E: initial match population (QUEUED only; worker evaluates).
      await populateJobMatchWorkForJob(tx, {
        organizationId: created.organizationId,
        jobId: created.id,
        reason: "GLOBAL_JOB_CREATED",
        requestedById: ctx.userId,
      });

      return created;
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "JOB_CREATED",
      entityType: "Job",
      entityId: job.id,
      details: {
        title: job.title,
        companyName: job.companyName,
        visibility: JobVisibility.GLOBAL,
      },
    });

    revalidateApplicationViews();
    return { success: true, data: { jobId: job.id } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create job" };
  }
}

/**
 * Creates a CANDIDATE_PRIVATE job lead + CandidateJobOpportunity.
 * Does NOT enter the organization Job Catalog.
 */
export async function createCandidateJobLeadAction(
  input: CandidateJobLeadCreateInput
): Promise<ActionResult<{ jobId: string; opportunityId: string }>> {
  const parsed = CandidateJobLeadCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    const result = await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findFirst({
        where: {
          id: parsed.data.candidateId,
          organizationId: ctx.organizationId,
          status: { not: "ARCHIVED" },
        },
        select: { id: true },
      });
      if (!candidate) throw new NotFoundError("Candidate not found or unauthorized");

      const job = await tx.job.create({
        data: {
          organizationId: ctx.organizationId,
          title: parsed.data.title,
          companyName: parsed.data.companyName,
          jobDescription: parsed.data.jobDescription,
          location: parsed.data.location || null,
          isRemote: parsed.data.isRemote,
          employmentType: parsed.data.employmentType,
          salaryMin: parsed.data.salaryMin ?? null,
          salaryMax: parsed.data.salaryMax ?? null,
          salaryCurrency: parsed.data.salaryCurrency,
          source: parsed.data.source || null,
          externalUrl: parsed.data.externalUrl || null,
          status: JobStatus.OPEN,
          visibility: JobVisibility.CANDIDATE_PRIVATE,
          ownerCandidateId: candidate.id,
          createdById: ctx.userId,
        },
      });

      await syncJobDescriptionSnapshotAfterJobWrite(
        tx,
        {
          id: job.id,
          organizationId: job.organizationId,
          jobDescription: job.jobDescription,
          externalUrl: job.externalUrl,
          source: job.source,
          updatedAt: job.updatedAt,
        },
        ctx.userId
      );

      const opportunity = await tx.candidateJobOpportunity.create({
        data: {
          organizationId: ctx.organizationId,
          candidateId: candidate.id,
          jobId: job.id,
          discoveredById: ctx.userId,
          status: "ACTIVE",
        },
      });

      // Phase 5E: private lead → match work for owner only.
      await populateJobMatchWorkForJob(tx, {
        organizationId: job.organizationId,
        jobId: job.id,
        reason: "PRIVATE_JOB_CREATED",
        requestedById: ctx.userId,
      });

      return { jobId: job.id, opportunityId: opportunity.id, title: job.title, companyName: job.companyName };
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "JOB_CREATED",
      entityType: "Job",
      entityId: result.jobId,
      details: {
        title: result.title,
        companyName: result.companyName,
        visibility: JobVisibility.CANDIDATE_PRIVATE,
        ownerCandidateId: parsed.data.candidateId,
        opportunityId: result.opportunityId,
      },
    });

    revalidateApplicationViews();
    return {
      success: true,
      data: { jobId: result.jobId, opportunityId: result.opportunityId },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create candidate job lead" };
  }
}

/** Promote a private job lead into the organization Job Catalog (ADMIN only). */
export async function shareJobToCatalogAction(
  input: ShareJobToCatalogInput
): Promise<ActionResult<{ jobId: string }>> {
  const parsed = ShareJobToCatalogSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireAdmin(ctx);

    const job = await withRlsContext(ctx.userId, async (tx) => {
      const existing = await tx.job.findFirst({
        where: { id: parsed.data.jobId, organizationId: ctx.organizationId },
      });
      if (!existing) throw new NotFoundError("Job not found");
      if (existing.visibility === JobVisibility.GLOBAL) {
        return { job: existing, visibilityChanged: false };
      }

      const updated = await tx.job.update({
        where: { id: existing.id },
        data: {
          visibility: JobVisibility.GLOBAL,
          ownerCandidateId: null,
        },
      });

      // Phase 5C.6: visibility is a matching.v1 Job input — invalidate matches.
      await invalidateCandidateJobMatchesForJob(tx, {
        organizationId: updated.organizationId,
        jobId: updated.id,
        reason: "JOB_SOURCE_CHANGED",
      });

      // Phase 5E: newly GLOBAL → populate eligible ACTIVE candidates (owner row skipped if exists).
      if (updated.status === JobStatus.OPEN) {
        await populateJobMatchWorkForJob(tx, {
          organizationId: updated.organizationId,
          jobId: updated.id,
          reason: "GLOBAL_JOB_SHARED_TO_CATALOG",
          requestedById: ctx.userId,
        });
      }

      return { job: updated, visibilityChanged: true };
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "JOB_UPDATED",
      entityType: "Job",
      entityId: job.job.id,
      details: { sharedToCatalog: true, visibility: JobVisibility.GLOBAL },
    });

    revalidateApplicationViews();
    return { success: true, data: { jobId: job.job.id } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to share job to catalog" };
  }
}

async function ensureCandidateJobOpportunity(
  tx: Prisma.TransactionClient,
  args: {
    organizationId: string;
    candidateId: string;
    jobId: string;
    discoveredById: string;
  }
) {
  const existing = await tx.candidateJobOpportunity.findUnique({
    where: {
      candidateId_jobId: {
        candidateId: args.candidateId,
        jobId: args.jobId,
      },
    },
  });
  if (existing) return existing;

  return tx.candidateJobOpportunity.create({
    data: {
      organizationId: args.organizationId,
      candidateId: args.candidateId,
      jobId: args.jobId,
      discoveredById: args.discoveredById,
      status: "ACTIVE",
    },
  });
}

export async function updateJobAction(
  input: JobUpdateInput
): Promise<ActionResult<{ jobId: string }>> {
  const parsed = JobUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    const job = await withRlsContext(ctx.userId, async (tx) => {
      const existing = await tx.job.findUnique({
        where: { id: parsed.data.jobId, organizationId: ctx.organizationId },
      });
      if (!existing) throw new NotFoundError("Job not found");

      const priorStatus = existing.status;
      const updated = await tx.job.update({
        where: { id: existing.id },
        data: {
          title: parsed.data.title,
          companyName: parsed.data.companyName,
          jobDescription: parsed.data.jobDescription,
          location: parsed.data.location,
          isRemote: parsed.data.isRemote,
          employmentType: parsed.data.employmentType,
          salaryMin: parsed.data.salaryMin,
          salaryMax: parsed.data.salaryMax,
          salaryCurrency: parsed.data.salaryCurrency,
          source: parsed.data.source,
          externalUrl: parsed.data.externalUrl,
          qualificationNotes: parsed.data.qualificationNotes,
          status: parsed.data.status,
        },
      });

      await syncJobDescriptionSnapshotAfterJobWrite(
        tx,
        {
          id: updated.id,
          organizationId: updated.organizationId,
          jobDescription: updated.jobDescription,
          externalUrl: updated.externalUrl,
          source: updated.source,
          updatedAt: updated.updatedAt,
        },
        ctx.userId
      );

      // Phase 5C.6: Job Intelligence invalidation (title/salary/status/etc).
      // JD snapshot path may also invalidate when content changes — idempotent.
      await invalidateCandidateJobMatchesForJob(tx, {
        organizationId: updated.organizationId,
        jobId: updated.id,
        reason: "JOB_SOURCE_CHANGED",
      });

      // Phase 5E: CLOSED/ARCHIVED → OPEN (GLOBAL) becomes eligible for initial population.
      const becameOpen =
        priorStatus !== JobStatus.OPEN && updated.status === JobStatus.OPEN;
      if (
        becameOpen &&
        updated.visibility === JobVisibility.GLOBAL
      ) {
        await populateJobMatchWorkForJob(tx, {
          organizationId: updated.organizationId,
          jobId: updated.id,
          reason: "GLOBAL_JOB_OPENED",
          requestedById: ctx.userId,
        });
      }

      return updated;
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "JOB_UPDATED",
      entityType: "Job",
      entityId: job.id,
      details: { status: job.status },
    });

    revalidateApplicationViews();
    return { success: true, data: { jobId: job.id } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update job" };
  }
}

// ==========================================
// 2. Application Core Actions
// ==========================================

export async function createApplicationAction(
  input: ApplicationCreateInput
): Promise<ActionResult<{ applicationId: string }>> {
  const parsed = ApplicationCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    const application = await withRlsContext(ctx.userId, async (tx) => {
      // 1. Verify candidate exists in same org and is not ARCHIVED
      const candidate = await tx.candidate.findUnique({
        where: { id: parsed.data.candidateId, organizationId: ctx.organizationId },
      });
      if (!candidate) throw new NotFoundError("Candidate not found in organization");
      if (candidate.status === "ARCHIVED") {
        throw new ValidationError("Cannot create applications for archived candidates");
      }

      // 2. Verify job is OPEN and scoped for this candidate
      const job = await tx.job.findFirst({
        where: { id: parsed.data.jobId, organizationId: ctx.organizationId },
      });
      if (!job) throw new NotFoundError("Job not found in organization");
      if (job.status !== "OPEN") {
        throw new ValidationError(`Cannot create applications for ${job.status} jobs`);
      }
      assertJobUsableForCandidate(job, ctx.organizationId, candidate.id);

      const opportunity = await ensureCandidateJobOpportunity(tx, {
        organizationId: ctx.organizationId,
        candidateId: candidate.id,
        jobId: job.id,
        discoveredById: ctx.userId,
      });

      // 3. Check partial unique index constraint: only 1 active/non-terminal application per candidate+job
      const existingActive = await tx.application.findFirst({
        where: {
          candidateId: candidate.id,
          jobId: job.id,
          status: { notIn: [ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN, ApplicationStatus.FAILED] },
        },
      });
      if (existingActive) {
        throw new ConflictError(
          `Candidate already has an active application (${existingActive.id}) for this job in status ${existingActive.status}`
        );
      }

      // 4. Phase 5I: every new Application must have an operational assignee.
      // Prefer explicit assignee; default to authenticated staff creator (Option A).
      // Creator is already requireEmployeeOrAdmin — only re-validate when assigning someone else.
      const assigneeId = parsed.data.assignedEmployeeId || ctx.userId;
      if (parsed.data.assignedEmployeeId) {
        const staff = await tx.membership.findFirst({
          where: {
            userId: parsed.data.assignedEmployeeId,
            organizationId: ctx.organizationId,
            role: { in: [Role.EMPLOYEE, Role.ADMIN] },
            status: "ACTIVE",
          },
        });
        if (!staff) {
          throw new ValidationError(
            "Assigned user must be an active staff member in this organization"
          );
        }
      }

      // 5. Create application with assignment-time structural snapshot (Phase 5R).
      const assignmentData = await buildAssignmentWriteData(
        tx,
        ctx.organizationId,
        assigneeId
      );

      const app = await tx.application.create({
        data: {
          organizationId: ctx.organizationId,
          candidateId: candidate.id,
          jobId: job.id,
          candidateJobOpportunityId: opportunity.id,
          status: ApplicationStatus.DISCOVERED,
          ...assignmentData,
        },
      });

      await tx.applicationStateHistory.create({
        data: {
          applicationId: app.id,
          fromStatus: null,
          toStatus: ApplicationStatus.DISCOVERED,
          changedById: ctx.userId,
          reason: "Application created",
        },
      });

      return app;
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "APPLICATION_CREATED",
      entityType: "Application",
      entityId: application.id,
      details: {
        candidateId: application.candidateId,
        jobId: application.jobId,
        assignedEmployeeId: application.assignedEmployeeId,
      },
    });

    revalidateApplicationViews(application.id);
    return { success: true, data: { applicationId: application.id } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create application" };
  }
}

export async function assignApplicationAction(
  input: ApplicationAssignInput
): Promise<ActionResult> {
  const parsed = ApplicationAssignSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    await withRlsContext(ctx.userId, async (tx) => {
      const decision = await assertCanAssignApplication(tx, ctx, {
        applicationId: parsed.data.applicationId,
        targetEmployeeId: parsed.data.employeeId,
      });

      const assignmentData = await buildAssignmentWriteData(
        tx,
        decision.organizationId,
        decision.newAssignedEmployeeId
      );

      await tx.application.update({
        where: { id: decision.applicationId },
        data: assignmentData,
      });

      // Audit inside the same RLS transaction so assignment never succeeds without audit.
      await logUserAuditEvent({
        tx,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: "APPLICATION_ASSIGNED",
        entityType: "Application",
        entityId: decision.applicationId,
        details: {
          previousAssignedEmployeeId: decision.previousAssignedEmployeeId,
          newAssignedEmployeeId: decision.newAssignedEmployeeId,
          // Compatibility alias for pre-5M consumers
          assignedEmployeeId: decision.newAssignedEmployeeId,
          reason: parsed.data.reason ?? null,
          actorKinds: decision.profile.actorKinds,
        },
      });
    });

    revalidateApplicationViews(parsed.data.applicationId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to assign application" };
  }
}

export async function updateApplicationMaterialAction(
  input: ApplicationMaterialInput
): Promise<ActionResult<{ materialId: string }>> {
  const parsed = ApplicationMaterialSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    const material = await withRlsContext(ctx.userId, async (tx) => {
      const app = await tx.application.findUnique({
        where: { id: parsed.data.applicationId, organizationId: ctx.organizationId },
      });
      if (!app) throw new NotFoundError("Application not found");

      // Check if application is in a state that permits material updates
      const immutableStates: ApplicationStatus[] = [
        ApplicationStatus.AWAITING_APPROVAL,
        ApplicationStatus.READY,
        ApplicationStatus.SUBMITTED,
        ApplicationStatus.REJECTED,
        ApplicationStatus.WITHDRAWN,
        ApplicationStatus.FAILED,
      ];
      if (immutableStates.includes(app.status)) {
        throw new ValidationError(`Cannot update application materials while application is in ${app.status}`);
      }

      // Phase 4A: immutable resume binding — never trust browser documentVersion.
      // Document ID is the authoritative version identity; versionNumber is compatibility metadata.
      let boundDocumentId: string | null = null;
      let boundDocumentVersion: number | null = null;

      if (parsed.data.candidateDocumentId) {
        const doc = await tx.candidateDocument.findFirst({
          where: {
            id: parsed.data.candidateDocumentId,
            candidateId: app.candidateId,
            candidate: { organizationId: ctx.organizationId },
          },
          select: {
            id: true,
            documentType: true,
            versionNumber: true,
            candidateId: true,
          },
        });
        if (!doc) {
          throw new NotFoundError("Referenced candidate document not found for candidate");
        }
        if (doc.documentType !== "RESUME") {
          throw new ValidationError("Selected document must be a resume");
        }
        boundDocumentId = doc.id;
        boundDocumentVersion = doc.versionNumber;
      }

      // Mark old materials as not current
      await tx.applicationMaterial.updateMany({
        where: { applicationId: app.id, isCurrent: true },
        data: { isCurrent: false },
      });

      const created = await tx.applicationMaterial.create({
        data: {
          applicationId: app.id,
          candidateDocumentId: boundDocumentId,
          documentVersion: boundDocumentVersion,
          coverLetterText: parsed.data.coverLetterText || null,
          screeningAnswers: parsed.data.screeningAnswers ? (parsed.data.screeningAnswers as any) : Prisma.JsonNull,
          customNotes: parsed.data.customNotes || null,
          isCurrent: true,
          createdById: ctx.userId,
        },
      });

      // Gate 12: material version change → mark prior intelligence STALE (no recompute).
      await markApplicationIntelligenceStale(tx, {
        applicationId: app.id,
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        freshness: freshnessAfterTrigger("APPLICATION_MATERIAL_CHANGED"),
      });

      // Phase 4: enqueue resume representation review when a resume is bound.
      if (boundDocumentId) {
        await enqueueResumeReview(tx, {
          organizationId: ctx.organizationId,
          candidateId: app.candidateId,
          applicationId: app.id,
          candidateDocumentId: boundDocumentId,
          requestedById: ctx.userId,
        });
      } else {
        await tx.resumeReview.updateMany({
          where: {
            organizationId: ctx.organizationId,
            applicationId: app.id,
            freshness: "CURRENT",
            status: { in: ["QUEUED", "ANALYZING", "READY"] },
          },
          data: { freshness: "STALE", status: "STALE" },
        });
      }

      return created;
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "APPLICATION_MATERIAL_UPDATED",
      entityType: "ApplicationMaterial",
      entityId: material.id,
      details: { applicationId: material.applicationId },
    });

    revalidateApplicationViews(material.applicationId);
    return { success: true, data: { materialId: material.id } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update application material" };
  }
}

// ==========================================
// 3. State Transitions & Universal Approval
// ==========================================

export async function transitionApplicationStatusAction(
  input: ApplicationStatusTransitionInput
): Promise<ActionResult> {
  const parsed = ApplicationStatusTransitionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();

    await withRlsContext(ctx.userId, async (tx) => {
      const app = await tx.application.findUnique({
        where: { id: parsed.data.applicationId, organizationId: ctx.organizationId },
        include: { candidate: true },
      });
      if (!app) throw new NotFoundError("Application not found");

      // Verify caller authority
      if (ctx.role === "CANDIDATE") {
        if (app.candidate.userId !== ctx.userId) {
          throw new AuthorizationError("Cannot transition another candidate's application");
        }
        // Candidates can only transition to WITHDRAWN via this action (Approval uses submitCandidateApprovalAction)
        if (parsed.data.targetStatus !== ApplicationStatus.WITHDRAWN) {
          throw new AuthorizationError("Candidates may only directly transition unsubmitted applications to WITHDRAWN");
        }
      } else {
        requireEmployeeOrAdmin(ctx);
        // Employees cannot bypass approval into READY
        if (app.status === ApplicationStatus.REVIEW && parsed.data.targetStatus === ApplicationStatus.READY) {
          throw new ValidationError("Universal Candidate Approval required: Application must pass through AWAITING_APPROVAL");
        }
      }

      // Verify allowed state transition graph
      const allowedNext = ALLOWED_APPLICATION_TRANSITIONS[app.status];
      if (!allowedNext.includes(parsed.data.targetStatus)) {
        throw new InvalidStateTransitionError(
          `Invalid transition: cannot transition application from ${app.status} to ${parsed.data.targetStatus}`
        );
      }

      // Phase 5I: QA authority — block lifecycle bypasses on generic transition.
      if (
        app.status === ApplicationStatus.REVIEW &&
        parsed.data.targetStatus === ApplicationStatus.AWAITING_APPROVAL
      ) {
        await assertAuthoritativeQaPass(tx, {
          applicationId: app.id,
          organizationId: ctx.organizationId,
        });
      }
      if (
        app.status === ApplicationStatus.AWAITING_APPROVAL &&
        parsed.data.targetStatus === ApplicationStatus.READY
      ) {
        await assertAuthoritativeQaPass(tx, {
          applicationId: app.id,
          organizationId: ctx.organizationId,
        });
        if (app.approvalStatus !== ApplicationApprovalStatus.APPROVED) {
          throw new ValidationError(
            "Candidate approval is required before advancing to READY. Use the candidate approval action."
          );
        }
      }

      // Update status
      await tx.application.update({
        where: { id: app.id },
        data: {
          status: parsed.data.targetStatus,
          withdrawalReason: parsed.data.targetStatus === "WITHDRAWN" ? parsed.data.reason || "Withdrawn by user" : app.withdrawalReason,
          failureReason: parsed.data.targetStatus === "FAILED" ? parsed.data.reason || "Operational failure" : app.failureReason,
          rejectionReason: parsed.data.targetStatus === "REJECTED" ? parsed.data.reason || "Application rejected" : app.rejectionReason,
        },
      });

      // Record state history
      await tx.applicationStateHistory.create({
        data: {
          applicationId: app.id,
          fromStatus: app.status,
          toStatus: parsed.data.targetStatus,
          changedById: ctx.userId,
          reason: parsed.data.reason || null,
        },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "APPLICATION_STATUS_CHANGED",
      entityType: "Application",
      entityId: parsed.data.applicationId,
      details: { targetStatus: parsed.data.targetStatus, reason: parsed.data.reason },
    });

    revalidateApplicationViews(parsed.data.applicationId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to transition application status" };
  }
}

export async function requestCandidateApprovalAction(
  applicationId: string
): Promise<ActionResult> {
  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    await withRlsContext(ctx.userId, async (tx) => {
      const app = await tx.application.findUnique({
        where: { id: applicationId, organizationId: ctx.organizationId },
        include: { materials: { where: { isCurrent: true } } },
      });
      if (!app) throw new NotFoundError("Application not found");
      if (app.status !== ApplicationStatus.REVIEW) {
        throw new InvalidStateTransitionError(
          `Cannot request candidate approval from ${app.status}. Must be in REVIEW.`
        );
      }
      if (app.materials.length === 0) {
        throw new ValidationError("Application must have current prepared materials before requesting approval");
      }

      // Phase 5I: legacy path must not bypass authoritative QA PASS.
      await assertAuthoritativeQaPass(tx, {
        applicationId: app.id,
        organizationId: ctx.organizationId,
      });

      await tx.application.update({
        where: { id: app.id },
        data: {
          status: ApplicationStatus.AWAITING_APPROVAL,
          approvalStatus: "PENDING",
          approvalRequestedAt: new Date(),
        },
      });

      await tx.applicationStateHistory.create({
        data: {
          applicationId: app.id,
          fromStatus: ApplicationStatus.REVIEW,
          toStatus: ApplicationStatus.AWAITING_APPROVAL,
          changedById: ctx.userId,
          reason: "Requested candidate approval",
        },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "APPLICATION_APPROVAL_REQUESTED",
      entityType: "Application",
      entityId: applicationId,
    });

    revalidateApplicationViews(applicationId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to request candidate approval" };
  }
}

export async function submitCandidateApprovalAction(
  input: ApplicationApprovalInput
): Promise<ActionResult> {
  const parsed = ApplicationApprovalSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();

    await withRlsContext(ctx.userId, async (tx) => {
      const app = await tx.application.findUnique({
        where: { id: parsed.data.applicationId, organizationId: ctx.organizationId },
        include: { candidate: true },
      });
      if (!app) throw new NotFoundError("Application not found");

      // Universal Candidate Approval Rule: ONLY the candidate may sign off
      if (ctx.role !== "CANDIDATE" || app.candidate.userId !== ctx.userId) {
        throw new AuthorizationError("Only the candidate owner can approve or request revisions for this application");
      }

      if (app.status !== ApplicationStatus.AWAITING_APPROVAL) {
        throw new InvalidStateTransitionError(
          `Cannot process approval for application in ${app.status}. Must be in AWAITING_APPROVAL.`
        );
      }

      if (parsed.data.approved) {
        // Phase 5I: legacy approval cannot reach READY without authoritative QA PASS.
        await assertAuthoritativeQaPass(tx, {
          applicationId: app.id,
          organizationId: ctx.organizationId,
        });

        // Candidate Approves -> Transitions to READY
        await tx.application.update({
          where: { id: app.id },
          data: {
            status: ApplicationStatus.READY,
            approvalStatus: "APPROVED",
            approvedAt: new Date(),
            approvedBy: ctx.userId,
            approvalNotes: parsed.data.feedbackNotes || null,
          },
        });

        await tx.applicationStateHistory.create({
          data: {
            applicationId: app.id,
            fromStatus: ApplicationStatus.AWAITING_APPROVAL,
            toStatus: ApplicationStatus.READY,
            changedById: ctx.userId,
            reason: parsed.data.feedbackNotes || "Candidate approved application",
          },
        });
      } else {
        // Candidate Requests Revision -> Transitions to PREPARING
        await tx.application.update({
          where: { id: app.id },
          data: {
            status: ApplicationStatus.PREPARING,
            approvalStatus: "REVISION_REQUESTED",
            approvalNotes: parsed.data.feedbackNotes || "Candidate requested revisions",
          },
        });

        await tx.applicationStateHistory.create({
          data: {
            applicationId: app.id,
            fromStatus: ApplicationStatus.AWAITING_APPROVAL,
            toStatus: ApplicationStatus.PREPARING,
            changedById: ctx.userId,
            reason: parsed.data.feedbackNotes || "Candidate requested changes",
          },
        });
      }
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: parsed.data.approved ? "APPLICATION_APPROVED" : "APPLICATION_APPROVAL_REJECTED",
      entityType: "Application",
      entityId: parsed.data.applicationId,
      details: { approved: parsed.data.approved, notes: parsed.data.feedbackNotes },
    });

    revalidateApplicationViews(parsed.data.applicationId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to submit candidate approval" };
  }
}

// ==========================================
// 4. Submission & Correction Workflow Actions
// ==========================================

export async function recordApplicationSubmissionAction(
  input: ApplicationSubmissionInput
): Promise<ActionResult<{ submissionId: string }>> {
  const parsed = ApplicationSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    // Phase 5I: legacy submission path also requires evidence (confirmation text).
    const evidence = assertSubmissionEvidence({
      confirmationEvidence: parsed.data.confirmationEvidence,
      storagePath: null,
    });

    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    const submission = await withRlsContext(ctx.userId, async (tx) => {
      const app = await tx.application.findUnique({
        where: { id: parsed.data.applicationId, organizationId: ctx.organizationId },
        include: { job: true },
      });
      if (!app) throw new NotFoundError("Application not found");
      if (app.status !== ApplicationStatus.READY) {
        throw new InvalidStateTransitionError(
          `Cannot submit application in status ${app.status}. Must be in READY status.`
        );
      }
      if (app.job.status !== "OPEN") {
        throw new ValidationError(`Cannot submit to ${app.job.status} job listing`);
      }

      // 1. Create submission record (attempt 1)
      const sub = await tx.applicationSubmission.create({
        data: {
          applicationId: app.id,
          attemptNumber: 1,
          submittedAt: new Date(),
          submittedById: ctx.userId,
          externalReference: parsed.data.externalReference || null,
          externalUrl: parsed.data.externalUrl || null,
          confirmationEvidence: evidence.confirmationEvidence,
          submissionNotes: parsed.data.submissionNotes || null,
        },
      });

      // 2. Transition status to SUBMITTED
      await tx.application.update({
        where: { id: app.id },
        data: { status: ApplicationStatus.SUBMITTED },
      });

      // 3. Record state history
      await tx.applicationStateHistory.create({
        data: {
          applicationId: app.id,
          fromStatus: ApplicationStatus.READY,
          toStatus: ApplicationStatus.SUBMITTED,
          changedById: ctx.userId,
          reason: "Manual external submission completed",
        },
      });

      // 4. Record audit event atomically within transaction
      await logUserAuditEvent({
        tx,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.APPLICATION_SUBMITTED,
        entityType: "ApplicationSubmission",
        entityId: sub.id,
        details: {
          applicationId: sub.applicationId,
          attemptNumber: sub.attemptNumber,
          externalReference: sub.externalReference,
        },
      });

      return sub;
    });

    revalidateApplicationViews(submission.applicationId);
    return { success: true, data: { submissionId: submission.id } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to record application submission" };
  }
}

export async function recordSubmissionIssueAction(
  input: ApplicationSubmissionIssueInput
): Promise<ActionResult> {
  const parsed = ApplicationSubmissionIssueSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    await withRlsContext(ctx.userId, async (tx) => {
      const app = await tx.application.findUnique({
        where: { id: parsed.data.applicationId, organizationId: ctx.organizationId },
        include: { submissions: { orderBy: { attemptNumber: "desc" }, take: 1 } },
      });
      if (!app) throw new NotFoundError("Application not found");
      if (app.status !== ApplicationStatus.SUBMITTED) {
        throw new InvalidStateTransitionError(
          `Cannot record submission issue for application in ${app.status}. Must be in SUBMITTED status.`
        );
      }

      await tx.application.update({
        where: { id: app.id },
        data: { status: ApplicationStatus.SUBMISSION_ISSUE },
      });

      await tx.applicationStateHistory.create({
        data: {
          applicationId: app.id,
          fromStatus: ApplicationStatus.SUBMITTED,
          toStatus: ApplicationStatus.SUBMISSION_ISSUE,
          changedById: ctx.userId,
          reason: parsed.data.issueDescription,
        },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "APPLICATION_SUBMISSION_ISSUE",
      entityType: "Application",
      entityId: parsed.data.applicationId,
      details: { issueDescription: parsed.data.issueDescription },
    });

    revalidateApplicationViews(parsed.data.applicationId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to record submission issue" };
  }
}

export async function reviewSubmissionIssueAction(
  applicationId: string
): Promise<ActionResult> {
  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    await withRlsContext(ctx.userId, async (tx) => {
      const app = await tx.application.findUnique({
        where: { id: applicationId, organizationId: ctx.organizationId },
      });
      if (!app) throw new NotFoundError("Application not found");
      if (app.status !== ApplicationStatus.SUBMISSION_ISSUE) {
        throw new InvalidStateTransitionError(
          `Cannot start correction review from ${app.status}. Must be in SUBMISSION_ISSUE.`
        );
      }

      await tx.application.update({
        where: { id: app.id },
        data: { status: ApplicationStatus.REVIEW_REQUIRED },
      });

      await tx.applicationStateHistory.create({
        data: {
          applicationId: app.id,
          fromStatus: ApplicationStatus.SUBMISSION_ISSUE,
          toStatus: ApplicationStatus.REVIEW_REQUIRED,
          changedById: ctx.userId,
          reason: "Staff started correction review",
        },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "APPLICATION_STATUS_CHANGED",
      entityType: "Application",
      entityId: applicationId,
      details: { targetStatus: "REVIEW_REQUIRED" },
    });

    revalidateApplicationViews(applicationId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to start correction review" };
  }
}

export async function approveSubmissionCorrectionAction(
  input: SubmissionCorrectionApprovalInput
): Promise<ActionResult> {
  const parsed = SubmissionCorrectionApprovalSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    await withRlsContext(ctx.userId, async (tx) => {
      const app = await tx.application.findUnique({
        where: { id: parsed.data.applicationId, organizationId: ctx.organizationId },
      });
      if (!app) throw new NotFoundError("Application not found");
      if (app.status !== ApplicationStatus.REVIEW_REQUIRED) {
        throw new InvalidStateTransitionError(
          `Cannot approve correction from ${app.status}. Must be in REVIEW_REQUIRED.`
        );
      }

      await tx.application.update({
        where: { id: app.id },
        data: { status: ApplicationStatus.CORRECTION_APPROVED },
      });

      await tx.applicationStateHistory.create({
        data: {
          applicationId: app.id,
          fromStatus: ApplicationStatus.REVIEW_REQUIRED,
          toStatus: ApplicationStatus.CORRECTION_APPROVED,
          changedById: ctx.userId,
          reason: parsed.data.correctionNotes,
        },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "APPLICATION_CORRECTION_APPROVED",
      entityType: "Application",
      entityId: parsed.data.applicationId,
      details: { notes: parsed.data.correctionNotes },
    });

    revalidateApplicationViews(parsed.data.applicationId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to approve correction" };
  }
}

export async function stageApplicationResubmissionAction(
  applicationId: string
): Promise<ActionResult> {
  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    await withRlsContext(ctx.userId, async (tx) => {
      const app = await tx.application.findUnique({
        where: { id: applicationId, organizationId: ctx.organizationId },
      });
      if (!app) throw new NotFoundError("Application not found");
      if (app.status !== ApplicationStatus.CORRECTION_APPROVED) {
        throw new InvalidStateTransitionError(
          `Cannot stage resubmission from ${app.status}. Must be in CORRECTION_APPROVED.`
        );
      }

      await tx.application.update({
        where: { id: app.id },
        data: { status: ApplicationStatus.RESUBMISSION },
      });

      await tx.applicationStateHistory.create({
        data: {
          applicationId: app.id,
          fromStatus: ApplicationStatus.CORRECTION_APPROVED,
          toStatus: ApplicationStatus.RESUBMISSION,
          changedById: ctx.userId,
          reason: "Materials corrected and staged for resubmission",
        },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "APPLICATION_STATUS_CHANGED",
      entityType: "Application",
      entityId: applicationId,
      details: { targetStatus: "RESUBMISSION" },
    });

    revalidateApplicationViews(applicationId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to stage resubmission" };
  }
}

export async function recordApplicationResubmissionAction(
  input: ApplicationResubmissionInput
): Promise<ActionResult<{ submissionId: string; attemptNumber: number }>> {
  const parsed = ApplicationResubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const evidence = assertSubmissionEvidence({
      confirmationEvidence: parsed.data.confirmationEvidence,
      storagePath: null,
    });

    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    const submission = await withRlsContext(ctx.userId, async (tx) => {
      const app = await tx.application.findUnique({
        where: { id: parsed.data.applicationId, organizationId: ctx.organizationId },
        include: { submissions: { orderBy: { attemptNumber: "desc" }, take: 1 } },
      });
      if (!app) throw new NotFoundError("Application not found");
      if (app.status !== ApplicationStatus.RESUBMISSION) {
        throw new InvalidStateTransitionError(
          `Cannot record resubmission for application in ${app.status}. Must be in RESUBMISSION status.`
        );
      }

      const latestAttempt = app.submissions[0]?.attemptNumber ?? 1;
      const nextAttempt = latestAttempt + 1;

      // 1. Create new submission record with incremented attempt number
      const sub = await tx.applicationSubmission.create({
        data: {
          applicationId: app.id,
          attemptNumber: nextAttempt,
          submittedAt: new Date(),
          submittedById: ctx.userId,
          externalReference: parsed.data.externalReference || null,
          externalUrl: parsed.data.externalUrl || null,
          confirmationEvidence: evidence.confirmationEvidence,
          submissionNotes: parsed.data.submissionNotes || null,
        },
      });

      // 2. Transition back to SUBMITTED
      await tx.application.update({
        where: { id: app.id },
        data: { status: ApplicationStatus.SUBMITTED },
      });

      // 3. Record state history
      await tx.applicationStateHistory.create({
        data: {
          applicationId: app.id,
          fromStatus: ApplicationStatus.RESUBMISSION,
          toStatus: ApplicationStatus.SUBMITTED,
          changedById: ctx.userId,
          reason: `Resubmission attempt #${nextAttempt} completed`,
        },
      });

      // 4. Record audit event atomically within transaction
      await logUserAuditEvent({
        tx,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.APPLICATION_RESUBMITTED,
        entityType: "ApplicationSubmission",
        entityId: sub.id,
        details: {
          applicationId: sub.applicationId,
          attemptNumber: sub.attemptNumber,
          externalReference: sub.externalReference,
        },
      });

      return sub;
    });

    revalidateApplicationViews(submission.applicationId);
    return { success: true, data: { submissionId: submission.id, attemptNumber: submission.attemptNumber } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to record application resubmission" };
  }
}

// ==========================================
// 5. Withdrawal & Consent Revocation Actions
// ==========================================

export async function withdrawApplicationAction(
  applicationId: string,
  reason?: string
): Promise<ActionResult> {
  try {
    const ctx = await getAuthenticatedContext();

    await withRlsContext(ctx.userId, async (tx) => {
      const app = await tx.application.findUnique({
        where: { id: applicationId, organizationId: ctx.organizationId },
        include: { candidate: true },
      });
      if (!app) throw new NotFoundError("Application not found");

      if (ctx.role === "CANDIDATE" && app.candidate.userId !== ctx.userId) {
        throw new AuthorizationError("Cannot withdraw another candidate's application");
      }

      // Cannot withdraw already submitted applications or terminal applications
      if (app.status === ApplicationStatus.SUBMITTED) {
        throw new ValidationError("Cannot withdraw an application that has already been externally submitted");
      }
      if (app.status === ApplicationStatus.REJECTED || app.status === ApplicationStatus.WITHDRAWN || app.status === ApplicationStatus.FAILED) {
        throw new ValidationError(`Application is already in terminal status ${app.status}`);
      }

      await tx.application.update({
        where: { id: app.id },
        data: {
          status: ApplicationStatus.WITHDRAWN,
          withdrawalReason: reason || "Withdrawn by user",
        },
      });

      await tx.applicationStateHistory.create({
        data: {
          applicationId: app.id,
          fromStatus: app.status,
          toStatus: ApplicationStatus.WITHDRAWN,
          changedById: ctx.userId,
          reason: reason || "Application withdrawn",
        },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "APPLICATION_WITHDRAWN",
      entityType: "Application",
      entityId: applicationId,
      details: { reason },
    });

    revalidateApplicationViews(applicationId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to withdraw application" };
  }
}

export async function bulkWithdrawApplicationsOnConsentRevocationAction(
  candidateId: string
): Promise<ActionResult<{ withdrawnCount: number }>> {
  try {
    const ctx = await getAuthenticatedContext();

    const count = await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { id: candidateId, organizationId: ctx.organizationId },
      });
      if (!candidate) throw new NotFoundError("Candidate not found");

      if (ctx.role === "CANDIDATE" && candidate.userId !== ctx.userId) {
        throw new AuthorizationError("Unauthorized consent operation");
      }

      // Find all unsubmitted and non-terminal applications
      const unsubmittedApps = await tx.application.findMany({
        where: {
          candidateId: candidate.id,
          status: {
            notIn: [
              ApplicationStatus.SUBMITTED,
              ApplicationStatus.REJECTED,
              ApplicationStatus.WITHDRAWN,
              ApplicationStatus.FAILED,
            ],
          },
        },
      });

      for (const app of unsubmittedApps) {
        await tx.application.update({
          where: { id: app.id },
          data: {
            status: ApplicationStatus.WITHDRAWN,
            withdrawalReason: "Candidate application consent revoked",
          },
        });

        await tx.applicationStateHistory.create({
          data: {
            applicationId: app.id,
            fromStatus: app.status,
            toStatus: ApplicationStatus.WITHDRAWN,
            changedById: ctx.userId,
            reason: "Consent revoked: automatic bulk withdrawal",
          },
        });
      }

      return unsubmittedApps.length;
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "APPLICATION_BULK_WITHDRAWN_CONSENT_REVOKED",
      entityType: "Candidate",
      entityId: candidateId,
      details: { withdrawnCount: count },
    });

    revalidateApplicationViews();
    return { success: true, data: { withdrawnCount: count } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to bulk withdraw applications" };
  }
}

// ==========================================
// 6. Application Desk Fast Intake Actions
// ==========================================

export async function startApplicationFromDeskAction(
  input: StartApplicationDeskInput
): Promise<ActionResult<{ applicationId: string; jobId: string; isExistingJob: boolean }>> {
  const parsed = StartApplicationDeskSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    const result = await withRlsContext(ctx.userId, async (tx) => {
      // 1. Verify candidate belongs to organization and is not ARCHIVED
      const candidate = await tx.candidate.findUnique({
        where: { id: parsed.data.candidateId, organizationId: ctx.organizationId },
        include: { user: true },
      });
      if (!candidate) {
        throw new NotFoundError("Candidate not found or unauthorized");
      }
      if (candidate.status === "ARCHIVED") {
        throw new ValidationError("Cannot create applications for an archived candidate");
      }

      // 2. Verify Job is OPEN and usable for THIS candidate (catalog or their private lead)
      const job = await tx.job.findFirst({
        where: { id: parsed.data.jobId, organizationId: ctx.organizationId },
        select: {
          id: true,
          status: true,
          title: true,
          companyName: true,
          source: true,
          visibility: true,
          ownerCandidateId: true,
          organizationId: true,
        },
      });
      if (!job) {
        throw new NotFoundError("Job not found or unauthorized");
      }
      if (job.status !== JobStatus.OPEN) {
        throw new ValidationError(`Cannot create applications for ${job.status} jobs`);
      }
      assertJobUsableForCandidate(job, ctx.organizationId, candidate.id);

      // 3. Ensure CandidateJobOpportunity (no Job duplication)
      const opportunity = await ensureCandidateJobOpportunity(tx, {
        organizationId: ctx.organizationId,
        candidateId: candidate.id,
        jobId: job.id,
        discoveredById: ctx.userId,
      });

      // 4. Prevent duplicate active applications for same candidate + job
      const existingApp = await tx.application.findFirst({
        where: {
          candidateId: candidate.id,
          jobId: job.id,
          status: {
            notIn: [ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN, ApplicationStatus.FAILED],
          },
        },
      });
      if (existingApp) {
        throw new ConflictError(
          `Candidate already has an active application (${existingApp.id}) for this job in status ${existingApp.status}`
        );
      }

      // 5. Create canonical Application + assignment-time structural snapshot (Phase 5R)
      const assignmentData = await buildAssignmentWriteData(
        tx,
        ctx.organizationId,
        ctx.userId
      );
      const application = await tx.application.create({
        data: {
          organizationId: ctx.organizationId,
          candidateId: candidate.id,
          jobId: job.id,
          candidateJobOpportunityId: opportunity.id,
          status: ApplicationStatus.DISCOVERED,
          ...assignmentData,
        },
      });

      await tx.applicationStateHistory.create({
        data: {
          applicationId: application.id,
          fromStatus: null,
          toStatus: ApplicationStatus.DISCOVERED,
          changedById: ctx.userId,
          reason: "Application initialized via Application Desk",
        },
      });

      if (parsed.data.internalNotes) {
        await tx.internalNote.create({
          data: {
            organizationId: ctx.organizationId,
            candidateId: candidate.id,
            applicationId: application.id,
            authorId: ctx.userId,
            body: parsed.data.internalNotes,
          },
        });
      }

      return {
        applicationId: application.id,
        jobId: job.id,
        opportunityId: opportunity.id,
        isExistingJob: true,
        jobTitle: job.title,
        companyName: job.companyName,
        source: job.source,
      };
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "APPLICATION_CREATED",
      entityType: "Application",
      entityId: result.applicationId,
      details: {
        viaApplicationDesk: true,
        candidateId: parsed.data.candidateId,
        jobId: result.jobId,
        opportunityId: result.opportunityId,
        isExistingJob: true,
      },
    });

    revalidateApplicationViews(result.applicationId);
    return {
      success: true,
      data: {
        applicationId: result.applicationId,
        jobId: result.jobId,
        isExistingJob: true,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to initialize application" };
  }
}

export async function getCandidateLogSummaryAction(
  candidateId: string
): Promise<ActionResult<{
  candidate: {
    id: string;
    fullName: string;
    email: string;
    status: string;
    applicationAuthorizationMode: string;
  };
  metrics: {
    today: number;
    thisWeek: number;
    totalSubmitted: number;
  };
  recentApplications: Array<{
    id: string;
    title: string;
    companyName: string;
    source: string;
    location: string;
    isRemote: boolean;
    salaryMin: number | null;
    salaryMax: number | null;
    status: string;
    appliedAt: string;
  }>;
}>> {
  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    const data = await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { id: candidateId, organizationId: ctx.organizationId },
        select: {
          id: true,
          status: true,
          applicationAuthorizationMode: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      });
      if (!candidate) throw new NotFoundError("Candidate not found");

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayOfWeek = now.getDay();
      const startOfWeek = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)
      );

      const candidateScope = {
        candidateId: candidate.id,
        organizationId: ctx.organizationId,
      } as const;

      const [todayCount, weekCount, totalSubmittedCount, recentApps] = await Promise.all([
        tx.application.count({
          where: {
            ...candidateScope,
            status: ApplicationStatus.SUBMITTED,
            createdAt: { gte: startOfToday },
          },
        }),
        tx.application.count({
          where: {
            ...candidateScope,
            status: ApplicationStatus.SUBMITTED,
            createdAt: { gte: startOfWeek },
          },
        }),
        tx.application.count({
          where: {
            ...candidateScope,
            status: ApplicationStatus.SUBMITTED,
          },
        }),
        tx.application.findMany({
          where: candidateScope,
          select: {
            id: true,
            status: true,
            createdAt: true,
            job: {
              select: {
                title: true,
                companyName: true,
                source: true,
                location: true,
                isRemote: true,
                salaryMin: true,
                salaryMax: true,
              },
            },
            submissions: {
              orderBy: { attemptNumber: "desc" },
              take: 1,
              select: { submittedAt: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ]);

      return {
        candidate: {
          id: candidate.id,
          fullName:
            `${candidate.user.firstName || ""} ${candidate.user.lastName || ""}`.trim() ||
            candidate.user.email,
          email: candidate.user.email,
          status: candidate.status,
          applicationAuthorizationMode: candidate.applicationAuthorizationMode,
        },
        metrics: {
          today: todayCount,
          thisWeek: weekCount,
          totalSubmitted: totalSubmittedCount,
        },
        recentApplications: recentApps.map((app) => ({
          id: app.id,
          title: app.job.title,
          companyName: app.job.companyName,
          source: app.job.source || "Other",
          location: app.job.location || (app.job.isRemote ? "Remote" : "On-site"),
          isRemote: app.job.isRemote,
          salaryMin: app.job.salaryMin,
          salaryMax: app.job.salaryMax,
          status: app.status,
          appliedAt:
            app.submissions[0]?.submittedAt?.toISOString() || app.createdAt.toISOString(),
        })),
      };
    });

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to fetch candidate summary" };
  }
}

const DESK_SEARCH_LIMIT = 40;

/** Server-side candidate search for Application Desk selectors (bounded). */
export async function searchDeskCandidatesAction(
  query: string
): Promise<
  ActionResult<
    Array<{
      id: string;
      fullName: string;
      email: string;
      status: string;
      applicationAuthorizationMode: string;
    }>
  >
> {
  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);
    const q = query.trim();

    const rows = await withRlsContext(ctx.userId, async (tx) => {
      return tx.candidate.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: { not: "ARCHIVED" },
          ...(q
            ? {
                OR: [
                  { user: { email: { contains: q, mode: "insensitive" } } },
                  { user: { firstName: { contains: q, mode: "insensitive" } } },
                  { user: { lastName: { contains: q, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          status: true,
          applicationAuthorizationMode: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: [{ user: { firstName: "asc" } }, { user: { lastName: "asc" } }],
        take: DESK_SEARCH_LIMIT,
      });
    });

    return {
      success: true,
      data: rows.map((c) => ({
        id: c.id,
        fullName:
          `${c.user.firstName || ""} ${c.user.lastName || ""}`.trim() || c.user.email,
        email: c.user.email,
        status: c.status,
        applicationAuthorizationMode: c.applicationAuthorizationMode,
      })),
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to search candidates" };
  }
}

/**
 * Server-side OPEN job search for Application Desk.
 * Requires candidateId — returns GLOBAL catalog jobs + that candidate's private leads only.
 */
export async function searchDeskJobsAction(
  query: string,
  candidateId?: string
): Promise<
  ActionResult<
    Array<{
      id: string;
      title: string;
      companyName: string;
      location: string | null;
      isRemote: boolean;
      employmentType: string;
      salaryMin: number | null;
      salaryMax: number | null;
      salaryCurrency: string;
      source: string | null;
      externalUrl: string | null;
      jobDescription: string | null;
      visibility: "GLOBAL" | "CANDIDATE_PRIVATE";
    }>
  >
> {
  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);
    if (!candidateId) {
      return { success: false, error: "Select a candidate before searching jobs" };
    }
    const q = query.trim();

    const rows = await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findFirst({
        where: {
          id: candidateId,
          organizationId: ctx.organizationId,
          status: { not: "ARCHIVED" },
        },
        select: { id: true },
      });
      if (!candidate) throw new NotFoundError("Candidate not found");

      const scope = deskJobsWhere(ctx.organizationId, candidate.id);
      return tx.job.findMany({
        where: {
          AND: [
            scope,
            ...(q
              ? [
                  {
                    OR: [
                      { title: { contains: q, mode: "insensitive" as const } },
                      { companyName: { contains: q, mode: "insensitive" as const } },
                      { location: { contains: q, mode: "insensitive" as const } },
                      { source: { contains: q, mode: "insensitive" as const } },
                    ],
                  },
                ]
              : []),
          ],
        },
        select: {
          id: true,
          title: true,
          companyName: true,
          location: true,
          isRemote: true,
          employmentType: true,
          salaryMin: true,
          salaryMax: true,
          salaryCurrency: true,
          source: true,
          externalUrl: true,
          visibility: true,
        },
        orderBy: [{ visibility: "asc" }, { createdAt: "desc" }],
        take: DESK_SEARCH_LIMIT,
      });
    });

    return {
      success: true,
      data: rows.map((j) => ({
        ...j,
        salaryCurrency: j.salaryCurrency || "USD",
        jobDescription: null,
      })),
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to search jobs" };
  }
}

/** Catalog-only search (GLOBAL reusable jobs). */
export async function searchCatalogJobsAction(
  query: string
): Promise<
  ActionResult<
    Array<{
      id: string;
      title: string;
      companyName: string;
      location: string | null;
      isRemote: boolean;
      employmentType: string;
      salaryMin: number | null;
      salaryMax: number | null;
      salaryCurrency: string;
      source: string | null;
      externalUrl: string | null;
      visibility: "GLOBAL";
    }>
  >
> {
  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);
    const q = query.trim();

    const rows = await withRlsContext(ctx.userId, async (tx) => {
      return tx.job.findMany({
        where: {
          ...catalogJobsWhere(ctx.organizationId),
          status: JobStatus.OPEN,
          ...(q
            ? {
                OR: [
                  { title: { contains: q, mode: "insensitive" } },
                  { companyName: { contains: q, mode: "insensitive" } },
                  { location: { contains: q, mode: "insensitive" } },
                  { source: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          title: true,
          companyName: true,
          location: true,
          isRemote: true,
          employmentType: true,
          salaryMin: true,
          salaryMax: true,
          salaryCurrency: true,
          source: true,
          externalUrl: true,
          visibility: true,
        },
        orderBy: { createdAt: "desc" },
        take: DESK_SEARCH_LIMIT,
      });
    });

    return {
      success: true,
      data: rows.map((j) => ({
        ...j,
        salaryCurrency: j.salaryCurrency || "USD",
        visibility: "GLOBAL" as const,
      })),
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to search catalog jobs" };
  }
}

/**
 * Fetch job description for Desk select/inspect.
 * Requires candidateId so CANDIDATE_PRIVATE jobs cannot be loaded outside that candidate's scope.
 */
export async function getDeskJobDetailAction(
  jobId: string,
  candidateId?: string
): Promise<
  ActionResult<{
    id: string;
    title: string;
    companyName: string;
    location: string | null;
    isRemote: boolean;
    employmentType: string;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string;
    source: string | null;
    externalUrl: string | null;
    jobDescription: string | null;
    visibility: "GLOBAL" | "CANDIDATE_PRIVATE";
  }>
> {
  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);
    if (!candidateId) {
      return { success: false, error: "Select a candidate before loading job details" };
    }

    const job = await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findFirst({
        where: {
          id: candidateId,
          organizationId: ctx.organizationId,
          status: { not: "ARCHIVED" },
        },
        select: { id: true },
      });
      if (!candidate) throw new NotFoundError("Candidate not found");

      // Scope at query boundary: GLOBAL + this candidate's private leads only (never another candidate's).
      return tx.job.findFirst({
        where: {
          AND: [
            deskJobsWhere(ctx.organizationId, candidate.id),
            { id: jobId },
          ],
        },
        select: {
          id: true,
          title: true,
          companyName: true,
          location: true,
          isRemote: true,
          employmentType: true,
          salaryMin: true,
          salaryMax: true,
          salaryCurrency: true,
          source: true,
          externalUrl: true,
          jobDescription: true,
          visibility: true,
          ownerCandidateId: true,
        },
      });
    });

    if (!job) throw new NotFoundError("Job not found");

    return {
      success: true,
      data: {
        ...job,
        salaryCurrency: job.salaryCurrency || "USD",
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load job detail" };
  }
}

