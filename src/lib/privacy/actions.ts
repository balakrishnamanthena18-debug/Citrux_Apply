"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedContext, requireAdmin, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { AuditAction, PrivacyRequestType, PrivacyRequestStatus, Role, MembershipStatus } from "@/generated/prisma";
import {
  CreatePrivacyRequestSchema,
  VerifyPrivacyRequestSchema,
  CompletePrivacyRequestSchema,
  RejectPrivacyRequestSchema,
  ListPrivacyRequestsSchema,
  type CreatePrivacyRequestInput,
  type VerifyPrivacyRequestInput,
  type CompletePrivacyRequestInput,
  type RejectPrivacyRequestInput,
  type ListPrivacyRequestsInput,
} from "@/lib/validation/admin-privacy.schemas";
import { AuthorizationError, NotFoundError, ValidationError } from "@/lib/errors";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

function revalidatePrivacyViews() {
  try {
    revalidatePath("/admin/privacy");
    revalidatePath("/candidate/privacy");
    revalidatePath("/admin");
  } catch {
    // Safe fallback when executed outside Next.js request context
  }
}

/**
 * 1. Candidate Action: Submits a formal privacy request (DATA_EXPORT, DATA_CORRECTION, DATA_DELETION).
 */
export async function createPrivacyRequestAction(
  input: CreatePrivacyRequestInput
): Promise<ActionResult<{ requestId: string }>> {
  const parsed = CreatePrivacyRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    if (ctx.role !== Role.CANDIDATE) {
      throw new AuthorizationError("Privacy requests can only be submitted by registered candidates");
    }

    const request = await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { userId: ctx.userId },
      });

      if (!candidate || candidate.organizationId !== ctx.organizationId) {
        throw new NotFoundError("Candidate profile not found");
      }

      // Check for an existing pending request of the same type
      const existingPending = await tx.privacyRequest.findFirst({
        where: {
          candidateId: candidate.id,
          requestType: parsed.data.requestType as PrivacyRequestType,
          status: { in: [PrivacyRequestStatus.PENDING, PrivacyRequestStatus.IDENTITY_VERIFIED, PrivacyRequestStatus.IN_REVIEW] },
        },
      });

      if (existingPending) {
        throw new ValidationError(
          `You already have an active ${parsed.data.requestType.replace(/_/g, " ")} request in progress`
        );
      }

      return tx.privacyRequest.create({
        data: {
          organizationId: ctx.organizationId,
          candidateId: candidate.id,
          requestType: parsed.data.requestType as PrivacyRequestType,
          status: PrivacyRequestStatus.PENDING,
          requestedById: ctx.userId,
          scopeDetails: parsed.data.scopeDetails || null,
        },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.PRIVACY_REQUEST_CREATED,
      entityType: "PrivacyRequest",
      entityId: request.id,
      details: {
        requestType: parsed.data.requestType,
        scopeDetails: parsed.data.scopeDetails || null,
      },
    });

    revalidatePrivacyViews();
    return { success: true, data: { requestId: request.id } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to submit privacy request" };
  }
}

/**
 * 2. Staff / Admin Action: Explicitly verifies the candidate's identity prior to processing.
 */
export async function verifyPrivacyRequestAction(
  input: VerifyPrivacyRequestInput
): Promise<ActionResult<{ status: PrivacyRequestStatus }>> {
  const parsed = VerifyPrivacyRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    const updated = await withRlsContext(ctx.userId, async (tx) => {
      const request = await tx.privacyRequest.findUnique({
        where: { id: parsed.data.requestId, organizationId: ctx.organizationId },
      });

      if (!request) {
        throw new NotFoundError("Privacy request not found");
      }

      if (request.status !== PrivacyRequestStatus.PENDING) {
        throw new ValidationError(`Cannot verify request in ${request.status} status`);
      }

      // Concurrency-safe atomic transition PENDING -> IDENTITY_VERIFIED
      const updateResult = await tx.privacyRequest.updateMany({
        where: {
          id: request.id,
          organizationId: ctx.organizationId,
          status: PrivacyRequestStatus.PENDING,
        },
        data: {
          status: PrivacyRequestStatus.IDENTITY_VERIFIED,
          verifiedById: ctx.userId,
          verifiedAt: new Date(),
          resolutionNotes: parsed.data.verificationNotes,
        },
      });

      if (updateResult.count === 0) {
        throw new ValidationError("Privacy request was already updated or verified by another staff member");
      }

      return { id: request.id, status: PrivacyRequestStatus.IDENTITY_VERIFIED };
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.PRIVACY_REQUEST_VERIFIED,
      entityType: "PrivacyRequest",
      entityId: updated.id,
      details: {
        verificationNotes: parsed.data.verificationNotes,
      },
    });

    revalidatePrivacyViews();
    return { success: true, data: { status: updated.status } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to verify privacy request" };
  }
}

