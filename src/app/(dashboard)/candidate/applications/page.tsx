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

export default async function CandidateApplicationsPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};
  const currentTab = resolvedParams.tab || "ALL";

  const ctx = await getAuthenticatedContext();
  if (ctx.role === "ADMIN") redirect("/admin/applications");
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

    return allApps as unknown as CandidateApplicationItem[];
  });

  return (
    <CandidateApplicationsWorkbench
      applications={applications}
      initialTab={currentTab}
    />
  );
}
