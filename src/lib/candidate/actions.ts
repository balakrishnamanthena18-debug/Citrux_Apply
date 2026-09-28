"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import {
  CandidateProfileSchema,
  CandidateExperienceSchema,
  CandidateEducationSchema,
  CandidateSkillSchema,
  CandidateProjectSchema,
  CandidateCertificationSchema,
  CandidateAssignmentSchema,
  CandidateVerificationSchema,
  CandidateStatusTransitionSchema,
  CandidateDocumentUploadSchema,
  CandidateDocumentUploadSelfSchema,
  UpdateCandidateAuthorizationModeSchema,
  type CandidateProfileInput,
  type CandidateExperienceInput,
  type CandidateEducationInput,
  type CandidateProjectInput,
  type CandidateCertificationInput,
  type CandidateAssignmentInput,
  type CandidateVerificationInput,
  type CandidateStatusTransitionInput,
  type CandidateDocumentUploadInput,
  type CandidateDocumentUploadSelfInput,
  type UpdateCandidateAuthorizationModeInput,
} from "@/lib/validation/candidate.schemas";
import {
  generateCandidateDocumentPath,
  isCanonicalCandidateDocumentPath,
  verifyCandidateDocumentStorageExists,
  createSignedUploadUrl,
  createSignedDownloadUrl,
  deleteCandidateDocumentStorage,
} from "@/lib/storage";
import { CandidateStatus, Role, ApplicationAuthorizationMode, AuditAction } from "@/generated/prisma";
import { AuthorizationError, InvalidStateTransitionError, NotFoundError, ValidationError } from "@/lib/errors";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

function revalidateCandidateViews() {
  try {
    revalidatePath("/candidate", "layout");
    revalidatePath("/employee", "layout");
    revalidatePath("/admin", "layout");
  } catch {
    // Safe fallback when executed outside Next.js request context
  }
}

// Valid lifecycle transition graph locked by human decision
const ALLOWED_TRANSITIONS: Record<CandidateStatus, CandidateStatus[]> = {
  ONBOARDING: [CandidateStatus.ACTIVE, CandidateStatus.INACTIVE],
  ACTIVE: [CandidateStatus.INACTIVE, CandidateStatus.ARCHIVED],
  INACTIVE: [CandidateStatus.ACTIVE, CandidateStatus.ARCHIVED],
  ARCHIVED: [], // Terminal
};

/**
 * Initializes or fetches the Candidate operational record for the authenticated user.
 */
export async function getOrCreateCandidateSelfAction(): Promise<ActionResult<{ candidateId: string; status: CandidateStatus }>> {
  const ctx = await getAuthenticatedContext();

  const candidate = await withRlsContext(ctx.userId, async (tx) => {
    let cand = await tx.candidate.findUnique({
      where: { userId: ctx.userId },
    });

    if (!cand) {
      cand = await tx.candidate.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          status: "ONBOARDING",
          verificationStatus: "UNVERIFIED",
        },
      });

      await logUserAuditEvent({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: "CANDIDATE_CREATED",
        entityType: "Candidate",
        entityId: cand.id,
      });
    }

    return cand;
  });

  return {
    success: true,
    data: {
      candidateId: candidate.id,
      status: candidate.status,
    },
  };
}

/**
 * Updates the candidate's canonical career profile details (Self-service).
 */
