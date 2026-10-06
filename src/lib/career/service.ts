/**
 * Phase 7C — Deterministic Candidate Career Intelligence Service
 * Authoritative service implementation of Phase 7B / 7B.1 Product Contract.
 */

import { createHash } from "crypto";
import { withRlsContext } from "@/lib/db/rls";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { Role } from "@/generated/prisma";
import { AuthorizationError, NotFoundError } from "@/lib/errors";
import type {
  CandidateCareerIntelligenceDTO,
  CareerSnapshotDTO,
  CareerDirectionDTO,
  OutcomesSummaryDTO,
  CareerIntelligenceFreshness,
} from "./types";
import { deriveCareerEvidenceGraph } from "./evidence";
import { deriveCareerStrengths } from "./strengths";
import { deriveCareerGaps } from "./gaps";
import { deriveCareerTimeline } from "./timeline";

/**
 * Computes a deterministic version hash representing the freshness of authoritative inputs.
 */
function computeCareerSourceDataVersion(parts: Array<string | number | null | undefined>): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    if (part != null) {
      hash.update(String(part));
      hash.update("|");
    }
  }
  return hash.digest("hex").slice(0, 32);
}

/**
 * Primary entry point: Generates a complete, deterministic, evidence-backed
 * Candidate Career Intelligence DTO.
 *
 * @param candidateId - UUID of the candidate
 * @param ctx - Authenticated caller context
 */
