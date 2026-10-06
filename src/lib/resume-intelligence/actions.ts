"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { AuditAction } from "@/generated/prisma";
import { enqueueResumeReview } from "@/lib/resume-intelligence/worker";
import { presentResumeReview } from "@/lib/resume-intelligence/presentation";
import { AuthorizationError, NotFoundError } from "@/lib/errors";

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

/**
 * Request a resume review for the current materials package on an application.
 * Analysis only — never mutates resume bytes or candidate truth.
 */
export async function requestApplicationResumeReviewAction(
  applicationId: string
): Promise<ActionResult<{ reviewId: string }>> {
  try {
    const ctx = await getAuthenticatedContext();

    const result = await withRlsContext(ctx.userId, async (tx) => {
      const app = await tx.application.findFirst({
        where: { id: applicationId, organizationId: ctx.organizationId },
        include: {
          candidate: { select: { id: true, userId: true } },
          materials: {
            where: { isCurrent: true },
            take: 1,
            select: {
              candidateDocumentId: true,
              documentVersion: true,
            },
          },
        },
      });
      if (!app) throw new NotFoundError("Application not found");

      if (ctx.role === "CANDIDATE" && app.candidate.userId !== ctx.userId) {
        throw new AuthorizationError("Unauthorized");
      }
      if (ctx.role !== "CANDIDATE" && ctx.role !== "EMPLOYEE" && ctx.role !== "ADMIN") {
        throw new AuthorizationError("Unauthorized");
      }

      const material = app.materials[0];
      if (!material?.candidateDocumentId) {
        return { error: "Select a resume for this application before requesting a review." as const };
      }

      const enqueued = await enqueueResumeReview(tx, {
        organizationId: ctx.organizationId,
        candidateId: app.candidateId,
        applicationId: app.id,
        candidateDocumentId: material.candidateDocumentId,
        requestedById: ctx.userId,
      });

      return { reviewId: enqueued.reviewId };
    });

    if ("error" in result && result.error) {
      return { success: false, error: result.error };
    }

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.RESUME_REVIEW_REQUESTED,
      entityType: "ResumeReview",
      entityId: (result as { reviewId: string }).reviewId,
      details: { applicationId },
    });

    revalidatePath(`/candidate/applications/${applicationId}`);
    revalidatePath(`/employee/applications/${applicationId}`);

    return {
      success: true,
      data: { reviewId: (result as { reviewId: string }).reviewId },
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to request resume review";
    return { success: false, error: message };
  }
}

/**
 * Load candidate-safe resume review presentation for an application.
 * Never returns extracted resume text.
 */
export async function getApplicationResumeReviewAction(
  applicationId: string
): Promise<ActionResult<ReturnType<typeof presentResumeReview>>> {
  try {
    const ctx = await getAuthenticatedContext();

    const presented = await withRlsContext(ctx.userId, async (tx) => {
      const app = await tx.application.findFirst({
        where: { id: applicationId, organizationId: ctx.organizationId },
        include: {
          candidate: { select: { userId: true } },
        },
      });
      if (!app) throw new NotFoundError("Application not found");
      if (ctx.role === "CANDIDATE" && app.candidate.userId !== ctx.userId) {
        throw new AuthorizationError("Unauthorized");
      }

      const review = await tx.resumeReview.findFirst({
        where: {
          organizationId: ctx.organizationId,
          applicationId,
          candidateId: app.candidateId,
        },
        orderBy: { createdAt: "desc" },
        select: {
          status: true,
          freshness: true,
          overallLabel: true,
          overallSummary: true,
          atsReadability: true,
          strengths: true,
          recommendations: true,
          completedAt: true,
          candidateDocument: { select: { title: true } },
        },
      });

      return presentResumeReview({ review });
    });

    return { success: true, data: presented };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to load resume review";
    return { success: false, error: message };
  }
}
