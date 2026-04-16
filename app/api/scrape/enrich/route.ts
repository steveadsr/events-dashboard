import { NextResponse } from "next/server";

/**
 * POST /api/scrape/enrich
 * Runs just the event-detail enrichment pass (image, ticket tiers, promoter).
 * Useful for triggering enrichment without a full scrape, or for debugging why
 * events are missing data.
 *
 * Body: { force?: boolean }
 * force=true re-enriches all events regardless of detailScrapedAt cooldown.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const force = body?.force === true;

  try {
    const { enrichEventDetails } = await import("@/lib/scrapers/event-detail");
    const enriched = await enrichEventDetails(force);
    return NextResponse.json({ ok: true, enriched, force });
  } catch (err) {
    console.error("[enrich] Error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
