import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { events, promoters, venues } from "@/lib/db/schema";
import { sql, desc, and, eq } from "drizzle-orm";
import { THAILAND_ONLY_FILTER, FAN_EVENT_FILTER, FUTURE_DATES_FILTER } from "@/lib/db/queries";

/**
 * GET /api/events/search?q=term
 * Returns up to 8 matching events for autocomplete suggestions.
 * Searches event name with ILIKE. Applies the same Thailand/fan/future filters as other views.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const rows = await db
    .select({
      id: events.id,
      name: events.name,
      platform: events.platform,
      status: events.status,
      date: events.date,
      imageUrl: events.imageUrl,
      promoterName: promoters.canonicalName,
      venueName: venues.canonicalName,
      venueRaw: sql<string | null>`(${events.raw}->>'venueRaw')`,
      eventUrl: sql<string | null>`(${events.raw}->>'eventUrl')`,
    })
    .from(events)
    .leftJoin(promoters, eq(events.promoterId, promoters.id))
    .leftJoin(venues, eq(events.venueId, venues.id))
    .where(
      and(
        sql`${events.name} ILIKE ${`%${q}%`}`,
        THAILAND_ONLY_FILTER,
        FAN_EVENT_FILTER,
        FUTURE_DATES_FILTER,
      )
    )
    .orderBy(desc(events.firstSeenAt))
    .limit(8);

  return NextResponse.json({
    results: rows.map((r) => ({
      ...r,
      date: r.date?.toISOString() ?? null,
      imageUrl: r.imageUrl ?? null,
      promoterName: r.promoterName ?? null,
      venueName: r.venueName ?? r.venueRaw ?? null,
      eventUrl: r.eventUrl ?? null,
    })),
  });
}
