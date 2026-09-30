import React from "react";
import Link from "next/link";

export interface RecordBreadcrumb {
  label: string;
  href?: string;
}

export interface RecordMetaItem {
  label: string;
  value: React.ReactNode;
  primary?: boolean;
}

interface RecordHeaderProps {
  breadcrumbs?: RecordBreadcrumb[];
  title: string;
  subtitle?: React.ReactNode;
  statusBadge?: React.ReactNode;
  avatarText?: string;
  metaItems?: RecordMetaItem[];
  actions?: React.ReactNode;
  quickActions?: {
    label: string;
    icon: React.ReactNode;
    onClick?: () => void;
    href?: string;
  }[];
}

export function RecordHeader({
  breadcrumbs,
  title,
  subtitle,
  statusBadge,
  avatarText,
  metaItems = [],
  actions,
  quickActions,
}: RecordHeaderProps) {
  const initials = avatarText
    ? avatarText
        .split(" ")
        .map((n) => n[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : title.slice(0, 2).toUpperCase();

  return (
    <div className="bg-white rounded-[20px] border border-[#E5EAE7] shadow-[0_4px_18px_rgba(15,23,32,0.04)] overflow-hidden transition-all">
      {/* Top Banner with Avatar, Title, Status & Actions */}
      <div className="p-5 sm:p-6 border-b border-[#EDF1EF] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-4 min-w-0">
          {/* Avatar Icon Node */}
          <div className="w-11 h-11 rounded-[14px] bg-[#0B3B2C] text-[#C6F432] font-bold text-sm flex items-center justify-center shrink-0 shadow-sm">
            {initials}
          </div>

          <div className="space-y-1 min-w-0">
            {breadcrumbs && breadcrumbs.length > 0 && (
              <nav className="flex items-center space-x-1.5 text-xs text-[#94A3B8] font-medium" aria-label="Breadcrumb">
                {breadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={crumb.label}>
                    {idx > 0 && <span className="text-[#E5EAE7]">/</span>}
                    {crumb.href ? (
                      <Link href={crumb.href} className="hover:text-[#12A150] transition-colors">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="text-[#64748B] truncate">{crumb.label}</span>
                    )}
                  </React.Fragment>
                ))}
              </nav>
            )}

            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold text-[#0F1720] tracking-tight truncate">
                {title}
              </h1>
              {statusBadge && <div className="shrink-0">{statusBadge}</div>}
            </div>

            {subtitle && (
              <div className="text-xs text-[#64748B] font-medium flex items-center gap-2 flex-wrap">
                {subtitle}
              </div>
            )}
          </div>
        </div>

        {/* Enterprise Command Action Controls */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {quickActions && quickActions.length > 0 && (
            <div className="flex items-center gap-1.5 mr-1">
              {quickActions.map((qa, i) => (
                <button
                  key={i}
                  title={qa.label}
                  onClick={qa.onClick}
                  className="px-3 py-1.5 rounded-[10px] bg-[#F7F9F8] hover:bg-[#EDF1EF] border border-[#E5EAE7] text-[#0F1720] text-xs font-medium flex items-center gap-1.5 transition"
                >
                  {qa.icon}
                  <span>{qa.label}</span>
                </button>
              ))}
            </div>
          )}

          {actions}
        </div>
      </div>

      {/* Compact Metadata Rail */}
      {metaItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-[#EDF1EF] bg-[#F7F9F8]/60 text-xs">
          {metaItems.map((meta, idx) => (
            <div key={idx} className="px-4 py-2.5">
              <div className="text-[10px] uppercase font-bold text-[#94A3B8] tracking-wider truncate">
                {meta.label}
              </div>
              <div
                className={`mt-0.5 truncate ${
                  meta.primary ? "font-bold text-[#0F1720]" : "font-medium text-[#64748B]"
                }`}
              >
                {meta.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
