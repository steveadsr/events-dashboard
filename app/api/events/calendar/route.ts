import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/events/calendar?month=2026-04
 * Returns all events for the given month (no pagination).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const month = searchParams.get("month"); // "YYYY-MM"

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "?month=YYYY-MM required" }, { status: 400 });
  }

  const [year, mon] = month.split("-").map(Number);

  try {
    const { getCalendarEvents } = await import("@/lib/db/queries");
    const { events, keyVenues } = await getCalendarEvents(year, mon);
    return NextResponse.json({ events, keyVenues });
  } catch (err) {
    console.error("[api/events/calendar]", err);
    return NextResponse.json({ error: "Failed to fetch calendar events" }, { status: 500 });
  }
}