export async function getCandidateCareerIntelligence(
  candidateId: string,
  ctx: AuthenticatedContext
): Promise<CandidateCareerIntelligenceDTO> {
  if (!ctx || !ctx.userId || !ctx.organizationId) {
    throw new AuthorizationError("Authentication context is required");
  }

  return withRlsContext(ctx.userId, async (tx) => {
    // 1. Verify candidate exists within the caller's organization
    const candidate = await tx.candidate.findFirst({
      where: {
        id: candidateId,
        organizationId: ctx.organizationId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!candidate) {
      throw new NotFoundError("Candidate profile not found");
    }

    // 2. Enforce Role & Tenant Boundaries
    if (ctx.role === Role.CANDIDATE) {
      if (candidate.userId !== ctx.userId) {
        throw new AuthorizationError("Candidates may only access their own career intelligence");
      }
    } else if (ctx.role !== Role.EMPLOYEE && ctx.role !== Role.ADMIN) {
      throw new AuthorizationError("Unauthorized role for candidate career intelligence");
    }

    // 3. Parallel bounded reads of authoritative candidate models
    const [
      experiences,
      educations,
      skills,
      projects,
      certifications,
      attestations,
      extracts,
      outcomeEvents,
    ] = await Promise.all([
      tx.candidateExperience.findMany({
        where: { candidateId: candidate.id },
        orderBy: { orderIndex: "asc" },
      }),
      tx.candidateEducation.findMany({
        where: { candidateId: candidate.id },
        orderBy: { orderIndex: "asc" },
      }),
      tx.candidateSkill.findMany({
        where: { candidateId: candidate.id },
        orderBy: { createdAt: "asc" },
      }),
      tx.candidateProject.findMany({
        where: { candidateId: candidate.id },
        orderBy: { orderIndex: "asc" },
      }),
      tx.candidateCertification.findMany({
        where: { candidateId: candidate.id },
        orderBy: { createdAt: "asc" },
      }),
      tx.candidateFactAttestation.findMany({
        where: { candidateId: candidate.id, organizationId: ctx.organizationId },
        orderBy: { attestedAt: "desc" },
      }),
      // Advisory resume extracts: bounded selection (never leak raw extracted text in DTO)
      tx.candidateDocumentExtract.findMany({
        where: { candidateId: candidate.id, organizationId: ctx.organizationId },
        select: {
          id: true,
          candidateDocumentId: true,
          extractedText: true,
          parsedAt: true,
          updatedAt: true,
        },
        orderBy: { parsedAt: "desc" },
        take: 5,
      }),
      // Outcome events for context summary ONLY (never skill evidence)
      tx.applicationOutcomeEvent.findMany({
        where: {
          application: { candidateId: candidate.id },
          organizationId: ctx.organizationId,
          correctionState: "ACTIVE",
          ...(ctx.role === Role.CANDIDATE ? { candidateVisible: true } : {}),
        },
        select: {
          id: true,
          outcomeType: true,
          recordedAt: true,
          candidateVisible: true,
        },
        orderBy: { recordedAt: "desc" },
      }),
    ]);

    // 4. Compute Source Data Version (Freshness fingerprint)
    const versionParts = [
      candidate.id,
      candidate.updatedAt.toISOString(),
      candidate.headline,
      candidate.totalYearsExperience ? candidate.totalYearsExperience.toString() : "",
      ...experiences.map((e) => `${e.id}:${e.updatedAt.toISOString()}`),
      ...educations.map((ed) => `${ed.id}:${ed.updatedAt.toISOString()}`),
      ...skills.map((s) => `${s.id}:${s.updatedAt.toISOString()}`),
      ...projects.map((p) => `${p.id}:${p.updatedAt.toISOString()}`),
      ...certifications.map((c) => `${c.id}:${c.updatedAt.toISOString()}`),
      ...attestations.map((a) => `${a.id}:${a.updatedAt.toISOString()}`),
      ...extracts.map((ex) => `${ex.id}:${ex.updatedAt.toISOString()}`),
    ];
    const sourceDataVersion = computeCareerSourceDataVersion(versionParts);

    // 5. Derive Deterministic Evidence Graph & Strengths
    const { skills: derivedSkills, allEvidence } = deriveCareerEvidenceGraph({
      skills,
      experiences,
      projects,
      certifications,
      extracts,
      attestations: attestations.map((a) => ({
        id: a.id,
        entityType: a.entityType,
        entityId: a.entityId,
        field: a.field,
        provenance: a.provenance,
        attestedAt: a.attestedAt,
        note: a.note,
      })),
    });

    const strengths = deriveCareerStrengths(derivedSkills);

    // 6. Derive Gaps
    const hasPortfolioOrRepo = Boolean(
      candidate.portfolioUrl ||
        candidate.githubUrl ||
        projects.some((p) => Boolean(p.url))
    );

    const gaps = deriveCareerGaps({
      profile: {
        hasExperiences: experiences.length > 0,
        hasProjects: projects.length > 0,
        hasEducation: educations.length > 0,
        hasCertifications: certifications.length > 0,
        hasPortfolioOrRepo,
        targetRoles: candidate.targetRoles || [],
      },
      skills: derivedSkills,
    });

    // 7. Derive Chronological Timeline
    const timeline = deriveCareerTimeline({
      experiences,
      projects,
      education: educations,
      certifications,
    });

    // 8. Compose Outcomes Summary (Context only - strictly isolated from skills)
    const interviewRequestsCount = outcomeEvents.filter(
      (o) => o.outcomeType === "INTERVIEW_REQUESTED" || o.outcomeType === "INTERVIEW_SCHEDULED"
    ).length;
    const offersCount = outcomeEvents.filter((o) => o.outcomeType === "OFFER_RECEIVED").length;
    const employerDeclinesCount = outcomeEvents.filter(
      (o) => o.outcomeType === "EMPLOYER_REJECTION"
    ).length;

    const outcomesSummary: OutcomesSummaryDTO = {
      totalOutcomes: outcomeEvents.length,
      interviewRequestsCount,
      offersCount,
      employerDeclinesCount,
      recentOutcomes: outcomeEvents.slice(0, 10).map((o) => ({
        outcomeType: o.outcomeType,
        recordedAt: o.recordedAt.toISOString(),
        candidateVisible: o.candidateVisible,
      })),
    };

    // 9. Compose Career Snapshot & Direction
    const verifiedSkillsCount = derivedSkills.filter((s) => s.authorityLevel === "VERIFIED").length;
    const evidencedSkillsCount = derivedSkills.filter((s) => s.authorityLevel === "EVIDENCED").length;
    const selfDeclaredSkillsCount = derivedSkills.filter((s) => s.authorityLevel === "SELF_DECLARED").length;

    const careerSnapshot: CareerSnapshotDTO = {
      totalYearsExperience: candidate.totalYearsExperience
        ? Number(candidate.totalYearsExperience)
        : null,
      headline: candidate.headline,
      topStrengths: strengths.slice(0, 5).map((s) => s.skillName),
      verifiedSkillsCount,
      evidencedSkillsCount,
      selfDeclaredSkillsCount,
      totalEvidencedEntities: allEvidence.length,
    };

    const careerDirection: CareerDirectionDTO = {
      targetRoles: candidate.targetRoles || [],
      targetLocations: candidate.targetLocations || [],
      remotePreference: candidate.remotePreference,
      desiredSalaryMin: candidate.desiredSalaryMin,
      desiredSalaryMax: candidate.desiredSalaryMax,
      salaryCurrency: candidate.salaryCurrency,
    };

    const candidateFullName =
      candidate.user.firstName || candidate.user.lastName
        ? `${candidate.user.firstName || ""} ${candidate.user.lastName || ""}`.trim()
        : null;

    // 10. Assemble and Return Sanitized DTO (Zero raw extracted text or internal passwords)
    return {
      candidate: {
        id: candidate.id,
        fullName: candidateFullName,
        email: candidate.user.email,
        headline: candidate.headline,
        city: candidate.city,
        state: candidate.state,
        country: candidate.country,
        workAuthorization: candidate.workAuthorization,
        verificationStatus: candidate.verificationStatus,
      },
      careerSnapshot,
      skills: derivedSkills,
      experience: experiences.map((e) => ({
        id: e.id,
        companyName: e.companyName,
        jobTitle: e.jobTitle,
        startDate: e.startDate.toISOString().split("T")[0]!,
        endDate: e.endDate ? e.endDate.toISOString().split("T")[0]! : null,
        isCurrent: e.isCurrent,
        technologies: e.technologies || [],
        achievements: e.achievements || [],
      })),
      projects: projects.map((p) => ({
        id: p.id,
        title: p.title,
        role: p.role,
        url: p.url,
        technologies: p.technologies || [],
        highlights: p.highlights || [],
        startDate: p.startDate ? p.startDate.toISOString().split("T")[0]! : null,
        endDate: p.endDate ? p.endDate.toISOString().split("T")[0]! : null,
      })),
      education: educations.map((ed) => ({
        id: ed.id,
        institution: ed.institution,
        degree: ed.degree,
        fieldOfStudy: ed.fieldOfStudy,
        graduationYear: ed.graduationYear,
      })),
      certifications: certifications.map((c) => ({
        id: c.id,
        name: c.name,
        issuingAuthority: c.issuingAuthority,
        issueDate: c.issueDate ? c.issueDate.toISOString().split("T")[0]! : null,
        expirationDate: c.expirationDate ? c.expirationDate.toISOString().split("T")[0]! : null,
        doesNotExpire: c.doesNotExpire,
      })),
      evidence: allEvidence,
      strengths,
      gaps,
      timeline,
      careerDirection,
      outcomesSummary,
      freshness: {
        status: "FRESH" as CareerIntelligenceFreshness,
        sourceDataVersion,
        computedAt: new Date().toISOString(),
      },
    };
  });
}
