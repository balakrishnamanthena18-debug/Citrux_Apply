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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Operational Lifecycle
        </span>
        {!presentation.isTerminal && (
          <span className="text-[11px] font-medium text-slate-500">
            Stage {currentStage} of {STAGES.length}
          </span>
        )}
      </div>

      {/* 5-Stage Progress Stepper */}
      {!presentation.isTerminal ? (
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          {STAGES.map((s) => {
            const isCompleted = s.stage < currentStage;
            const isCurrent = s.stage === currentStage;

            return (
              <div
                key={s.stage}
                className={`p-2.5 rounded-lg border text-xs transition ${
                  isCurrent
                    ? "bg-blue-50/80 border-blue-300 ring-1 ring-blue-300/80 shadow-2xs"
                    : isCompleted
                    ? "bg-slate-50 border-slate-200/80 text-slate-700"
                    : "bg-white border-slate-150 text-slate-400"
                }`}
              >
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span
                    className={`font-bold ${
                      isCurrent
                        ? "text-blue-600"
                        : isCompleted
                        ? "text-emerald-700"
                        : "text-slate-300"
                    }`}
                  >
                    {isCompleted ? "✓" : isCurrent ? "●" : "○"}
                  </span>
                  <span
                    className={`font-semibold truncate ${
                      isCurrent
                        ? "text-blue-950 font-bold"
                        : isCompleted
                        ? "text-slate-800"
                        : "text-slate-400"
                    }`}
                  >
                    {s.title}
                  </span>
                </div>
                <div
                  className={`text-[10px] mt-0.5 truncate ${
                    isCurrent
                      ? "text-blue-700 font-medium"
                      : isCompleted
                      ? "text-slate-500"
                      : "text-slate-400"
                  }`}
                >
                  {s.desc}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700 flex items-center gap-2">
          <span className="font-semibold text-slate-900">Application Concluded:</span>
          <span>This application has reached a terminal state ({presentation.label}).</span>
        </div>
      )}
    </div>
  );
}
