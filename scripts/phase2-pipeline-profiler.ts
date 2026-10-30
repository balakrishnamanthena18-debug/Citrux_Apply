import { config } from "dotenv";
config({ path: ".env" });

import { liveJobSearchEngine, clearJobSearchCache } from "../src/lib/job-discovery/live-search";
import type { ValidatedJobSearchQuery } from "../src/lib/job-discovery/contracts";

interface SearchTimingSample {
  query: string;
  repetition: number;
  totalDurationMs: number;
  providerTotalMs: number;
  dedupFilterRankingMs: number;
  savedHydrationMs: number;
  providerLatencies: Record<string, { ms: number; count: number; status: string }>;
  jobsReturned: number;
  totalAvailable: number | undefined;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * s.length) - 1;
  return s[Math.max(0, Math.min(s.length - 1, idx))] ?? 0;
}

function median(arr: number[]): number {
  return percentile(arr, 50);
}

async function profileSearchScenario(name: string, query: Partial<ValidatedJobSearchQuery>, repetitions = 10) {
  console.log(`\n================================================================================`);
  console.log(`PROFILING SCENARIO: ${name} (${repetitions} repetitions)`);
  console.log(`================================================================================`);

  const samples: SearchTimingSample[] = [];

  for (let i = 1; i <= repetitions; i++) {
    clearJobSearchCache(); // Force live provider execution for each run
    const start = performance.now();
    const res = await liveJobSearchEngine.searchLiveJobs({
      page: 1,
      pageSize: 20,
      sortBy: "newest",
      ...query,
    } as ValidatedJobSearchQuery);
    const duration = performance.now() - start;

    const provMap: Record<string, { ms: number; count: number; status: string }> = {};
    for (const st of res.providerStatuses || []) {
      provMap[st.providerId] = { ms: st.latencyMs, count: st.count, status: st.status };
    }

    // Extract checkpoints from trace
    const checkpoints = res.trace?.checkpoints || [];
    const apiEntry = checkpoints.find(c => c.checkpoint === "API_ENTRY")?.timestampMs || start;
    const queryInterpreted = checkpoints.find(c => c.checkpoint === "QUERY_INTERPRETATION_COMPLETED")?.timestampMs || apiEntry;
    const providerCompleted = checkpoints.filter(c => c.checkpoint === "PROVIDER_COMPLETED");
    const lastProviderMs = providerCompleted.length > 0 
      ? Math.max(...providerCompleted.map(c => c.timestampMs)) 
      : queryInterpreted;
    const aggRankingCompleted = checkpoints.find(c => c.checkpoint === "AGGREGATION_RANKING_COMPLETED")?.timestampMs || lastProviderMs;

    samples.push({
      query: name,
      repetition: i,
      totalDurationMs: duration,
      providerTotalMs: lastProviderMs - queryInterpreted,
      dedupFilterRankingMs: aggRankingCompleted - lastProviderMs,
      savedHydrationMs: duration - (aggRankingCompleted - apiEntry),
      providerLatencies: provMap,
      jobsReturned: res.jobs.length,
      totalAvailable: res.total,
    });
  }

  const totals = samples.map(s => s.totalDurationMs);
  const provTotals = samples.map(s => s.providerTotalMs);
  const localProcessing = samples.map(s => s.dedupFilterRankingMs);

  console.log(`Results across ${repetitions} runs:`);
  console.log(`  Total Duration:     Median = ${median(totals).toFixed(1)}ms, p95 = ${percentile(totals, 95).toFixed(1)}ms, min = ${Math.min(...totals).toFixed(1)}ms, max = ${Math.max(...totals).toFixed(1)}ms`);
  console.log(`  Provider Dispatch:  Median = ${median(provTotals).toFixed(1)}ms, p95 = ${percentile(provTotals, 95).toFixed(1)}ms`);
  console.log(`  Local Processing:   Median = ${median(localProcessing).toFixed(1)}ms, p95 = ${percentile(localProcessing, 95).toFixed(1)}ms`);

  // Provider summary
  const providerIds = Object.keys(samples[0]?.providerLatencies || {});
  console.log(`  Per-Provider Latencies (Median / p95):`);
  for (const pid of providerIds) {
    const latencies = samples.map(s => s.providerLatencies[pid]?.ms || 0);
    const counts = samples.map(s => s.providerLatencies[pid]?.count || 0);
    console.log(`    - ${pid.padEnd(12)}: Median = ${median(latencies).toFixed(0)}ms, p95 = ${percentile(latencies, 95).toFixed(0)}ms | Avg Count = ${(counts.reduce((a,b)=>a+b,0)/counts.length).toFixed(0)} jobs`);
  }

  return {
    name,
    medianTotal: median(totals),
    p95Total: percentile(totals, 95),
    medianProvider: median(provTotals),
    medianLocal: median(localProcessing),
    providerBreakdown: providerIds.map(pid => ({
      providerId: pid,
      medianMs: median(samples.map(s => s.providerLatencies[pid]?.ms || 0)),
      p95Ms: percentile(samples.map(s => s.providerLatencies[pid]?.ms || 0), 95),
      avgCount: samples.map(s => s.providerLatencies[pid]?.count || 0).reduce((a,b)=>a+b,0) / samples.length
    }))
  };
}

async function main() {
  console.log("================================================================================");
  console.log("PHASE 2 — REAL-WORLD SEARCH LATENCY & PROVIDER TELEMETRY PROFILER");
  console.log("================================================================================");

  const r1 = await profileSearchScenario("1. Normal Search ('software engineer')", {
    query: "software engineer",
  }, 10);

  const r2 = await profileSearchScenario("2. Advanced Search (Experience 3-7 yrs)", {
    query: "software engineer",
    experienceMin: 3,
    experienceMax: 7,
    experienceIncludeUnspecified: false,
  }, 10);

  const r3 = await profileSearchScenario("3. Location + Skill (React in United States)", {
    query: "React developer",
    countries: ["US"],
  }, 10);

  const r4 = await profileSearchScenario("4. Pagination Page 2 (20 jobs/page)", {
    query: "software engineer",
    page: 2,
    pageSize: 20,
  }, 10);

  console.log("\n================================================================================");
  console.log("SEARCH PIPELINE STAGES SUMMARY TABLE");
  console.log("================================================================================");
  console.table([r1, r2, r3, r4].map(r => ({
    Scenario: r.name,
    "Median Total (ms)": r.medianTotal.toFixed(1),
    "p95 Total (ms)": r.p95Total.toFixed(1),
    "Provider Dispatch (ms)": r.medianProvider.toFixed(1),
    "Local Processing (ms)": r.medianLocal.toFixed(1),
  })));

  process.exit(0);
}

main().catch(err => {
  console.error("Profiler failed:", err);
  process.exit(1);
});
