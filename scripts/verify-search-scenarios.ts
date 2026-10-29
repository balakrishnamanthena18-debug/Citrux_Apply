import { liveJobSearchEngine } from "../src/lib/job-discovery/live-search";
import type { ValidatedJobSearchQuery } from "../src/lib/job-discovery/contracts";

async function runScenarios() {
  console.log("================================================================================");
  console.log("OOS GLOBAL JOB DISCOVERY — LIVE SEARCH CORRECTNESS SCENARIOS (A - J)");
  console.log("================================================================================\n");

  const results: Record<string, any> = {};

  // Scenario A: Normal search with keywords only
  console.log("--- Running Scenario A: Normal search ('software engineer') ---");
  const startA = Date.now();
  const resA = await liveJobSearchEngine.searchLiveJobs({
    query: "software engineer",
    page: 1,
    pageSize: 20,
    sortBy: "newest"
  } as ValidatedJobSearchQuery);
  results["A"] = {
    name: "Normal search with keywords only",
    query: "software engineer",
    durationMs: Date.now() - startA,
    jobsReturned: resA.jobs.length,
    total: resA.total,
    totalPages: resA.totalPages,
    hasMore: resA.hasMore,
    isExactTotal: resA.isExactTotal,
    uniqueCount: resA.uniqueCount,
    rawProviderCounts: resA.rawProviderCounts,
    providerStatuses: resA.providerStatuses?.map(s => ({ id: s.providerId, status: s.status, count: s.count, latencyMs: s.latencyMs })),
    sampleJobs: resA.jobs.slice(0, 3).map(j => ({ title: j.title, company: j.companyName, provider: j.sourceAttribution }))
  };
  console.log("Scenario A complete:", results["A"].jobsReturned, "jobs, duration:", results["A"].durationMs, "ms\n");

  // Scenario B: Same query with Advanced Search enabled (no extra filters)
  console.log("--- Running Scenario B: Same query with Advanced Search enabled (no extra filters) ---");
  const startB = Date.now();
  const resB = await liveJobSearchEngine.searchLiveJobs({
    query: "software engineer",
    page: 1,
    pageSize: 20,
    sortBy: "newest",
    experienceIncludeUnspecified: true
  } as ValidatedJobSearchQuery);
  results["B"] = {
    name: "Same query with Advanced Search enabled (no additional filters)",
    query: "software engineer",
    durationMs: Date.now() - startB,
    jobsReturned: resB.jobs.length,
    total: resB.total,
    totalPages: resB.totalPages,
    hasMore: resB.hasMore,
    isExactTotal: resB.isExactTotal,
    uniqueCount: resB.uniqueCount,
    rawProviderCounts: resB.rawProviderCounts,
    providerStatuses: resB.providerStatuses?.map(s => ({ id: s.providerId, status: s.status, count: s.count, latencyMs: s.latencyMs })),
  };
  console.log("Scenario B complete:", results["B"].jobsReturned, "jobs, duration:", results["B"].durationMs, "ms\n");

  // Scenario C: Same query with experience 0–2 years
  console.log("--- Running Scenario C: Experience 0–2 years ---");
  const startC = Date.now();
  const resC = await liveJobSearchEngine.searchLiveJobs({
    query: "software engineer",
    experienceMin: 0,
    experienceMax: 2,
    experienceIncludeUnspecified: false,
    page: 1,
    pageSize: 20,
    sortBy: "newest"
  } as ValidatedJobSearchQuery);
  results["C"] = {
    name: "Same query with experience 0–2 years (explicit only)",
    durationMs: Date.now() - startC,
    jobsReturned: resC.jobs.length,
    total: resC.total,
    rawProviderCounts: resC.rawProviderCounts,
    sampleMatches: resC.jobs.slice(0, 3).map(j => ({ title: j.title, expMin: j.experienceMin, expMax: j.experienceMax }))
  };
  console.log("Scenario C complete:", results["C"].jobsReturned, "jobs, duration:", results["C"].durationMs, "ms\n");

  // Scenario D: Same query with experience 3–7 years
  console.log("--- Running Scenario D: Experience 3–7 years ---");
  const startD = Date.now();
  const resD = await liveJobSearchEngine.searchLiveJobs({
    query: "software engineer",
    experienceMin: 3,
    experienceMax: 7,
    experienceIncludeUnspecified: false,
    page: 1,
    pageSize: 20,
    sortBy: "newest"
  } as ValidatedJobSearchQuery);
  results["D"] = {
    name: "Same query with experience 3–7 years (explicit only)",
    durationMs: Date.now() - startD,
    jobsReturned: resD.jobs.length,
    total: resD.total,
    rawProviderCounts: resD.rawProviderCounts,
    sampleMatches: resD.jobs.slice(0, 3).map(j => ({ title: j.title, expMin: j.experienceMin, expMax: j.experienceMax }))
  };
  console.log("Scenario D complete:", results["D"].jobsReturned, "jobs, duration:", results["D"].durationMs, "ms\n");

  // Scenario E: Same query with experience 0–30 years
  console.log("--- Running Scenario E: Experience 0–30 years ---");
  const startE = Date.now();
  const resE = await liveJobSearchEngine.searchLiveJobs({
    query: "software engineer",
    experienceMin: 0,
    experienceMax: 30,
    experienceIncludeUnspecified: true,
    page: 1,
    pageSize: 20,
    sortBy: "newest"
  } as ValidatedJobSearchQuery);
  results["E"] = {
    name: "Same query with experience 0–30 years (with unspecified)",
    durationMs: Date.now() - startE,
    jobsReturned: resE.jobs.length,
    total: resE.total,
    rawProviderCounts: resE.rawProviderCounts,
  };
  console.log("Scenario E complete:", results["E"].jobsReturned, "jobs, duration:", results["E"].durationMs, "ms\n");

  // Scenario F: Same query with required skills
  console.log("--- Running Scenario F: Required skills ('React') ---");
  const startF = Date.now();
  const resF = await liveJobSearchEngine.searchLiveJobs({
    query: "software engineer",
    requiredSkills: ["React"],
    page: 1,
    pageSize: 20,
    sortBy: "newest"
  } as ValidatedJobSearchQuery);
  results["F"] = {
    name: "Same query with required skills ('React')",
    durationMs: Date.now() - startF,
    jobsReturned: resF.jobs.length,
    total: resF.total,
    rawProviderCounts: resF.rawProviderCounts,
    sampleMatches: resF.jobs.slice(0, 3).map(j => ({ title: j.title, skills: j.requiredSkills }))
  };
  console.log("Scenario F complete:", results["F"].jobsReturned, "jobs, duration:", results["F"].durationMs, "ms\n");

  // Scenario G: Same query with location and employment type
  console.log("--- Running Scenario G: Location (US) and Employment Type (FULL_TIME) ---");
  const startG = Date.now();
  const resG = await liveJobSearchEngine.searchLiveJobs({
    query: "software engineer",
    countries: ["US"],
    employmentTypes: ["FULL_TIME"],
    page: 1,
    pageSize: 20,
    sortBy: "newest"
  } as ValidatedJobSearchQuery);
  results["G"] = {
    name: "Same query with Location (US) and Employment Type (FULL_TIME)",
    durationMs: Date.now() - startG,
    jobsReturned: resG.jobs.length,
    total: resG.total,
    rawProviderCounts: resG.rawProviderCounts,
    sampleMatches: resG.jobs.slice(0, 3).map(j => ({ title: j.title, country: j.country, employmentType: j.employmentType }))
  };
  console.log("Scenario G complete:", results["G"].jobsReturned, "jobs, duration:", results["G"].durationMs, "ms\n");

  // Scenario H: Several filters combined
  console.log("--- Running Scenario H: Several filters combined ---");
  const startH = Date.now();
  const resH = await liveJobSearchEngine.searchLiveJobs({
    query: "software engineer",
    workArrangements: ["REMOTE"],
    employmentTypes: ["FULL_TIME"],
    experienceMin: 3,
    experienceMax: 10,
    experienceIncludeUnspecified: true,
    page: 1,
    pageSize: 20,
    sortBy: "newest"
  } as ValidatedJobSearchQuery);
  results["H"] = {
    name: "Combined filters (remote, full-time, 3-10 yrs exp, query)",
    durationMs: Date.now() - startH,
    jobsReturned: resH.jobs.length,
    total: resH.total,
    rawProviderCounts: resH.rawProviderCounts,
    appliedFilters: resH.appliedFiltersSummary,
    sampleMatches: resH.jobs.slice(0, 3).map(j => ({ title: j.title, mode: j.workArrangement, emp: j.employmentType, exp: { min: j.experienceMin, max: j.experienceMax } }))
  };
  console.log("Scenario H complete:", results["H"].jobsReturned, "jobs, duration:", results["H"].durationMs, "ms\n");

  // Scenario I: Repeat search with page sizes 20, 30, and 50
  console.log("--- Running Scenario I: Page sizes 20, 30, 50 ---");
  const resI20 = await liveJobSearchEngine.searchLiveJobs({ query: "developer", page: 1, pageSize: 20 } as ValidatedJobSearchQuery);
  const resI30 = await liveJobSearchEngine.searchLiveJobs({ query: "developer", page: 1, pageSize: 30 } as ValidatedJobSearchQuery);
  const resI50 = await liveJobSearchEngine.searchLiveJobs({ query: "developer", page: 1, pageSize: 50 } as ValidatedJobSearchQuery);
  results["I"] = {
    name: "Page size scaling (20 vs 30 vs 50)",
    pageSize20: { returned: resI20.jobs.length, total: resI20.total, pageSize: resI20.pageSize },
    pageSize30: { returned: resI30.jobs.length, total: resI30.total, pageSize: resI30.pageSize },
    pageSize50: { returned: resI50.jobs.length, total: resI50.total, pageSize: resI50.pageSize }
  };
  console.log("Scenario I complete: 20 ->", resI20.jobs.length, ", 30 ->", resI30.jobs.length, ", 50 ->", resI50.jobs.length, "\n");

  // Scenario J: Navigate subsequent pages (page 1, 2, 3) verifying no duplicates or skips
  console.log("--- Running Scenario J: Pagination verification across page 1, 2, 3 ---");
  const p1 = await liveJobSearchEngine.searchLiveJobs({ query: "developer", page: 1, pageSize: 15 } as ValidatedJobSearchQuery);
  const p2 = await liveJobSearchEngine.searchLiveJobs({ query: "developer", page: 2, pageSize: 15 } as ValidatedJobSearchQuery);
  const p3 = await liveJobSearchEngine.searchLiveJobs({ query: "developer", page: 3, pageSize: 15 } as ValidatedJobSearchQuery);

  const ids1 = new Set(p1.jobs.map(j => j.id));
  const ids2 = new Set(p2.jobs.map(j => j.id));
  const ids3 = new Set(p3.jobs.map(j => j.id));

  let overlap12 = 0;
  for (const id of ids2) {
    if (ids1.has(id)) overlap12++;
  }
  let overlap23 = 0;
  for (const id of ids3) {
    if (ids2.has(id)) overlap23++;
  }

  results["J"] = {
    name: "Pagination continuity and zero duplicate/skip check",
    page1Count: p1.jobs.length,
    page2Count: p2.jobs.length,
    page3Count: p3.jobs.length,
    overlapP1P2: overlap12,
    overlapP2P3: overlap23,
    sampleP1Ids: p1.jobs.slice(0, 2).map(j => j.title),
    sampleP2Ids: p2.jobs.slice(0, 2).map(j => j.title),
    sampleP3Ids: p3.jobs.slice(0, 2).map(j => j.title),
    hasMoreP1: p1.hasMore,
    hasMoreP2: p2.hasMore,
    hasMoreP3: p3.hasMore,
  };
  console.log("Scenario J complete. Overlap P1/P2:", overlap12, "Overlap P2/P3:", overlap23);

  console.log("\n================================================================================");
  console.log("FINAL SCENARIO AUDIT SUMMARY (JSON)");
  console.log("================================================================================");
  console.log(JSON.stringify(results, null, 2));
}

runScenarios().catch(err => {
  console.error("Fatal error running scenarios:", err);
  process.exit(1);
});
