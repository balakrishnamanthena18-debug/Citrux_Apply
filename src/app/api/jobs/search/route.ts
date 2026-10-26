import { NextRequest, NextResponse } from "next/server";
import { searchDiscoveredJobsAction } from "@/lib/job-discovery/actions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const result = await searchDiscoveredJobsAction(body);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.data, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Search failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get("q") || undefined;
    const exactPhrase = searchParams.get("exactPhrase") || undefined;
    const company = searchParams.get("company") || undefined;
    const country = searchParams.get("country") || undefined;
    const state = searchParams.get("state") || undefined;
    const city = searchParams.get("city") || undefined;
    const industry = searchParams.get("industry") || undefined;
    const workArrangement = searchParams.get("workArrangement") || undefined;
    const seniority = searchParams.get("seniority") || undefined;
    const employmentType = searchParams.get("employmentType") || undefined;
    const skills = searchParams.get("skills") ? searchParams.get("skills")!.split(",").map(s => s.trim()) : undefined;
    const excludedKeywords = searchParams.get("excludedKeywords") ? searchParams.get("excludedKeywords")!.split(",").map(s => s.trim()) : undefined;
    const experienceMin = searchParams.get("experienceMin") ? parseInt(searchParams.get("experienceMin")!, 10) : undefined;
    const experienceMax = searchParams.get("experienceMax") ? parseInt(searchParams.get("experienceMax")!, 10) : undefined;
    const salaryMin = searchParams.get("salaryMin") ? parseInt(searchParams.get("salaryMin")!, 10) : undefined;
    const salaryMax = searchParams.get("salaryMax") ? parseInt(searchParams.get("salaryMax")!, 10) : undefined;
    const postedWithinDays = searchParams.get("postedWithinDays") ? parseInt(searchParams.get("postedWithinDays")!, 10) : undefined;
    const visaSponsored = searchParams.get("visaSponsored") === "true";
    const savedOnly = searchParams.get("savedOnly") === "true";
    const hideSaved = searchParams.get("hideSaved") === "true";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
    const sortBy = searchParams.get("sortBy") || undefined;

    const result = await searchDiscoveredJobsAction({
      query: q,
      exactPhrase,
      companyName: company,
      countries: country ? [country] : undefined,
      states: state ? [state] : undefined,
      cities: city ? [city] : undefined,
      industries: industry ? [industry] : undefined,
      workArrangements: workArrangement ? [workArrangement as any] : undefined,
      seniorityLevels: seniority ? [seniority] : undefined,
      employmentTypes: employmentType ? [employmentType as any] : undefined,
      skills,
      excludedKeywords,
      experienceMin,
      experienceMax,
      salaryMin,
      salaryMax,
      postedWithinDays,
      visaSponsored: visaSponsored || undefined,
      savedOnly: savedOnly || undefined,
      hideSaved: hideSaved || undefined,
      page,
      pageSize,
      sortBy: sortBy as any,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.data, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Search failed" }, { status: 500 });
  }
}
