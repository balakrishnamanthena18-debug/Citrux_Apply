"use client";

import React, { useState, useMemo, useTransition, useCallback, useEffect } from "react";
import {
  Shield,
  Search,
  Filter,
  Calendar,
  ArrowUpDown,
  Download,
  RotateCcw,
  ExternalLink,
  ChevronRight,
  Copy,
  Check,
  Globe,
  Layers,
  Clock,
  User,
  AlertCircle,
  FileSpreadsheet,
  FileCode,
} from "lucide-react";
import {
  WorkbenchShell,
  WorkbenchToolbar,
  WorkbenchEmptyState,
  InstantTabs,
  InstantSearch,
  TablePagination,
  type TabItem,
} from "@/components/workbench";
import { MetricStrip, type MetricStripItem } from "@/components/ui/MetricStrip";
import {
  AuditInvestigationDrawer,
  type AuditEventDetail,
} from "@/components/admin/AuditInvestigationDrawer";
import { AlertDialog } from "@/components/ui/dialog";
import {
  getAllCategories,
  getActionMetadata,
  CATEGORY_LABELS,
  ALL_AUDIT_ACTIONS,
  type AuditCategory,
  type AuditTone,
} from "@/lib/audit/catalog";
import { listAuditLogsAction, exportAuditLogsAction } from "@/lib/admin/actions";
import { syncUrlParams } from "@/lib/client/urlSync";

export interface AuditKpis {
  totalEvents: number;
  securityEvents: number;
  authSessions: number;
  activeActors: number;
}

export interface InitialAuditFilters {
  category?: string;
  action?: string;
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortOrder?: "asc" | "desc";
}

interface Props {
  initialEvents: AuditEventDetail[];
  initialTotalCount: number;
  initialFilters: InitialAuditFilters;
  kpis: AuditKpis;
  knownActors?: Array<{ id: string; name: string; email: string }>;
}

