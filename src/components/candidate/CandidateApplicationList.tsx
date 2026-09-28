"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  CandidateApplicationCard,
  CandidateApplicationData,
} from "./CandidateApplicationCard";
import { PipelineStageKey } from "./CandidatePipeline";
import { InstantSearch } from "@/components/workbench/InstantSearch";
import { TablePagination } from "@/components/workbench/TablePagination";

interface Props {
  applications: CandidateApplicationData[];
  selectedStage: PipelineStageKey;
  onSelectStage?: (stage: PipelineStageKey) => void;
  title?: string;
  subtitle?: string;
  showViewAllLink?: boolean;
}

export function CandidateApplicationList({
  applications,
  selectedStage,
  onSelectStage,
  title = "Active Applications",
  subtitle = "Continuous operational oversight of your ongoing and completed submissions",
  showViewAllLink = false,
}: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Filter based on stage and search term in memory (0ms)
  const filteredApps = useMemo(() => {
    let result = applications;

    if (selectedStage === "PREPARING") {
      result = result.filter((a) =>
        ["DISCOVERED", "QUALIFIED", "PREPARING"].includes(a.status)
      );
    } else if (selectedStage === "UNDER_REVIEW") {
      result = result.filter((a) =>
        ["REVIEW", "REVIEW_REQUIRED", "CORRECTION_APPROVED"].includes(a.status)
      );
    } else if (selectedStage === "AWAITING_APPROVAL") {
      result = result.filter((a) => a.status === "AWAITING_APPROVAL");
    } else if (selectedStage === "READY") {
      result = result.filter((a) => a.status === "READY");
    } else if (selectedStage === "SUBMITTED") {
      result = result.filter((a) =>
        ["SUBMITTED", "RESUBMISSION"].includes(a.status)
      );
    } else if (selectedStage === "EMPLOYER_RESPONSE") {
      result = result.filter((a) =>
        ["REJECTED", "WITHDRAWN", "FAILED"].includes(a.status)
      );
    }

    const q = searchTerm.trim().toLowerCase();
    if (q) {
      result = result.filter((a) => {
        const titleMatch = a.job.title.toLowerCase().includes(q);
        const companyMatch = a.job.companyName.toLowerCase().includes(q);
        const locMatch = (a.job.location || "").toLowerCase().includes(q);
        return titleMatch || companyMatch || locMatch;
      });
    }

    return result;
  }, [applications, selectedStage, searchTerm]);

  const totalPages = Math.ceil(filteredApps.length / pageSize) || 1;
  const paginatedApps = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredApps.slice(start, start + pageSize);
  }, [filteredApps, page, pageSize]);

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
      {/* Header & Search Bar */}
      <div className="p-4 sm:px-5 sm:py-3.5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
              {filteredApps.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="w-full sm:w-64">
            <InstantSearch
              value={searchTerm}
              onChange={(t) => {
                setSearchTerm(t);
                setPage(1);
              }}
              placeholder="Search by role, company..."
            />
          </div>
          {showViewAllLink && (
            <Link
              href="/candidate/applications"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 shrink-0 hidden md:inline-block"
            >
              View All Applications →
            </Link>
          )}
        </div>
      </div>

      {/* Applications List */}
      {filteredApps.length === 0 ? (
        <div className="p-12 text-center text-slate-500 space-y-2">
          <div className="text-3xl">📂</div>
          <h3 className="text-sm font-semibold text-slate-900">
            No applications in this view
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchTerm
              ? `No application matches "${searchTerm}". Try resetting your search.`
              : "Applications matched to your profile will appear here in real-time as your team stages them."}
          </p>
          {selectedStage !== "ALL" && onSelectStage && (
            <button
              type="button"
              onClick={() => onSelectStage("ALL")}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 pt-2 cursor-pointer inline-block"
            >
              View all pipeline stages
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {paginatedApps.map((app) => (
            <CandidateApplicationCard key={app.id} application={app} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {filteredApps.length > pageSize && (
        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={filteredApps.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
