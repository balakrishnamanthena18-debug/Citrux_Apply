import React from "react";

interface WorkspaceSectionProps {
  title?: string;
  description?: string;
  badge?: React.ReactNode;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
}

export function WorkspaceSection({
  title,
  description,
  badge,
  headerAction,
  children,
  className = "",
  footer,
}: WorkspaceSectionProps) {
  return (
    <div className={`bg-white rounded-[20px] border border-[#E5EAE7] shadow-[0_4px_18px_rgba(15,23,32,0.04)] overflow-hidden flex flex-col transition-all ${className}`}>
      {(title || headerAction) && (
        <div className="px-5 py-4 border-b border-[#EDF1EF] bg-[#F7F9F8]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              {title && <h2 className="text-xs font-bold uppercase tracking-wider text-[#0F1720]">{title}</h2>}
              {badge && <div>{badge}</div>}
            </div>
            {description && <p className="text-[11px] text-[#64748B] mt-0.5">{description}</p>}
          </div>
          {headerAction && <div className="flex-shrink-0">{headerAction}</div>}
        </div>
      )}

      <div className="flex-1">{children}</div>

      {footer && (
        <div className="px-5 py-3.5 border-t border-[#EDF1EF] bg-[#F7F9F8]/40 flex items-center justify-between text-xs text-[#64748B]">
          {footer}
        </div>
      )}
    </div>
  );
}
