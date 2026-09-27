"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import {
  ApplicationStatus,
  ApplicationApprovalStatus,
  AuditAction,
  JobStatus,
  CandidateStatus,
  NotificationType,
} from "@/generated/prisma";
import { emailNotificationService } from "@/lib/email";
import {
  GenerateSubmissionEvidenceUploadUrlSchema,
  RecordApplicationSubmissionSchema,
  RecordSubmissionIssueSchema,
  ApproveSubmissionCorrectionSchema,
  StageApplicationResubmissionSchema,
  RecordApplicationResubmissionSchema,
  GetSubmissionEvidenceDownloadUrlSchema,
  GenerateSubmissionEvidenceUploadUrlInput,
  RecordApplicationSubmissionInput,
  RecordSubmissionIssueInput,
  ApproveSubmissionCorrectionInput,
  StageApplicationResubmissionInput,
  RecordApplicationResubmissionInput,
  GetSubmissionEvidenceDownloadUrlInput,
} from "@/lib/validation/submission.schemas";
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  InvalidStateTransitionError,
} from "@/lib/errors";
import {
  generateSubmissionEvidencePath,
  createSignedSubmissionEvidenceUploadUrl,
  createSignedSubmissionEvidenceDownloadUrl,
} from "@/lib/storage";
import { logger } from "@/lib/logger";
import crypto from "crypto";

function revalidateSubmissionViews(applicationId?: string) {
  try {
    revalidatePath("/employee/applications");
    revalidatePath("/candidate/applications");
    revalidatePath("/employee", "layout");
    revalidatePath("/candidate", "layout");
    revalidatePath("/admin", "layout");
    if (applicationId) {
      revalidatePath(`/employee/applications/${applicationId}`);
      revalidatePath(`/candidate/applications/${applicationId}`);
    }
  } catch {
    // Safe fallback when executed outside Next.js request context
  }
}

/**
 * Staff Action: Generate pre-authorized upload URL for submission confirmation evidence.
 * Verifies application belongs to organization and is in READY or RESUBMISSION status.
 */
export async function generateSubmissionEvidenceUploadUrlAction(
  input: GenerateSubmissionEvidenceUploadUrlInput
) {
  const parsed = GenerateSubmissionEvidenceUploadUrlSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || "Validation error in upload parameters");
  }

  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  return withRlsContext(ctx.userId, async (tx) => {
    const application = await tx.application.findUnique({
      where: { id: parsed.data.applicationId, organizationId: ctx.organizationId },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    if (
      application.status !== ApplicationStatus.READY &&
      application.status !== ApplicationStatus.RESUBMISSION
    ) {
      throw new InvalidStateTransitionError(
        `Cannot upload submission evidence for application in status: ${application.status}. Application must be in READY or RESUBMISSION status.`
      );
    }

    const submissionId = crypto.randomUUID();
    const sanitizedFilename = parsed.data.filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const storagePath = generateSubmissionEvidencePath(
      ctx.organizationId,
      application.id,
      submissionId,
      sanitizedFilename
    );

    const uploadUrl = await createSignedSubmissionEvidenceUploadUrl(storagePath);

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.APPLICATION_SUBMISSION_EVIDENCE_UPLOADED,
      entityType: "ApplicationSubmission",
      entityId: submissionId,
      details: {
        applicationId: application.id,
        storagePath,
        mimeType: parsed.data.mimeType,
        fileSizeBytes: parsed.data.fileSizeBytes,
      },
    });

    return {
      success: true,
      submissionId,
      storagePath,
      uploadUrl,
    };
  });
}

/**
 * Staff Action: Record initial manual external submission (Attempt 1).
 * Transitions application from READY to SUBMITTED.
 */
