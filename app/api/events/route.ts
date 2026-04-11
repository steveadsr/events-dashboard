import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const cursor = searchParams.get("cursor") ?? undefined;
  const platform = searchParams.get("platform") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const keyVenue = searchParams.get("keyVenue") === "1";

  try {
    const { getEventsPage } = await import("@/lib/db/queries");
    const result = await getEventsPage(cursor, platform, status, keyVenue, 25);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/events] Error:", err);
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}
