import type { ApplicationIntelligenceViewModel } from "@/lib/application-intelligence/presentation";
import { ApplicationIntelligenceSection } from "./ApplicationIntelligenceSection";

type Props = {
  view: ApplicationIntelligenceViewModel | null;
  audience: "candidate" | "staff";
  /** When true, show isolated error fallback instead of empty state. */
  loadFailed?: boolean;
};

/**
 * Presentational server wrapper for Application Detail intelligence.
 * Parent pages load the view model inside the authorized RLS transaction
 * and pass it here so intelligence failures never block job/status/materials.
 */
export function ApplicationIntelligencePanel({
  view,
  audience,
  loadFailed = false,
}: Props) {
  if (loadFailed) {
    return (
      <section
        aria-labelledby="application-intelligence-error-heading"
        className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-2xs space-y-2"
        data-testid="application-intelligence-error"
        role="status"
      >
        <h2
          id="application-intelligence-error-heading"
          className="text-xs font-semibold uppercase tracking-wider text-slate-600"
        >
          Application Intelligence
        </h2>
        <p className="text-sm font-semibold text-slate-900">
          Analysis unavailable
        </p>
        <p className="text-xs text-slate-600 leading-relaxed">
          The application intelligence analysis could not be loaded. Other
          application details remain available.
        </p>
      </section>
    );
  }

  if (!view) return null;

  return <ApplicationIntelligenceSection view={view} audience={audience} />;
}
