import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { redirect } from "next/navigation";
import {
  CandidateApplicationsWorkbench,
  CandidateApplicationItem,
} from "@/components/candidate/CandidateApplicationsWorkbench";

interface Props {
  searchParams?: Promise<{ tab?: string }>;
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

/**
 * Normalize Prisma rows into JSON-safe props before crossing the
 * Server → Client Component boundary. Prevents Date-instance vs ISO-string
 * asymmetry during SSR hydration of the Applications Workbench.
 */
function serializeApplicationForWorkbench(app: {
  id: string;
  status: CandidateApplicationItem["status"];
  createdAt: Date | string;
  updatedAt: Date | string;
  job: {
    id: string;
    title: string;
    companyName: string;
    location?: string | null;
    isRemote?: boolean | null;
    salaryMin?: number | null;
    salaryMax?: number | null;
    salaryCurrency?: string | null;
  };
  submissions: Array<{
    id: string;
    attemptNumber: number;
    submittedAt: Date | string;
  }>;
}): CandidateApplicationItem {
  return {
    id: app.id,
    status: app.status,
    createdAt: toIso(app.createdAt),
    updatedAt: toIso(app.updatedAt),
    job: {
      id: app.job.id,
      title: app.job.title,
      companyName: app.job.companyName,
      location: app.job.location ?? null,
      isRemote: Boolean(app.job.isRemote),
      salaryMin: app.job.salaryMin ?? null,
      salaryMax: app.job.salaryMax ?? null,
      salaryCurrency: app.job.salaryCurrency ?? null,
    },
    submissions: app.submissions.map((sub) => ({
      id: sub.id,
      attemptNumber: sub.attemptNumber,
      submittedAt: toIso(sub.submittedAt),
    })),
  };
}

export default async function CandidateApplicationsPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};
  const currentTab = resolvedParams.tab || "ALL";

  const ctx = await getAuthenticatedContext();
  if (ctx.role === "ADMIN") redirect("/employee/applications");
  if (ctx.role === "EMPLOYEE") redirect("/employee/applications");

  const applications = await withRlsContext(ctx.userId, async (tx) => {
    const candidate = await tx.candidate.findUnique({
      where: { userId: ctx.userId },
      select: { id: true },
    });

    if (!candidate) {
      return [];
    }

    const allApps = await tx.application.findMany({
      where: { candidateId: candidate.id },
      include: {
        job: true,
        submissions: {
          select: { id: true, attemptNumber: true, submittedAt: true },
          orderBy: { attemptNumber: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    return allApps.map(serializeApplicationForWorkbench);
  });

  return (
    <CandidateApplicationsWorkbench
      applications={applications}
      initialTab={currentTab}
    />
  );
}
