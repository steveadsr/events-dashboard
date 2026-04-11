import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * POST /api/scrape/backfill
 * Backfills eventUrl for existing events that are missing it.
 * Also runs immediate data-quality fixes (promoter name cleanup, etc).
 */
export async function POST() {
  try {
    // Fix promoter names with parenthetical noise immediately
    // e.g. "UOB Live (often linked with Thai Ticket Major)" → "UOB Live"
    await db.execute(
      sql`UPDATE promoters SET canonical_name = trim(regexp_replace(canonical_name, '\\s*\\(.*\\)\\s*$', '', 'g'))
          WHERE canonical_name ~ '\\('`
    );

    const { backfillEventUrls } = await import("@/lib/db/backfill-event-urls");
    const results = await backfillEventUrls();

    const totalUpdated = results.reduce((sum, r) => sum + r.eventsUpdated, 0);
    const totalLinks = results.reduce((sum, r) => sum + r.linksFound, 0);

    return NextResponse.json({
      ok: true,
      totalLinksFound: totalLinks,
      totalEventsUpdated: totalUpdated,
      byPlatform: results,
    });
  } catch (err) {
    console.error("[backfill] Error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
