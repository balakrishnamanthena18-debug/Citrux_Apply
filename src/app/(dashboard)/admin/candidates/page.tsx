import EmployeeCandidatesListPage from "@/app/(dashboard)/employee/candidates/page";

export default async function AdminCandidatesPage(props: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  return <EmployeeCandidatesListPage {...props} />;
}
