"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import {
  JobCreateSchema,
  JobUpdateSchema,
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
  Prisma,
} from "@/generated/prisma";
import {
  AuthorizationError,
  ConflictError,
  InvalidStateTransitionError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";

import { ALLOWED_APPLICATION_TRANSITIONS } from "./constants";

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
    revalidatePath("/employee");
    revalidatePath("/candidate/applications");
    revalidatePath("/candidate");
    revalidatePath("/admin/applications");
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

    const job = await withRlsContext(ctx.userId, async (tx) => {
      return tx.job.create({
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
          createdById: ctx.userId,
        },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "JOB_CREATED",
      entityType: "Job",
      entityId: job.id,
      details: { title: job.title, companyName: job.companyName },
    });

    revalidateApplicationViews();
    return { success: true, data: { jobId: job.id } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create job" };
  }
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

      return tx.job.update({
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

      // 2. Verify job exists in same org and is OPEN
      const job = await tx.job.findUnique({
        where: { id: parsed.data.jobId, organizationId: ctx.organizationId },
      });
      if (!job) throw new NotFoundError("Job not found in organization");
      if (job.status !== "OPEN") {
        throw new ValidationError(`Cannot create applications for ${job.status} jobs`);
      }

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

      // 4. Validate assignee if provided
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
          throw new ValidationError("Assigned user must be an active staff member in this organization");
        }
      }

      // 5. Create application and state history record
      const app = await tx.application.create({
        data: {
          organizationId: ctx.organizationId,
          candidateId: candidate.id,
          jobId: job.id,
          status: ApplicationStatus.DISCOVERED,
          assignedEmployeeId: parsed.data.assignedEmployeeId || null,
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
      const application = await tx.application.findUnique({
        where: { id: parsed.data.applicationId, organizationId: ctx.organizationId },
      });
      if (!application) throw new NotFoundError("Application not found in organization");

      if (parsed.data.employeeId) {
        const staff = await tx.membership.findFirst({
          where: {
            userId: parsed.data.employeeId,
            organizationId: ctx.organizationId,
            role: { in: [Role.EMPLOYEE, Role.ADMIN] },
            status: "ACTIVE",
          },
        });
        if (!staff) {
          throw new ValidationError("Target user is not an active staff member in this organization");
        }
      }

      await tx.application.update({
        where: { id: application.id },
        data: { assignedEmployeeId: parsed.data.employeeId },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "APPLICATION_ASSIGNED",
      entityType: "Application",
      entityId: parsed.data.applicationId,
      details: { assignedEmployeeId: parsed.data.employeeId },
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

      // If candidateDocumentId provided, verify it belongs to candidate
      if (parsed.data.candidateDocumentId) {
        const doc = await tx.candidateDocument.findFirst({
          where: { id: parsed.data.candidateDocumentId, candidateId: app.candidateId },
        });
        if (!doc) throw new NotFoundError("Referenced candidate document not found for candidate");
      }

      // Mark old materials as not current
      await tx.applicationMaterial.updateMany({
        where: { applicationId: app.id, isCurrent: true },
        data: { isCurrent: false },
      });

      return tx.applicationMaterial.create({
        data: {
          applicationId: app.id,
          candidateDocumentId: parsed.data.candidateDocumentId || null,
          documentVersion: parsed.data.documentVersion || 1,
          coverLetterText: parsed.data.coverLetterText || null,
          screeningAnswers: parsed.data.screeningAnswers ? (parsed.data.screeningAnswers as any) : Prisma.JsonNull,
          customNotes: parsed.data.customNotes || null,
          isCurrent: true,
          createdById: ctx.userId,
        },
      });
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
          confirmationEvidence: parsed.data.confirmationEvidence,
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
          confirmationEvidence: parsed.data.confirmationEvidence,
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

      // 2. Resolve or create canonical Job
      let job: { id: string; status: JobStatus } | null = null;
      let isExistingJob = false;

      // Check by externalUrl if provided
      if (parsed.data.externalUrl) {
        job = await tx.job.findFirst({
          where: {
            organizationId: ctx.organizationId,
            externalUrl: parsed.data.externalUrl,
            status: JobStatus.OPEN,
          },
          select: { id: true, status: true },
        });
        if (job) isExistingJob = true;
      }

      // Fallback: check by exact companyName and title match in organization
      if (!job) {
        job = await tx.job.findFirst({
          where: {
            organizationId: ctx.organizationId,
            companyName: { equals: parsed.data.companyName, mode: "insensitive" },
            title: { equals: parsed.data.title, mode: "insensitive" },
            status: JobStatus.OPEN,
          },
          select: { id: true, status: true },
        });
        if (job) isExistingJob = true;
      }

      // If still not found, create new Job
      if (!job) {
        job = await tx.job.create({
          data: {
            organizationId: ctx.organizationId,
            createdById: ctx.userId,
            title: parsed.data.title,
            companyName: parsed.data.companyName,
            location: parsed.data.location || "Remote",
            isRemote: parsed.data.isRemote ?? false,
            employmentType: parsed.data.employmentType || "FULL_TIME",
            source: parsed.data.source || "MANUAL",
            externalUrl: parsed.data.externalUrl || null,
            jobDescription: parsed.data.jobDescription || "Not provided",
            salaryMin: parsed.data.salaryMin ?? null,
            salaryMax: parsed.data.salaryMax ?? null,
            salaryCurrency: parsed.data.salaryCurrency || "USD",
            status: JobStatus.OPEN,
          },
          select: { id: true, status: true },
        });
      }

      // 3. Prevent duplicate active applications for same candidate + job
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

      // 4. Create canonical Application in initial DISCOVERED status
      const application = await tx.application.create({
        data: {
          organizationId: ctx.organizationId,
          candidateId: candidate.id,
          jobId: job.id,
          assignedEmployeeId: ctx.userId,
          status: ApplicationStatus.DISCOVERED,
        },
      });

      // 5. Create initial ApplicationStateHistory
      await tx.applicationStateHistory.create({
        data: {
          applicationId: application.id,
          fromStatus: null,
          toStatus: ApplicationStatus.DISCOVERED,
          changedById: ctx.userId,
          reason: "Application initialized via Application Desk",
        },
      });

      // 6. Record staff internal note if provided
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
        isExistingJob,
      };
    });

    // 7. Authoritative Audit event
    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "APPLICATION_CREATED",
      entityType: "Application",
      entityId: result.applicationId,
      details: {
        candidateId: parsed.data.candidateId,
        jobId: result.jobId,
        isExistingJob: result.isExistingJob,
        viaApplicationDesk: true,
      },
    });

    revalidateApplicationViews(result.applicationId);
    return {
      success: true,
      data: result,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to initialize application from desk" };
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
        include: { user: true },
      });
      if (!candidate) throw new NotFoundError("Candidate not found");

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayOfWeek = now.getDay();
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

      const todayCount = await tx.application.count({
        where: {
          candidateId: candidate.id,
          organizationId: ctx.organizationId,
          status: ApplicationStatus.SUBMITTED,
          createdAt: { gte: startOfToday },
        },
      });
      const weekCount = await tx.application.count({
        where: {
          candidateId: candidate.id,
          organizationId: ctx.organizationId,
          status: ApplicationStatus.SUBMITTED,
          createdAt: { gte: startOfWeek },
        },
      });
      const totalSubmittedCount = await tx.application.count({
        where: {
          candidateId: candidate.id,
          organizationId: ctx.organizationId,
          status: ApplicationStatus.SUBMITTED,
        },
      });
      const recentApps = await tx.application.findMany({
        where: {
          candidateId: candidate.id,
          organizationId: ctx.organizationId,
        },
        include: {
          job: true,
          submissions: {
            orderBy: { attemptNumber: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      return {
        candidate: {
          id: candidate.id,
          fullName: `${candidate.user.firstName || ""} ${candidate.user.lastName || ""}`.trim() || candidate.user.email,
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
          appliedAt: app.submissions[0]?.submittedAt?.toISOString() || app.createdAt.toISOString(),
        })),
      };
    });

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to fetch candidate summary" };
  }
}

