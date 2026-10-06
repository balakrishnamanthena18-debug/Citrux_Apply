/**
 * Phase 5G — Requested Application Intake Queue (server read model).
 *
 * Does NOT create Tasks, Notifications, Applications, or invoke matching/worker.
 * Eligibility is derived from existing Match + Opportunity + Application absence.
 */

import type { Prisma } from "@/generated/prisma";
import { ApplicationStatus } from "@/generated/prisma";
import { sanitizePaginationLimit } from "@/lib/utils/sanitization";
import {
  ACTIVE_APPLICATION_STATUSES_EXCLUDED_FROM_INTAKE,
  REQUESTED_INTAKE_DEFAULT_PAGE_SIZE,
  REQUESTED_INTAKE_MAX_PAGE_SIZE,
  type RequestedApplicationIntakeItem,
  type RequestedApplicationIntakePage,
  type RequestedApplicationIntakeQuery,
} from "./requested-intake-types";

const TERMINAL = [
  ...ACTIVE_APPLICATION_STATUSES_EXCLUDED_FROM_INTAKE,
] as ApplicationStatus[];

function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  const n = Number.parseInt(cursor, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function encodeCursor(offset: number): string {
  return String(offset);
}

const CATEGORY_LABELS: Record<string, string> = {
  STRONG_MATCH: "Strong match",
  GOOD_MATCH: "Good match",
  POSSIBLE_MATCH: "Possible match",
  NEEDS_REVIEW: "Needs review",
  LOW_MATCH: "Low match",
};

function candidateDisplayName(user: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  return name || user.email;
}

/**
 * Shared where-clause for pending requested applications (org-scoped).
 * Active Application = status not in REJECTED / WITHDRAWN / FAILED
 * (same rule as startApplicationFromDeskAction).
 */
export function buildRequestedIntakeWhere(
  organizationId: string
): Prisma.CandidateJobMatchWhereInput {
  return {
    organizationId,
    applicationRequestedAt: { not: null },
    opportunityId: { not: null },
    opportunity: {
      is: {
        organizationId,
        status: "ACTIVE",
        applications: {
          none: {
            status: { notIn: TERMINAL },
          },
        },
      },
    },
    candidate: {
      is: {
        organizationId,
        status: { not: "ARCHIVED" },
      },
    },
    job: {
      is: {
        organizationId,
      },
    },
  };
}

function toItem(row: {
  id: string;
  opportunityId: string | null;
  candidateId: string;
  jobId: string;
  applicationRequestedAt: Date | null;
  category: string | null;
  candidate: {
    user: {
      firstName: string | null;
      lastName: string | null;
      email: string;
    };
  };
  job: {
    title: string;
    companyName: string;
    location: string | null;
    isRemote: boolean;
    employmentType: string;
    status: string;
  };
}): RequestedApplicationIntakeItem | null {
  if (!row.opportunityId || !row.applicationRequestedAt) return null;
  const open = row.job.status === "OPEN";
  return {
    matchId: row.id,
    opportunityId: row.opportunityId,
    candidateId: row.candidateId,
    candidateName: candidateDisplayName(row.candidate.user),
    candidateEmail: row.candidate.user.email,
    jobId: row.jobId,
    jobTitle: row.job.title,
    companyName: row.job.companyName,
    location: row.job.location,
    isRemote: row.job.isRemote,
    employmentType: row.job.employmentType,
    requestedAt: row.applicationRequestedAt.toISOString(),
    matchCategory: row.category
      ? CATEGORY_LABELS[row.category] ?? row.category.replace(/_/g, " ")
      : null,
    requestState: "REQUESTED",
    canStart: open,
    blockedReason: open ? null : `Job is ${row.job.status}`,
  };
}

const INTAKE_SELECT = {
  id: true,
  opportunityId: true,
  candidateId: true,
  jobId: true,
  applicationRequestedAt: true,
  category: true,
  candidate: {
    select: {
      user: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
  },
  job: {
    select: {
      title: true,
      companyName: true,
      location: true,
      isRemote: true,
      employmentType: true,
      status: true,
    },
  },
} as const;

/**
 * Bounded staff intake page. Organization from authenticated context only.
 */
export async function listRequestedApplicationIntake(
  tx: Prisma.TransactionClient,
  organizationId: string,
  query: RequestedApplicationIntakeQuery = {}
): Promise<RequestedApplicationIntakePage> {
  const pageSize = sanitizePaginationLimit(
    query.pageSize,
    REQUESTED_INTAKE_DEFAULT_PAGE_SIZE,
    REQUESTED_INTAKE_MAX_PAGE_SIZE
  );
  const offset = decodeCursor(query.cursor);
  const where = buildRequestedIntakeWhere(organizationId);

  const [rows, totalPending] = await Promise.all([
    tx.candidateJobMatch.findMany({
      where,
      select: INTAKE_SELECT,
      orderBy: [{ applicationRequestedAt: "asc" }, { id: "asc" }],
      skip: offset,
      take: pageSize + 1,
    }),
    tx.candidateJobMatch.count({ where }),
  ]);

  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const items: RequestedApplicationIntakeItem[] = [];
  for (const row of pageRows) {
    const item = toItem(row);
    if (item) items.push(item);
  }

  return {
    items,
    pageSize,
    nextCursor: hasMore ? encodeCursor(offset + pageSize) : null,
    totalPending,
  };
}