export async function updateCandidateProfileSelfAction(
  input: CandidateProfileInput
): Promise<ActionResult<{ candidateId: string }>> {
  const parsed = CandidateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const ctx = await getAuthenticatedContext();

  try {
    const candidate = await withRlsContext(ctx.userId, async (tx) => {
      const existing = await tx.candidate.findUnique({
        where: { userId: ctx.userId },
      });

      if (!existing) {
        throw new NotFoundError("Candidate profile not found");
      }

      if (existing.status !== "ONBOARDING" && existing.status !== "ACTIVE") {
        throw new AuthorizationError("Cannot update profile while account is inactive or archived");
      }

      const updated = await tx.candidate.update({
        where: { id: existing.id },
        data: {
          phone: parsed.data.phone,
          city: parsed.data.city,
          state: parsed.data.state,
          country: parsed.data.country,
          postalCode: parsed.data.postalCode,
          timezone: parsed.data.timezone,
          linkedinUrl: parsed.data.linkedinUrl || null,
          githubUrl: parsed.data.githubUrl || null,
          portfolioUrl: parsed.data.portfolioUrl || null,
          headline: parsed.data.headline,
          professionalSummary: parsed.data.professionalSummary,
          totalYearsExperience: parsed.data.totalYearsExperience !== undefined && parsed.data.totalYearsExperience !== null ? parsed.data.totalYearsExperience : null,
          workAuthorization: parsed.data.workAuthorization,
          requiresSponsorship: parsed.data.requiresSponsorship,
          visaDetails: parsed.data.visaDetails,
          targetRoles: parsed.data.targetRoles,
          targetLocations: parsed.data.targetLocations,
          remotePreference: parsed.data.remotePreference,
          desiredSalaryMin: parsed.data.desiredSalaryMin,
          desiredSalaryMax: parsed.data.desiredSalaryMax,
          salaryCurrency: parsed.data.salaryCurrency,
          ...(parsed.data.applicationAuthorizationMode ? { applicationAuthorizationMode: parsed.data.applicationAuthorizationMode } : {}),
        },
      });

      return updated;
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "CANDIDATE_PROFILE_UPDATED",
      entityType: "Candidate",
      entityId: candidate.id,
    });

    revalidateCandidateViews();
    return { success: true, data: { candidateId: candidate.id } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update candidate profile" };
  }
}

/**
 * Upserts a work experience entry for the authenticated candidate.
 */
export async function upsertCandidateExperienceAction(
  input: CandidateExperienceInput
): Promise<ActionResult<{ experienceId: string }>> {
  const parsed = CandidateExperienceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const ctx = await getAuthenticatedContext();

  try {
    const experience = await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { userId: ctx.userId },
      });

      if (!candidate) {
        throw new NotFoundError("Candidate profile not found");
      }

      if (parsed.data.id) {
        return tx.candidateExperience.update({
          where: { id: parsed.data.id, candidateId: candidate.id },
          data: {
            companyName: parsed.data.companyName,
            jobTitle: parsed.data.jobTitle,
            location: parsed.data.location,
            isCurrent: parsed.data.isCurrent,
            startDate: new Date(parsed.data.startDate),
            endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
            description: parsed.data.description,
            achievements: parsed.data.achievements,
            technologies: parsed.data.technologies,
            orderIndex: parsed.data.orderIndex,
          },
        });
      }

      return tx.candidateExperience.create({
        data: {
          candidateId: candidate.id,
          companyName: parsed.data.companyName,
          jobTitle: parsed.data.jobTitle,
          location: parsed.data.location,
          isCurrent: parsed.data.isCurrent,
          startDate: new Date(parsed.data.startDate),
          endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
          description: parsed.data.description,
          achievements: parsed.data.achievements,
          technologies: parsed.data.technologies,
          orderIndex: parsed.data.orderIndex,
        },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "CANDIDATE_EXPERIENCE_UPDATED",
      entityType: "CandidateExperience",
      entityId: experience.id,
    });

    revalidateCandidateViews();
    return { success: true, data: { experienceId: experience.id } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update work experience" };
  }
}

/**
 * Deletes a work experience entry for the authenticated candidate.
 */
export async function deleteCandidateExperienceAction(
  experienceId: string
): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();

  try {
    await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { userId: ctx.userId },
      });
      if (!candidate) throw new NotFoundError("Candidate not found");

      await tx.candidateExperience.delete({
        where: { id: experienceId, candidateId: candidate.id },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "CANDIDATE_EXPERIENCE_UPDATED",
      entityType: "CandidateExperience",
      entityId: experienceId,
      details: { deleted: true },
    });

    revalidateCandidateViews();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete experience" };
  }
}

/**
 * Upserts an education entry for the authenticated candidate.
 */
export async function upsertCandidateEducationAction(
  input: CandidateEducationInput
): Promise<ActionResult<{ educationId: string }>> {
  const parsed = CandidateEducationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const ctx = await getAuthenticatedContext();

  try {
    const education = await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { userId: ctx.userId },
      });
      if (!candidate) throw new NotFoundError("Candidate profile not found");

      if (parsed.data.id) {
        return tx.candidateEducation.update({
          where: { id: parsed.data.id, candidateId: candidate.id },
          data: {
            institution: parsed.data.institution,
            degree: parsed.data.degree,
            fieldOfStudy: parsed.data.fieldOfStudy,
            startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
            endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
            graduationYear: parsed.data.graduationYear,
            gpa: parsed.data.gpa,
            honors: parsed.data.honors,
            orderIndex: parsed.data.orderIndex,
          },
        });
      }

      return tx.candidateEducation.create({
        data: {
          candidateId: candidate.id,
          institution: parsed.data.institution,
          degree: parsed.data.degree,
          fieldOfStudy: parsed.data.fieldOfStudy,
          startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
          endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
          graduationYear: parsed.data.graduationYear,
          gpa: parsed.data.gpa,
          honors: parsed.data.honors,
          orderIndex: parsed.data.orderIndex,
        },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "CANDIDATE_EDUCATION_UPDATED",
      entityType: "CandidateEducation",
      entityId: education.id,
    });

    revalidateCandidateViews();
    return { success: true, data: { educationId: education.id } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update education" };
  }
}

