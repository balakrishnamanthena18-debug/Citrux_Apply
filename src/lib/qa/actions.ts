"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedContext, requireEmployeeOrAdmin, requireCandidate } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import {
  ApplicationStatus,
  ApplicationApprovalStatus,
  AuditAction,
  JobStatus,
  QaDecision,
  QaCriterionKey,
} from "@/generated/prisma";
import {
  CompleteQaReviewSchema,
  CandidateApproveApplicationSchema,
  CandidateRequestRevisionSchema,
  CompleteQaReviewInput,
  CandidateApproveApplicationInput,
  CandidateRequestRevisionInput,
} from "@/lib/validation/qa.schemas";
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  InvalidStateTransitionError,
} from "@/lib/errors";

function revalidateQaViews(applicationId?: string) {
  try {
    revalidatePath("/employee/applications");
    revalidatePath("/candidate/applications");
    revalidatePath("/employee");
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

/**
 * Staff Action: Submit application for QA review.
 * Transitions application from PREPARING to REVIEW.
 */
export async function submitApplicationForQaAction(applicationId: string) {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  return withRlsContext(ctx.userId, async (tx) => {
    const application = await tx.application.findUnique({
      where: { id: applicationId, organizationId: ctx.organizationId },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    if (application.status !== ApplicationStatus.PREPARING) {
      throw new InvalidStateTransitionError(
        `Cannot submit application for QA from status: ${application.status}. Application must be in PREPARING status.`
      );
    }

    const updatedApp = await tx.application.update({
      where: { id: application.id },
      data: {
        status: ApplicationStatus.REVIEW,
      },
    });

    await tx.applicationStateHistory.create({
      data: {
        applicationId: application.id,
        fromStatus: ApplicationStatus.PREPARING,
        toStatus: ApplicationStatus.REVIEW,
        changedById: ctx.userId,
        reason: "Application preparation completed; submitted for operational QA review",
      },
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.APPLICATION_SUBMITTED_FOR_QA,
      entityType: "Application",
      entityId: application.id,
      details: {
        previousStatus: ApplicationStatus.PREPARING,
        newStatus: ApplicationStatus.REVIEW,
      },
    });

    revalidateQaViews(application.id);
    return { success: true, application: updatedApp };
  });
}

/**
 * Staff Action: Complete QA review with decision PASS or FAIL.
 */
export async function completeQaReviewAction(input: CompleteQaReviewInput) {
  const parsed = CompleteQaReviewSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || "Validation error in QA review");
  }

  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  return withRlsContext(ctx.userId, async (tx) => {
    const application = await tx.application.findUnique({
      where: { id: parsed.data.applicationId, organizationId: ctx.organizationId },
      include: { job: true, candidate: true },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    if (application.status !== ApplicationStatus.REVIEW) {
      throw new InvalidStateTransitionError(
        `Cannot complete QA review on application in status: ${application.status}. Application must be in REVIEW status.`
      );
    }

    const isPass = parsed.data.decision === "PASS";

    // If decision is PASS, all 9 criteria must be verified
    if (isPass) {
      const unverifiedItems = parsed.data.checklistItems.filter((item) => !item.isVerified);
      if (unverifiedItems.length > 0) {
        throw new ValidationError("All 9 QA criteria must be verified to pass QA review");
      }
    }

    // Create QA Review and Checklist records
    const qaReview = await tx.applicationQaReview.create({
      data: {
        organizationId: ctx.organizationId,
        applicationId: application.id,
        reviewerId: ctx.userId,
        decision: isPass ? QaDecision.PASS : QaDecision.FAIL,
        notes: parsed.data.notes?.trim() || null,
        checklistItems: {
          create: parsed.data.checklistItems.map((item) => ({
            criterionKey: item.criterionKey as QaCriterionKey,
            isVerified: item.isVerified,
          })),
        },
      },
      include: {
        checklistItems: true,
      },
    });

    let targetStatus: ApplicationStatus = ApplicationStatus.PREPARING;
    let approvalStatus: ApplicationApprovalStatus | null = application.approvalStatus;
    let approvalRequestedAt: Date | null = application.approvalRequestedAt;
    let approvedAt: Date | null = application.approvedAt;
    let approvedBy: string | null = application.approvedBy;
    let transitionReason = `QA review failed: ${parsed.data.notes?.trim()}`;
    let isManagedReady = false;

    if (isPass) {
      const candidate = application.candidate;
      const job = application.job;

      // Evaluate preference boundaries
      const salaryFloorViolation = Boolean(
        candidate?.desiredSalaryMin && job?.salaryMax && job.salaryMax < candidate.desiredSalaryMin
      );
      const remoteViolation = Boolean(
        candidate?.remotePreference === "REMOTE_ONLY" && job && !job.isRemote
      );
      const hasBoundaryViolation = salaryFloorViolation || remoteViolation;

      const isManagedCandidate =
        candidate?.applicationAuthorizationMode === "MANAGED" &&
        candidate?.status === "ACTIVE" &&
        (!job || job.status === JobStatus.OPEN);

      if (isManagedCandidate && !hasBoundaryViolation) {
        targetStatus = ApplicationStatus.READY;
        approvalStatus = ApplicationApprovalStatus.APPROVED;
        approvedAt = new Date();
        approvedBy = null; // System-managed under candidate's broad authorization
        transitionReason = "QA review passed; application automatically advanced to READY under managed authorization";
        isManagedReady = true;
      } else {
        targetStatus = ApplicationStatus.AWAITING_APPROVAL;
        approvalStatus = ApplicationApprovalStatus.PENDING;
        approvalRequestedAt = new Date();
        transitionReason = hasBoundaryViolation
          ? "QA review passed; application requires candidate review due to preference boundary exception"
          : "QA review passed; application staged for candidate approval";
      }
    }

    const updatedApp = await tx.application.update({
      where: { id: application.id },
      data: {
        status: targetStatus,
        approvalStatus,
        approvalRequestedAt,
        approvedAt,
        approvedBy,
      },
    });

    await tx.applicationStateHistory.create({
      data: {
        applicationId: application.id,
        fromStatus: ApplicationStatus.REVIEW,
        toStatus: targetStatus,
        changedById: ctx.userId,
        reason: transitionReason,
      },
    });

    if (isPass) {
      await logUserAuditEvent({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.APPLICATION_QA_PASSED,
        entityType: "Application",
        entityId: application.id,
        details: {
          qaReviewId: qaReview.id,
          decision: QaDecision.PASS,
        },
      });

      if (isManagedReady) {
        await logUserAuditEvent({
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          action: AuditAction.APPLICATION_ADVANCED_TO_READY_MANAGED,
          entityType: "Application",
          entityId: application.id,
          details: {
            qaReviewId: qaReview.id,
            authorizationMode: "MANAGED",
            approvedAt: approvedAt?.toISOString(),
          },
        });
      } else {
        await logUserAuditEvent({
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          action: AuditAction.APPLICATION_APPROVAL_REQUESTED,
          entityType: "Application",
          entityId: application.id,
          details: {
            approvalStatus: ApplicationApprovalStatus.PENDING,
            requestedAt: updatedApp.approvalRequestedAt?.toISOString(),
          },
        });
      }
    } else {
      await logUserAuditEvent({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.APPLICATION_QA_FAILED,
        entityType: "Application",
        entityId: application.id,
        details: {
          qaReviewId: qaReview.id,
          decision: QaDecision.FAIL,
          failureNotes: parsed.data.notes?.trim(),
        },
      });
    }

    revalidateQaViews(application.id);
    return { success: true, qaReview, application: updatedApp };
  });
}

/**
 * Candidate Action: Explicitly approve application for submission.
 * Moves application from AWAITING_APPROVAL to READY.
 */
export async function candidateApproveApplicationAction(input: CandidateApproveApplicationInput) {
  const parsed = CandidateApproveApplicationSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || "Validation error in approval");
  }

  const ctx = await getAuthenticatedContext();
  requireCandidate(ctx);

  return withRlsContext(ctx.userId, async (tx) => {
    // 1. Fetch Candidate for the authenticated user
    const candidate = await tx.candidate.findUnique({
      where: { userId: ctx.userId },
    });

    if (!candidate) {
      throw new AuthorizationError("Candidate profile not found for authenticated user");
    }

    // 2. Fetch Application and verify candidate ownership and job status
    const application = await tx.application.findUnique({
      where: { id: parsed.data.applicationId },
      include: { job: true },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    if (application.candidateId !== candidate.id) {
      throw new AuthorizationError("You are not authorized to approve this application");
    }

    if (application.status !== ApplicationStatus.AWAITING_APPROVAL) {
      throw new InvalidStateTransitionError(
        `Cannot approve application in status: ${application.status}. Application must be in AWAITING_APPROVAL status.`
      );
    }

    if (candidate.status !== "ACTIVE") {
      throw new ValidationError("Cannot approve application because candidate consent is not active");
    }

    // 3. Enforce Job Status Guard (Phase 3 §8.2)
    if (application.job.status === JobStatus.CLOSED || application.job.status === JobStatus.ARCHIVED) {
      throw new ValidationError(
        `Cannot approve application for a job in status ${application.job.status}. Job must be OPEN.`
      );
    }

    const now = new Date();

    const updatedApp = await tx.application.update({
      where: { id: application.id },
      data: {
        status: ApplicationStatus.READY,
        approvalStatus: ApplicationApprovalStatus.APPROVED,
        approvedAt: now,
        approvedBy: ctx.userId,
      },
    });

    await tx.applicationStateHistory.create({
      data: {
        applicationId: application.id,
        fromStatus: ApplicationStatus.AWAITING_APPROVAL,
        toStatus: ApplicationStatus.READY,
        changedById: ctx.userId,
        reason: "Candidate explicitly approved application for external submission",
      },
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: application.organizationId,
      action: AuditAction.APPLICATION_APPROVED_BY_CANDIDATE,
      entityType: "Application",
      entityId: application.id,
      details: {
        approvedAt: now.toISOString(),
        approvedBy: ctx.userId,
        jobId: application.jobId,
      },
    });

    revalidateQaViews(application.id);
    return { success: true, application: updatedApp };
  });
}

/**
 * Candidate Action: Request revision on prepared application materials.
 * Moves application from AWAITING_APPROVAL to PREPARING.
 */
export async function candidateRequestRevisionAction(input: CandidateRequestRevisionInput) {
  const parsed = CandidateRequestRevisionSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || "Validation error in revision request");
  }

  const ctx = await getAuthenticatedContext();
  requireCandidate(ctx);

  return withRlsContext(ctx.userId, async (tx) => {
    // 1. Fetch Candidate for the authenticated user
    const candidate = await tx.candidate.findUnique({
      where: { userId: ctx.userId },
    });

    if (!candidate) {
      throw new AuthorizationError("Candidate profile not found for authenticated user");
    }

    // 2. Fetch Application and verify candidate ownership
    const application = await tx.application.findUnique({
      where: { id: parsed.data.applicationId },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    if (application.candidateId !== candidate.id) {
      throw new AuthorizationError("You are not authorized to request revisions on this application");
    }

    if (application.status !== ApplicationStatus.AWAITING_APPROVAL) {
      throw new InvalidStateTransitionError(
        `Cannot request revision on application in status: ${application.status}. Application must be in AWAITING_APPROVAL status.`
      );
    }

    const trimmedNotes = parsed.data.revisionNotes.trim();

    const updatedApp = await tx.application.update({
      where: { id: application.id },
      data: {
        status: ApplicationStatus.PREPARING,
        approvalStatus: ApplicationApprovalStatus.REVISION_REQUESTED,
        approvalNotes: trimmedNotes,
      },
    });

    await tx.applicationStateHistory.create({
      data: {
        applicationId: application.id,
        fromStatus: ApplicationStatus.AWAITING_APPROVAL,
        toStatus: ApplicationStatus.PREPARING,
        changedById: ctx.userId,
        reason: `Candidate requested revision: ${trimmedNotes}`,
      },
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: application.organizationId,
      action: AuditAction.APPLICATION_REVISION_REQUESTED_BY_CANDIDATE,
      entityType: "Application",
      entityId: application.id,
      details: {
        revisionNotes: trimmedNotes,
      },
    });

    revalidateQaViews(application.id);
    return { success: true, application: updatedApp };
  });
}
