import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = {
    status: "pass",
    timestamp: new Date().toISOString(),
    service: "oos",
    phase: "0",
  };

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