/**
 * Deletes an education entry for the authenticated candidate.
 */
export async function deleteCandidateEducationAction(
  educationId: string
): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();

  try {
    await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { userId: ctx.userId },
      });
      if (!candidate) throw new NotFoundError("Candidate not found");

      await tx.candidateEducation.delete({
        where: { id: educationId, candidateId: candidate.id },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "CANDIDATE_EDUCATION_UPDATED",
      entityType: "CandidateEducation",
      entityId: educationId,
      details: { deleted: true },
    });

    revalidateCandidateViews();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete education" };
  }
}

/**
 * Syncs candidate-provided skills (Locked minimal model: name only).
 */
export async function syncCandidateSkillsAction(
  skillNames: string[]
): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();

  const cleanedNames = Array.from(
    new Set(
      skillNames
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= 100)
    )
  );

  try {
    await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { userId: ctx.userId },
      });
      if (!candidate) throw new NotFoundError("Candidate profile not found");

      // Delete existing skills
      await tx.candidateSkill.deleteMany({
        where: { candidateId: candidate.id },
      });

      // Insert new skills
      if (cleanedNames.length > 0) {
        await tx.candidateSkill.createMany({
          data: cleanedNames.map((name) => ({
            candidateId: candidate.id,
            name,
          })),
        });
      }
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "CANDIDATE_SKILLS_UPDATED",
      entityType: "CandidateSkill",
      details: { count: cleanedNames.length },
    });

    revalidateCandidateViews();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update skills" };
  }
}

/**
 * Upserts a candidate project entry.
 */
export async function upsertCandidateProjectAction(
  input: CandidateProjectInput
): Promise<ActionResult<{ projectId: string }>> {
  const parsed = CandidateProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const ctx = await getAuthenticatedContext();

  try {
    const project = await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { userId: ctx.userId },
      });
      if (!candidate) throw new NotFoundError("Candidate profile not found");

      if (parsed.data.id) {
        return tx.candidateProject.update({
          where: { id: parsed.data.id, candidateId: candidate.id },
          data: {
            title: parsed.data.title,
            role: parsed.data.role,
            url: parsed.data.url || null,
            description: parsed.data.description,
            highlights: parsed.data.highlights,
            technologies: parsed.data.technologies,
            startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
            endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
            orderIndex: parsed.data.orderIndex,
          },
        });
      }

      return tx.candidateProject.create({
        data: {
          candidateId: candidate.id,
          title: parsed.data.title,
          role: parsed.data.role,
          url: parsed.data.url || null,
          description: parsed.data.description,
          highlights: parsed.data.highlights,
          technologies: parsed.data.technologies,
          startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
          endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
          orderIndex: parsed.data.orderIndex,
        },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "CANDIDATE_PROFILE_UPDATED",
      entityType: "CandidateProject",
      entityId: project.id,
    });

    revalidateCandidateViews();
    return { success: true, data: { projectId: project.id } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update project" };
  }
}

/**
 * Deletes a candidate project.
 */
export async function deleteCandidateProjectAction(
  projectId: string
): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();

  try {
    await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { userId: ctx.userId },
      });
      if (!candidate) throw new NotFoundError("Candidate not found");

      await tx.candidateProject.delete({
        where: { id: projectId, candidateId: candidate.id },
      });
    });

    revalidateCandidateViews();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete project" };
  }
}

/**
 * Upserts a certification entry.
 */
export async function upsertCandidateCertificationAction(
  input: CandidateCertificationInput
): Promise<ActionResult<{ certificationId: string }>> {
  const parsed = CandidateCertificationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const ctx = await getAuthenticatedContext();

  try {
    const cert = await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { userId: ctx.userId },
      });
      if (!candidate) throw new NotFoundError("Candidate profile not found");

      if (parsed.data.id) {
        return tx.candidateCertification.update({
          where: { id: parsed.data.id, candidateId: candidate.id },
          data: {
            name: parsed.data.name,
            issuingAuthority: parsed.data.issuingAuthority,
            credentialId: parsed.data.credentialId,
            credentialUrl: parsed.data.credentialUrl || null,
            issueDate: parsed.data.issueDate ? new Date(parsed.data.issueDate) : null,
            expirationDate: parsed.data.expirationDate ? new Date(parsed.data.expirationDate) : null,
            doesNotExpire: parsed.data.doesNotExpire,
          },
        });
      }

      return tx.candidateCertification.create({
        data: {
          candidateId: candidate.id,
          name: parsed.data.name,
          issuingAuthority: parsed.data.issuingAuthority,
          credentialId: parsed.data.credentialId,
          credentialUrl: parsed.data.credentialUrl || null,
          issueDate: parsed.data.issueDate ? new Date(parsed.data.issueDate) : null,
          expirationDate: parsed.data.expirationDate ? new Date(parsed.data.expirationDate) : null,
          doesNotExpire: parsed.data.doesNotExpire,
        },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "CANDIDATE_PROFILE_UPDATED",
      entityType: "CandidateCertification",
      entityId: cert.id,
    });

    revalidateCandidateViews();
    return { success: true, data: { certificationId: cert.id } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update certification" };
  }
}

