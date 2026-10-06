"use client";

/**
 * Phase 5G — Requested Applications intake panel (Application Desk).
 */

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getRequestedApplicationIntakeAction,
  startApplicationFromRequestedIntakeAction,
} from "@/lib/application/requested-intake-actions";
import type { RequestedApplicationIntakeItem } from "@/lib/application/requested-intake-types";
import { formatApplicationCardDate } from "@/lib/utils/format-application-date";

type Props = {
  initialItems: RequestedApplicationIntakeItem[];
  initialNextCursor: string | null;
  initialTotalPending: number;
};

function locationLabel(item: RequestedApplicationIntakeItem): string {
  if (item.isRemote) return "Remote";
  return item.location?.trim() || "—";
}

export function RequestedApplicationIntakePanel({
  initialItems,
  initialNextCursor,
  initialTotalPending,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [totalPending, setTotalPending] = useState(initialTotalPending);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refreshList() {
    startTransition(async () => {
      setError(null);
      const res = await getRequestedApplicationIntakeAction({});
      if (!res.success) {
        setError(res.error || "Unable to load requested applications.");
        return;
      }
      setItems(res.data.items);
      setNextCursor(res.data.nextCursor);
      setTotalPending(res.data.totalPending);
    });
  }

  function loadMore() {
    if (!nextCursor) return;
    startTransition(async () => {
      setError(null);
      const res = await getRequestedApplicationIntakeAction({ cursor: nextCursor });
      if (!res.success) {
        setError(res.error || "Unable to load more requests.");
        return;
      }
      setItems((prev) => [...prev, ...res.data.items]);
      setNextCursor(res.data.nextCursor);
      setTotalPending(res.data.totalPending);
    });
  }

  function handleStart(item: RequestedApplicationIntakeItem) {
    if (!item.canStart || startingId) return;
    setStartingId(item.matchId);
    setError(null);
    startTransition(async () => {
      const res = await startApplicationFromRequestedIntakeAction({
        candidateId: item.candidateId,
        jobId: item.jobId,
      });
      setStartingId(null);
      if (!res.success) {
        setError(res.error || "Failed to start application.");
        refreshList();
        return;
      }
      setItems((prev) => prev.filter((row) => row.matchId !== item.matchId));
      setTotalPending((n) => Math.max(0, n - 1));
      router.push(`/employee/applications/${res.data.applicationId}`);
      router.refresh();
    });
  }

  return (
    <section
      className="bg-white rounded-[20px] border border-[#E5EAE7]/90 shadow-2xs overflow-hidden"
      aria-labelledby="requested-applications-heading"
      data-testid="requested-application-intake"
    >
      <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-[#EDF1EF] flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2
            id="requested-applications-heading"
            className="text-sm font-semibold text-[#0F1720] tracking-tight"
          >
            Requested applications
          </h2>
          <p className="text-xs text-[#64748B]">
            Application requests waiting for your team to start work.
            {totalPending > 0 ? ` ${totalPending} pending.` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={refreshList}
          disabled={isPending}
          className="text-xs font-semibold text-[#0B3B2C] hover:underline disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#12A150]/40 rounded"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div
          className="mx-5 mt-4 sm:mx-6 rounded-[12px] border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
          role="alert"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={refreshList}
            className="mt-1 text-xs font-semibold underline focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 rounded"
          >
            Retry
          </button>
        </div>
      ) : null}

      {items.length === 0 && !error ? (
        <div className="px-5 py-10 sm:px-6 text-center space-y-1">
          <p className="text-sm font-medium text-[#0F1720]">
            No application requests are waiting.
          </p>
          <p className="text-xs text-[#64748B]">
            When a candidate requests an application, it will appear here.
          </p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#EDF1EF] text-[11px] uppercase tracking-wider text-[#64748B]">
                  <th scope="col" className="px-5 py-3 font-semibold sm:px-6">
                    Candidate
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Role
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Requested
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold text-right sm:px-6">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF1EF]">
                {items.map((item) => (
                  <tr key={item.matchId} className="align-top">
                    <td className="px-5 py-3.5 sm:px-6">
                      <div className="font-semibold text-[#0F1720]">
                        {item.candidateName}
                      </div>
                      <div className="text-xs text-[#64748B] truncate max-w-[220px]">
                        {item.candidateEmail}
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="font-medium text-[#0F1720]">
                        {item.jobTitle}
                      </div>
                      <div className="text-xs text-[#64748B]">
                        {item.companyName} · {locationLabel(item)}
                        {item.matchCategory ? ` · ${item.matchCategory}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-[#334155] whitespace-nowrap">
                      <time dateTime={item.requestedAt}>
                        {formatApplicationCardDate(item.requestedAt)}
                      </time>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="inline-flex items-center rounded-md border border-[#D1FAE5] bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-semibold text-[#065F46]">
                        {item.requestState === "REQUESTED" ? "Requested" : item.requestState}
                      </span>
                      {item.blockedReason ? (
                        <div className="mt-1 text-[11px] text-amber-800">
                          {item.blockedReason}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5 text-right sm:px-6">
                      <button
                        type="button"
                        onClick={() => handleStart(item)}
                        disabled={!item.canStart || startingId === item.matchId || isPending}
                        aria-label={`Start application for ${item.candidateName}, ${item.jobTitle}`}
                        className="inline-flex items-center justify-center rounded-[12px] bg-[#0B3B2C] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0F4A38] disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#12A150]/50"
                      >
                        {startingId === item.matchId ? "Starting…" : "Start application"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-[#EDF1EF]">
            {items.map((item) => (
              <li key={item.matchId} className="px-5 py-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-[#0F1720]">
                    {item.candidateName}
                  </p>
                  <p className="text-xs text-[#64748B]">{item.candidateEmail}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#0F1720]">
                    {item.jobTitle}
                  </p>
                  <p className="text-xs text-[#64748B]">
                    {item.companyName} · {locationLabel(item)}
                  </p>
                  {item.matchCategory ? (
                    <p className="text-xs text-[#64748B] mt-0.5">{item.matchCategory}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <span className="inline-flex items-center rounded-md border border-[#D1FAE5] bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-semibold text-[#065F46]">
                      Requested
                    </span>
                    <p className="text-xs text-[#64748B]">
                      <time dateTime={item.requestedAt}>
                        {formatApplicationCardDate(item.requestedAt)}
                      </time>
                    </p>
                    {item.blockedReason ? (
                      <p className="text-[11px] text-amber-800">{item.blockedReason}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStart(item)}
                    disabled={!item.canStart || startingId === item.matchId || isPending}
                    aria-label={`Start application for ${item.candidateName}, ${item.jobTitle}`}
                    className="inline-flex items-center justify-center rounded-[12px] bg-[#0B3B2C] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0F4A38] disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#12A150]/50"
                  >
                    {startingId === item.matchId ? "Starting…" : "Start application"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {nextCursor ? (
        <div className="px-5 py-3 sm:px-6 border-t border-[#EDF1EF]">
          <button
            type="button"
            onClick={loadMore}
            disabled={isPending}
            className="text-xs font-semibold text-[#0B3B2C] hover:underline disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#12A150]/40 rounded"
          >
            Load more
          </button>
        </div>
      ) : null}
    </section>
  );
}
