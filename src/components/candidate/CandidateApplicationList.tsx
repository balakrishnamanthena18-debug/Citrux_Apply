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
  const currentPage = Math.min(page, totalPages);
  const paginatedApps = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredApps.slice(start, start + pageSize);
  }, [filteredApps, currentPage, pageSize]);

  return (
    <div className="overflow-hidden rounded-[18px] border border-[#DDE5E1] bg-white shadow-[0_2px_12px_rgba(15,32,26,0.04)]">
      {/* Header & Search Bar */}
      <div className="flex flex-col gap-3 border-b border-[#EDF1EF] bg-[#F7F9F8] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-3.5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[#10201A]">{title}</h2>
            <span className="text-xs font-bold tabular-nums text-[#0B3B2C]">
              {filteredApps.length}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#66756E]">{subtitle}</p>
        </div>

        <div className="flex w-full items-center gap-3 sm:w-auto">
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
              className="hidden shrink-0 text-xs font-semibold text-[#12A150] hover:text-[#0E8541] md:inline-block"
            >
              View All Applications →
            </Link>
          )}
        </div>
      </div>

      {/* Applications List */}
      {filteredApps.length === 0 ? (
        <div className="space-y-2 p-12 text-center text-[#66756E]">
          <h3 className="text-sm font-semibold text-[#10201A]">
            No applications in this view
          </h3>
          <p className="mx-auto max-w-sm text-xs text-[#66756E]">
            {searchTerm
              ? `No application matches "${searchTerm}". Try resetting your search.`
              : "Applications matched to your profile will appear here in real-time as your team stages them."}
          </p>
          {selectedStage !== "ALL" && onSelectStage && (
            <button
              type="button"
              onClick={() => onSelectStage("ALL")}
              className="inline-block cursor-pointer pt-2 text-xs font-semibold text-[#12A150] hover:text-[#0E8541]"
            >
              View all pipeline stages
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-[#EDF1EF]">
          {paginatedApps.map((app) => (
            <CandidateApplicationCard key={app.id} application={app} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {filteredApps.length > pageSize && (
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredApps.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