const toneStyles: Record<AuditTone, { bg: string; text: string; border: string }> = {
  emerald: { bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-200" },
  rose: { bg: "bg-rose-50", text: "text-rose-800", border: "border-rose-200" },
  amber: { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200" },
  blue: { bg: "bg-sky-50", text: "text-sky-800", border: "border-sky-200" },
  purple: { bg: "bg-purple-50", text: "text-purple-800", border: "border-purple-200" },
  neutral: { bg: "bg-slate-100", text: "text-slate-800", border: "border-slate-200" },
};

export function AuditInvestigationWorkbench({
  initialEvents,
  initialTotalCount,
  initialFilters,
  kpis,
  knownActors = [],
}: Props) {
  const [events, setEvents] = useState<AuditEventDetail[]>(initialEvents);
  const [totalCount, setTotalCount] = useState<number>(initialTotalCount);
  const [page, setPage] = useState<number>(initialFilters.page || 1);
  const [pageSize, setPageSize] = useState<number>(initialFilters.limit || 25);
  const [category, setCategory] = useState<string>(initialFilters.category || "ALL");
  const [selectedAction, setSelectedAction] = useState<string>(initialFilters.action || "");
  const [actorUserId, setActorUserId] = useState<string>(initialFilters.actorUserId || "");
  const [entityType, setEntityType] = useState<string>(initialFilters.entityType || "");
  const [entityId, setEntityId] = useState<string>(initialFilters.entityId || "");
  const [startDate, setStartDate] = useState<string>(initialFilters.startDate || "");
  const [endDate, setEndDate] = useState<string>(initialFilters.endDate || "");
  const [searchTerm, setSearchTerm] = useState<string>(initialFilters.search || "");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(initialFilters.sortOrder || "desc");

  const [selectedEvent, setSelectedEvent] = useState<AuditEventDetail | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exportAlert, setExportAlert] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Sync state to URL and fetch fresh data
  const fetchData = useCallback(
    (overrides: Partial<InitialAuditFilters> = {}) => {
      const queryParams: InitialAuditFilters = {
        page: overrides.page !== undefined ? overrides.page : page,
        limit: overrides.limit !== undefined ? overrides.limit : pageSize,
        category: overrides.category !== undefined ? overrides.category : category,
        action: overrides.action !== undefined ? overrides.action : selectedAction,
        actorUserId: overrides.actorUserId !== undefined ? overrides.actorUserId : actorUserId,
        entityType: overrides.entityType !== undefined ? overrides.entityType : entityType,
        entityId: overrides.entityId !== undefined ? overrides.entityId : entityId,
        startDate: overrides.startDate !== undefined ? overrides.startDate : startDate,
        endDate: overrides.endDate !== undefined ? overrides.endDate : endDate,
        search: overrides.search !== undefined ? overrides.search : searchTerm,
        sortOrder: overrides.sortOrder !== undefined ? overrides.sortOrder : sortOrder,
      };

      // Sync URL
      syncUrlParams({
        page: queryParams.page === 1 ? null : queryParams.page,
        limit: queryParams.limit === 25 ? null : queryParams.limit,
        category: queryParams.category === "ALL" ? null : queryParams.category,
        action: queryParams.action || null,
        actorUserId: queryParams.actorUserId || null,
        entityType: queryParams.entityType || null,
        entityId: queryParams.entityId || null,
        startDate: queryParams.startDate || null,
        endDate: queryParams.endDate || null,
        search: queryParams.search || null,
        sortOrder: queryParams.sortOrder === "desc" ? null : queryParams.sortOrder,
      });

      startTransition(async () => {
        setErrorMessage(null);
        const res = await listAuditLogsAction({
          page: queryParams.page,
          limit: queryParams.limit,
          category: queryParams.category === "ALL" ? undefined : queryParams.category,
          action: queryParams.action || undefined,
          actorUserId: queryParams.actorUserId || undefined,
          entityType: queryParams.entityType || undefined,
          entityId: queryParams.entityId || undefined,
          startDate: queryParams.startDate || undefined,
          endDate: queryParams.endDate || undefined,
          search: queryParams.search || undefined,
          sortOrder: queryParams.sortOrder,
        });

        if (res.success && res.data) {
          setEvents(res.data.logs);
          setTotalCount(res.data.totalCount);
        } else {
          setErrorMessage(res.error || "Failed to load audit logs");
        }
      });
    },
    [
      page,
      pageSize,
      category,
      selectedAction,
      actorUserId,
      entityType,
      entityId,
      startDate,
      endDate,
      searchTerm,
      sortOrder,
    ]
  );

  // Tabs for Categories
  const categoryTabs: TabItem[] = useMemo(() => {
    return getAllCategories().map((cat) => ({
      key: cat.key,
      label: cat.label,
    }));
  }, []);

  const handleCategoryChange = (newCat: string) => {
    setCategory(newCat);
    setSelectedAction(""); // Reset specific action if category changes
    setPage(1);
    fetchData({ category: newCat, action: "", page: 1 });
  };

  const handleActionChange = (newAct: string) => {
    setSelectedAction(newAct);
    setPage(1);
    fetchData({ action: newAct, page: 1 });
  };

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setPage(1);
    fetchData({ search: val, page: 1 });
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchData({ page: newPage });
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
    fetchData({ limit: newSize, page: 1 });
  };

  const handleSortToggle = () => {
    const nextSort = sortOrder === "desc" ? "asc" : "desc";
    setSortOrder(nextSort);
    fetchData({ sortOrder: nextSort });
  };

  const handleResetFilters = () => {
    setCategory("ALL");
    setSelectedAction("");
    setActorUserId("");
    setEntityType("");
    setEntityId("");
    setStartDate("");
    setEndDate("");
    setSearchTerm("");
    setSortOrder("desc");
    setPage(1);
    fetchData({
      category: "ALL",
      action: "",
      actorUserId: "",
      entityType: "",
      entityId: "",
      startDate: "",
      endDate: "",
      search: "",
      sortOrder: "desc",
      page: 1,
    });
  };

  const handleFilterByActor = (newActorId: string) => {
    setActorUserId(newActorId);
    setPage(1);
    fetchData({ actorUserId: newActorId, page: 1 });
  };

  const handleFilterByEntity = (newEntityType: string, newEntityId: string) => {
    setEntityType(newEntityType);
    setEntityId(newEntityId);
    setPage(1);
    fetchData({ entityType: newEntityType, entityId: newEntityId, page: 1 });
  };

  const handleCopy = (text: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleExport = async (format: "csv" | "json") => {
    setIsExporting(true);
    try {
      const res = await exportAuditLogsAction({
        format,
        limit: 500,
        category: category === "ALL" ? undefined : category,
        action: selectedAction || undefined,
        actorUserId: actorUserId || undefined,
        entityType: entityType || undefined,
        entityId: entityId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        search: searchTerm || undefined,
      });

      if (res.success && res.data) {
        const blob = new Blob([res.data.data], {
          type: format === "csv" ? "text/csv;charset=utf-8;" : "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", res.data.filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        const msg = res.error || "Failed to export audit logs";
        setErrorMessage(msg);
        setExportAlert(msg);
      }
    } catch (err: any) {
      const msg = err.message || "Export failed";
      setErrorMessage(msg);
      setExportAlert(msg);
    } finally {
      setIsExporting(false);
    }
  };

  const hasActiveFilters =
    category !== "ALL" ||
    !!selectedAction ||
    !!actorUserId ||
    !!entityType ||
    !!entityId ||
    !!startDate ||
    !!endDate ||
    !!searchTerm;

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  // KPI Strip definition
  const metricItems: MetricStripItem[] = [
    {
      label: "Total Audit Records",
      value: kpis.totalEvents,
      accent: true,
    },
    {
      label: "Security & Alerts",
      value: kpis.securityEvents,
    },
    {
      label: "User Sessions",
      value: kpis.authSessions,
    },
    {
      label: "Tracked Actors",
      value: kpis.activeActors,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Real KPI Summary Strip */}
      <MetricStrip items={metricItems} />

      {/* Main Investigation Console Workbench */}
      <WorkbenchShell ariaLabel="Audit Investigation Console">
        {/* Category Filter Tabs */}
        <div className="px-5 pt-3 pb-2 border-b border-[#EDF1EF] bg-white">
          <InstantTabs
            tabs={categoryTabs}
            activeTab={category}
            onChange={handleCategoryChange}
            ariaLabel="Audit Event Categories"
          />
        </div>

        {/* Primary Filter Toolbar */}
        <WorkbenchToolbar className="flex-col gap-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full justify-between">
            {/* Search Input */}
            <div className="w-full md:w-80">
              <InstantSearch
                value={searchTerm}
                onChange={handleSearchChange}
                placeholder="Search action, entity, actor, IP... (/)"
              />
            </div>

            {/* Quick Action Filters & Export */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {/* Action Dropdown */}
              <div className="flex items-center">
                <select
                  value={selectedAction}
                  onChange={(e) => handleActionChange(e.target.value)}
                  className="rounded-[10px] border border-[#DDE5E0] px-3 py-1.5 text-xs bg-white text-[#0F1720] font-medium focus:outline-none focus:ring-1 focus:ring-[#12A150] focus:border-[#12A150] cursor-pointer max-w-[200px] truncate"
                >
                  <option value="">All Actions in Category</option>
                  {ALL_AUDIT_ACTIONS.map((act) => {
                    const meta = getActionMetadata(act);
                    if (category !== "ALL" && meta.category !== category) return null;
                    return (
                      <option key={act} value={act}>
                        {meta.label} ({act})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Sort Order Toggle */}
              <button
                type="button"
                onClick={handleSortToggle}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-[#DDE5E0] bg-white text-xs font-medium text-[#334155] hover:bg-[#F7F9F8] transition-colors cursor-pointer"
                title={`Sorting ${sortOrder === "desc" ? "Newest First" : "Oldest First"}`}
              >
                <ArrowUpDown className="h-3.5 w-3.5 text-[#64748B]" />
                <span>{sortOrder === "desc" ? "Newest" : "Oldest"}</span>
              </button>

              {/* Export Dropdown / Buttons */}
              <div className="inline-flex items-center rounded-[10px] border border-[#DDE5E0] bg-white overflow-hidden shadow-2xs">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => handleExport("csv")}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#0F1720] hover:bg-[#F7F9F8] border-r border-[#DDE5E0] transition-colors cursor-pointer disabled:opacity-50"
                  title="Export current filtered view to CSV"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                  <span>CSV</span>
                </button>
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => handleExport("json")}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#0F1720] hover:bg-[#F7F9F8] transition-colors cursor-pointer disabled:opacity-50"
                  title="Export current filtered view to JSON"
                >
                  <FileCode className="h-3.5 w-3.5 text-blue-600" />
                  <span>JSON</span>
                </button>
              </div>

              {/* Reset Button */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-800 transition-colors cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* Secondary Filter Row: Date Range, Entity Type, Actor User ID */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-[#EDF1EF] text-xs">
            {/* Date Range Controls */}
            <div className="inline-flex items-center gap-1.5 bg-white border border-[#DDE5E0] rounded-[10px] px-2.5 py-1">
              <Calendar className="h-3.5 w-3.5 text-[#64748B]" />
              <span className="text-[10px] uppercase font-bold text-[#94A3B8]">UTC Date:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                  fetchData({ startDate: e.target.value, page: 1 });
                }}
                className="text-xs text-[#0F1720] bg-transparent focus:outline-none cursor-pointer"
                placeholder="From date"
                title="Start date (UTC)"
              />
              <span className="text-[#94A3B8]">—</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                  fetchData({ endDate: e.target.value, page: 1 });
                }}
                className="text-xs text-[#0F1720] bg-transparent focus:outline-none cursor-pointer"
                placeholder="To date"
                title="End date (UTC)"
              />
            </div>

            {/* Entity Type Input */}
            <div className="inline-flex items-center">
              <input
                type="text"
                value={entityType}
                onChange={(e) => {
                  setEntityType(e.target.value);
                  setPage(1);
                  fetchData({ entityType: e.target.value, page: 1 });
                }}
                placeholder="Filter Entity Type..."
                className="rounded-[10px] border border-[#DDE5E0] px-3 py-1.5 text-xs bg-white text-[#0F1720] focus:outline-none focus:ring-1 focus:ring-[#12A150] w-36"
              />
            </div>

            {/* Entity ID Input */}
            <div className="inline-flex items-center">
              <input
                type="text"
                value={entityId}
                onChange={(e) => {
                  setEntityId(e.target.value);
                  setPage(1);
                  fetchData({ entityId: e.target.value, page: 1 });
                }}
                placeholder="Filter Entity ID / UUID..."
                className="rounded-[10px] border border-[#DDE5E0] px-3 py-1.5 text-xs bg-white text-[#0F1720] focus:outline-none focus:ring-1 focus:ring-[#12A150] w-44 font-mono"
              />
            </div>

            {/* Actor User ID Input / Picker */}
            <div className="inline-flex items-center">
              <input
                type="text"
                value={actorUserId}
                onChange={(e) => {
                  setActorUserId(e.target.value);
                  setPage(1);
                  fetchData({ actorUserId: e.target.value, page: 1 });
                }}
                placeholder="Filter Actor User ID..."
                className="rounded-[10px] border border-[#DDE5E0] px-3 py-1.5 text-xs bg-white text-[#0F1720] focus:outline-none focus:ring-1 focus:ring-[#12A150] w-44 font-mono"
              />
            </div>

            {/* Page Size Selector */}
            <div className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-[#64748B]">
              <span>Rows:</span>
              {[25, 50, 100].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => handlePageSizeChange(size)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                    pageSize === size
                      ? "bg-[#0F1720] text-white"
                      : "bg-white border border-[#E5EAE7] text-[#64748B] hover:text-[#0F1720]"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </WorkbenchToolbar>

        {/* Active Filter Pills Bar */}
        {hasActiveFilters && (
          <div className="px-5 py-2.5 bg-[#F7F9F8] border-b border-[#EDF1EF] flex items-center gap-2 flex-wrap text-xs">
            <span className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">Active Filters:</span>
            {category !== "ALL" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-[#E5EAE7] text-xs font-medium text-[#0F1720]">
                Category: {CATEGORY_LABELS[category as AuditCategory] || category}
                <button
                  type="button"
                  onClick={() => handleCategoryChange("ALL")}
                  className="hover:text-rose-600 font-bold ml-0.5"
                >
                  ×
                </button>
              </span>
            )}
            {selectedAction && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-[#E5EAE7] text-xs font-medium text-[#0F1720]">
                Action: {getActionMetadata(selectedAction).label}
                <button
                  type="button"
                  onClick={() => handleActionChange("")}
                  className="hover:text-rose-600 font-bold ml-0.5"
                >
                  ×
                </button>
              </span>
            )}
            {searchTerm && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-[#E5EAE7] text-xs font-medium text-[#0F1720]">
                Search: &quot;{searchTerm}&quot;
                <button
                  type="button"
                  onClick={() => handleSearchChange("")}
                  className="hover:text-rose-600 font-bold ml-0.5"
                >
                  ×
                </button>
              </span>
            )}
            {actorUserId && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-[#E5EAE7] text-xs font-medium text-[#0F1720]">
                Actor: {actorUserId.slice(0, 8)}...
                <button
                  type="button"
                  onClick={() => {
                    setActorUserId("");
                    fetchData({ actorUserId: "" });
                  }}
                  className="hover:text-rose-600 font-bold ml-0.5"
                >
                  ×
                </button>
              </span>
            )}
            {entityType && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-[#E5EAE7] text-xs font-medium text-[#0F1720]">
                Entity: {entityType}
                <button
                  type="button"
                  onClick={() => {
                    setEntityType("");
                    fetchData({ entityType: "" });
                  }}
                  className="hover:text-rose-600 font-bold ml-0.5"
                >
                  ×
                </button>
              </span>
            )}
            {entityId && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-[#E5EAE7] text-xs font-medium text-[#0F1720]">
                Entity ID: {entityId.slice(0, 8)}...
                <button
                  type="button"
                  onClick={() => {
                    setEntityId("");
                    fetchData({ entityId: "" });
                  }}
                  className="hover:text-rose-600 font-bold ml-0.5"
                >
                  ×
                </button>
              </span>
            )}
            {(startDate || endDate) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-[#E5EAE7] text-xs font-medium text-[#0F1720]">
                Date: {startDate || "Earliest"} → {endDate || "Latest"}
                <button
                  type="button"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                    fetchData({ startDate: "", endDate: "" });
                  }}
                  className="hover:text-rose-600 font-bold ml-0.5"
                >
                  ×
                </button>
              </span>
            )}
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div className="mx-5 my-3 p-3 bg-rose-50 border border-rose-200 rounded-[12px] flex items-center gap-2 text-xs text-rose-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Audit Log Table Container with Horizontal Scroll Protection */}
        <div className="relative overflow-x-auto min-h-[300px]">
          {isPending && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-2xs z-10 flex items-center justify-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#E5EAE7] shadow-sm text-xs font-semibold text-[#0B3B2C]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#12A150]" />
                <span>Loading investigation logs…</span>
              </div>
            </div>
          )}

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E5EAE7] bg-[#F7F9F8] text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                <th className="px-5 py-3 whitespace-nowrap">Timestamp (UTC)</th>
                <th className="px-5 py-3 whitespace-nowrap">Event Action & Category</th>
                <th className="px-5 py-3 whitespace-nowrap">Actor</th>
                <th className="px-5 py-3 whitespace-nowrap">Target Entity</th>
                <th className="px-5 py-3 whitespace-nowrap">Context</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDF1EF] text-xs">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-0">
                    <WorkbenchEmptyState
                      title="No Audit Records Found"
                      description={
                        hasActiveFilters
                          ? "No audit records matched your active filter criteria. Try resetting filters or adjusting search parameters."
                          : "No authoritative audit logs have been recorded yet."
                      }
                      actionText={hasActiveFilters ? "Reset Filters" : undefined}
                      onAction={hasActiveFilters ? handleResetFilters : undefined}
                    />
                  </td>
                </tr>
              ) : (
                events.map((evt) => {
                  const meta = getActionMetadata(evt.action);
                  const tone = toneStyles[meta.tone] || toneStyles.neutral;
                  const date = new Date(evt.createdAt);
                  const formattedUtc = date.toISOString().replace("T", " ").slice(0, 19);

                  const actorName = evt.actor
                    ? `${evt.actor.firstName || ""} ${evt.actor.lastName || ""}`.trim() || evt.actor.email
                    : evt.actorType;

                  return (
                    <tr
                      key={evt.id}
                      onClick={() => setSelectedEvent(evt)}
                      className="hover:bg-[#F7F9F8] transition-colors cursor-pointer group"
                    >
                      {/* Timestamp Column */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="font-mono text-xs font-semibold text-[#0F1720] flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-[#94A3B8]" />
                          <span>{formattedUtc}</span>
                          <span className="text-[10px] px-1 py-0.2 rounded bg-slate-100 text-[#64748B] font-mono">
                            UTC
                          </span>
                        </div>
                      </td>

                      {/* Action & Category Column */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${tone.bg} ${tone.text} ${tone.border}`}
                          >
                            {meta.label}
                          </span>
                          <span className="font-mono text-[10px] text-[#94A3B8] hidden xl:inline">
                            {evt.action}
                          </span>
                        </div>
                      </td>

                      {/* Actor Column */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="min-w-0">
                          <div className="font-medium text-xs text-[#0F1720] truncate max-w-[180px]">
                            {actorName}
                          </div>
                          {evt.actor?.email ? (
                            <div className="font-mono text-[11px] text-[#64748B] truncate max-w-[180px]">
                              {evt.actor.email}
                            </div>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-[#64748B] font-bold">
                              {evt.actorType}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Entity Column */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-semibold text-[11px] text-[#0F1720]">
                            {evt.entityType}
                          </span>
                          {evt.entityId && (
                            <span
                              className="font-mono text-[11px] text-[#64748B] max-w-[120px] truncate"
                              title={evt.entityId}
                            >
                              {evt.entityId.slice(0, 8)}...
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Network & IP Context */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {evt.ipAddress ? (
                          <span className="font-mono text-[11px] text-[#64748B] bg-slate-50 px-2 py-0.5 rounded border border-[#E5EAE7]">
                            {evt.ipAddress}
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#94A3B8] italic">internal</span>
                        )}
                      </td>

                      {/* Details Trigger Column */}
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(evt);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] bg-white border border-[#E5EAE7] text-xs font-semibold text-[#0F1720] group-hover:bg-[#12A150] group-hover:text-white group-hover:border-[#12A150] transition-all cursor-pointer shadow-2xs"
                        >
                          <span>Inspect</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Side Pagination Bar */}
        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalCount}
          pageSize={pageSize}
          onPageChange={handlePageChange}
        />
      </WorkbenchShell>

      {/* Slide-Over Investigation Drawer */}
      <AuditInvestigationDrawer
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onFilterByActor={handleFilterByActor}
        onFilterByEntity={handleFilterByEntity}
      />

      {/* Enterprise Alert Dialog */}
      <AlertDialog
        open={!!exportAlert}
        title="Export Failed"
        message={exportAlert || "An unexpected error occurred while exporting the audit logs."}
        variant="error"
        onClose={() => setExportAlert(null)}
      />
    </div>
  );
}