export async function recordApplicationSubmissionAction(
  input: RecordApplicationSubmissionInput
) {
  const parsed = RecordApplicationSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || "Validation error in submission recording");
  }

  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const result = await withRlsContext(ctx.userId, async (tx) => {
    const application = await tx.application.findUnique({
      where: { id: parsed.data.applicationId, organizationId: ctx.organizationId },
      include: {
        job: true,
        candidate: {
          include: {
            user: {
              select: { email: true, firstName: true },
            },
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    // 1. Enforce Application Status Guard
    if (application.status !== ApplicationStatus.READY) {
      throw new InvalidStateTransitionError(
        `Cannot record submission for application in status: ${application.status}. Application must be in READY status.`
      );
    }

    // 2. Enforce Candidate Approval Guard
    if (application.approvalStatus !== ApplicationApprovalStatus.APPROVED) {
      throw new ValidationError("Application cannot be submitted because candidate approval has not been granted.");
    }

    // 3. Enforce Candidate Consent Guard
    if (application.candidate.status !== CandidateStatus.ACTIVE) {
      throw new ValidationError("Application cannot be submitted because candidate consent is not active.");
    }

    // 4. Enforce Job Status Guard
    if (application.job.status === JobStatus.CLOSED || application.job.status === JobStatus.ARCHIVED) {
      throw new ValidationError(
        `Cannot submit application for a job in status ${application.job.status}. Job must be OPEN.`
      );
    }

    const now = new Date();

    // Create Attempt #1 Submission (append-only)
    const submission = await tx.applicationSubmission.create({
      data: {
        applicationId: application.id,
        attemptNumber: 1,
        submittedAt: now,
        submittedById: ctx.userId,
        externalReference: parsed.data.externalReference?.trim() || null,
        externalUrl: parsed.data.externalUrl?.trim() || null,
        confirmationEvidence: parsed.data.confirmationEvidence?.trim() || null,
        storagePath: parsed.data.storagePath?.trim() || null,
        submissionNotes: parsed.data.submissionNotes?.trim() || null,
      },
    });

    // Transition Application to SUBMITTED
    const updatedApp = await tx.application.update({
      where: { id: application.id },
      data: {
        status: ApplicationStatus.SUBMITTED,
      },
    });

    // Record State History
    await tx.applicationStateHistory.create({
      data: {
        applicationId: application.id,
        fromStatus: ApplicationStatus.READY,
        toStatus: ApplicationStatus.SUBMITTED,
        changedById: ctx.userId,
        reason: parsed.data.submissionNotes?.trim() || "Manual external submission recorded",
      },
    });

    // Emit Audit Event atomically within transaction
    await logUserAuditEvent({
      tx,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.APPLICATION_SUBMITTED,
      entityType: "Application",
      entityId: application.id,
      details: {
        submissionId: submission.id,
        attemptNumber: 1,
        submittedAt: now.toISOString(),
        externalReference: submission.externalReference,
        externalUrl: submission.externalUrl,
        storagePath: submission.storagePath,
      },
    });

    // Create in-app Notification for Candidate atomically
    if (application.candidate?.userId) {
      await tx.notification.create({
        data: {
          organizationId: ctx.organizationId,
          recipientId: application.candidate.userId,
          type: NotificationType.APPLICATION_SUBMITTED,
          title: `Application Submitted: ${application.job?.title || "Job Application"} at ${application.job?.companyName || "Company"}`,
          body: `An operational team member has submitted your application for ${application.job?.title || "the role"} at ${application.job?.companyName || "the company"} on your behalf. Confirmation reference: ${submission.externalReference || "Recorded"}.`,
          relatedEntityType: "Application",
          relatedEntityId: application.id,
        },
      });
    }

    const candidateUser = (application.candidate as any)?.user;

    return {
      submission,
      application: updatedApp,
      candidateUserId: application.candidate?.userId,
      candidateUser: candidateUser ? { email: candidateUser.email, firstName: candidateUser.firstName } : null,
      jobTitle: application.job?.title || "Job Application",
      companyName: application.job?.companyName || "Company",
    };
  });

  // Post-commit side effects: cache revalidation & non-blocking email notification
  revalidateSubmissionViews(result.application.id);

  if (result.candidateUser?.email) {
    try {
      await emailNotificationService
        .sendTransactionalNotification({
          organizationId: ctx.organizationId,
          recipientEmail: result.candidateUser.email,
          templateId: "APPLICATION_SUBMITTED",
          subject: `Application Submitted: ${result.jobTitle} at ${result.companyName}`,
          textBody: `Hello ${result.candidateUser.firstName || "Candidate"},\n\nAn operational team member has submitted your application for ${result.jobTitle} at ${result.companyName} on your behalf.\n\nConfirmation Reference: ${result.submission.externalReference || "Recorded"}\n\nYou can view the submission details and confirmation evidence in your OOS portal.\n\nBest regards,\nOperations Team`,
        })
        .catch((err) => {
          logger.warn(`[EmailNotification] Post-commit submission email notification failed`, {
            error: err?.message,
            applicationId: result.application.id,
          });
        });
    } catch (err: any) {
      logger.warn(`[EmailNotification] Error resolving candidate user for email notification`, {
        error: err?.message,
        applicationId: result.application.id,
      });
    }
  }

  return { success: true, submission: result.submission, application: result.application };
}

/**
 * Staff Action: Report defect or issue on submitted application.
 * Transitions application from SUBMITTED to SUBMISSION_ISSUE.
 * Does NOT mutate ApplicationSubmission rows (append-only immutability).
 */
export async function recordSubmissionIssueAction(
  input: RecordSubmissionIssueInput
) {
  const parsed = RecordSubmissionIssueSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || "Validation error in issue recording");
  }

  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  return withRlsContext(ctx.userId, async (tx) => {
    const application = await tx.application.findUnique({
      where: { id: parsed.data.applicationId, organizationId: ctx.organizationId },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    if (application.status !== ApplicationStatus.SUBMITTED) {
      throw new InvalidStateTransitionError(
        `Cannot record submission issue for application in status: ${application.status}. Application must be in SUBMITTED status.`
      );
    }

    const trimmedIssue = parsed.data.issueDescription.trim();

    // Transition Application to SUBMISSION_ISSUE
    const updatedApp = await tx.application.update({
      where: { id: application.id },
      data: {
        status: ApplicationStatus.SUBMISSION_ISSUE,
      },
    });

    // Record State History with issueDescription in reason
    await tx.applicationStateHistory.create({
      data: {
        applicationId: application.id,
        fromStatus: ApplicationStatus.SUBMITTED,
        toStatus: ApplicationStatus.SUBMISSION_ISSUE,
        changedById: ctx.userId,
        reason: trimmedIssue,
      },
    });

    // Emit Audit Event
    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.APPLICATION_SUBMISSION_ISSUE_RECORDED,
      entityType: "Application",
      entityId: application.id,
      details: {
        issueDescription: trimmedIssue,
      },
    });

    revalidateSubmissionViews(application.id);
    return { success: true, application: updatedApp };
  });
}

/**
 * Staff Action: Begin operational review of a reported submission issue.
 * Transitions application from SUBMISSION_ISSUE to REVIEW_REQUIRED.
 */
export async function startCorrectionReviewAction(applicationId: string) {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  return withRlsContext(ctx.userId, async (tx) => {
    const application = await tx.application.findUnique({
      where: { id: applicationId, organizationId: ctx.organizationId },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    if (application.status !== ApplicationStatus.SUBMISSION_ISSUE) {
      throw new InvalidStateTransitionError(
        `Cannot start correction review for application in status: ${application.status}. Application must be in SUBMISSION_ISSUE status.`
      );
    }

    // Transition Application to REVIEW_REQUIRED
    const updatedApp = await tx.application.update({
      where: { id: application.id },
      data: {
        status: ApplicationStatus.REVIEW_REQUIRED,
      },
    });

    // Record State History
    await tx.applicationStateHistory.create({
      data: {
        applicationId: application.id,
        fromStatus: ApplicationStatus.SUBMISSION_ISSUE,
        toStatus: ApplicationStatus.REVIEW_REQUIRED,
        changedById: ctx.userId,
        reason: "Operational review and triage started for submission issue",
      },
    });

    // Emit Audit Event
    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.APPLICATION_CORRECTION_REVIEW_STARTED,
      entityType: "Application",
      entityId: application.id,
      details: {
        previousStatus: ApplicationStatus.SUBMISSION_ISSUE,
        newStatus: ApplicationStatus.REVIEW_REQUIRED,
      },
    });

    revalidateSubmissionViews(application.id);
    return { success: true, application: updatedApp };
  });
}

/**
 * Staff Action: Approve correction plan for an application in REVIEW_REQUIRED.
 * Transitions application from REVIEW_REQUIRED to CORRECTION_APPROVED.
 * Staff Correction Gate (no redundant candidate approval).
 */
export async function approveSubmissionCorrectionAction(
  input: ApproveSubmissionCorrectionInput
) {
  const parsed = ApproveSubmissionCorrectionSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || "Validation error in correction approval");
  }

  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  return withRlsContext(ctx.userId, async (tx) => {
    const application = await tx.application.findUnique({
      where: { id: parsed.data.applicationId, organizationId: ctx.organizationId },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    if (application.status !== ApplicationStatus.REVIEW_REQUIRED) {
      throw new InvalidStateTransitionError(
        `Cannot approve correction for application in status: ${application.status}. Application must be in REVIEW_REQUIRED status.`
      );
    }

    const trimmedNotes = parsed.data.correctionNotes.trim();

    // Transition Application to CORRECTION_APPROVED
    const updatedApp = await tx.application.update({
      where: { id: application.id },
      data: {
        status: ApplicationStatus.CORRECTION_APPROVED,
      },
    });

    // Record State History with correctionNotes in reason
    await tx.applicationStateHistory.create({
      data: {
        applicationId: application.id,
        fromStatus: ApplicationStatus.REVIEW_REQUIRED,
        toStatus: ApplicationStatus.CORRECTION_APPROVED,
        changedById: ctx.userId,
        reason: trimmedNotes,
      },
    });

    // Emit Audit Event
    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.APPLICATION_CORRECTION_APPROVED,
      entityType: "Application",
      entityId: application.id,
      details: {
        correctionNotes: trimmedNotes,
      },
    });

    revalidateSubmissionViews(application.id);
    return { success: true, application: updatedApp };
  });
}

