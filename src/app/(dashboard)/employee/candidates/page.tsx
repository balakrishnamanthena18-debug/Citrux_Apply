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

  const { candidates, staffMembers } = await withRlsContext(ctx.userId, async (tx) => {
    const cands = await tx.candidate.findMany({
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

    const staff = await tx.membership.findMany({
      where: {
        organizationId: ctx.organizationId,
        role: { in: ["EMPLOYEE", "ADMIN"] },
        status: "ACTIVE",
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { user: { firstName: "asc" } },
    });

    return { candidates: cands, staffMembers: staff };
  });

  const availableStaff = staffMembers.map((m) => ({
    id: m.userId,
    name: [m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || m.user.email,
    email: m.user.email,
    role: m.role,
  }));

  return (
    <EmployeeCandidatesWorkbench
      currentUserId={ctx.userId}
      currentUserRole={ctx.role}
      canAddCandidate={ctx.role === "ADMIN"}
      candidates={candidates as unknown as CandidateDirectoryItem[]}
      availableStaff={availableStaff}
      initialScope={scopeFilter}
      initialStatus={statusFilter}
      initialSearch={searchQuery}
    />
  );
}