/**
 * Deletes a certification.
 */
export async function deleteCandidateCertificationAction(
  certificationId: string
): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();

  try {
    await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { userId: ctx.userId },
      });
      if (!candidate) throw new NotFoundError("Candidate not found");

      await tx.candidateCertification.delete({
        where: { id: certificationId, candidateId: candidate.id },
      });
    });

    revalidateCandidateViews();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete certification" };
  }
}

/**
 * Manually assigns/reassigns a candidate to an employee (Employee / Admin operation).
 * Assignment is purely an operational ownership/workload tag and NOT an authorization boundary.
 */
export async function assignCandidateAction(
  input: CandidateAssignmentInput
): Promise<ActionResult> {
  const parsed = CandidateAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { id: parsed.data.candidateId, organizationId: ctx.organizationId },
      });
      if (!candidate) throw new NotFoundError("Candidate not found in organization");

      if (parsed.data.employeeId) {
        const targetEmployee = await tx.membership.findFirst({
          where: {
            userId: parsed.data.employeeId,
            organizationId: ctx.organizationId,
            role: { in: [Role.EMPLOYEE, Role.ADMIN] },
            status: "ACTIVE",
          },
        });
        if (!targetEmployee) {
          throw new ValidationError("Target user is not an active staff member in this organization");
        }
      }

      await tx.candidate.update({
        where: { id: candidate.id },
        data: { assignedEmployeeId: parsed.data.employeeId },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "CANDIDATE_ASSIGNED",
      entityType: "Candidate",
      entityId: parsed.data.candidateId,
      details: { assignedEmployeeId: parsed.data.employeeId },
    });

    revalidateCandidateViews();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to assign candidate" };
  }
}

/**
 * Updates verification status and notes for a candidate profile (Employee / Admin operation).
 */
export async function verifyCandidateAction(
  input: CandidateVerificationInput
): Promise<ActionResult> {
  const parsed = CandidateVerificationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { id: parsed.data.candidateId, organizationId: ctx.organizationId },
      });
      if (!candidate) throw new NotFoundError("Candidate not found in organization");

      await tx.candidate.update({
        where: { id: candidate.id },
        data: {
          verificationStatus: parsed.data.verificationStatus,
          verifiedAt: new Date(),
          verifiedBy: ctx.userId,
          verificationNotes: parsed.data.verificationNotes,
        },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "CANDIDATE_VERIFIED",
      entityType: "Candidate",
      entityId: parsed.data.candidateId,
      details: {
        verificationStatus: parsed.data.verificationStatus,
        notes: parsed.data.verificationNotes,
      },
    });

    revalidateCandidateViews();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to verify candidate" };
  }
}

/**
 * Transitions candidate lifecycle status according to the locked state machine:
 * ONBOARDING -> ACTIVE, ACTIVE -> INACTIVE, INACTIVE -> ACTIVE, ACTIVE -> ARCHIVED, INACTIVE -> ARCHIVED.
 * ARCHIVED is terminal.
 */
export async function updateCandidateStatusAction(
  input: CandidateStatusTransitionInput
): Promise<ActionResult> {
  const parsed = CandidateStatusTransitionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const ctx = await getAuthenticatedContext();

  try {
    await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { id: parsed.data.candidateId, organizationId: ctx.organizationId },
      });
      if (!candidate) throw new NotFoundError("Candidate not found in organization");

      // Authorization: Staff/Admin can execute all transitions; Candidate self can submit ONBOARDING -> ACTIVE
      if (ctx.role === "CANDIDATE") {
        if (candidate.userId !== ctx.userId || candidate.status !== "ONBOARDING" || parsed.data.targetStatus !== "ACTIVE") {
          throw new AuthorizationError("Candidates can only transition their own status from ONBOARDING to ACTIVE");
        }
      } else {
        requireEmployeeOrAdmin(ctx);
      }

      // Check allowed transition graph
      const allowedNext = ALLOWED_TRANSITIONS[candidate.status];
      if (!allowedNext.includes(parsed.data.targetStatus)) {
        throw new InvalidStateTransitionError(
          `Invalid candidate lifecycle transition: cannot transition from ${candidate.status} to ${parsed.data.targetStatus}`
        );
      }

      await tx.candidate.update({
        where: { id: candidate.id },
        data: { status: parsed.data.targetStatus },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "CANDIDATE_STATUS_CHANGED",
      entityType: "Candidate",
      entityId: parsed.data.candidateId,
      details: { targetStatus: parsed.data.targetStatus },
    });

    revalidateCandidateViews();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to transition candidate status" };
  }
}

