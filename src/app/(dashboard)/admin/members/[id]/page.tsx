import { notFound } from "next/navigation";
import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { EmployeeProfileManager } from "@/components/admin/EmployeeProfileManager";

interface EmployeeProfilePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EmployeeProfilePage({ params }: EmployeeProfilePageProps) {
  const { id } = await params;
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);

  const data = await withRlsContext(ctx.userId, async (tx) => {
    const membership = await tx.membership.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
      },
      include: {
        user: true,
        designation: true,
        reportingManager: true,
      },
    });

    if (!membership) {
      return null;
    }

    const designations = await tx.designation.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { name: "asc" },
    });

    const activeStaff = await tx.membership.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: "ACTIVE",
        role: { in: ["EMPLOYEE", "ADMIN"] },
      },
      include: { user: true },
      orderBy: { user: { firstName: "asc" } },
    });

    const auditLogs = await tx.auditEvent.findMany({
      where: {
        organizationId: ctx.organizationId,
        OR: [
          { entityId: membership.id },
          { actorId: membership.userId },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return {
      membership,
      designations,
      managers: activeStaff.map((m) => ({
        id: m.userId,
        name: `${m.user.firstName ?? ""} ${m.user.lastName ?? ""}`.trim() || m.user.email,
        email: m.user.email,
        role: m.role,
      })),
      auditLogs,
    };
  });

  if (!data) {
    notFound();
  }

  return (
    <EmployeeProfileManager
      currentUserId={ctx.userId}
      member={data.membership as any}
      designations={data.designations}
      managers={data.managers}
      auditLogs={data.auditLogs as any}
    />
  );
}
