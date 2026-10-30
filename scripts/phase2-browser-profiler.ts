import { chromium } from "playwright";

interface PageMetrics {
  url: string;
  dnsMs: number;
  tcpMs: number;
  ttfbMs: number;
  domContentLoadedMs: number;
  loadEventMs: number;
  fcpMs: number;
  lcpMs: number;
  cls: number;
  domNodes: number;
  requestCount: number;
}

function calculateMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const midVal = sorted[mid] ?? 0;
  const prevVal = sorted[mid - 1] ?? 0;
  return sorted.length % 2 !== 0 ? midVal : (prevVal + midVal) / 2;
}

function calculateP95(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
  return sorted[idx] ?? 0;
}

async function runBrowserProfiling() {
  console.log("================================================================================");
  console.log("PHASE 2 — REAL BROWSER PROFILING (Playwright Chromium Headless)");
  console.log("================================================================================");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  // 1. Authenticate
  console.log("\n[Auth] Navigating to http://localhost:3000/login...");
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  
  await page.fill('input[type="email"], input[name="email"]', "staff@citrux.com");
  await page.fill('input[type="password"], input[name="password"]', "Password123!");
  
  console.log("[Auth] Submitting login form...");
  const submitBtn = await page.$('button[type="submit"]');
  if (submitBtn) {
    await submitBtn.click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 }).catch((e) => {
      console.warn("[Auth] waitForURL warning:", e.message);
    });
  }
  
  console.log("[Auth] Signed in! Current URL:", page.url());

  const targetRoutes = [
    { name: "Applications List", path: "/employee/applications" },
    { name: "Application Detail", path: "/employee/applications/fb6c9606-90ea-4bec-a759-f8d1e848f731" },
    { name: "Job Discovery", path: "/employee/jobs" },
  ];

  const results: Record<string, PageMetrics[]> = {};

  for (const route of targetRoutes) {
    console.log(`\n--- Profiling Route: ${route.name} (${route.path}) [10 repetitions] ---`);
    results[route.name] = [];

    for (let i = 1; i <= 10; i++) {
      let requestCount = 0;

      const onRequest = () => {
        requestCount++;
      };

      page.on("request", onRequest);

      await page.goto(`http://localhost:3000${route.path}`, { waitUntil: "networkidle" });

      // Extract window performance metrics
      const perfMetrics = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const paint = performance.getEntriesByType("paint");
        const fcp = paint.find((p) => p.name === "first-contentful-paint")?.startTime || 0;

        let lcp = 0;
        const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
        if (lcpEntries && lcpEntries.length > 0) {
          lcp = (lcpEntries[lcpEntries.length - 1] as any).startTime || 0;
        }

        let cls = 0;
        const shiftEntries = performance.getEntriesByType("layout-shift") as any[];
        if (shiftEntries) {
          for (const entry of shiftEntries) {
            if (!entry.hadRecentInput) {
              cls += entry.value;
            }
          }
        }

        const domNodes = document.querySelectorAll("*").length;

        return {
          dnsMs: nav ? Math.max(0, nav.domainLookupEnd - nav.domainLookupStart) : 0,
          tcpMs: nav ? Math.max(0, nav.connectEnd - nav.connectStart) : 0,
          ttfbMs: nav ? Math.max(0, nav.responseStart - nav.requestStart) : 0,
          domContentLoadedMs: nav ? Math.max(0, nav.domContentLoadedEventEnd - nav.startTime) : 0,
          loadEventMs: nav ? Math.max(0, nav.loadEventEnd - nav.startTime) : 0,
          fcpMs: fcp,
          lcpMs: lcp,
          cls: cls,
          domNodes: domNodes,
        };
      });

      page.off("request", onRequest);

      results[route.name]!.push({
        url: route.path,
        ...perfMetrics,
        requestCount,
      });

      process.stdout.write(`  Run ${i}: TTFB=${perfMetrics.ttfbMs.toFixed(1)}ms, DCL=${perfMetrics.domContentLoadedMs.toFixed(1)}ms, FCP=${perfMetrics.fcpMs.toFixed(1)}ms, LCP=${perfMetrics.lcpMs.toFixed(1)}ms, CLS=${perfMetrics.cls.toFixed(4)}, Nodes=${perfMetrics.domNodes}\n`);
    }
  }

  // Interactive search profiling on /employee/jobs
  console.log("\n--- Profiling Job Discovery UI Interaction & Layout Shift ---");
  await page.goto("http://localhost:3000/employee/jobs", { waitUntil: "networkidle" });

  const searchInput = await page.$('input[placeholder*="title"], input[placeholder*="Search"], input[name="query"], input[type="search"]');
  if (searchInput) {
    await searchInput.fill("React Developer");
    const searchBtn = await page.$('button:has-text("Search"), button[type="submit"]');
    
    if (searchBtn) {
      const clsBefore = await page.evaluate(() => {
        let cls = 0;
        const shiftEntries = performance.getEntriesByType("layout-shift") as any[];
        if (shiftEntries) {
          for (const entry of shiftEntries) {
            if (!entry.hadRecentInput) cls += entry.value;
          }
        }
        return cls;
      });

      const clickStart = Date.now();
      await searchBtn.click();
      
      // Wait for search response (state settles)
      await page.waitForTimeout(3000);
      const interactionDuration = Date.now() - clickStart;

      const clsAfter = await page.evaluate(() => {
        let cls = 0;
        const shiftEntries = performance.getEntriesByType("layout-shift") as any[];
        if (shiftEntries) {
          for (const entry of shiftEntries) {
            if (!entry.hadRecentInput) cls += entry.value;
          }
        }
        return cls;
      });

      console.log(`Search Interaction Duration: ${interactionDuration}ms`);
      console.log(`Cumulative Layout Shift (CLS) during search: ${(clsAfter - clsBefore).toFixed(4)}`);
    }
  }

  // Print Summary Table
  console.log("\n================================================================================");
  console.log("BROWSER PERFORMANCE AUDIT SUMMARY (10 RUNS PER ROUTE)");
  console.log("================================================================================");
  
  const summaryRows = Object.entries(results).map(([name, runs]) => {
    return {
      Route: name,
      "TTFB Median (ms)": calculateMedian(runs.map(r => r.ttfbMs)).toFixed(1),
      "TTFB p95 (ms)": calculateP95(runs.map(r => r.ttfbMs)).toFixed(1),
      "DCL Median (ms)": calculateMedian(runs.map(r => r.domContentLoadedMs)).toFixed(1),
      "DCL p95 (ms)": calculateP95(runs.map(r => r.domContentLoadedMs)).toFixed(1),
      "FCP Median (ms)": calculateMedian(runs.map(r => r.fcpMs)).toFixed(1),
      "FCP p95 (ms)": calculateP95(runs.map(r => r.fcpMs)).toFixed(1),
      "LCP Median (ms)": calculateMedian(runs.map(r => r.lcpMs)).toFixed(1),
      "CLS Median": calculateMedian(runs.map(r => r.cls)).toFixed(4),
      "DOM Nodes (avg)": Math.round(runs.reduce((s, r) => s + r.domNodes, 0) / runs.length),
      "Requests (avg)": Math.round(runs.reduce((s, r) => s + r.requestCount, 0) / runs.length),
    };
  });

  console.table(summaryRows);

  await browser.close();
}

runBrowserProfiling().catch(console.error);