/**
 * Requests a short-lived signed upload URL for candidate self-service document uploads.
 * Derives candidate identity authoritatively from authenticated session and returns a server-bound documentId.
 */
export async function requestCandidateDocumentUploadUrlSelfAction(params: {
  filename: string;
}): Promise<ActionResult<{ signedUrl: string; storagePath: string; documentId: string; filename: string }>> {
  const ctx = await getAuthenticatedContext();

  try {
    const candidate = await withRlsContext(ctx.userId, async (tx) => {
      const cand = await tx.candidate.findUnique({
        where: { userId: ctx.userId },
      });
      if (!cand) throw new NotFoundError("Candidate profile not found");
      return cand;
    });

    const docId = crypto.randomUUID();
    const storagePath = generateCandidateDocumentPath(
      ctx.organizationId,
      candidate.id,
      docId,
      1,
      params.filename
    );

    const uploadPayload = await createSignedUploadUrl(storagePath);
    if (!uploadPayload) {
      return { success: false, error: "Unable to prepare secure upload. Please try again." };
    }

    return {
      success: true,
      data: {
        signedUrl: uploadPayload.signedUrl,
        storagePath: uploadPayload.path,
        documentId: docId,
        filename: params.filename,
      },
    };
  } catch (err: any) {
    return { success: false, error: "Unable to prepare secure upload. Please try again." };
  }
}

/**
 * Registers metadata in PostgreSQL for a candidate self-service uploaded document.
 * Authoritatively derives candidate and canonical storage path from authenticated session.
 * Verifies storage object presence before DB row creation.
 */
