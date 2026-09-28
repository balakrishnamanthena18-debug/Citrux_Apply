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
    <div className={`bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col ${className}`}>
      {(title || headerAction) && (
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              {title && <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">{title}</h2>}
              {badge && <div>{badge}</div>}
            </div>
            {description && <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>}
          </div>
          {headerAction && <div className="flex-shrink-0">{headerAction}</div>}
        </div>
      )}

      <div className="flex-1">{children}</div>

      {footer && (
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between text-xs">
          {footer}
        </div>
      )}
    </div>
  );
}
