import type { Role } from "@/generated/prisma";

/**
 * Security contract for intelligence objects.
 * Every record must carry organizationId + application/candidate/job FKs.
 */

export type IntelligenceScope = {
  organizationId: string;
  candidateId: string;
  applicationId: string;
  jobId: string;
};

/** Job-only intelligence (Gate 5 requirement extraction). */
export type JobIntelligenceScope = {
  organizationId: string;
  jobId: string;
};

export function assertIntelligenceScopeComplete(scope: IntelligenceScope): void {
  for (const [k, v] of Object.entries(scope)) {
    if (!v || typeof v !== "string") {
      throw new Error(`Intelligence scope missing ${k}`);
    }
  }
}

export function assertJobIntelligenceScopeComplete(
  scope: JobIntelligenceScope
): void {
  for (const [k, v] of Object.entries(scope)) {
    if (!v || typeof v !== "string") {
      throw new Error(`Job intelligence scope missing ${k}`);
    }
  }
}

/**
 * Candidate-visible intelligence: own application only.
 * Employee/TL/Manager/Admin: org-privileged via existing RLS helpers.
 */
export function canViewCandidateVisibleIntelligence(input: {
  role: Role;
  viewerUserId: string;
  candidateUserId: string;
  sameOrganization: boolean;
}): boolean {
  if (!input.sameOrganization) return false;
  if (input.role === "CANDIDATE") {
    return input.viewerUserId === input.candidateUserId;
  }
  // EMPLOYEE / ADMIN (org-privileged staff). Designation-level TL/Manager
  // scoping continues to follow existing membership/governance helpers at call sites.
  return input.role === "EMPLOYEE" || input.role === "ADMIN";
}

/**
 * AI context assembly must never load "all candidates" / "all jobs".
 * Only explicitly scoped, authorization-filtered records.
 */
export function buildScopedAiContextGuard(scope: IntelligenceScope): {
  allowedCandidateId: string;
  allowedApplicationId: string;
  allowedJobId: string;
  allowedOrganizationId: string;
  forbidUnscopedQueries: true;
} {
  assertIntelligenceScopeComplete(scope);
  return {
    allowedCandidateId: scope.candidateId,
    allowedApplicationId: scope.applicationId,
    allowedJobId: scope.jobId,
    allowedOrganizationId: scope.organizationId,
    forbidUnscopedQueries: true,
  };
}

export function rejectsCrossTenant(
  recordOrgId: string,
  viewerOrgId: string
): boolean {
  return recordOrgId !== viewerOrgId;
}

export function rejectsCrossCandidate(
  recordCandidateId: string,
  viewerCandidateId: string
): boolean {
  return recordCandidateId !== viewerCandidateId;
}

/**
 * Snapshot / requirement-set access (Gate 2).
 * Organization → Job → Snapshot → RequirementSet.
 * Private jobs: only owning candidate (or org-privileged staff) may read.
 */
export function canAccessJobSnapshot(input: {
  viewerOrganizationId: string;
  snapshotOrganizationId: string;
  role: Role;
  viewerUserId: string;
  viewerCandidateId?: string | null;
  jobVisibility: "GLOBAL" | "CANDIDATE_PRIVATE";
  jobOwnerCandidateId?: string | null;
  isOrgPrivilegedStaff: boolean;
}): boolean {
  if (input.viewerOrganizationId !== input.snapshotOrganizationId) {
    return false;
  }

  if (input.isOrgPrivilegedStaff) {
    return input.role === "EMPLOYEE" || input.role === "ADMIN";
  }

  if (input.role !== "CANDIDATE") return false;

  if (input.jobVisibility === "GLOBAL") {
    // Candidate may see snapshot only when they have an application/opportunity
    // on the job — call sites must additionally enforce that relationship.
    return Boolean(input.viewerCandidateId);
  }

  return (
    Boolean(input.viewerCandidateId) &&
    input.jobOwnerCandidateId === input.viewerCandidateId
  );
}

export function deniesPrivateJobSnapshotToOtherCandidate(input: {
  jobVisibility: "GLOBAL" | "CANDIDATE_PRIVATE";
  jobOwnerCandidateId?: string | null;
  viewerCandidateId: string;
}): boolean {
  return (
    input.jobVisibility === "CANDIDATE_PRIVATE" &&
    input.jobOwnerCandidateId !== input.viewerCandidateId
  );
}
