import type { ApplicationStatus } from "@/generated/prisma";
import { getCandidateStatusPresentation } from "@/lib/utils/status-presenter";

interface Props {
  status: ApplicationStatus;
}

const STAGES = [
  { stage: 1, title: "Intake & Triage", desc: "Eligibility verification" },
  { stage: 2, title: "Preparation", desc: "Material authoring" },
  { stage: 3, title: "QA Review", desc: "Quality assurance" },
  { stage: 4, title: "Candidate Approval", desc: "Your authorization" },
  { stage: 5, title: "Submission", desc: "Manual execution" },
];

export function ApplicationProgressTracker({ status }: Props) {
  const presentation = getCandidateStatusPresentation(status);
  const currentStage = presentation.progressStage;

  return (
    <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-slate-100">
        <div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Operational Lifecycle Progression
          </span>
          <p className="text-sm font-bold text-slate-900 mt-0.5">{presentation.label}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${presentation.badgeClass}`}>
            {presentation.label}
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-600">{presentation.description}</p>

      {/* 5-Stage Progress Bar */}
      {!presentation.isTerminal ? (
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-2">
          {STAGES.map((s) => {
            const isCompleted = s.stage < currentStage;
            const isCurrent = s.stage === currentStage;

            return (
              <div
                key={s.stage}
                className={`p-2.5 rounded-md border text-xs transition ${
                  isCurrent
                    ? "bg-blue-50/70 border-blue-300 ring-1 ring-blue-300"
                    : isCompleted
                    ? "bg-slate-50 border-slate-200 text-slate-700"
                    : "bg-white border-slate-100 text-slate-400"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                  <span>
                    {isCompleted ? "✓" : s.stage}.
                  </span>
                  <span className={isCurrent ? "text-blue-900" : isCompleted ? "text-slate-800" : "text-slate-400"}>
                    {s.title}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 truncate">{s.desc}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-3 bg-slate-50 rounded-md border border-slate-200 text-xs text-slate-700 flex items-center gap-2">
          <span className="font-semibold">Application Closed:</span>
          <span>This application has concluded in the {presentation.label} state.</span>
        </div>
      )}
    </div>
  );
}