export async function registerCandidateDocumentSelfAction(
  input: CandidateDocumentUploadSelfInput
): Promise<ActionResult<{ document: any }>> {
  const parsed = CandidateDocumentUploadSelfSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const ctx = await getAuthenticatedContext();

  try {
    const candidate = await withRlsContext(ctx.userId, async (tx) => {
      const cand = await tx.candidate.findUnique({
        where: { userId: ctx.userId },
      });
      if (!cand) throw new NotFoundError("Candidate profile not found");
      return cand;
    });

    // 1. Authoritatively derive the canonical storage path on the server
    const canonicalStoragePath = generateCandidateDocumentPath(
      ctx.organizationId,
      candidate.id,
      parsed.data.documentId,
      1,
      parsed.data.filename
    );

    // 2. Verify that the storage object actually exists at the canonical path
    const objectExists = await verifyCandidateDocumentStorageExists(canonicalStoragePath);
    if (!objectExists) {
      return {
        success: false,
        error: "Upload could not be verified. Please try uploading the document again.",
      };
    }

    // 3. Persist CandidateDocument with idempotency and atomic default resume handling
    const doc = await withRlsContext(ctx.userId, async (tx) => {
      // Idempotency: return existing record if already created for this documentId
      const existing = await tx.candidateDocument.findUnique({
        where: { id: parsed.data.documentId },
      });
      if (existing) {
        if (existing.candidateId !== candidate.id) {
          throw new AuthorizationError("Document ID conflict across candidate boundaries");
        }
        return existing;
      }

      if (parsed.data.isDefault && parsed.data.documentType === "RESUME") {
        await tx.candidateDocument.updateMany({
          where: { candidateId: candidate.id, documentType: "RESUME" },
          data: { isDefault: false },
        });
      }

      return tx.candidateDocument.create({
        data: {
          id: parsed.data.documentId,
          candidateId: candidate.id,
          documentType: parsed.data.documentType,
          title: parsed.data.title,
          storagePath: canonicalStoragePath, // Strictly use server-derived canonical path
          fileSizeBytes: parsed.data.fileSizeBytes,
          mimeType: parsed.data.mimeType,
          isDefault: parsed.data.isDefault,
          uploadedBy: ctx.userId,
        },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "CANDIDATE_DOCUMENT_UPLOADED",
      entityType: "CandidateDocument",
      entityId: doc.id,
      details: {
        documentType: doc.documentType,
        title: doc.title,
        fileSizeBytes: doc.fileSizeBytes,
        storagePath: canonicalStoragePath,
      },
    });

    revalidateCandidateViews();
    return {
      success: true,
      data: {
        document: {
          id: doc.id,
          candidateId: doc.candidateId,
          documentType: doc.documentType,
          title: doc.title,
          storagePath: doc.storagePath,
          fileSizeBytes: doc.fileSizeBytes,
          mimeType: doc.mimeType,
          versionNumber: doc.versionNumber,
          isDefault: doc.isDefault,
          createdAt: doc.createdAt.toISOString(),
          updatedAt: doc.updatedAt.toISOString(),
        },
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to register document" };
  }
}

/**
 * Requests a short-lived signed upload URL for Supabase Storage to upload a candidate document.
 */
export async function requestDocumentUploadUrlAction(params: {
  candidateId: string;
  filename: string;
}): Promise<ActionResult<{ signedUrl: string; storagePath: string }>> {
  const ctx = await getAuthenticatedContext();

  try {
    const candidate = await withRlsContext(ctx.userId, async (tx) => {
      const cand = await tx.candidate.findUnique({
        where: { id: params.candidateId, organizationId: ctx.organizationId },
      });
      if (!cand) throw new NotFoundError("Candidate not found");
      if (ctx.role === "CANDIDATE" && cand.userId !== ctx.userId) {
        throw new AuthorizationError("Cannot upload documents to another candidate's profile");
      }
      return cand;
    });

    const docId = crypto.randomUUID();
    const storagePath = generateCandidateDocumentPath(
      ctx.organizationId,
      candidate.id,
      docId,
      1,
      params.filename
    );

    const uploadPayload = await createSignedUploadUrl(storagePath);
    if (!uploadPayload) {
      return { success: false, error: "Failed to create storage upload URL" };
    }

    return {
      success: true,
      data: {
        signedUrl: uploadPayload.signedUrl,
        storagePath: uploadPayload.path,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to request upload URL" };
  }
}

/**
 * Registers metadata in PostgreSQL for an uploaded candidate document.
 */
export async function registerCandidateDocumentAction(
  input: CandidateDocumentUploadInput
): Promise<ActionResult<{ documentId: string }>> {
  const parsed = CandidateDocumentUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const ctx = await getAuthenticatedContext();

  try {
    const doc = await withRlsContext(ctx.userId, async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { id: parsed.data.candidateId, organizationId: ctx.organizationId },
      });
      if (!candidate) throw new NotFoundError("Candidate not found");

      if (ctx.role === "CANDIDATE" && candidate.userId !== ctx.userId) {
        throw new AuthorizationError("Unauthorized document registration");
      }

      if (parsed.data.isDefault) {
        await tx.candidateDocument.updateMany({
          where: { candidateId: candidate.id, documentType: parsed.data.documentType },
          data: { isDefault: false },
        });
      }

      // Extract documentId if storagePath matches canonical UUID pattern
      const match = parsed.data.storagePath.match(/\/documents\/([0-9a-fA-F-]{36})-v/);
      const embeddedDocId = match ? match[1] : undefined;

      return tx.candidateDocument.create({
        data: {
          ...(embeddedDocId ? { id: embeddedDocId } : {}),
          candidateId: candidate.id,
          documentType: parsed.data.documentType,
          title: parsed.data.title,
          storagePath: parsed.data.storagePath,
          fileSizeBytes: parsed.data.fileSizeBytes,
          mimeType: parsed.data.mimeType,
          isDefault: parsed.data.isDefault,
          uploadedBy: ctx.userId,
        },
      });
    });

    try {
      await logUserAuditEvent({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.CANDIDATE_DOCUMENT_UPLOADED,
        entityType: "CandidateDocument",
        entityId: doc.id,
        details: { documentType: doc.documentType, title: doc.title },
      });
    } catch {
      // Non-fatal for registration outcome
    }

    revalidateCandidateViews();
    return { success: true, data: { documentId: doc.id } };
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return { success: false, error: "You don't have permission to register this document." };
    }
    if (err instanceof NotFoundError) {
      return { success: false, error: "Candidate not found." };
    }
    return { success: false, error: "Failed to register candidate document metadata." };
  }
}

/**
 * Generates a short-lived signed download URL for an authorized candidate document.
 * Validates candidate ownership and canonical storage path invariant.
 */
export async function getDocumentDownloadUrlAction(
  documentId: string
): Promise<ActionResult<{ downloadUrl: string }>> {
  const ctx = await getAuthenticatedContext();

  try {
    const doc = await withRlsContext(ctx.userId, async (tx) => {
      const document = await tx.candidateDocument.findUnique({
        where: { id: documentId },
        include: { candidate: true },
      });
      if (!document || document.candidate.organizationId !== ctx.organizationId) {
        throw new NotFoundError("Document not found");
      }
      if (ctx.role === "CANDIDATE" && document.candidate.userId !== ctx.userId) {
        throw new AuthorizationError("Unauthorized document access");
      }

      // Authoritative canonical storage path invariant check
      const isCanonical = isCanonicalCandidateDocumentPath(
        document.storagePath,
        ctx.organizationId,
        document.candidateId,
        document.id
      );

      if (!isCanonical) {
        try {
          await logUserAuditEvent({
            userId: ctx.userId,
            organizationId: ctx.organizationId,
            action: AuditAction.SECURITY_ALERT_INVALID_STORAGE_PATH,
            entityType: "CandidateDocument",
            entityId: document.id,
            details: {
              storagePath: document.storagePath,
              expectedCandidateId: document.candidateId,
            },
          });
        } catch {
          // Audit logging failure must never convert denial into success
        }
        throw new AuthorizationError("Invalid document storage path invariant");
      }

      return document;
    });

    const downloadUrl = await createSignedDownloadUrl(doc.storagePath, 60);
    if (!downloadUrl) {
      return { success: false, error: "Failed to generate download URL" };
    }

    return { success: true, data: { downloadUrl } };
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return { success: false, error: err.message };
    }
    if (err instanceof NotFoundError) {
      return { success: false, error: "Document not found" };
    }
    return { success: false, error: "Failed to retrieve document URL" };
  }
}

/**
 * Generates a short-lived signed URL for in-browser document preview.
 * Returns document metadata needed by the viewer (title, mimeType, fileSizeBytes).
 * Validates candidate ownership, canonical storage path, and storage object existence.
 * Logs CANDIDATE_DOCUMENT_VIEWED audit event on success.
 */
export async function getCandidateDocumentViewUrlAction(
  documentId: string
): Promise<ActionResult<{ viewUrl: string; title: string; mimeType: string; fileSizeBytes: number }>> {
  const ctx = await getAuthenticatedContext();

  try {
    const doc = await withRlsContext(ctx.userId, async (tx) => {
      const document = await tx.candidateDocument.findUnique({
        where: { id: documentId },
        include: { candidate: true },
      });
      if (!document || document.candidate.organizationId !== ctx.organizationId) {
        throw new NotFoundError("Document not found");
      }
      if (ctx.role === "CANDIDATE" && document.candidate.userId !== ctx.userId) {
        throw new AuthorizationError("You don't have permission to view this document.");
      }

      // Authoritative canonical storage path invariant check
      const isCanonical = isCanonicalCandidateDocumentPath(
        document.storagePath,
        ctx.organizationId,
        document.candidateId,
        document.id
      );

      if (!isCanonical) {
        try {
          await logUserAuditEvent({
            userId: ctx.userId,
            organizationId: ctx.organizationId,
            action: AuditAction.SECURITY_ALERT_INVALID_STORAGE_PATH,
            entityType: "CandidateDocument",
            entityId: document.id,
            details: {
              storagePath: document.storagePath,
              expectedCandidateId: document.candidateId,
            },
          });
        } catch {
          // Audit failure must never convert denial into success
        }
        throw new AuthorizationError("Invalid document storage path invariant");
      }

      return document;
    });

    // Verify storage object still exists before generating signed URL
    const objectExists = await verifyCandidateDocumentStorageExists(doc.storagePath);
    if (!objectExists) {
      return { success: false, error: "Document is currently unavailable." };
    }

    // Generate short-lived signed URL for preview (120 seconds for viewing)
    const viewUrl = await createSignedDownloadUrl(doc.storagePath, 120);
    if (!viewUrl) {
      return { success: false, error: "Unable to prepare document preview. Please try again." };
    }

    // Log document viewed audit event
    try {
      await logUserAuditEvent({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.CANDIDATE_DOCUMENT_VIEWED,
        entityType: "CandidateDocument",
        entityId: doc.id,
        details: {
          candidateId: doc.candidateId,
          documentType: doc.documentType,
          title: doc.title,
        },
      });
    } catch {
      // Non-fatal for preview URL presentation
    }

    return {
      success: true,
      data: {
        viewUrl,
        title: doc.title,
        mimeType: doc.mimeType,
        fileSizeBytes: doc.fileSizeBytes,
      },
    };
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return { success: false, error: err.message };
    }
    if (err instanceof NotFoundError) {
      return { success: false, error: "Document not found" };
    }
    return { success: false, error: "Unable to prepare document preview. Please try again." };
  }
}