/**
 * 3. Admin Action: Completes an approved privacy request (Export / Correction / Deletion).
 * Follows approved Admin-Assisted boundary without hardcoded field-level deletion rules.
 */
export async function completePrivacyRequestAction(
  input: CompletePrivacyRequestInput
): Promise<ActionResult<{ status: PrivacyRequestStatus; resultSummary?: string }>> {
  const parsed = CompletePrivacyRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireAdmin(ctx);

    const result = await withRlsContext(ctx.userId, async (tx) => {
      const request = await tx.privacyRequest.findUnique({
        where: { id: parsed.data.requestId, organizationId: ctx.organizationId },
        include: { candidate: { include: { user: true } } },
      });

      if (!request) {
        throw new NotFoundError("Privacy request not found");
      }

      if (
        request.status !== PrivacyRequestStatus.IDENTITY_VERIFIED &&
        request.status !== PrivacyRequestStatus.IN_REVIEW
      ) {
        throw new ValidationError("Privacy request identity must be verified before completion");
      }

      const now = new Date();
      let auditAction: AuditAction = AuditAction.PRIVACY_REQUEST_COMPLETED;

      if (request.requestType === PrivacyRequestType.DATA_DELETION) {
        auditAction = AuditAction.CANDIDATE_DATA_DELETED;
      } else if (request.requestType === PrivacyRequestType.DATA_EXPORT) {
        auditAction = AuditAction.CANDIDATE_DATA_EXPORTED;
      } else if (request.requestType === PrivacyRequestType.DATA_CORRECTION) {
        auditAction = AuditAction.CANDIDATE_DATA_CORRECTED;
      }

      // Concurrency-safe atomic transition IDENTITY_VERIFIED / IN_REVIEW -> COMPLETED
      const updateResult = await tx.privacyRequest.updateMany({
        where: {
          id: request.id,
          organizationId: ctx.organizationId,
          status: { in: [PrivacyRequestStatus.IDENTITY_VERIFIED, PrivacyRequestStatus.IN_REVIEW] },
        },
        data: {
          status: PrivacyRequestStatus.COMPLETED,
          completedById: ctx.userId,
          completedAt: now,
          resolutionNotes: parsed.data.resolutionNotes,
        },
      });

      if (updateResult.count === 0) {
        throw new ValidationError("Privacy request was already completed or modified by another administrator");
      }

      return { id: request.id, status: PrivacyRequestStatus.COMPLETED, auditAction, requestType: request.requestType };
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: result.auditAction,
      entityType: "PrivacyRequest",
      entityId: result.id,
      details: {
        requestType: result.requestType,
        resolutionNotes: parsed.data.resolutionNotes,
      },
    });

    revalidatePrivacyViews();
    return { success: true, data: { status: result.status } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to complete privacy request" };
  }
}

/**
 * 4. Admin Action: Rejects a privacy request with a mandatory explanation.
 */
