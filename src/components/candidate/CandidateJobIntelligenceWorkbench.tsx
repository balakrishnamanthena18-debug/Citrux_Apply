"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getCandidateJobFeed } from "@/lib/job-matching/feed-actions";
import { getCandidateDecisionHistory } from "@/lib/job-matching/continuity-actions";
import { getCandidateJobMatchDetail } from "@/lib/job-matching/detail-actions";
import {
  saveCandidateJobMatchAction,
  dismissCandidateJobMatchAction,
  requestCandidateJobApplicationAction,
} from "@/lib/job-matching/actions";
import type {
  CandidateJobFeedCategory,
  CandidateJobFeedFilters,
  CandidateJobFeedItem,
  CandidateJobFeedPage,
} from "@/lib/job-matching/feed-types";
import type { CandidateJobMatchDetail } from "@/lib/job-matching/detail-types";
import { InstantTabs, type TabItem } from "@/components/workbench/InstantTabs";
import { CandidateJobMatchCard } from "@/components/candidate/CandidateJobMatchCard";
import { CandidateJobMatchDetailDrawer } from "@/components/candidate/CandidateJobMatchDetailDrawer";
import { RequestApplicationConfirmDialog } from "@/components/candidate/RequestApplicationConfirmDialog";
import { emptyReasonCopy } from "@/lib/job-matching/feed-ui";
import { historyItemAsFeedItem } from "@/lib/job-matching/continuity-ui";
import { syncUrlParams } from "@/lib/client/urlSync";

export type JobIntelligenceFilterKey =
  | "ALL"
  | CandidateJobFeedCategory
  | "SAVED"
  | "REQUESTED";

type Props = {
  initialPage: CandidateJobFeedPage;
  initialFilter?: JobIntelligenceFilterKey;
  initialError?: string | null;
};

function patchItem(
  items: CandidateJobFeedItem[],
  matchId: string,
  patch: Partial<CandidateJobFeedItem["state"]> & {
    match?: Partial<CandidateJobFeedItem["match"]>;
    continuity?: CandidateJobFeedItem["continuity"];
  }
): CandidateJobFeedItem[] {
  return items.map((item) => {
    if (item.matchId !== matchId) return item;
    return {
      ...item,
      state: { ...item.state, ...patch },
      match: patch.match ? { ...item.match, ...patch.match } : item.match,
      continuity:
        patch.continuity !== undefined ? patch.continuity : item.continuity,
    };
  });
}

function filtersForKey(key: JobIntelligenceFilterKey): CandidateJobFeedFilters | undefined {
  if (key === "ALL") return undefined;
  if (key === "SAVED" || key === "REQUESTED") return undefined;
  return { category: key };
}

function isHistoryFilter(
  key: JobIntelligenceFilterKey
): key is "SAVED" | "REQUESTED" {
  return key === "SAVED" || key === "REQUESTED";
}

