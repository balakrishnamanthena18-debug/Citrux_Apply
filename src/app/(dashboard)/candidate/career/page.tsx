import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { getCandidate360 } from "@/lib/candidate-360/service";
import { Candidate360View } from "@/components/candidate/Candidate360View";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function CandidateCareerPage() {
  const ctx = await getAuthenticatedContext();
  if (ctx.role === "ADMIN") redirect("/admin");
  if (ctx.role === "EMPLOYEE") redirect("/employee");

  // In Candidate context, retrieve candidateId from candidate entity
  const candidate = await withRlsContext(ctx.userId, async (tx) => {
    return tx.candidate.findUnique({
      where: { userId: ctx.userId },
      select: { id: true },
    });
  });

  const candidate360 = candidate ? await getCandidate360(candidate.id, ctx) : null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Header & Navigation Breadcrumb */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Career Intelligence 360
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
            <span className="text-xs text-slate-400">Read-Only Synthesis</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Candidate 360 Overview
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Comprehensive multi-source career evidence, competencies, and readiness snapshot.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
          <Link
            href="/candidate/profile"
            className="flex-1 sm:flex-initial text-center px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition shadow-2xs"
          >
            ✏️ Edit Career Profile
          </Link>
          <Link
            href="/candidate/applications"
            className="flex-1 sm:flex-initial text-center px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition shadow-2xs"
          >
            My Applications
          </Link>
        </div>
      </div>

      {candidate360 ? (
        <Candidate360View data={candidate360} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Career Profile Setup Required</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            To view your Candidate 360 Career Intelligence, please complete your profile details.
          </p>
          <Link
            href="/candidate/profile"
            className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition"
          >
            Go to Profile Workspace →
          </Link>
        </div>
      )}
    </div>
  );
}