export async function rejectPrivacyRequestAction(
  input: RejectPrivacyRequestInput
): Promise<ActionResult<{ status: PrivacyRequestStatus }>> {
  const parsed = RejectPrivacyRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireAdmin(ctx);

    const updated = await withRlsContext(ctx.userId, async (tx) => {
      const request = await tx.privacyRequest.findUnique({
        where: { id: parsed.data.requestId, organizationId: ctx.organizationId },
      });

      if (!request) {
        throw new NotFoundError("Privacy request not found");
      }

      if (request.status === PrivacyRequestStatus.COMPLETED || request.status === PrivacyRequestStatus.REJECTED) {
        throw new ValidationError(`Cannot reject privacy request already in ${request.status} status`);
      }

      // Concurrency-safe atomic transition -> REJECTED
      const updateResult = await tx.privacyRequest.updateMany({
        where: {
          id: request.id,
          organizationId: ctx.organizationId,
          status: { in: [PrivacyRequestStatus.PENDING, PrivacyRequestStatus.IDENTITY_VERIFIED, PrivacyRequestStatus.IN_REVIEW] },
        },
        data: {
          status: PrivacyRequestStatus.REJECTED,
          completedById: ctx.userId,
          completedAt: new Date(),
          resolutionNotes: parsed.data.rejectionReason,
        },
      });

      if (updateResult.count === 0) {
        throw new ValidationError("Privacy request was already resolved by another administrator");
      }

      return { id: request.id, status: PrivacyRequestStatus.REJECTED };
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.PRIVACY_REQUEST_REJECTED,
      entityType: "PrivacyRequest",
      entityId: updated.id,
      details: {
        rejectionReason: parsed.data.rejectionReason,
      },
    });

    revalidatePrivacyViews();
    return { success: true, data: { status: updated.status } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to reject privacy request" };
  }
}

/**
 * 5. Lists privacy requests for Candidate (own requests) or Staff/Admin (organization queue).
 */
export async function listPrivacyRequestsAction(
  input?: ListPrivacyRequestsInput
): Promise<ActionResult<{ requests: any[] }>> {
  const parsed = ListPrivacyRequestsSchema.safeParse(input || {});
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();

    const requests = await withRlsContext(ctx.userId, async (tx) => {
      const whereClause: any = { organizationId: ctx.organizationId };

      if (ctx.role === Role.CANDIDATE) {
        const cand = await tx.candidate.findUnique({
          where: { userId: ctx.userId },
        });
        if (!cand) return [];
        whereClause.candidateId = cand.id;
      }

      if (parsed.data.status) {
        whereClause.status = parsed.data.status;
      }

      return tx.privacyRequest.findMany({
        where: whereClause,
        include: {
          candidate: {
            include: { user: { select: { firstName: true, lastName: true, email: true } } },
          },
          verifiedBy: {
            select: { firstName: true, lastName: true, email: true },
          },
          completedBy: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: parsed.data.limit,
      });
    });

    return { success: true, data: { requests } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to list privacy requests" };
  }
}

/**
 * 6. Admin Action: Compiles and downloads structured machine-readable candidate export bundle.
 * Strictly ADMIN-ASSISTED. Candidate cannot self-serve export execution.
 */
export async function getCandidateExportDataAction(
  candidateId: string
): Promise<ActionResult<{ exportBundle: any }>> {
  try {
    const ctx = await getAuthenticatedContext();
    requireAdmin(ctx); // Strictly ADMIN-ASSISTED workflow

    const data = await withRlsContext(ctx.userId, async (tx) => {
      const cand = await tx.candidate.findUnique({
        where: { id: candidateId, organizationId: ctx.organizationId },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true, createdAt: true } },
          experiences: true,
          educations: true,
          skills: true,
          projects: true,
          certifications: true,
          documents: {
            select: { id: true, title: true, documentType: true, versionNumber: true, createdAt: true },
          },
          applications: {
            include: {
              job: { select: { id: true, title: true, companyName: true } },
              stateHistory: { select: { toStatus: true, reason: true, createdAt: true } },
            },
          },
          conversations: {
            include: {
              messages: {
                select: { id: true, senderRole: true, body: true, createdAt: true },
              },
            },
          },
        },
      });

      if (!cand) {
        throw new NotFoundError("Candidate profile not found");
      }

      return cand;
    });

    return {
      success: true,
      data: {
        exportBundle: {
          exportedAt: new Date().toISOString(),
          profile: {
            id: data.id,
            email: data.user.email,
            firstName: data.user.firstName,
            lastName: data.user.lastName,
            phone: data.phone,
            city: data.city,
            state: data.state,
            country: data.country,
            workAuthorization: data.workAuthorization,
            headline: data.headline,
            professionalSummary: data.professionalSummary,
            experiences: data.experiences,
            educations: data.educations,
            skills: data.skills,
            projects: data.projects,
            certifications: data.certifications,
          },
          documents: data.documents,
          applications: data.applications,
          messages: data.conversations,
        },
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to retrieve export data" };
  }
}
