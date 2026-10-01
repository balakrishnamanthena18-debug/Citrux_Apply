"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error caught by boundary:", error);
  }, [error]);

  const isAccessDenied = error.message?.toLowerCase().includes("access denied");

  return (
    <div className="max-w-xl mx-auto my-12 p-8 bg-white rounded-lg border border-slate-200 shadow-sm text-center space-y-4">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 font-bold text-xl">
        ✕
      </div>

      <h2 className="text-lg font-bold text-slate-900">
        {isAccessDenied ? "Access Denied" : "Something went wrong"}
      </h2>

      <p className="text-xs text-slate-600 leading-relaxed">
        {error.message?.includes("EMAXCONNSESSION") || error.message?.includes("max clients")
          ? "The workspace is temporarily busy. Please try again in a moment."
          : error.message || "An unexpected error occurred while processing your request."}
      </p>

      {isAccessDenied && (
        <div className="p-3 bg-amber-50 rounded border border-amber-200 text-xs text-amber-900 text-left space-y-1">
          <p className="font-semibold">Role-Based Access Control (RBAC):</p>
          <p>
            Your current account does not have authorization to view this internal staff workspace. Please navigate to your candidate portal or sign in with an employee/admin account.
          </p>
        </div>
      )}

      <div className="flex justify-center gap-3 pt-4">
        <Link
          href="/candidate"
          className="bg-slate-900 hover:bg-slate-800 text-white font-semibold px-4 py-2 rounded text-xs"
        >
          Go to Candidate Portal
        </Link>
        <button
          onClick={() => reset()}
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 py-2 rounded text-xs border border-slate-300"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
