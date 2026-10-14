"use client";

import React from "react";
import Link from "next/link";
import { formatApplicationCardDate } from "@/lib/utils/format-application-date";
import { HelpTooltip } from "@/components/ui/HelpTooltip";

export interface CandidateServiceContractData {
  id: string;
  contractNumber: string;
  serviceType: string;
  billingCadence: string;
  currency: string;
  status: string;
  effectiveDate: string | Date;
  expirationDate?: string | Date | null;
  entitlements?: Array<{
    id: string;
    entitlementType: string;
    allocatedQuota: number;
    consumedQuota: number;
  }>;
}

interface Props {
  contract?: CandidateServiceContractData | null;
}

export function CandidateServiceStatus({ contract }: Props) {
  // If candidate has no applicable commercial contract or subscription, gracefully omit billing card
  if (!contract) {
    return null;
  }

  const effectiveDateStr = formatApplicationCardDate(contract.effectiveDate);
  const expirationDateStr = contract.expirationDate
    ? formatApplicationCardDate(contract.expirationDate)
    : "Ongoing";

  return (
    <section
      aria-label="Service Information & Contract"
      className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden"
    >
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Active Service Plan & Entitlements
            </span>
            <HelpTooltip topic="service_contract_status" label="Service contract help" />
          </div>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            {contract.status}
          </span>
        </div>
        <span className="text-xs text-slate-400 font-mono">
          #{contract.contractNumber}
        </span>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-slate-500 font-medium block">Service Tier</span>
            <span className="text-sm font-bold text-slate-900 mt-0.5 block">
              {contract.serviceType.replace(/_/g, " ")}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-slate-500 font-medium block">Billing Cadence</span>
            <span className="text-sm font-bold text-slate-900 mt-0.5 block">
              {contract.billingCadence.replace(/_/g, " ")}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 col-span-2 sm:col-span-1">
            <span className="text-slate-500 font-medium block">Effective Term</span>
            <span className="text-xs font-semibold text-slate-800 mt-1 block">
              {effectiveDateStr} – {expirationDateStr}
            </span>
          </div>
        </div>

        {contract.entitlements && contract.entitlements.length > 0 && (
          <div className="space-y-2 pt-1 border-t border-slate-100">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Allocated Service Entitlements
              </span>
              <HelpTooltip topic="entitlements_quota" label="Service entitlements quota help" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {contract.entitlements.map((ent) => (
                <div
                  key={ent.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200/70"
                >
                  <span className="text-slate-700 font-medium">
                    {ent.entitlementType.replace(/_/g, " ")}
                  </span>
                  <span className="font-bold text-slate-900">
                    {ent.consumedQuota} / {ent.allocatedQuota} Used
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
