import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { AdminApplicationsWorkbench } from "@/components/admin/AdminApplicationsWorkbench";

export default async function AdminApplicationsPage() {
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);

  const { applications, totalCount, statusCounts } = await withRlsContext(ctx.userId, async (tx) => {
    const [apps, total, counts] = await Promise.all([
      tx.application.findMany({
        where: { organizationId: ctx.organizationId },
        select: {
          id: true,
          status: true,
          createdAt: true,
          candidate: {
            select: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          job: {
            select: {
              title: true,
              companyName: true,
            },
          },
          assignedEmployee: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 250,
      }),
      tx.application.count({
        where: { organizationId: ctx.organizationId },
      }),
      tx.application.groupBy({
        by: ["status"],
        where: { organizationId: ctx.organizationId },
        _count: true,
      }),
    ]);

    return { 
      applications: apps.map(app => ({
        id: app.id,
        status: app.status,
        createdAt: app.createdAt,
        candidate: {
          user: {
            firstName: app.candidate?.user?.firstName,
            lastName: app.candidate?.user?.lastName,
            email: app.candidate?.user?.email || "",
          }
        },
        job: {
          title: app.job?.title || "",
          companyName: app.job?.companyName || "",
        },
        assignedEmployee: app.assignedEmployee ? {
          firstName: app.assignedEmployee.firstName,
          lastName: app.assignedEmployee.lastName,
          email: app.assignedEmployee.email,
        } : null,
      })), 
      totalCount: total, 
      statusCounts: counts.map(c => ({ status: c.status, _count: c._count })) 
    };
  });

  return (
    <AdminApplicationsWorkbench
      applications={applications}
      totalCount={totalCount}
      statusCounts={statusCounts}
    />
  );
}

