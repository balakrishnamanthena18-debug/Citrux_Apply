import { config } from "dotenv";
config({ path: ".env" });

import { prisma } from "../src/lib/db/prisma";
import { withRlsContext } from "../src/lib/db/rls";
import { liveJobSearchEngine, clearJobSearchCache } from "../src/lib/job-discovery/live-search";
import { listOperationalApplications } from "../src/lib/application/operations-read";
import { loadStaffApplicationIntelligence } from "../src/lib/application-intelligence/load-application-intelligence";
import { listOutcomesForStaff } from "../src/lib/application/outcome-service";
import { listEligibleAssignees } from "../src/lib/application/assignment-authority";
import type { AuthenticatedContext } from "../src/lib/auth/context";
import type { ValidatedJobSearchQuery } from "../src/lib/job-discovery/contracts";

interface LatencyMeasurement {
  scenario: string;
  coldMs: number;
  warmRunsMs: number[];
  medianWarmMs: number;
  p95WarmMs: number;
  dbQueriesCount?: number;
  details: Record<string, unknown>;
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

async function main() {
  console.log("================================================================================");
  console.log("PHASE A — ENTERPRISE PERFORMANCE BASELINE AUDIT");
  console.log("Environment: Node.js " + process.version + ", Platform: " + process.platform);
  console.log("Database: PostgreSQL via Prisma Client 7.10.0");
  console.log("================================================================================\n");

  const results: Record<string, LatencyMeasurement> = {};

  // Setup test context (find an admin/employee user in DB)
  const membership = await prisma.membership.findFirst({
    where: { role: { in: ["ADMIN", "EMPLOYEE"] } },
    include: { user: true, organization: true }
  });

  if (!membership) {
    console.error("No active employee/admin membership found for testing.");
    process.exit(1);
  }

  const authCtx: AuthenticatedContext = {
    userId: membership.userId,
    email: membership.user.email,
    organizationId: membership.organizationId,
    role: membership.role as any,
    status: "ACTIVE" as any,
    membershipStatus: "ACTIVE" as any,
  };

  console.log(`Using Authenticated Context: User ${authCtx.email} (${authCtx.role}) in Org (${authCtx.organizationId})\n`);

  // Target application for Scenarios C and G
  const targetApp = await prisma.application.findFirst({
    where: { organizationId: authCtx.organizationId },
    select: { id: true }
  });
  const appId = targetApp?.id || "fb6c9606-90ea-4bec-a759-f8d1e848f731";
  console.log(`Target Application ID for Scenarios C & G: ${appId}\n`);

  // --------------------------------------------------------------------------
  // Scenario A: Main Dashboard / Operations Summary
  // --------------------------------------------------------------------------
  console.log("--> Measuring Scenario A: Main Dashboard / Operations Read...");
  const runScenarioA = async () => {
    return await withRlsContext(authCtx.userId, async (tx) => {
      const start = performance.now();
      const page = await listOperationalApplications(tx, authCtx, {
        page: "1",
        pageSize: "10"
      });
      const end = performance.now();
      return { duration: end - start, totalCount: page.totalCount, counts: page.counts };
    });
  };

  const coldA = await runScenarioA();
  const warmA: number[] = [];
  for (let i = 0; i < 5; i++) {
    const w = await runScenarioA();
    warmA.push(w.duration);
  }
  results["Scenario_A_Dashboard"] = {
    scenario: "Scenario A: Main Dashboard / Operations Queue Summary",
    coldMs: Math.round(coldA.duration * 10) / 10,
    warmRunsMs: warmA.map(v => Math.round(v * 10) / 10),
    medianWarmMs: Math.round(median(warmA) * 10) / 10,
    p95WarmMs: Math.round(percentile(warmA, 95) * 10) / 10,
    details: { totalCount: coldA.totalCount, counts: coldA.counts }
  };
  console.log(`    Cold: ${results["Scenario_A_Dashboard"].coldMs}ms, Warm Median: ${results["Scenario_A_Dashboard"].medianWarmMs}ms, p95: ${results["Scenario_A_Dashboard"].p95WarmMs}ms\n`);

  // --------------------------------------------------------------------------
  // Scenario B: Application List with Filters & Counts
  // --------------------------------------------------------------------------
  console.log("--> Measuring Scenario B: Application List with Full Scopes...");
  const runScenarioB = async () => {
    return await withRlsContext(authCtx.userId, async (tx) => {
      const start = performance.now();
      const page = await listOperationalApplications(tx, authCtx, {
        queue: "all",
        sort: "newest",
        page: "1",
        pageSize: "25"
      });
      const cands = await tx.candidate.findMany({
        where: { organizationId: authCtx.organizationId, status: { not: "ARCHIVED" } },
        select: { id: true, status: true, user: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: 50
      });
      const openJobs = await tx.job.findMany({
        where: { organizationId: authCtx.organizationId, status: "OPEN", visibility: "GLOBAL" },
        select: { id: true, title: true, companyName: true, source: true },
        orderBy: { createdAt: "desc" },
        take: 50
      });
      const end = performance.now();
      return { duration: end - start, items: page.items.length, cands: cands.length, jobs: openJobs.length };
    });
  };

  const coldB = await runScenarioB();
  const warmB: number[] = [];
  for (let i = 0; i < 5; i++) {
    const w = await runScenarioB();
    warmB.push(w.duration);
  }
  results["Scenario_B_ApplicationList"] = {
    scenario: "Scenario B: Application List Page Operations Data",
    coldMs: Math.round(coldB.duration * 10) / 10,
    warmRunsMs: warmB.map(v => Math.round(v * 10) / 10),
    medianWarmMs: Math.round(median(warmB) * 10) / 10,
    p95WarmMs: Math.round(percentile(warmB, 95) * 10) / 10,
    details: { itemsCount: coldB.items, candsCount: coldB.cands, jobsCount: coldB.jobs }
  };
  console.log(`    Cold: ${results["Scenario_B_ApplicationList"].coldMs}ms, Warm Median: ${results["Scenario_B_ApplicationList"].medianWarmMs}ms, p95: ${results["Scenario_B_ApplicationList"].p95WarmMs}ms\n`);

  // --------------------------------------------------------------------------
  // Scenario C: Application Detail Page (Full Model)
  // --------------------------------------------------------------------------
  console.log("--> Measuring Scenario C: Application Detail Page (Full Model)...");
  const runScenarioC = async () => {
    return await withRlsContext(authCtx.userId, async (tx) => {
      const start = performance.now();
      const app = await tx.application.findUnique({
        where: { id: appId, organizationId: authCtx.organizationId },
        include: {
          candidate: {
            include: {
              user: true,
              experiences: { orderBy: { orderIndex: "asc" } },
              educations: { orderBy: { orderIndex: "asc" } },
              skills: true
            }
          },
          job: true,
          assignedEmployee: true,
          materials: { where: { isCurrent: true }, include: { candidateDocument: true } },
          submissions: { orderBy: { attemptNumber: "desc" }, include: { submittedBy: true } },
          stateHistory: { orderBy: { createdAt: "desc" }, include: { changedBy: true } },
          qaReviews: { orderBy: { createdAt: "desc" }, take: 1, include: { checklistItems: true } }
        }
      });
      const eligible = await listEligibleAssignees(tx, authCtx);
      const docs = app ? await tx.candidateDocument.findMany({
        where: { candidateId: app.candidateId },
        orderBy: { createdAt: "desc" }
      }) : [];
      const intel = app ? await loadStaffApplicationIntelligence({
        db: tx,
        applicationId: app.id,
        organizationId: authCtx.organizationId
      }) : null;
      const outcomes = app ? await listOutcomesForStaff(tx, authCtx, app.id, { includeInactive: true }) : [];
      const dbInterview = app ? await tx.interview.findUnique({
        where: { applicationId: app.id },
        include: { rounds: { where: { voidedAt: null }, orderBy: { roundNumber: "asc" }, include: { debrief: true } } }
      }) : null;
      const end = performance.now();
      return { duration: end - start, found: Boolean(app), docs: docs.length, outcomes: outcomes.length };
    });
  };

  const coldC = await runScenarioC();
  const warmC: number[] = [];
  for (let i = 0; i < 5; i++) {
    const w = await runScenarioC();
    warmC.push(w.duration);
  }
  results["Scenario_C_ApplicationDetail"] = {
    scenario: "Scenario C: Application Detail Page (9 Sequential DB Queries)",
    coldMs: Math.round(coldC.duration * 10) / 10,
    warmRunsMs: warmC.map(v => Math.round(v * 10) / 10),
    medianWarmMs: Math.round(median(warmC) * 10) / 10,
    p95WarmMs: Math.round(percentile(warmC, 95) * 10) / 10,
    details: { found: coldC.found, docsCount: coldC.docs, outcomesCount: coldC.outcomes }
  };
  console.log(`    Cold: ${results["Scenario_C_ApplicationDetail"].coldMs}ms, Warm Median: ${results["Scenario_C_ApplicationDetail"].medianWarmMs}ms, p95: ${results["Scenario_C_ApplicationDetail"].p95WarmMs}ms\n`);

  // --------------------------------------------------------------------------
  // Scenario D: Normal Global Job Search (Keywords only)
  // --------------------------------------------------------------------------
  console.log("--> Measuring Scenario D: Normal Global Job Search ('software engineer')...");
  clearJobSearchCache();
  const startColdD = performance.now();
  const resColdD = await liveJobSearchEngine.searchLiveJobs({
    query: "software engineer",
    page: 1,
    pageSize: 20,
    sortBy: "newest"
  } as ValidatedJobSearchQuery);
  const coldDurationD = performance.now() - startColdD;

  const warmD: number[] = [];
  for (let i = 0; i < 5; i++) {
    clearJobSearchCache(); // test un-cached live provider round trip
    const s = performance.now();
    await liveJobSearchEngine.searchLiveJobs({
      query: "software engineer",
      page: 1,
      pageSize: 20,
      sortBy: "newest"
    } as ValidatedJobSearchQuery);
    warmD.push(performance.now() - s);
  }

  results["Scenario_D_NormalSearch"] = {
    scenario: "Scenario D: Normal Global Job Search (Un-cached Live Providers)",
    coldMs: Math.round(coldDurationD * 10) / 10,
    warmRunsMs: warmD.map(v => Math.round(v * 10) / 10),
    medianWarmMs: Math.round(median(warmD) * 10) / 10,
    p95WarmMs: Math.round(percentile(warmD, 95) * 10) / 10,
    details: {
      total: resColdD.total,
      jobsCount: resColdD.jobs.length,
      providerStatuses: resColdD.providerStatuses?.map(p => ({ id: p.providerId, ms: p.latencyMs, status: p.status, count: p.count }))
    }
  };
  console.log(`    Cold: ${results["Scenario_D_NormalSearch"].coldMs}ms, Warm Median: ${results["Scenario_D_NormalSearch"].medianWarmMs}ms, p95: ${results["Scenario_D_NormalSearch"].p95WarmMs}ms\n`);

  // --------------------------------------------------------------------------
  // Scenario E: Advanced Job Search with Experience Filters
  // --------------------------------------------------------------------------
  console.log("--> Measuring Scenario E: Advanced Job Search with Experience Filter (3-7 yrs)...");
  clearJobSearchCache();
  const startColdE = performance.now();
  const resColdE = await liveJobSearchEngine.searchLiveJobs({
    query: "software engineer",
    experienceMin: 3,
    experienceMax: 7,
    experienceIncludeUnspecified: false,
    page: 1,
    pageSize: 20,
    sortBy: "newest"
  } as ValidatedJobSearchQuery);
  const coldDurationE = performance.now() - startColdE;

  const warmE: number[] = [];
  for (let i = 0; i < 5; i++) {
    clearJobSearchCache();
    const s = performance.now();
    await liveJobSearchEngine.searchLiveJobs({
      query: "software engineer",
      experienceMin: 3,
      experienceMax: 7,
      experienceIncludeUnspecified: false,
      page: 1,
      pageSize: 20,
      sortBy: "newest"
    } as ValidatedJobSearchQuery);
    warmE.push(performance.now() - s);
  }

  results["Scenario_E_AdvancedSearch"] = {
    scenario: "Scenario E: Advanced Search (Experience 3-7 yrs, Live Providers)",
    coldMs: Math.round(coldDurationE * 10) / 10,
    warmRunsMs: warmE.map(v => Math.round(v * 10) / 10),
    medianWarmMs: Math.round(median(warmE) * 10) / 10,
    p95WarmMs: Math.round(percentile(warmE, 95) * 10) / 10,
    details: { total: resColdE.total, jobsCount: resColdE.jobs.length }
  };
  console.log(`    Cold: ${results["Scenario_E_AdvancedSearch"].coldMs}ms, Warm Median: ${results["Scenario_E_AdvancedSearch"].medianWarmMs}ms, p95: ${results["Scenario_E_AdvancedSearch"].p95WarmMs}ms\n`);

  // --------------------------------------------------------------------------
  // Scenario F: Change search filters and paginate (Page 2)
  // --------------------------------------------------------------------------
  console.log("--> Measuring Scenario F: Change Search Filters & Paginate (Page 2)...");
  clearJobSearchCache();
  const startColdF = performance.now();
  const resColdF = await liveJobSearchEngine.searchLiveJobs({
    query: "software engineer",
    page: 2,
    pageSize: 20,
    sortBy: "newest"
  } as ValidatedJobSearchQuery);
  const coldDurationF = performance.now() - startColdF;

  const warmF: number[] = [];
  for (let i = 0; i < 5; i++) {
    clearJobSearchCache();
    const s = performance.now();
    await liveJobSearchEngine.searchLiveJobs({
      query: "software engineer",
      page: 2,
      pageSize: 20,
      sortBy: "newest"
    } as ValidatedJobSearchQuery);
    warmF.push(performance.now() - s);
  }

  results["Scenario_F_Pagination"] = {
    scenario: "Scenario F: Search Pagination (Page 2)",
    coldMs: Math.round(coldDurationF * 10) / 10,
    warmRunsMs: warmF.map(v => Math.round(v * 10) / 10),
    medianWarmMs: Math.round(median(warmF) * 10) / 10,
    p95WarmMs: Math.round(percentile(warmF, 95) * 10) / 10,
    details: { page: 2, jobsCount: resColdF.jobs.length, hasMore: resColdF.hasMore }
  };
  console.log(`    Cold: ${results["Scenario_F_Pagination"].coldMs}ms, Warm Median: ${results["Scenario_F_Pagination"].medianWarmMs}ms, p95: ${results["Scenario_F_Pagination"].p95WarmMs}ms\n`);

  // --------------------------------------------------------------------------
  // Scenario J: Warm-Cache Performance (Exact duplicate queries with searchCache hit)
  // --------------------------------------------------------------------------
  console.log("--> Measuring Scenario J: Warm-Cache Hits (In-Memory Cache TTL 30s)...");
  // Seed the cache with a search
  await liveJobSearchEngine.searchLiveJobs({
    query: "software engineer",
    page: 1,
    pageSize: 20,
    sortBy: "newest"
  } as ValidatedJobSearchQuery);

  const warmJ: number[] = [];
  for (let i = 0; i < 10; i++) {
    const s = performance.now();
    const res = await liveJobSearchEngine.searchLiveJobs({
      query: "software engineer",
      page: 1,
      pageSize: 20,
      sortBy: "newest"
    } as ValidatedJobSearchQuery);
    warmJ.push(performance.now() - s);
  }

  results["Scenario_J_WarmCacheHits"] = {
    scenario: "Scenario J: Warm In-Memory Search Cache (10 consecutive hits)",
    coldMs: 0,
    warmRunsMs: warmJ.map(v => Math.round(v * 100) / 100),
    medianWarmMs: Math.round(median(warmJ) * 100) / 100,
    p95WarmMs: Math.round(percentile(warmJ, 95) * 100) / 100,
    details: { cacheTtlMs: 30000, hits: 10 }
  };
  console.log(`    Warm Cache Median: ${results["Scenario_J_WarmCacheHits"].medianWarmMs}ms, p95: ${results["Scenario_J_WarmCacheHits"].p95WarmMs}ms\n`);

  console.log("================================================================================");
  console.log("PHASE A BASELINE SUMMARY TABLE");
  console.log("================================================================================");
  console.table(Object.entries(results).map(([key, m]) => ({
    Scenario: m.scenario,
    "Cold (ms)": m.coldMs,
    "Warm Median (ms)": m.medianWarmMs,
    "Warm p95 (ms)": m.p95WarmMs
  })));

  // Write baseline data as JSON for reporting
  import("fs").then(fs => {
    fs.writeFileSync(
      "scripts/baseline-measurements.json",
      JSON.stringify(results, null, 2)
    );
    console.log("\nSaved baseline measurements to scripts/baseline-measurements.json");
    process.exit(0);
  });
}

main().catch(err => {
  console.error("Baseline benchmark failed:", err);
  process.exit(1);
});
