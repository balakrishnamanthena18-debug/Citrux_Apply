/**
 * Gate 9/10 — authorized loader for Application Detail intelligence UI.
 * Same ownership / org boundaries as Application Detail pages.
 * Never recalculates scoring; projects persisted rows only.
 *
 * Gate 10: prefer loadCandidate / loadStaff entrypoints. Those re-verify
 * parent ownership/org before reading intelligence children so child IDs
 * cannot authorize access.
 */

import type { Prisma } from "@/generated/prisma";
import { buildApplicationIntelligenceViewModel } from "./presentation";
import type { ApplicationIntelligenceViewModel } from "./presentation";

type DbClient = Prisma.TransactionClient;

export type LoadApplicationIntelligenceResult =
  | { ok: true; view: ApplicationIntelligenceViewModel }
  | { ok: false; reason: "NOT_FOUND" | "FORBIDDEN" };

async function loadPersistedIntelligence(
  db: DbClient,
  applicationId: string,
  viewer: "CANDIDATE" | "STAFF"
): Promise<ApplicationIntelligenceViewModel> {
  const [alignment, readiness, latestRun] = await Promise.all([
    db.applicationAlignmentResult.findFirst({
      where: { applicationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        runId: true,
        freshness: true,
        scoringVersion: true,
        overallScore: true,
        evidence: true,
        run: {
          select: {
            id: true,
            status: true,
            analysisPurpose: true,
            requirementSetId: true,
            snapshotId: true,
            ...(viewer === "STAFF" ? { errorCode: true } : {}),
          },
        },
      },
    }),
    db.applicationReadinessResult.findFirst({
      where: { applicationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        runId: true,
        freshness: true,
        readinessState: true,
        blockers: true,
        warnings: true,
        nextActions: true,
        evidence: true,
        run: {
          select: {
            id: true,
            status: true,
            analysisPurpose: true,
            ...(viewer === "STAFF" ? { errorCode: true } : {}),
          },
        },
      },
    }),
    db.applicationIntelligenceRun.findFirst({
      where: { applicationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        analysisPurpose: true,
        freshness: true,
        ...(viewer === "STAFF" ? { errorCode: true } : {}),
      },
    }),
  ]);

  return buildApplicationIntelligenceViewModel({
    viewer,
    alignment: alignment
      ? {
          ...alignment,
          run: alignment.run
            ? {
                id: alignment.run.id,
                status: alignment.run.status,
                analysisPurpose: alignment.run.analysisPurpose,
                requirementSetId: alignment.run.requirementSetId,
                snapshotId: alignment.run.snapshotId,
                errorCode:
                  viewer === "STAFF" && "errorCode" in alignment.run
                    ? (alignment.run.errorCode as string | null)
                    : null,
              }
            : null,
        }
      : null,
    readiness: readiness
      ? {
          ...readiness,
          run: readiness.run
            ? {
                id: readiness.run.id,
                status: readiness.run.status,
                analysisPurpose: readiness.run.analysisPurpose,
                errorCode:
                  viewer === "STAFF" && "errorCode" in readiness.run
                    ? (readiness.run.errorCode as string | null)
                    : null,
              }
            : null,
        }
      : null,
    latestRun: latestRun
      ? {
          id: latestRun.id,
          status: latestRun.status,
          analysisPurpose: latestRun.analysisPurpose,
          freshness: latestRun.freshness,
          errorCode:
            viewer === "STAFF" && "errorCode" in latestRun
              ? (latestRun.errorCode as string | null)
              : null,
        }
      : null,
  });
}

/**
 * Candidate detail: must own the application (same as detail page).
 */
export async function loadCandidateApplicationIntelligence(params: {
  db: DbClient;
  applicationId: string;
  candidateId: string;
}): Promise<LoadApplicationIntelligenceResult> {
  const app = await params.db.application.findFirst({
    where: {
      id: params.applicationId,
      candidateId: params.candidateId,
    },
    select: { id: true },
  });
  if (!app) {
    return { ok: false, reason: "NOT_FOUND" };
  }
  const view = await loadPersistedIntelligence(
    params.db,
    params.applicationId,
    "CANDIDATE"
  );
  return { ok: true, view };
}

/**
 * Staff detail: application must belong to staff organization.
 */
export async function loadStaffApplicationIntelligence(params: {
  db: DbClient;
  applicationId: string;
  organizationId: string;
}): Promise<LoadApplicationIntelligenceResult> {
  const app = await params.db.application.findFirst({
    where: {
      id: params.applicationId,
      organizationId: params.organizationId,
    },
    select: { id: true },
  });
  if (!app) {
    return { ok: false, reason: "NOT_FOUND" };
  }
  const view = await loadPersistedIntelligence(
    params.db,
    params.applicationId,
    "STAFF"
  );
  return { ok: true, view };
}

/**
 * @deprecated Prefer loadCandidateApplicationIntelligence / loadStaffApplicationIntelligence.
 * Kept for internal use only after parent authorization is already proven in-process.
 * Gate 10: does not accept alignment/readiness/run result IDs as authorization inputs.
 */
export async function loadAuthorizedApplicationIntelligence(params: {
  db: DbClient;
  applicationId: string;
  viewer: "CANDIDATE" | "STAFF";
}): Promise<ApplicationIntelligenceViewModel> {
  return loadPersistedIntelligence(
    params.db,
    params.applicationId,
    params.viewer
  );
}
