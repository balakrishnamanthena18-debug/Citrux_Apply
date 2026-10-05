import type { AuthenticatedContext } from "@/lib/auth/context";
import { AuthorizationError, NotFoundError, ValidationError } from "@/lib/errors";
import type { Job, JobVisibility, Prisma } from "@/generated/prisma";

/** Organization Job Catalog — reusable GLOBAL jobs only. */
export function catalogJobsWhere(organizationId: string): Prisma.JobWhereInput {
  return {
    organizationId,
    visibility: "GLOBAL",
  };
}

/** Desk / candidate-scoped job search: catalog GLOBAL + this candidate's private leads. */
export function deskJobsWhere(
  organizationId: string,
  candidateId: string
): Prisma.JobWhereInput {
  return {
    organizationId,
    status: "OPEN",
    OR: [
      { visibility: "GLOBAL" },
      { visibility: "CANDIDATE_PRIVATE", ownerCandidateId: candidateId },
    ],
  };
}

/** Private leads visible in the employee's authorized operational scope. */
export function privateLeadsWhere(
  organizationId: string,
  ctx: AuthenticatedContext
): Prisma.JobWhereInput {
  const base: Prisma.JobWhereInput = {
    organizationId,
    visibility: "CANDIDATE_PRIVATE",
  };
  if (ctx.role === "ADMIN") return base;
  return {
    ...base,
    OR: [
      { createdById: ctx.userId },
      { ownerCandidate: { assignedEmployeeId: ctx.userId } },
      { opportunities: { some: { discoveredById: ctx.userId } } },
      { applications: { some: { assignedEmployeeId: ctx.userId } } },
    ],
  };
}

export function assertJobUsableForCandidate(
  job: Pick<Job, "id" | "organizationId" | "status" | "visibility" | "ownerCandidateId">,
  organizationId: string,
  candidateId: string
): void {
  if (job.organizationId !== organizationId) {
    throw new NotFoundError("Job not found or unauthorized");
  }
  if (job.visibility === "CANDIDATE_PRIVATE" && job.ownerCandidateId !== candidateId) {
    throw new AuthorizationError(
      "This job lead is private to another candidate and cannot be used here"
    );
  }
}

export function assertCatalogJob(
  job: Pick<Job, "visibility">
): asserts job is { visibility: "GLOBAL" } {
  if (job.visibility !== "GLOBAL") {
    throw new AuthorizationError("Candidate-private jobs are excluded from the Job Catalog");
  }
}

export function requirePrivateOwnerConsistency(input: {
  visibility: JobVisibility;
  ownerCandidateId?: string | null;
}): void {
  if (input.visibility === "GLOBAL" && input.ownerCandidateId) {
    throw new ValidationError("Catalog jobs cannot own a candidate");
  }
  if (input.visibility === "CANDIDATE_PRIVATE" && !input.ownerCandidateId) {
    throw new ValidationError("Candidate-private jobs require an owner candidate");
  }
}
