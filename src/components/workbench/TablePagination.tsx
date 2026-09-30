"use client";

import React from "react";

interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function TablePagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  className = "",
}: TablePaginationProps) {
  if (totalItems === 0 || totalPages <= 1) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div
      className={`px-5 py-3.5 border-t border-[#EDF1EF] bg-[#F7F9F8]/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#64748B] ${className}`}
    >
      <div>
        Showing <span className="font-bold text-[#0F1720]">{startItem}</span> to{" "}
        <span className="font-bold text-[#0F1720]">{endItem}</span> of{" "}
        <span className="font-bold text-[#0F1720]">{totalItems}</span> records
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="px-3 py-1.5 rounded-[9px] border border-[#E5EAE7] bg-white font-medium text-[#0F1720] hover:bg-[#F7F9F8] disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-2xs transition-colors"
        >
          ← Prev
        </button>

        <span className="px-2.5 font-mono font-bold text-[#0F1720]">
          {currentPage} / {totalPages}
        </span>

        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="px-3 py-1.5 rounded-[9px] border border-[#E5EAE7] bg-white font-medium text-[#0F1720] hover:bg-[#F7F9F8] disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-2xs transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
