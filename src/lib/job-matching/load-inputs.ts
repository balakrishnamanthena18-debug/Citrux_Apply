import type { Prisma } from "@/generated/prisma";
import { AuthorizationError, NotFoundError } from "@/lib/errors";
import { assertJobUsableForCandidate } from "@/lib/job/visibility";
import type {
  MatchCandidateInput,
  MatchJobInput,
  MatchRequirementSetInput,
  MatchStructuredRequirement,
} from "./types";

type DbClient = Prisma.TransactionClient;

function toIsoDate(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseRequirements(raw: unknown): MatchStructuredRequirement[] {
  if (!Array.isArray(raw)) return [];
  const out: MatchStructuredRequirement[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string") continue;
    if (typeof r.category !== "string") continue;
    if (typeof r.rawValue !== "string") continue;
    if (typeof r.normalizedValue !== "string") continue;
    if (typeof r.importance !== "string") continue;
    out.push({
      id: r.id,
      category: r.category as MatchStructuredRequirement["category"],
      rawValue: r.rawValue,
      normalizedValue: r.normalizedValue,
      importance: r.importance as MatchStructuredRequirement["importance"],
    });
  }
  return out;
}

/**
 * Load authoritative matching inputs from the database.
 * Never trusts queued client payloads for evaluation.
 */
export async function loadAuthoritativeMatchInputs(
  tx: DbClient,
  input: {
    organizationId: string;
    candidateId: string;
    jobId: string;
  }
): Promise<{
  candidate: MatchCandidateInput;
  job: MatchJobInput;
  requirementSet: MatchRequirementSetInput;
  snapshotId: string | null;
  requirementSetId: string | null;
}> {
  const candidateRow = await tx.candidate.findFirst({
    where: {
      id: input.candidateId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      updatedAt: true,
      city: true,
      state: true,
      country: true,
      totalYearsExperience: true,
      workAuthorization: true,
      requiresSponsorship: true,
      remotePreference: true,
      targetLocations: true,
      targetRoles: true,
      desiredSalaryMin: true,
      desiredSalaryMax: true,
      salaryCurrency: true,
      skills: { select: { id: true, name: true } },
      experiences: {
        select: {
          id: true,
          jobTitle: true,
          companyName: true,
          technologies: true,
          startDate: true,
          endDate: true,
          isCurrent: true,
        },
        orderBy: { orderIndex: "asc" },
      },
      educations: {
        select: {
          id: true,
          degree: true,
          fieldOfStudy: true,
          institution: true,
        },
        orderBy: { orderIndex: "asc" },
      },
      certifications: {
        select: { id: true, name: true, issuingAuthority: true },
      },
      projects: {
        select: { id: true, technologies: true },
        orderBy: { orderIndex: "asc" },
      },
    },
  });
  if (!candidateRow) throw new NotFoundError("Candidate not found");

  const jobRow = await tx.job.findFirst({
    where: {
      id: input.jobId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      title: true,
      companyName: true,
      location: true,
      isRemote: true,
      employmentType: true,
      salaryMin: true,
      salaryMax: true,
      salaryCurrency: true,
      status: true,
      visibility: true,
      ownerCandidateId: true,
    },
  });
  if (!jobRow) throw new NotFoundError("Job not found");

  if (jobRow.organizationId !== candidateRow.organizationId) {
    throw new AuthorizationError("Cross-tenant match denied");
  }

  assertJobUsableForCandidate(
    jobRow,
    input.organizationId,
    candidateRow.id
  );

  const requirementSetRow = await tx.jobRequirementSet.findFirst({
    where: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      freshness: "CURRENT",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      snapshotId: true,
      schemaVersion: true,
      normalizationVersion: true,
      extractionVersion: true,
      freshness: true,
      requirements: true,
      snapshot: { select: { id: true, contentHash: true } },
    },
  });

  let requirementSet: MatchRequirementSetInput = null;
  let snapshotId: string | null = null;
  let requirementSetId: string | null = null;

  if (requirementSetRow) {
    requirementSetId = requirementSetRow.id;
    snapshotId = requirementSetRow.snapshotId;
    requirementSet = {
      requirementSetId: requirementSetRow.id,
      snapshotId: requirementSetRow.snapshotId,
      contentHash: requirementSetRow.snapshot.contentHash,
      schemaVersion: requirementSetRow.schemaVersion,
      normalizationVersion: requirementSetRow.normalizationVersion,
      extractionVersion: requirementSetRow.extractionVersion,
      freshness: requirementSetRow.freshness,
      requirements: parseRequirements(requirementSetRow.requirements),
    };
  } else {
    const snap = await tx.jobDescriptionSnapshot.findFirst({
      where: {
        organizationId: input.organizationId,
        jobId: input.jobId,
      },
      orderBy: { capturedAt: "desc" },
      select: { id: true },
    });
    snapshotId = snap?.id ?? null;
  }

  const years =
    candidateRow.totalYearsExperience == null
      ? null
      : Number(candidateRow.totalYearsExperience);

  const candidate: MatchCandidateInput = {
    candidateId: candidateRow.id,
    organizationId: candidateRow.organizationId,
    updatedAt: candidateRow.updatedAt.toISOString(),
    city: candidateRow.city,
    state: candidateRow.state,
    country: candidateRow.country,
    totalYearsExperience: Number.isFinite(years) ? years : null,
    workAuthorization: candidateRow.workAuthorization,
    requiresSponsorship: candidateRow.requiresSponsorship,
    remotePreference: candidateRow.remotePreference,
    targetLocations: [...candidateRow.targetLocations],
    targetRoles: [...candidateRow.targetRoles],
    desiredSalaryMin: candidateRow.desiredSalaryMin,
    desiredSalaryMax: candidateRow.desiredSalaryMax,
    salaryCurrency: candidateRow.salaryCurrency,
    skills: candidateRow.skills.map((s) => ({ id: s.id, name: s.name })),
    experiences: candidateRow.experiences.map((e) => ({
      id: e.id,
      jobTitle: e.jobTitle,
      companyName: e.companyName,
      technologies: [...e.technologies],
      startDate: toIsoDate(e.startDate) ?? "",
      endDate: toIsoDate(e.endDate),
      isCurrent: e.isCurrent,
    })),
    educations: candidateRow.educations.map((e) => ({
      id: e.id,
      degree: e.degree,
      fieldOfStudy: e.fieldOfStudy,
      institution: e.institution,
    })),
    certifications: candidateRow.certifications.map((c) => ({
      id: c.id,
      name: c.name,
      issuingAuthority: c.issuingAuthority,
    })),
    projects: candidateRow.projects.map((p) => ({
      id: p.id,
      technologies: [...p.technologies],
    })),
  };

  const job: MatchJobInput = {
    jobId: jobRow.id,
    organizationId: jobRow.organizationId,
    title: jobRow.title,
    companyName: jobRow.companyName,
    location: jobRow.location,
    isRemote: jobRow.isRemote,
    employmentType: jobRow.employmentType,
    salaryMin: jobRow.salaryMin,
    salaryMax: jobRow.salaryMax,
    salaryCurrency: jobRow.salaryCurrency,
    status: jobRow.status,
    visibility: jobRow.visibility,
    ownerCandidateId: jobRow.ownerCandidateId,
  };

  return {
    candidate,
    job,
    requirementSet,
    snapshotId,
    requirementSetId,
  };
}
