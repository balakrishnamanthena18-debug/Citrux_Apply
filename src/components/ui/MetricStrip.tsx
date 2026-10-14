import Link from "next/link";
import type { ReactNode } from "react";
import type { HelpTopicKey } from "@/lib/help/dictionary";
import { HelpTooltip } from "@/components/ui/HelpTooltip";

export interface MetricStripItem {
  label: string;
  value: number | string;
  href?: string;
  accent?: boolean;
  helpTopic?: HelpTopicKey;
  helpContent?: ReactNode;
}

interface MetricStripProps {
  items: MetricStripItem[];
  className?: string;
}

/**
 * Slim KPI composition matching Operations Overview.
 */
export function MetricStrip({ items, className = "" }: MetricStripProps) {
  const cols =
    items.length <= 2
      ? "sm:grid-cols-2"
      : items.length === 3
      ? "sm:grid-cols-3"
      : "sm:grid-cols-4";

  return (
    <section
      className={`grid grid-cols-2 gap-px overflow-hidden rounded-[22px] border border-[#E5EAE7] bg-[#E5EAE7] ${cols} shadow-[0_10px_40px_rgba(15,23,32,0.03)] ${className}`}
    >
      {items.map((metric) => {
        const content = (
          <>
            <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94A3B8]">
              <span>{metric.label}</span>
              {(metric.helpTopic || metric.helpContent) && (
                <span onClick={(e) => e.stopPropagation()} className="inline-flex">
                  <HelpTooltip
                    topic={metric.helpTopic}
                    content={metric.helpContent}
                    label={`Help for ${metric.label}`}
                    size="sm"
                  />
                </span>
              )}
            </div>
            <div
              className={`mt-2 text-[1.55rem] font-semibold tracking-[-0.04em] tabular-nums sm:mt-3 sm:text-[1.85rem] ${
                metric.accent ? "text-[#12A150]" : "text-[#0F1720]"
              }`}
            >
              {typeof metric.value === "number" ? metric.value.toLocaleString() : metric.value}
            </div>
          </>
        );

        if (metric.href) {
          return (
            <Link
              key={metric.label}
              href={metric.href}
              className="bg-white px-3.5 py-3.5 transition hover:bg-[#F7F9F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#12A150] sm:px-5 sm:py-5"
            >
              {content}
            </Link>
          );
        }

        return (
          <div key={metric.label} className="bg-white px-3.5 py-3.5 sm:px-5 sm:py-5">
            {content}
          </div>
        );
      })}
    </section>
  );
}
