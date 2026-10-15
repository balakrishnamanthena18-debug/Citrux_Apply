"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Copy,
  Check,
  Clock,
  User,
  Shield,
  Layers,
  Globe,
  ArrowRight,
  Filter,
  FileCode,
  AlertTriangle,
} from "lucide-react";
import { getActionMetadata, type AuditTone } from "@/lib/audit/catalog";

export interface AuditEventDetail {
  id: string;
  organizationId: string | null;
  actorId: string | null;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string | Date;
  actor?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
}

interface AuditInvestigationDrawerProps {
  event: AuditEventDetail | null;
  onClose: () => void;
  onFilterByActor?: (actorId: string) => void;
  onFilterByEntity?: (entityType: string, entityId: string) => void;
}

const toneStyles: Record<AuditTone, { bg: string; text: string; border: string }> = {
  emerald: { bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-200" },
  rose: { bg: "bg-rose-50", text: "text-rose-800", border: "border-rose-200" },
  amber: { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200" },
  blue: { bg: "bg-sky-50", text: "text-sky-800", border: "border-sky-200" },
  purple: { bg: "bg-purple-50", text: "text-purple-800", border: "border-purple-200" },
  neutral: { bg: "bg-slate-100", text: "text-slate-800", border: "border-slate-200" },
};

export function AuditInvestigationDrawer({
  event,
  onClose,
  onFilterByActor,
  onFilterByEntity,
}: AuditInvestigationDrawerProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!event) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [event, onClose]);

  if (!event) return null;

  const metadata = getActionMetadata(event.action);
  const tone = toneStyles[metadata.tone] || toneStyles.neutral;
  const createdAtDate = new Date(event.createdAt);
  const utcIso = createdAtDate.toISOString();
  const localFormatted = createdAtDate.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const actorFullName = event.actor
    ? `${event.actor.firstName || ""} ${event.actor.lastName || ""}`.trim() || event.actor.email
    : event.actorType;

  // Detect state transitions in details
  const details = event.details || {};
  const fromStatus = details.fromStatus || details.previousStatus || details.previousState || details.oldRole;
  const toStatus = details.toStatus || details.newStatus || details.newState || details.newRole;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-drawer-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#0F1720]/40 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-2xl bg-white shadow-2xl flex flex-col border-l border-[#E5EAE7]">
          {/* Header */}
          <div className="px-6 py-5 border-b border-[#E5EAE7] bg-[#F7F9F8] flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${tone.bg} ${tone.text} ${tone.border}`}
                >
                  {metadata.category.replace(/_/g, " ")}
                </span>
                <span className="font-mono text-[11px] text-[#64748B] bg-white px-2 py-0.5 rounded border border-[#E5EAE7]">
                  {event.action}
                </span>
              </div>
              <h2 id="audit-drawer-title" className="text-xl font-bold text-[#0F1720] tracking-tight">
                {metadata.label}
              </h2>
              <p className="mt-1 text-xs text-[#64748B]">{metadata.description}</p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F1720] hover:bg-white border border-transparent hover:border-[#E5EAE7] transition-colors cursor-pointer"
              aria-label="Close investigation drawer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-[#0F1720]">
            {/* Event UUID Bar */}
            <div className="bg-[#F7F9F8] p-3.5 rounded-[12px] border border-[#E5EAE7] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#64748B] block">
                  Event Record UUID
                </span>
                <span className="font-mono text-xs text-[#0F1720] truncate block">{event.id}</span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(event.id, "eventId")}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] bg-white border border-[#E5EAE7] text-[11px] font-medium text-[#334155] hover:bg-[#F7F9F8] transition-colors shrink-0 cursor-pointer"
              >
                {copiedKey === "eventId" ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-[#64748B]" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* Transition Card if present */}
            {Boolean(fromStatus && toStatus) && (
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-[14px] p-4">
                <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  Recorded State Transition
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded bg-white border border-amber-200 font-mono font-semibold text-xs text-amber-900">
                    {String(fromStatus)}
                  </span>
                  <ArrowRight className="h-4 w-4 text-amber-600" />
                  <span className="px-2.5 py-1 rounded bg-amber-600 text-white font-mono font-semibold text-xs shadow-2xs">
                    {String(toStatus)}
                  </span>
                </div>
              </div>
            )}

            {/* Primary Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Timestamp Card */}
              <div className="p-4 rounded-[14px] border border-[#E5EAE7] bg-white space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                  <Clock className="h-3.5 w-3.5 text-[#12A150]" />
                  <span>Timestamp</span>
                </div>
                <div>
                  <div className="font-mono text-xs text-[#0F1720] font-semibold">{utcIso}</div>
                  <div className="text-[11px] text-[#64748B] mt-0.5">UTC Time (Authoritative)</div>
                </div>
                <div className="pt-2 border-t border-[#EDF1EF]">
                  <div className="text-xs text-[#334155]">{localFormatted}</div>
                  <div className="text-[11px] text-[#94A3B8]">Browser Local Time</div>
                </div>
              </div>

              {/* Actor Card */}
              <div className="p-4 rounded-[14px] border border-[#E5EAE7] bg-white space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    <User className="h-3.5 w-3.5 text-[#12A150]" />
                    <span>Actor</span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#EDF1EF] text-[#0F1720] border border-[#E5EAE7]">
                    {event.actorType}
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-xs text-[#0F1720]">{actorFullName}</div>
                  {event.actor?.email && (
                    <div className="font-mono text-[11px] text-[#64748B]">{event.actor.email}</div>
                  )}
                </div>
                {event.actorId && onFilterByActor && (
                  <button
                    type="button"
                    onClick={() => {
                      onFilterByActor(event.actorId!);
                      onClose();
                    }}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#12A150] hover:text-[#0B3B2C] cursor-pointer"
                  >
                    <Filter className="h-3 w-3" />
                    <span>Filter all events by this actor</span>
                  </button>
                )}
              </div>

              {/* Entity Target Card */}
              <div className="p-4 rounded-[14px] border border-[#E5EAE7] bg-white space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                  <Layers className="h-3.5 w-3.5 text-[#12A150]" />
                  <span>Target Entity</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-semibold text-xs text-[#0F1720]">
                    {event.entityType}
                  </span>
                </div>
                <div className="font-mono text-xs text-[#334155] break-all">
                  {event.entityId || "N/A (Organization scope)"}
                </div>
                {event.entityId && onFilterByEntity && (
                  <button
                    type="button"
                    onClick={() => {
                      onFilterByEntity(event.entityType, event.entityId!);
                      onClose();
                    }}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#12A150] hover:text-[#0B3B2C] cursor-pointer"
                  >
                    <Filter className="h-3 w-3" />
                    <span>Filter all events for this entity</span>
                  </button>
                )}
              </div>

              {/* Network & Client Context */}
              <div className="p-4 rounded-[14px] border border-[#E5EAE7] bg-white space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                  <Globe className="h-3.5 w-3.5 text-[#12A150]" />
                  <span>Network & Client</span>
                </div>
                <div>
                  <div className="text-[10px] text-[#94A3B8] uppercase font-bold">IP Address</div>
                  <div className="font-mono text-xs text-[#0F1720] mt-0.5">
                    {event.ipAddress || "Not captured (Internal/System)"}
                  </div>
                </div>
                <div className="pt-2 border-t border-[#EDF1EF]">
                  <div className="text-[10px] text-[#94A3B8] uppercase font-bold">User Agent</div>
                  <div className="font-mono text-[11px] text-[#64748B] truncate mt-0.5" title={event.userAgent || ""}>
                    {event.userAgent || "None recorded"}
                  </div>
                </div>
              </div>
            </div>

            {/* Recorded Metadata JSON Section */}
            <div className="rounded-[16px] border border-[#E5EAE7] bg-white overflow-hidden shadow-2xs">
              <div className="px-5 py-3.5 bg-[#F7F9F8] border-b border-[#E5EAE7] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-[#12A150]" />
                  <span className="font-semibold text-xs text-[#0F1720]">Recorded Metadata (Payload)</span>
                </div>
                {event.details && (
                  <button
                    type="button"
                    onClick={() => handleCopy(JSON.stringify(event.details, null, 2), "payloadJson")}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] bg-white border border-[#E5EAE7] text-[11px] font-medium text-[#334155] hover:bg-[#F7F9F8] transition-colors cursor-pointer"
                  >
                    {copiedKey === "payloadJson" ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" />
                        <span>Copied JSON</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 text-[#64748B]" />
                        <span>Copy JSON</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="p-4 bg-[#0F1720] text-slate-100 overflow-x-auto font-mono text-[11px] leading-relaxed max-h-96">
                {event.details && Object.keys(event.details).length > 0 ? (
                  <pre>{JSON.stringify(event.details, null, 2)}</pre>
                ) : (
                  <span className="text-slate-400 italic">No additional metadata recorded for this event.</span>
                )}
              </div>

              <div className="px-4 py-2 bg-[#F7F9F8] border-t border-[#E5EAE7] text-[11px] text-[#64748B] flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-[#12A150]" />
                <span>Sensitive tokens, passwords, and API keys are systematically redacted before storage.</span>
              </div>
            </div>
          </div>

          {/* Drawer Footer */}
          <div className="px-6 py-4 bg-[#F7F9F8] border-t border-[#E5EAE7] flex items-center justify-between">
            <span className="text-[11px] text-[#64748B]">
              Immutable audit record under Organization Governance
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-[9px] bg-white border border-[#E5EAE7] text-xs font-semibold text-[#0F1720] hover:bg-[#F7F9F8] transition-colors cursor-pointer shadow-2xs"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
