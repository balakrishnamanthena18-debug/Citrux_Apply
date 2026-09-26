import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { getTaskGovernancePolicy } from "@/lib/task/governance";
import { TaskGovernanceSettings } from "@/components/admin/TaskGovernanceSettings";

export default async function TaskRulesSettingsPage() {
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);

  const { organization, policy } = await withRlsContext(ctx.userId, async (tx) => {
    const org = await tx.organization.findUnique({
      where: { id: ctx.organizationId },
    });

    const activePolicy = await getTaskGovernancePolicy(tx, ctx.organizationId);

    return {
      organization: org,
      policy: activePolicy,
    };
  });

  return (
    <TaskGovernanceSettings
      initialPolicy={policy}
      organizationName={organization?.name || "CitrUX Operations"}
    />
  );
}
