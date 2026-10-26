import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { getCollectionAdminDataAction } from "@/lib/job-discovery/actions";
import { JobCollectionAdminWorkbench } from "@/components/admin/job-collection/JobCollectionAdminWorkbench";

export const metadata = {
  title: "Job Collection Engine | Operations Operating System",
  description: "Global job discovery, multi-provider collection management, and deduplication audit console.",
};

export default async function AdminJobCollectionPage() {
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);

  const res = await getCollectionAdminDataAction();
  const metrics = res.metrics || {
    totalDiscoveredJobs: 0,
    activeJobs: 0,
    verifiedJobs: 0,
    staleJobs: 0,
    duplicateJobs: 0,
    providersTotal: 0,
    providersActive: 0,
    lastCollectionRun: null,
    sourceBreakdown: {},
    industryBreakdown: {},
  };

  return (
    <JobCollectionAdminWorkbench
      initialMetrics={metrics}
      initialProviders={res.providers || []}
      initialRecentRuns={res.recentRuns || []}
    />
  );
}
