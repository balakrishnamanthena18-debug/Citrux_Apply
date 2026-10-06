import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { getCandidate360 } from "@/lib/candidate-360/service";
import { StaffCandidate360View } from "@/components/candidate/StaffCandidate360View";
import {
  assignCandidateAction,
  verifyCandidateAction,
  updateCandidateStatusAction,
} from "@/lib/candidate/actions";
import { InternalNotesWidget } from "@/components/InternalNotesWidget";
import { EmployeeCandidateDocuments } from "@/components/EmployeeCandidateDocuments";

export default async function EmployeeCandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const { id: candidateId } = await params;

  // Retrieve Candidate 360 Career Intelligence DTO via Phase 7E.1 composition service
  const candidate360 = await getCandidate360(candidateId, ctx).catch(() => null);
  if (!candidate360) {
    notFound();
  }

  // Load operational data (staff members, private opportunities, catalog available) within RLS
  const { candidate, staffMembers, privateOpportunities, catalogAvailable } = await withRlsContext(
    ctx.userId,
    async (tx) => {
      const cand = await tx.candidate.findFirst({
        where: { id: candidateId, organizationId: ctx.organizationId },
        include: {
          user: true,
          assignedEmployee: true,
          documents: { orderBy: { createdAt: "desc" } },
          projects: { orderBy: { orderIndex: "asc" } },
        },
      });

      const staff = await tx.membership.findMany({
        where: {
          organizationId: ctx.organizationId,
          role: { in: ["EMPLOYEE", "ADMIN"] },
          status: "ACTIVE",
        },
        include: { user: true },
      });

      const privateOpps = cand
        ? await tx.candidateJobOpportunity.findMany({
            where: {
              organizationId: ctx.organizationId,
              candidateId: cand.id,
              status: "ACTIVE",
              job: { visibility: "CANDIDATE_PRIVATE" },
            },
            include: {
              job: {
                select: {
                  id: true,
                  title: true,
                  companyName: true,
                  source: true,
                  location: true,
                  isRemote: true,
                  visibility: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 20,
          })
        : [];

      const linkedJobIds = cand
        ? (
            await tx.candidateJobOpportunity.findMany({
              where: { candidateId: cand.id, organizationId: ctx.organizationId },
              select: { jobId: true },
            })
          ).map((o) => o.jobId)
        : [];

      const catalogJobs = cand
        ? await tx.job.findMany({
            where: {
              organizationId: ctx.organizationId,
              visibility: "GLOBAL",
              status: "OPEN",
              ...(linkedJobIds.length > 0 ? { id: { notIn: linkedJobIds } } : {}),
            },
            select: {
              id: true,
              title: true,
              companyName: true,
              source: true,
              location: true,
              isRemote: true,
            },
            orderBy: { createdAt: "desc" },
            take: 8,
          })
        : [];

      return {
        candidate: cand,
        staffMembers: staff,
        privateOpportunities: privateOpps,
        catalogAvailable: catalogJobs,
      };
    }
  );

  if (!candidate) {
    notFound();
  }

  const candidateName =
    [candidate.user.firstName, candidate.user.lastName].filter(Boolean).join(" ") || candidate.user.email;

  // Build slot elements for mutation workflows
  const assignmentControl = (
    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 uppercase tracking-wide text-[11px]">Specialist Assignment</h3>
        <span className="text-[10px] text-slate-400">Ownership</span>
      </div>
      <p className="text-slate-500">Assign responsible specialist for candidate operations.</p>
      <form
        action={async (formData: FormData) => {
          "use server";
          const employeeId = (formData.get("employeeId") as string) || null;
          await assignCandidateAction({
            candidateId: candidate.id,
            employeeId,
          });
        }}
        className="space-y-2 pt-1"
      >
        <select
          name="employeeId"
          defaultValue={candidate.assignedEmployeeId ?? ""}
          className="block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option value="">Unassigned</option>
          {staffMembers.map((sm) => (
            <option key={sm.userId} value={sm.userId}>
              {[sm.user.firstName, sm.user.lastName].filter(Boolean).join(" ") || sm.user.email} ({sm.role})
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="w-full rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
        >
          Update Assignment
        </button>
      </form>
    </div>
  );

  const verificationControl = (
    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 uppercase tracking-wide text-[11px]">Profile Verification</h3>
        <span className="text-[10px] text-slate-400">Canonical</span>
      </div>
      <form
        action={async (formData: FormData) => {
          "use server";
          await verifyCandidateAction({
            candidateId: candidate.id,
            verificationStatus: formData.get("verificationStatus") as any,
            verificationNotes: (formData.get("verificationNotes") as string) || null,
          });
        }}
        className="space-y-2 pt-1"
      >
        <select
          name="verificationStatus"
          defaultValue={candidate.verificationStatus}
          className="block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option value="UNVERIFIED">UNVERIFIED</option>
          <option value="PENDING_REVIEW">PENDING_REVIEW</option>
          <option value="VERIFIED">VERIFIED</option>
          <option value="REJECTED">REJECTED</option>
        </select>
        <input
          name="verificationNotes"
          defaultValue={candidate.verificationNotes ?? ""}
          placeholder="Correction notes for candidate..."
          className="block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <button
          type="submit"
          className="w-full rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
        >
          Record Verification
        </button>
      </form>
    </div>
  );

  const lifecycleControl = (
    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 uppercase tracking-wide text-[11px]">Lifecycle Transition</h3>
        <span className="text-[10px] text-slate-400">Status: {candidate.status}</span>
      </div>
      <form
        action={async (formData: FormData) => {
          "use server";
          await updateCandidateStatusAction({
            candidateId: candidate.id,
            targetStatus: formData.get("targetStatus") as any,
          });
        }}
        className="space-y-2 pt-1"
      >
        <select
          name="targetStatus"
          defaultValue=""
          className="block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option value="" disabled>Select next transition...</option>
          {candidate.status === "ONBOARDING" && <option value="ACTIVE">ACTIVE</option>}
          {candidate.status === "ONBOARDING" && <option value="INACTIVE">INACTIVE</option>}
          {candidate.status === "ACTIVE" && <option value="INACTIVE">INACTIVE</option>}
          {candidate.status === "ACTIVE" && <option value="ARCHIVED">ARCHIVED</option>}
          {candidate.status === "INACTIVE" && <option value="ACTIVE">ACTIVE</option>}
          {candidate.status === "INACTIVE" && <option value="ARCHIVED">ARCHIVED</option>}
        </select>
        <button
          type="submit"
          disabled={candidate.status === "ARCHIVED"}
          className="w-full rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition"
        >
          Apply Transition
        </button>
      </form>
    </div>
  );

  const privateOpportunitiesSection = (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Candidate Job Opportunities</h3>
          <p className="text-xs text-slate-500">Private leads for this candidate vs organization catalog jobs.</p>
        </div>
        <Link
          href={`/employee/application-log?candidateId=${candidate.id}`}
          className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
        >
          Open Application Desk →
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
            Candidate-Specific Leads ({privateOpportunities.length})
          </div>
          {privateOpportunities.length === 0 ? (
            <div className="p-3 text-xs text-slate-500 border border-dashed border-slate-200 rounded">
              No private job leads for this candidate yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded">
              {privateOpportunities.map((opp) => (
                <div key={opp.id} className="px-3 py-2 text-xs">
                  <div className="font-semibold text-slate-900">{opp.job.title}</div>
                  <div className="text-slate-600">{opp.job.companyName}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
            Available Catalog Jobs ({catalogAvailable.length})
          </div>
          {catalogAvailable.length === 0 ? (
            <div className="p-3 text-xs text-slate-500 border border-dashed border-slate-200 rounded">
              No additional catalog jobs available.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded">
              {catalogAvailable.map((job) => (
                <div key={job.id} className="px-3 py-2 text-xs">
                  <div className="font-semibold text-slate-900">{job.title}</div>
                  <div className="text-slate-600">{job.companyName}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const documentsSection = (
    <EmployeeCandidateDocuments
      candidateId={candidate.id}
      candidateName={candidateName}
      documents={candidate.documents as any}
    />
  );

  const projectsSection = (
    <div className="border-t border-slate-100 pt-4" data-testid="staff-candidate-projects">
      <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide mb-3">
        Projects
      </h3>
      {(candidate.projects || []).length === 0 ? (
        <span className="text-xs text-slate-400 italic">
          No projects recorded yet.
        </span>
      ) : (
        <div className="space-y-3">
          {(candidate.projects || []).map((proj: any) => (
            <div
              key={proj.id}
              className="p-3.5 rounded border border-slate-100 bg-slate-50 text-xs space-y-2"
            >
              <div className="font-semibold text-slate-900 flex flex-wrap items-center justify-between gap-2">
                <span>
                  {proj.title}
                  {proj.role ? ` · ${proj.role}` : ""}
                </span>
                {proj.url && (
                  <a
                    href={proj.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline shrink-0"
                  >
                    Open link →
                  </a>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Source: Candidate provided
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const notesWidget = <InternalNotesWidget candidateId={candidate.id} />;

  return (
    <StaffCandidate360View
      data={candidate360}
      actionSlots={{
        assignmentControl,
        verificationControl,
        lifecycleControl,
        documentsSection,
        privateOpportunitiesSection,
        notesWidget,
      }}
    />
  );
}