/**
 * Deletes a candidate document record and its Supabase storage object.
 * Validates candidate ownership and canonical storage path invariant.
 */
export async function deleteCandidateDocumentAction(
  documentId: string
): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();

  try {
    let storagePathToDelete: string | null = null;

    await withRlsContext(ctx.userId, async (tx) => {
      const document = await tx.candidateDocument.findUnique({
        where: { id: documentId },
        include: { candidate: true },
      });
      if (!document || document.candidate.organizationId !== ctx.organizationId) {
        throw new NotFoundError("Document not found");
      }
      if (ctx.role === "CANDIDATE" && document.candidate.userId !== ctx.userId) {
        throw new AuthorizationError("Unauthorized document deletion");
      }

      // Authoritative canonical storage path invariant check
      const isCanonical = isCanonicalCandidateDocumentPath(
        document.storagePath,
        ctx.organizationId,
        document.candidateId,
        document.id
      );

      if (!isCanonical) {
        try {
          await logUserAuditEvent({
            userId: ctx.userId,
            organizationId: ctx.organizationId,
            action: AuditAction.SECURITY_ALERT_INVALID_STORAGE_PATH,
            entityType: "CandidateDocument",
            entityId: document.id,
            details: {
              storagePath: document.storagePath,
              expectedCandidateId: document.candidateId,
            },
          });
        } catch {
          // Audit failure must never convert denial into success
        }
        throw new AuthorizationError("Invalid document storage path invariant");
      }

      storagePathToDelete = document.storagePath;

      await tx.candidateDocument.delete({
        where: { id: documentId },
      });
    });

    // Delete binary from Supabase storage
    if (storagePathToDelete) {
      await deleteCandidateDocumentStorage(storagePathToDelete);
    }

    try {
      await logUserAuditEvent({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.CANDIDATE_DOCUMENT_DELETED,
        entityType: "CandidateDocument",
        entityId: documentId,
      });
    } catch {
      // Non-fatal for deletion outcome
    }

    revalidateCandidateViews();
    return { success: true };
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return { success: false, error: err.message };
    }
    if (err instanceof NotFoundError) {
      return { success: false, error: "Document not found" };
    }
    return { success: false, error: "Failed to delete document" };
  }
}

