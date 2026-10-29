"use client";

import React, { useState, useTransition } from "react";
import {
  Server,
  Play,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Database,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Filter,
  Check,
  X,
} from "lucide-react";
import {
  triggerJobCollectionAction,
  updateProviderConfigAction,
} from "@/lib/job-discovery/actions";
import type {
  CollectionEngineMetrics,
  CollectionExecutionSummary,
} from "@/lib/job-discovery/types";

interface Props {
  initialMetrics: CollectionEngineMetrics;
  initialProviders: any[];
  initialRecentRuns: any[];
}

export function JobCollectionAdminWorkbench({
  initialMetrics,
  initialProviders,
  initialRecentRuns,
}: Props) {
  const [metrics, setMetrics] = useState<CollectionEngineMetrics>(initialMetrics);
  const [providers, setProviders] = useState<any[]>(initialProviders);
  const [runs, setRuns] = useState<any[]>(initialRecentRuns);

  // Manual trigger state
  const [targetProvider, setTargetProvider] = useState<string>("ALL");
  const [keywords, setKeywords] = useState("");
  const [country, setCountry] = useState("");
  const [maxJobs, setMaxJobs] = useState(50);
  const [isCollecting, startCollectingTransition] = useTransition();
  const [collectionFeedback, setCollectionFeedback] = useState<{
    success: boolean;
    summaries?: CollectionExecutionSummary[];
    error?: string;
  } | null>(null);

  const handleToggleProvider = async (providerId: string, currentEnabled: boolean) => {
    // Optimistic
    setProviders((prev) =>
      prev.map((p) => (p.providerId === providerId ? { ...p, isEnabled: !currentEnabled } : p))
    );

    try {
      await updateProviderConfigAction({
        providerId,
        isEnabled: !currentEnabled,
      });
    } catch {
      // Revert
      setProviders((prev) =>
        prev.map((p) => (p.providerId === providerId ? { ...p, isEnabled: currentEnabled } : p))
      );
    }
  };

  const handleRunManualCollection = () => {
    setCollectionFeedback(null);
    startCollectingTransition(async () => {
      const res = await triggerJobCollectionAction({
        providerId: targetProvider === "ALL" ? undefined : targetProvider,
        keywords: keywords.trim() || undefined,
        country: country.trim() || undefined,
        maxJobs,
      });

      if (res.success && res.summaries) {
        setCollectionFeedback({ success: true, summaries: res.summaries });
        // Update metric counters optimistically
        const totalDiscovered = res.summaries.reduce((a, s) => a + s.jobsDiscovered, 0);
        const totalDuplicates = res.summaries.reduce((a, s) => a + s.duplicatesDetected, 0);

        setMetrics((m) => ({
          ...m,
          totalDiscoveredJobs: m.totalDiscoveredJobs + totalDiscovered,
          activeJobs: m.activeJobs + totalDiscovered,
          duplicateJobs: m.duplicateJobs + totalDuplicates,
          verifiedJobs: m.verifiedJobs + totalDiscovered,
        }));
      } else {
        setCollectionFeedback({ success: false, error: res.error || "Collection failed" });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="bg-white p-6 rounded-[16px] border border-[#E5EAE7] shadow-2xs">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#0F1720]">
              Job Discovery & Collection Engine
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Production orchestrator for multi-source automated job discovery, deduplication, and quality verification.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Engine Active
          </span>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6 pt-5 border-t border-[#EDF1EF]">
          <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Total Discovered
            </span>
            <span className="text-xl font-bold text-slate-900 mt-0.5 block">
              {metrics.totalDiscoveredJobs.toLocaleString()}
            </span>
          </div>

          <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">
              Active / Open Jobs
            </span>
            <span className="text-xl font-bold text-emerald-900 mt-0.5 block">
              {metrics.activeJobs.toLocaleString()}
            </span>
          </div>

          <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block">
              Source Confirmed
            </span>
            <span className="text-xl font-bold text-blue-900 mt-0.5 block">
              {metrics.verifiedJobs.toLocaleString()}
            </span>
          </div>

          <div className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">
              Duplicates Filtered
            </span>
            <span className="text-xl font-bold text-amber-900 mt-0.5 block">
              {metrics.duplicateJobs.toLocaleString()}
            </span>
          </div>

          <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Active Providers
            </span>
            <span className="text-xl font-bold text-slate-900 mt-0.5 block">
              {metrics.providersActive} / {metrics.providersTotal}
            </span>
          </div>
        </div>
      </div>

      {/* Manual Collection Trigger & Controls */}
      <div className="bg-white p-6 rounded-[16px] border border-[#E5EAE7] shadow-2xs space-y-4">
        <div className="border-b border-[#EDF1EF] pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#0F1720]">
              Manual Collection Trigger
            </h2>
            <p className="text-[11px] text-[#64748B] mt-0.5">
              Launch targeted discovery runs on demand with custom keyword or regional parameters.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Target Provider</label>
            <select
              value={targetProvider}
              onChange={(e) => setTargetProvider(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-[#DDE5E0] rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#12A150]"
            >
              <option value="ALL">All Active Providers</option>
              {providers.map((p) => (
                <option key={p.providerId} value={p.providerId}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Target Keywords</label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="e.g. Registered Nurse, DevOps, SAP"
              className="w-full p-2 bg-slate-50 border border-[#DDE5E0] rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#12A150]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Country / Market</label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g. IN, US, DE, Remote"
              className="w-full p-2 bg-slate-50 border border-[#DDE5E0] rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#12A150]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Max Batch Limit</label>
            <input
              type="number"
              min={10}
              max={200}
              value={maxJobs}
              onChange={(e) => setMaxJobs(Number(e.target.value))}
              className="w-full p-2 bg-slate-50 border border-[#DDE5E0] rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#12A150]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-[11px] text-slate-500">
            Protected against concurrent overlapping runs. Rate limits and source attribution are enforced.
          </span>
          <button
            type="button"
            disabled={isCollecting}
            onClick={handleRunManualCollection}
            className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-[#0B3B2C] hover:bg-[#082F26] disabled:opacity-50 transition shadow-2xs flex items-center gap-2"
          >
            {isCollecting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Executing Collection...
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                Run Collection
              </>
            )}
          </button>
        </div>

        {/* Feedback Alert */}
        {collectionFeedback && (
          <div
            className={`p-4 rounded-xl text-xs border ${
              collectionFeedback.success
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            {collectionFeedback.success ? (
              <div className="space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Collection Completed Successfully!
                </div>
                {collectionFeedback.summaries?.map((s) => (
                  <div key={s.runId} className="text-[11px] text-emerald-700 pl-5">
                    <strong>{s.providerId.toUpperCase()}:</strong> {s.jobsDiscovered} new jobs discovered,{" "}
                    {s.jobsUpdated} updated, {s.duplicatesDetected} duplicate candidates grouped ({s.durationMs}ms).
                  </div>
                ))}
              </div>
            ) : (
              <div className="font-semibold">{collectionFeedback.error}</div>
            )}
          </div>
        )}
      </div>

      {/* Provider Registry Table */}
      <div className="bg-white p-6 rounded-[16px] border border-[#E5EAE7] shadow-2xs space-y-4">
        <div className="border-b border-[#EDF1EF] pb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#0F1720]">
            Configured Provider Registry
          </h2>
          <p className="text-[11px] text-[#64748B] mt-0.5">
            Registered source adapters, operational status, quotas, and licensing contracts.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#EDF1EF] text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50">
                <th className="py-2.5 px-3">Provider</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Rate Limit</th>
                <th className="py-2.5 px-3">Last Run</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDF1EF]">
              {providers.map((p) => (
                <tr key={p.providerId} className="hover:bg-slate-50/50 transition">
                  <td className="py-3 px-3">
                    <div className="font-bold text-slate-900">{p.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{p.providerId}</div>
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                      {p.category}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    {p.isEnabled ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        <Check className="w-3.5 h-3.5" /> Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                        <X className="w-3.5 h-3.5" /> Disabled
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-[11px] text-slate-600">
                    {p.rateLimitPerMinute} / min ({p.rateLimitDaily} / day)
                  </td>
                  <td className="py-3 px-3 text-[11px] text-slate-500">
                    {p.lastRunAt ? new Date(p.lastRunAt).toLocaleString() : "Never"}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleToggleProvider(p.providerId, p.isEnabled)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border transition ${
                        p.isEnabled
                          ? "bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200"
                          : "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                      }`}
                    >
                      {p.isEnabled ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Collection Run History Table */}
      <div className="bg-white p-6 rounded-[16px] border border-[#E5EAE7] shadow-2xs space-y-4">
        <div className="border-b border-[#EDF1EF] pb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#0F1720]">
            Recent Collection Run Log
          </h2>
          <p className="text-[11px] text-[#64748B] mt-0.5">
            Audit history of manual and automated collection runs.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#EDF1EF] text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50">
                <th className="py-2.5 px-3">Run ID / Provider</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Discovered</th>
                <th className="py-2.5 px-3">Updated</th>
                <th className="py-2.5 px-3">Duplicates</th>
                <th className="py-2.5 px-3">Duration</th>
                <th className="py-2.5 px-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDF1EF]">
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No collection runs recorded yet. Click &ldquo;Run Collection&rdquo; to initiate the first run.
                  </td>
                </tr>
              ) : (
                runs.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{r.providerId.toUpperCase()}</div>
                      <div className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]">{r.id}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        {r.triggerType}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          r.status === "COMPLETED"
                            ? "bg-emerald-50 text-emerald-800"
                            : r.status === "RUNNING"
                            ? "bg-blue-50 text-blue-800 animate-pulse"
                            : "bg-rose-50 text-rose-800"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-800">{r.jobsDiscovered}</td>
                    <td className="py-3 px-3 text-slate-600">{r.jobsUpdated}</td>
                    <td className="py-3 px-3 text-amber-700 font-medium">{r.duplicatesDetected}</td>
                    <td className="py-3 px-3 text-slate-500">{(r.durationMs / 1000).toFixed(1)}s</td>
                    <td className="py-3 px-3 text-slate-500">{new Date(r.startedAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Scheduling & Cron Configuration Card */}
      <div className="bg-slate-50/70 p-5 rounded-[16px] border border-slate-200 text-xs text-slate-600 space-y-2">
        <div className="font-bold text-slate-900 flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-emerald-600" />
          Scheduled Background Execution Configuration
        </div>
        <p className="leading-relaxed">
          The background collector runs via secure Vercel Cron at <code>/api/cron/job-collection</code> every day at 04:00 UTC.
          Requests are authenticated with <code>Authorization: Bearer &lt;CRON_SECRET&gt;</code> and enforced against concurrent executions.
        </p>
      </div>
    </div>
  );
}
