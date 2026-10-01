import Link from "next/link";
import type { ReactNode } from "react";

interface SectionPanelProps {
  title?: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  flush?: boolean;
}

/**
 * Soft operations panel — default surface for secondary dashboard sections.
 */
export function SectionPanel({
  title,
  description,
  actionHref,
  actionLabel,
  children,
  className = "",
  bodyClassName = "",
  flush = false,
}: SectionPanelProps) {
  return (
    <section
      className={`rounded-[24px] border border-[#E5EAE7] bg-white shadow-[0_10px_40px_rgba(15,23,32,0.03)] overflow-hidden ${className}`}
    >
      {(title || actionHref) && (
        <div className="flex items-center justify-between gap-3 border-b border-[#EDF1EF] px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-semibold tracking-[-0.02em] text-[#0F1720]">{title}</h2>
            )}
            {description && <p className="mt-0.5 text-xs text-[#94A3B8]">{description}</p>}
          </div>
          {actionHref && actionLabel && (
            <Link
              href={actionHref}
              className="shrink-0 text-xs font-semibold text-[#12A150] hover:text-[#0B3B2C]"
            >
              {actionLabel}
            </Link>
          )}
        </div>
      )}
      <div className={`${flush ? "" : "p-5 sm:p-6"} ${bodyClassName}`}>{children}</div>
    </section>
  );
}
