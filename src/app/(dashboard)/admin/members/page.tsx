import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { StaffRosterManager } from "@/components/admin/StaffRosterManager";

export default async function AdminMembersPage() {
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);

  const { memberships, designations, managers } = await withRlsContext(ctx.userId, async (tx) => {
    const mems = await tx.membership.findMany({
      where: {
        organizationId: ctx.organizationId,
        role: { in: ["EMPLOYEE", "ADMIN"] },
      },
      include: {
        user: true,
        designation: true,
        reportingManager: true,
      },
      orderBy: [
        { status: "asc" },
        { createdAt: "desc" },
      ],
    });

    const desigs = await tx.designation.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { name: "asc" },
    });

    const activeStaff = mems.filter((m) => m.status === "ACTIVE");
    const mgrs = activeStaff
      .map((m) => ({
        id: m.userId,
        name: `${m.user.firstName ?? ""} ${m.user.lastName ?? ""}`.trim() || m.user.email,
        email: m.user.email,
        role: m.role,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      memberships: mems,
      designations: desigs,
      managers: mgrs,
    };
  });

  return (
    <div className="space-y-6">
      <StaffRosterManager
        currentUserId={ctx.userId}
        members={memberships as any}
        designations={designations}
        managers={managers}
      />
    </div>
  );
}
