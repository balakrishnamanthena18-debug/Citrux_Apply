import { DashboardSkeleton } from "@/components/navigation/RouteSkeletons";

export default function CandidateLoading() {
  return <DashboardSkeleton label="Loading candidate portal" metricCount={3} />;
}
