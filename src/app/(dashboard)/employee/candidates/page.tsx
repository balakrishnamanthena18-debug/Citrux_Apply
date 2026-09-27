import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import {
  EmployeeCandidatesWorkbench,
  CandidateDirectoryItem,
} from "@/components/candidate/EmployeeCandidatesWorkbench";

export default async function EmployeeCandidatesListPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; search?: string; scope?: string }>;
}) {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const resolvedParams = searchParams ? await searchParams : {};
  const statusFilter = resolvedParams.status || "ALL";
  const scopeFilter = resolvedParams.scope || "";
  const searchQuery = resolvedParams.search || "";

  const candidates = await withRlsContext(ctx.userId, async (tx) => {
    return tx.candidate.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { not: "ARCHIVED" },
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        assignedEmployee: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        skills: {
          select: { id: true, name: true },
        },
        applications: {
          select: { id: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  });

  return (
    <EmployeeCandidatesWorkbench
      currentUserId={ctx.userId}
      candidates={candidates as unknown as CandidateDirectoryItem[]}
      initialScope={scopeFilter}
      initialStatus={statusFilter}
      initialSearch={searchQuery}
    />
  );
}