export function CandidateJobIntelligenceWorkbench({
  initialPage,
  initialFilter = "ALL",
  initialError = null,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialPage.items);
  const [pageState, setPageState] = useState(initialPage.state);
  const [emptyReason, setEmptyReason] = useState(initialPage.emptyReason);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [filter, setFilter] = useState<JobIntelligenceFilterKey>(initialFilter);
  const [error, setError] = useState<string | null>(initialError);
  const [banner, setBanner] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CandidateJobMatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loadingMore, setLoadingMore] = useState(false);

  const detailItem = useMemo(
    () => items.find((i) => i.matchId === detailId) ?? null,
    [items, detailId]
  );
  const requestItem = useMemo(
    () => items.find((i) => i.matchId === requestId) ?? null,
    [items, requestId]
  );

  const tabs: TabItem[] = useMemo(
    () => [
      { key: "ALL", label: "All" },
      { key: "STRONG_MATCH", label: "Strong match" },
      { key: "GOOD_MATCH", label: "Good match" },
      { key: "POSSIBLE_MATCH", label: "Possible match" },
      { key: "NEEDS_REVIEW", label: "Needs review" },
      { key: "SAVED", label: "Saved" },
      { key: "REQUESTED", label: "Requested" },
    ],
    []
  );

  const reloadFeed = useCallback(
    (nextFilter: JobIntelligenceFilterKey, cursor?: string | null, append = false) => {
      startTransition(async () => {
        setError(null);
        if (!append) setBanner(null);

        if (isHistoryFilter(nextFilter)) {
          const result = await getCandidateDecisionHistory({
            mode: nextFilter,
            pageSize: 20,
            cursor: cursor ?? null,
          });
          if (!result.success) {
            setError(result.error || "We couldn't load your decision history.");
            if (!append) {
              setPageState("ERROR");
              setItems([]);
            }
            return;
          }
          const mapped = result.data.items.map(historyItemAsFeedItem);
          setPageState(result.data.state);
          setEmptyReason(
            result.data.state === "EMPTY" ? "NO_RECOMMENDATIONS" : undefined
          );
          setNextCursor(result.data.nextCursor);
          setItems((prev) => (append ? [...prev, ...mapped] : mapped));
          return;
        }

        const result = await getCandidateJobFeed({
          pageSize: 20,
          cursor: cursor ?? null,
          filters: filtersForKey(nextFilter),
        });

        if (!result.success) {
          setError(result.error || "We couldn't load your job recommendations.");
          if (!append) {
            setPageState("ERROR");
            setItems([]);
          }
          return;
        }

        setPageState(result.data.state);
        setEmptyReason(result.data.emptyReason);
        setNextCursor(result.data.nextCursor);
        setItems((prev) =>
          append ? [...prev, ...result.data.items] : result.data.items
        );
      });
    },
    []
  );

  const closeDetail = useCallback(() => {
    setDetailId(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  }, []);

  const openDetail = useCallback((matchId: string) => {
    setDetailId(matchId);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
  }, []);

  const handleFilterChange = (key: string) => {
    const next = key as JobIntelligenceFilterKey;
    setFilter(next);
    closeDetail();
    const isCategory =
      next === "STRONG_MATCH" ||
      next === "GOOD_MATCH" ||
      next === "POSSIBLE_MATCH" ||
      next === "NEEDS_REVIEW";
    syncUrlParams({
      category: isCategory ? next : null,
      filter: next === "SAVED" || next === "REQUESTED" ? next : null,
    });
    reloadFeed(next, null, false);
  };

  const handleLoadMore = () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    startTransition(async () => {
      try {
        if (isHistoryFilter(filter)) {
          const result = await getCandidateDecisionHistory({
            mode: filter,
            pageSize: 20,
            cursor: nextCursor,
          });
          if (!result.success) {
            setError(result.error || "We couldn't load more history.");
            return;
          }
          setNextCursor(result.data.nextCursor);
          setItems((prev) => [
            ...prev,
            ...result.data.items.map(historyItemAsFeedItem),
          ]);
          return;
        }

        const result = await getCandidateJobFeed({
          pageSize: 20,
          cursor: nextCursor,
          filters: filtersForKey(filter),
        });
        if (!result.success) {
          setError(result.error || "We couldn't load more recommendations.");
          return;
        }
        setNextCursor(result.data.nextCursor);
        setItems((prev) => [...prev, ...result.data.items]);
      } finally {
        setLoadingMore(false);
      }
    });
  };

  useEffect(() => {
    if (!detailId) return;

    let cancelled = false;

    void (async () => {
      const result = await getCandidateJobMatchDetail(detailId);
      if (cancelled) return;
      setDetailLoading(false);
      if (!result.success) {
        setDetail(null);
        setDetailError(result.error || "Unable to load job details.");
        return;
      }
      setDetail(result.data);
      setDetailError(null);
      // Keep feed card state in sync with authoritative detail.
      setItems((prev) =>
        patchItem(prev, detailId, {
          saved: result.data.state.saved,
          dismissed: result.data.state.dismissed,
          applicationRequested: result.data.state.applicationRequested,
          opportunityId: result.data.state.opportunityId,
          continuity: result.data.continuity,
        })
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [detailId]);

  const handleSave = (matchId: string) => {
    setBusyId(matchId);
    startTransition(async () => {
      const res = await saveCandidateJobMatchAction({ matchId });
      setBusyId(null);
      if (!res.success) {
        if (res.code === "VALIDATION") {
          setBanner(res.error);
          setItems((prev) => prev.filter((i) => i.matchId !== matchId));
          if (detailId === matchId) closeDetail();
          return;
        }
        setBanner(res.error || "We couldn't save this job.");
        return;
      }
      setItems((prev) =>
        patchItem(prev, matchId, {
          saved: true,
          dismissed: false,
        })
      );
      setDetail((prev) =>
        prev && prev.matchId === matchId
          ? {
              ...prev,
              state: { ...prev.state, saved: true, dismissed: false },
            }
          : prev
      );
      setBanner("Saved.");
      router.refresh();
    });
  };

  const handleDismiss = (matchId: string) => {
    setBusyId(matchId);
    startTransition(async () => {
      const res = await dismissCandidateJobMatchAction({ matchId });
      setBusyId(null);
      if (!res.success) {
        setBanner(res.error || "We couldn't update this recommendation.");
        return;
      }
      setItems((prev) => prev.filter((i) => i.matchId !== matchId));
      if (detailId === matchId) closeDetail();
      setBanner("Removed from your recommendations.");
      router.refresh();
    });
  };

  const confirmRequest = () => {
    if (!requestId) return;
    const matchId = requestId;
    setBusyId(matchId);
    startTransition(async () => {
      const res = await requestCandidateJobApplicationAction({ matchId });
      setBusyId(null);
      if (!res.success) {
        setRequestId(null);
        if (res.code === "VALIDATION") {
          setBanner(res.error);
          setItems((prev) => prev.filter((i) => i.matchId !== matchId));
          if (detailId === matchId) closeDetail();
          return;
        }
        setBanner(res.error || "We couldn't request an application.");
        return;
      }
      setItems((prev) =>
        patchItem(prev, matchId, {
          applicationRequested: true,
          opportunityId: res.data.opportunityId,
          dismissed: false,
        })
      );
      setDetail((prev) =>
        prev && prev.matchId === matchId
          ? {
              ...prev,
              state: {
                ...prev.state,
                applicationRequested: true,
                opportunityId: res.data.opportunityId,
                dismissed: false,
              },
            }
          : prev
      );
      setRequestId(null);
      setBanner("Queued for your team. Your team has been asked to pursue this opportunity.");
      router.refresh();
    });
  };

  const stateFilter =
    filter === "SAVED" || filter === "REQUESTED" ? filter : null;
  const empty = emptyReasonCopy(emptyReason, stateFilter);
  const showEmpty = !error && pageState === "EMPTY" && items.length === 0;
  const showError = Boolean(error) || pageState === "ERROR";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8" data-testid="job-intelligence-workbench">
      <header className="mb-6 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#12A150]">
          Job Intelligence
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[#0F1720] sm:text-3xl">
          Jobs worth your attention
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[#64748B]">
          Recommendations based on your experience, skills and preferences.
        </p>
      </header>

      <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
        <InstantTabs
          tabs={tabs}
          activeTab={filter}
          onChange={handleFilterChange}
          ariaLabel="Job recommendation filters"
          className="min-w-max sm:min-w-0"
        />
      </div>

      {banner ? (
        <div
          className="mb-4 rounded-[12px] border border-[#D1FAE5] bg-[#ECFDF5] px-3 py-2 text-sm text-[#065F46]"
          role="status"
          data-testid="job-intelligence-banner"
        >
          {banner}
        </div>
      ) : null}

      {showError ? (
        <div
          className="rounded-[14px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-6 text-center"
          data-testid="job-intelligence-error"
        >
          <p className="text-sm font-semibold text-[#991B1B]">
            We couldn&apos;t load your job recommendations.
          </p>
          <button
            type="button"
            onClick={() => reloadFeed(filter)}
            className="mt-3 inline-flex h-10 items-center justify-center rounded-[10px] border border-[#FECACA] bg-white px-4 text-sm font-semibold text-[#991B1B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12A150]"
          >
            Try again
          </button>
        </div>
      ) : null}

      {showEmpty ? (
        <div
          className="rounded-[14px] border border-dashed border-[#D5DDD8] bg-[#F8FAF9] px-4 py-10 text-center"
          data-testid="job-intelligence-empty"
        >
          <p className="text-base font-semibold text-[#0F1720]">{empty.title}</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#64748B]">
            {empty.body}
          </p>
        </div>
      ) : null}

      {!showError && items.length > 0 ? (
        <section aria-label="Recommended jobs" className="space-y-3">
          <h2 className="text-sm font-semibold text-[#0F1720]">
            {filter === "SAVED"
              ? "Saved jobs"
              : filter === "REQUESTED"
                ? "Requested jobs"
                : "Recommended jobs"}
          </h2>
          <div className="space-y-3">
            {items.map((item) => (
              <CandidateJobMatchCard
                key={item.matchId}
                item={item}
                historyMode={isHistoryFilter(filter)}
                busy={busyId === item.matchId || isPending}
                onViewDetails={openDetail}
                onSave={handleSave}
                onDismiss={handleDismiss}
                onRequest={setRequestId}
              />
            ))}
          </div>

          {nextCursor ? (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore || isPending}
                className="inline-flex h-10 w-full items-center justify-center rounded-[10px] border border-[#D5DDD8] bg-white text-sm font-semibold text-[#0F1720] hover:bg-[#F8FAF9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12A150] disabled:opacity-50 sm:w-auto sm:px-5"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <CandidateJobMatchDetailDrawer
        open={Boolean(detailItem)}
        item={detailItem}
        detail={detail}
        detailLoading={detailLoading}
        detailError={detailError}
        busy={busyId === detailItem?.matchId || isPending}
        onClose={closeDetail}
        onSave={handleSave}
        onDismiss={handleDismiss}
        onRequest={setRequestId}
      />

      <RequestApplicationConfirmDialog
        open={Boolean(requestItem)}
        jobTitle={requestItem?.job.title ?? ""}
        companyName={requestItem?.job.companyName ?? ""}
        pending={busyId === requestItem?.matchId && isPending}
        onCancel={() => setRequestId(null)}
        onConfirm={confirmRequest}
      />
    </div>
  );
}
