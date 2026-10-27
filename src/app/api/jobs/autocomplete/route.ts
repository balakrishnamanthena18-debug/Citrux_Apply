import { NextRequest, NextResponse } from "next/server";
import { getJobAutocompleteSuggestionsAction } from "@/lib/job-discovery/actions";
import { verifyAbuseProtection } from "@/lib/security/abuse-protection";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Abuse protection & rate limiting
    const abuseCheck = await verifyAbuseProtection(request, {
      endpoint: "/api/jobs/autocomplete",
    });

    if (!abuseCheck.allowed) {
      return NextResponse.json(
        { error: abuseCheck.error || "Too many requests. Please slow down." },
        { status: abuseCheck.status || 429, headers: abuseCheck.headers }
      );
    }

    // 2. Query extraction & bounds enforcement
    const searchParams = request.nextUrl.searchParams;
    const rawQuery = searchParams.get("q") || searchParams.get("query") || "";
    const query = rawQuery.slice(0, 100);
    const type = (searchParams.get("type") || "all") as any;
    const country = searchParams.get("country")?.slice(0, 20) || undefined;
    const state = searchParams.get("state")?.slice(0, 100) || undefined;
    const limitParam = searchParams.get("limit");
    const parsedLimit = limitParam ? parseInt(limitParam, 10) : 8;
    const limit = Math.min(Math.max(parsedLimit || 8, 1), 25);

    // 3. Authenticated execution
    const result = await getJobAutocompleteSuggestionsAction({
      query,
      type,
      country,
      state,
      limit,
    });

    if (!result.success) {
      if (result.unauthorized) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ error: result.error || "Search error" }, { status: 400 });
    }

    return NextResponse.json(
      { suggestions: result.data || [] },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
          ...abuseCheck.headers,
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Autocomplete lookup failed" },
      { status: 500 }
    );
  }
}