/**
 * Staff Action: Stage corrected application for resubmission.
 * Transitions application from CORRECTION_APPROVED to RESUBMISSION.
 */
export async function stageApplicationResubmissionAction(
  input: StageApplicationResubmissionInput
) {
  const parsed = StageApplicationResubmissionSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || "Validation error in staging resubmission");
  }

  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const result = await withRlsContext(ctx.userId, async (tx) => {
    const application = await tx.application.findUnique({
      where: { id: parsed.data.applicationId, organizationId: ctx.organizationId },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    if (application.status !== ApplicationStatus.CORRECTION_APPROVED) {
      throw new InvalidStateTransitionError(
        `Cannot stage resubmission for application in status: ${application.status}. Application must be in CORRECTION_APPROVED status.`
      );
    }

    // Transition Application to RESUBMISSION
    const updatedApp = await tx.application.update({
      where: { id: application.id },
      data: {
        status: ApplicationStatus.RESUBMISSION,
      },
    });

    // Record State History
    await tx.applicationStateHistory.create({
      data: {
        applicationId: application.id,
        fromStatus: ApplicationStatus.CORRECTION_APPROVED,
        toStatus: ApplicationStatus.RESUBMISSION,
        changedById: ctx.userId,
        reason: "Corrected application materials staged for resubmission",
      },
    });

    // Emit Audit Event atomically within transaction
    await logUserAuditEvent({
      tx,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.APPLICATION_RESUBMISSION_STAGED,
      entityType: "Application",
      entityId: application.id,
      details: {
        previousStatus: ApplicationStatus.CORRECTION_APPROVED,
        newStatus: ApplicationStatus.RESUBMISSION,
      },
    });

    return { success: true, application: updatedApp };
  });

  revalidateSubmissionViews(result.application.id);
  return result;
}

/**
 * Staff Action: Record secondary manual external submission (Attempt > 1).
 * Creates a new sequential ApplicationSubmission row and transitions RESUBMISSION to SUBMITTED.
 * Previous attempt records remain completely untouched and immutable.
 */
export async function recordApplicationResubmissionAction(
  input: RecordApplicationResubmissionInput
) {
  const parsed = RecordApplicationResubmissionSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || "Validation error in resubmission recording");
  }

  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const result = await withRlsContext(ctx.userId, async (tx) => {
    const application = await tx.application.findUnique({
      where: { id: parsed.data.applicationId, organizationId: ctx.organizationId },
      include: {
        job: true,
        candidate: true,
      },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    // 1. Enforce Application Status Guard
    if (application.status !== ApplicationStatus.RESUBMISSION) {
      throw new InvalidStateTransitionError(
        `Cannot record resubmission for application in status: ${application.status}. Application must be in RESUBMISSION status.`
      );
    }

    // 2. Enforce Candidate Consent Guard
    if (application.candidate.status !== CandidateStatus.ACTIVE) {
      throw new ValidationError("Cannot resubmit application because candidate consent is not active.");
    }

    // 3. Enforce Job Status Guard
    if (application.job.status === JobStatus.CLOSED || application.job.status === JobStatus.ARCHIVED) {
      throw new ValidationError(
        `Cannot resubmit application for a job in status ${application.job.status}. Job must be OPEN.`
      );
    }

    // Determine sequential attempt number
    const latestSubmission = await tx.applicationSubmission.findFirst({
      where: { applicationId: application.id },
      orderBy: { attemptNumber: "desc" },
    });
    const nextAttemptNumber = (latestSubmission?.attemptNumber ?? 1) + 1;
    const now = new Date();

    // Insert new sequential ApplicationSubmission (append-only)
    const submission = await tx.applicationSubmission.create({
      data: {
        applicationId: application.id,
        attemptNumber: nextAttemptNumber,
        submittedAt: now,
        submittedById: ctx.userId,
        externalReference: parsed.data.externalReference?.trim() || null,
        externalUrl: parsed.data.externalUrl?.trim() || null,
        confirmationEvidence: parsed.data.confirmationEvidence?.trim() || null,
        storagePath: parsed.data.storagePath?.trim() || null,
        submissionNotes: parsed.data.submissionNotes?.trim() || null,
      },
    });

    // Transition Application to SUBMITTED
    const updatedApp = await tx.application.update({
      where: { id: application.id },
      data: {
        status: ApplicationStatus.SUBMITTED,
      },
    });

    // Record State History
    await tx.applicationStateHistory.create({
      data: {
        applicationId: application.id,
        fromStatus: ApplicationStatus.RESUBMISSION,
        toStatus: ApplicationStatus.SUBMITTED,
        changedById: ctx.userId,
        reason: parsed.data.submissionNotes?.trim() || `Manual external resubmission recorded (Attempt #${nextAttemptNumber})`,
      },
    });

    // Emit Audit Event atomically within transaction
    await logUserAuditEvent({
      tx,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.APPLICATION_RESUBMITTED,
      entityType: "Application",
      entityId: application.id,
      details: {
        submissionId: submission.id,
        attemptNumber: nextAttemptNumber,
        submittedAt: now.toISOString(),
        externalReference: submission.externalReference,
        externalUrl: submission.externalUrl,
        storagePath: submission.storagePath,
      },
    });

    return { success: true, submission, application: updatedApp };
  });

  revalidateSubmissionViews(result.application.id);
  return result;
}

/**
 * Staff Action: Generate short-lived signed download URL for submission confirmation evidence.
 * Verifies submission belongs to an application within the authenticated staff's organization.
 */
export async function getSubmissionEvidenceDownloadUrlAction(
  input: GetSubmissionEvidenceDownloadUrlInput
) {
  const parsed = GetSubmissionEvidenceDownloadUrlSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || "Validation error in download request");
  }

  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  return withRlsContext(ctx.userId, async (tx) => {
    const submission = await tx.applicationSubmission.findUnique({
      where: { id: parsed.data.submissionId },
      include: {
        application: true,
      },
    });

    if (!submission) {
      throw new NotFoundError("Submission record not found");
    }

    if (submission.application.organizationId !== ctx.organizationId) {
      throw new AuthorizationError("You do not have access to evidence for this organization");
    }

    if (!submission.storagePath) {
      throw new NotFoundError("No binary evidence file associated with this submission");
    }

    const downloadUrl = await createSignedSubmissionEvidenceDownloadUrl(submission.storagePath, 60);

    return {
      success: true,
      downloadUrl,
      filename: submission.storagePath.split("/").pop() || "evidence",
    };
  });
}
