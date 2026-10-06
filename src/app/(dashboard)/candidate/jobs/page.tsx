import { redirect } from "next/navigation";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { getCandidateJobFeed } from "@/lib/job-matching/feed";
import { getCandidateDecisionHistory } from "@/lib/job-matching/continuity";
import {
  isCandidateJobFeedCategory,
  type CandidateJobFeedFilters,
  type CandidateJobFeedPage,
} from "@/lib/job-matching/feed-types";
import { historyItemAsFeedItem } from "@/lib/job-matching/continuity-ui";
import {
  CandidateJobIntelligenceWorkbench,
  type JobIntelligenceFilterKey,
} from "@/components/candidate/CandidateJobIntelligenceWorkbench";

interface Props {
  searchParams?: Promise<{ category?: string; filter?: string }>;
}

function resolveInitialFilter(params: {
  category?: string;
  filter?: string;
}): {
  key: JobIntelligenceFilterKey;
  filters: CandidateJobFeedFilters | undefined;
  historyMode: "SAVED" | "REQUESTED" | null;
} {
  if (params.filter === "SAVED") {
    return { key: "SAVED", filters: undefined, historyMode: "SAVED" };
  }
  if (params.filter === "REQUESTED") {
    return { key: "REQUESTED", filters: undefined, historyMode: "REQUESTED" };
  }
  if (params.category && isCandidateJobFeedCategory(params.category)) {
    return {
      key: params.category,
      filters: { category: params.category },
      historyMode: null,
    };
  }
  return { key: "ALL", filters: undefined, historyMode: null };
}

export default async function CandidateJobIntelligencePage({ searchParams }: Props) {
  const ctx = await getAuthenticatedContext();
  if (ctx.role === "ADMIN") redirect("/admin");
  if (ctx.role === "EMPLOYEE") redirect("/employee");

  const resolved = searchParams ? await searchParams : {};
  const { key, filters, historyMode } = resolveInitialFilter(resolved);

  let initialPage: CandidateJobFeedPage;
  let initialError: string | null = null;

  if (historyMode) {
    const result = await getCandidateDecisionHistory({
      pageSize: 20,
      mode: historyMode,
    });
    if (result.success) {
      initialPage = {
        state: result.data.state,
        items: result.data.items.map(historyItemAsFeedItem),
        pageSize: result.data.pageSize,
        nextCursor: result.data.nextCursor,
        emptyReason:
          result.data.state === "EMPTY" ? "NO_RECOMMENDATIONS" : undefined,
      };
    } else {
      initialPage = {
        state: "ERROR",
        items: [],
        pageSize: 20,
        nextCursor: null,
      };
      initialError = result.error;
    }
  } else {
    const result = await getCandidateJobFeed({
      pageSize: 20,
      filters,
    });
    initialPage = result.success
      ? result.data
      : {
          state: "ERROR",
          items: [],
          pageSize: 20,
          nextCursor: null,
        };
    initialError = result.success ? null : result.error;
  }

  return (
    <CandidateJobIntelligenceWorkbench
      initialPage={initialPage}
      initialFilter={key}
      initialError={initialError}
    />
  );
}