/**
 * Updates the candidate's application authorization mode (MANAGED <-> REVIEW_REQUIRED).
 * Callable by the candidate for self or by an Admin for a candidate within the organization.
 */
export async function updateCandidateAuthorizationModeAction(
  input: UpdateCandidateAuthorizationModeInput
): Promise<ActionResult<{ candidateId: string; authorizationMode: ApplicationAuthorizationMode }>> {
  const parsed = UpdateCandidateAuthorizationModeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const ctx = await getAuthenticatedContext();

  try {
    const result = await withRlsContext(ctx.userId, async (tx) => {
      let targetCandidate = null;

      if (parsed.data.candidateId) {
        targetCandidate = await tx.candidate.findUnique({
          where: { id: parsed.data.candidateId, organizationId: ctx.organizationId },
        });
        if (targetCandidate && targetCandidate.userId !== ctx.userId && ctx.role !== Role.ADMIN) {
          throw new AuthorizationError("Only administrators can update authorization mode for other candidates");
        }
      } else {
        targetCandidate = await tx.candidate.findUnique({
          where: { userId: ctx.userId },
        });
      }

      if (!targetCandidate) {
        throw new NotFoundError("Candidate profile not found");
      }

      const oldMode = targetCandidate.applicationAuthorizationMode;
      const newMode = parsed.data.authorizationMode as ApplicationAuthorizationMode;

      const updated = await tx.candidate.update({
        where: { id: targetCandidate.id },
        data: {
          applicationAuthorizationMode: newMode,
        },
      });

      return { candidate: updated, oldMode, newMode };
    });

    const action =
      result.newMode === "MANAGED" && result.oldMode !== "MANAGED"
        ? AuditAction.CANDIDATE_MANAGED_AUTHORIZATION_GRANTED
        : AuditAction.CANDIDATE_AUTHORIZATION_MODE_CHANGED;

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action,
      entityType: "Candidate",
      entityId: result.candidate.id,
      details: {
        fromMode: result.oldMode,
        toMode: result.newMode,
      },
    });

    revalidateCandidateViews();
    return {
      success: true,
      data: {
        candidateId: result.candidate.id,
        authorizationMode: result.candidate.applicationAuthorizationMode,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update authorization mode" };
  }
}

