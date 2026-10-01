import { GenericDashboardSkeleton } from "@/components/navigation/RouteSkeletons";

/**
 * Dashboard segment loading boundary.
 * AppShell (sidebar/header) from layout.tsx stays mounted; only main content swaps to skeleton.
 */
export default function DashboardLoading() {
  return <GenericDashboardSkeleton />;
}
