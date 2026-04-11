import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { events, scrapeRuns } from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";
import { sql, and, eq, lt } from "drizzle-orm";

export async function POST(request: Request) {
  // Optional body: { force?: boolean }
  // force=true clears enrichment data and re-scrapes ALL event detail pages
  let force = false;
  try {
    const body = await request.json().catch(() => ({}));
    force = body?.force === true;
  } catch {
    // no body — fine
  }

  // Mark stale running jobs before checking concurrency
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  await db
    .update(scrapeRuns)
    .set({ status: "failed", completedAt: new Date() })
    .where(
      and(
        eq(scrapeRuns.status, "running"),
        lt(scrapeRuns.startedAt, thirtyMinutesAgo)
      )
    );

  const running = await db.query.scrapeRuns.findFirst({
    where: sql`${scrapeRuns.status} IN ('queued', 'running')`,
  });

  if (running) {
    return NextResponse.json(
      { error: "A scrape job is already running", job_id: running.jobId, status: running.status },
      { status: 409 }
    );
  }

  const jobId = uuidv4();
  await db.insert(scrapeRuns).values({ jobId, status: "queued", startedAt: new Date() });

  // Fire-and-forget — Railway persistent process won't kill this
  void runScrapeJob(jobId, force);

  return NextResponse.json({ job_id: jobId, status: "queued", force });
}

interface PlatformResult {
  platform: string;
  url: string;
  extracted: number;
  inserted: number;
  updated: number;
  skipped: number;
  error?: string;
}

async function runScrapeJob(jobId: string, force = false) {
  await db.update(scrapeRuns).set({ status: "running" }).where(eq(scrapeRuns.jobId, jobId));

  const platformResults: PlatformResult[] = [];
  let totalInserted = 0;

  try {
    // Remove any Megatix events — Megatix is not a supported platform
    await db.execute(
      sql`DELETE FROM events WHERE raw->>'eventUrl' ILIKE '%megatix%' OR platform = 'Megatix'`
    );

    // Null out artist-as-promoter: events where the promoter name appears inside the event name
    // (after stripping common concert suffix words). These are artists, not promoters.
    await db.execute(
      sql`UPDATE events
          SET promoter_id = NULL
          WHERE promoter_id IN (
            SELECT p.id FROM promoters p
            JOIN events e ON e.promoter_id = p.id
            WHERE lower(e.name) LIKE '%' || lower(regexp_replace(p.canonical_name, '\\s*\\(.*\\)', '', 'g')) || '%'
              AND lower(p.canonical_name) NOT SIMILAR TO '%(bec.tero|gmm|live nation|change music|promoter|entertainment|tero|mono|rs|ume|sony|warner|universal|umg|bec|tero)%'
          )`
    );

    // Strip parenthetical noise from promoter names the LLM injected
    // e.g. "UOB Live (often linked with Thai Ticket Major)" → "UOB Live"
    await db.execute(
      sql`UPDATE promoters SET canonical_name = trim(regexp_replace(canonical_name, '\\s*\\(.*\\)\\s*$', '', 'g'))
          WHERE canonical_name ~ '\\('`
    );

    // Clean up false-positive promoters — UI text / button labels the LLM mistakenly
    // extracted as organizer names (TheConcert "Verified fan" membership text, generic
    // "Buy Now" button text, etc.)
    await db.execute(
      sql`UPDATE events SET promoter_id = NULL
          WHERE promoter_id IN (
            SELECT id FROM promoters
            WHERE canonical_name ILIKE '%verified fan%'
               OR canonical_name ILIKE '%สมาชิกยืนยัน%'
               OR canonical_name ILIKE '%ยืนยันตัวตน%'
               OR canonical_name ILIKE 'buy now'
               OR canonical_name ILIKE 'buy ticket%'
               OR canonical_name ILIKE 'sold out'
          )`
    );
    await db.execute(
      sql`DELETE FROM promoters
          WHERE canonical_name ILIKE '%verified fan%'
             OR canonical_name ILIKE '%สมาชิกยืนยัน%'
             OR canonical_name ILIKE '%ยืนยันตัวตน%'
             OR canonical_name ILIKE 'buy now'
             OR canonical_name ILIKE 'buy ticket%'
             OR canonical_name ILIKE 'sold out'`
    );

    // Heal any UNKNOWN events on ticket platforms from prior scrapes (they're on sale by definition)
    await db.execute(
      sql`UPDATE events SET status = 'ON_SALE' WHERE status = 'UNKNOWN' AND platform IN ('ThaiTicketMajor', 'Ticketmelon', 'TheConcert', 'Eventpop', 'AllTicket', 'TicketTier')`
    );

    // Wipe homepage-level eventUrls (e.g. "https://www.theconcert.com/#") that were
    // stored from JS-routing sites where the LLM extracted "#" as the event URL.
    // These poison the enrichment pass — scraping a homepage never returns event data.
    await db.execute(
      sql`UPDATE events SET raw = raw - 'eventUrl'
          WHERE raw->>'eventUrl' SIMILAR TO 'https?://[^/]+/?#?'`
    );

    // Strip URL fragments and query params from eventUrls — they're client-side only
    // and cause Firecrawl to fail or return wrong content on detail pages.
    // e.g. ".../event#event-tickets" → ".../event", ".../event?aff=xxx#section" → ".../event"
    await db.execute(
      sql`UPDATE events
          SET raw = jsonb_set(raw, '{eventUrl}', to_jsonb(
            regexp_replace(raw->>'eventUrl', '[?#].*$', '')
          ))
          WHERE raw->>'eventUrl' IS NOT NULL
            AND (raw->>'eventUrl' LIKE '%#%' OR raw->>'eventUrl' LIKE '%?%')`
    );

    // Fix malformed Eventpop URLs missing the /e/ path prefix
    // e.g. "https://www.eventpop.me/132318" → "https://www.eventpop.me/e/132318"
    await db.execute(
      sql`UPDATE events
          SET raw = jsonb_set(raw, '{eventUrl}', to_jsonb(
            'https://www.eventpop.me/e/' || substring(raw->>'eventUrl' from 25)
          ))
          WHERE platform = 'Eventpop'
            AND raw->>'eventUrl' ~ '^https://www[.]eventpop[.]me/[0-9]+$'`
    );

    // Heal bad dates: LLM year guesses can be wrong (< 2026 on active events).
    // Null them so they get re-populated when the listing is re-scraped this run.
    await db.execute(
      sql`UPDATE events SET date = NULL WHERE EXTRACT(YEAR FROM date) < 2026
          AND status IN ('ON_SALE', 'PRE_SALE', 'UNKNOWN')`
    );

    // Force mode: wipe enrichment fields so all events get re-enriched from scratch
    if (force) {
      console.log("[scrape] Force mode: clearing enrichment data for re-scrape");
      await db.execute(
        sql`UPDATE events SET image_url = NULL, ticket_tiers = '[]'::jsonb, promoter_id = NULL
            WHERE platform IN ('Ticketmelon','Eventpop','TheConcert','ThaiTicketMajor','AllTicket','TicketTier')
            AND status IN ('PRE_SALE', 'ON_SALE', 'COMING_SOON', 'UNKNOWN')`
      );
    }

    const FirecrawlApp = (await import("firecrawl")).default;
    const { scrapeUrl, PLATFORMS } = await import("@/lib/scrapers/firecrawl");
    const { normalizeAndIngest } = await import("@/lib/ingest/normalize");

    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) throw new Error("FIRECRAWL_API_KEY not set");

    const app = new FirecrawlApp({ apiKey });

    // Build tasks — include waitForMs so platform config is respected
    const tasks = PLATFORMS.flatMap((platform) =>
      platform.urls.map((url) => ({
        platformName: platform.name,
        url,
        timeoutMs: platform.timeoutMs,
        waitForMs: platform.waitForMs ?? 5000,
      }))
    );

    // Run platform scrapes sequentially — Firecrawl LLM extraction fails under concurrency
    const CONCURRENCY = 1;
    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      const batch = tasks.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.map(async ({ platformName, url, timeoutMs, waitForMs }) => {
          const platformResult: PlatformResult = {
            platform: platformName,
            url,
            extracted: 0,
            inserted: 0,
            updated: 0,
            skipped: 0,
          };

          try {
            const rawEvents = await scrapeUrl(app, platformName, url, timeoutMs, waitForMs);
            platformResult.extracted = rawEvents.length;

            if (rawEvents.length > 0) {
              const result = await normalizeAndIngest(rawEvents);
              platformResult.inserted = result.inserted;
              platformResult.updated = result.updated;
              platformResult.skipped = result.skipped;
              totalInserted += result.inserted;

              // Incremental count update
              await db
                .update(scrapeRuns)
                .set({ eventsFound: sql`COALESCE(${scrapeRuns.eventsFound}, 0) + ${result.inserted}` })
                .where(eq(scrapeRuns.jobId, jobId));
            }
          } catch (err) {
            platformResult.error = String(err);
            console.error(`[scrape] Platform ${platformName} failed:`, err);
          }

          platformResults.push(platformResult);
          console.log(
            `[scrape] ${platformName}: extracted=${platformResult.extracted} new=${platformResult.inserted} updated=${platformResult.updated} skipped=${platformResult.skipped}${platformResult.error ? ` error=${platformResult.error}` : ""}`
          );
        })
      );
    }

    // Dedup pass: merge same-platform duplicate events (LLM name variations)
    console.log("[scrape] Running dedup pass...");
    try {
      const dedupRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3003"}/api/scrape/dedup`, { method: "POST" });
      const dedupData = await dedupRes.json() as { deleted?: number };
      console.log(`[scrape] Dedup removed ${dedupData.deleted ?? 0} duplicate events`);
    } catch (err) {
      console.warn("[scrape] Dedup pass failed (non-fatal):", err);
    }

    // URL backfill pass: fill in missing eventUrls so the enrichment pass can run
    console.log("[scrape] Running URL backfill pass...");
    const { backfillEventUrls } = await import("@/lib/db/backfill-event-urls");
    const backfillResults = await backfillEventUrls();
    const backfillTotal = backfillResults.reduce((sum, r) => sum + r.eventsUpdated, 0);
    console.log(`[scrape] URL backfill updated ${backfillTotal} events`);

    // Second pass (zero-cost): link Ticketmelon events to promoters via URL slug
    const { linkTicketmelonPromotersFromUrls, enrichEventDetails, enrichFromPromoterPages, enrichVenuePlatformTicketingLinks } = await import("@/lib/scrapers/event-detail");
    console.log("[scrape] Running Ticketmelon URL-based promoter linking...");
    const linkedFromUrls = await linkTicketmelonPromotersFromUrls();
    console.log(`[scrape] Linked ${linkedFromUrls} Ticketmelon events to promoters via URLs`);

    // Third pass: enrich event detail pages (image, ticket tiers — promoter now handled above)
    console.log(`[scrape] Running event detail enrichment pass (force=${force})...`);
    const enriched = await enrichEventDetails(force);
    console.log(`[scrape] Enriched ${enriched} event detail pages`);

    // Fourth pass: visit each Ticketmelon promoter's organizer page for additional events
    console.log("[scrape] Running promoter page discovery pass...");
    const fromPromoterPages = await enrichFromPromoterPages();
    console.log(`[scrape] Found ${fromPromoterPages} new events from promoter pages`);

    // Fifth pass: follow ticketing links from venue platform event pages
    console.log("[scrape] Running venue platform ticketing link pass...");
    const fromVenueLinks = await enrichVenuePlatformTicketingLinks();
    console.log(`[scrape] Found ${fromVenueLinks} new events from venue platform links`);

    // Refresh promoter stats after every scrape
    const { refreshPromoterStats } = await import("@/lib/ingest/normalize");
    await refreshPromoterStats();

    // Generate daily brief BEFORE marking done — the ScrapeButton poller stops
    // as soon as it sees "done", so the brief must already be in the DB by then
    // or the final router.refresh() will capture the old brief.
    const { generateDailyBrief } = await import("@/lib/ingest/brief");
    await generateDailyBrief();

    await db
      .update(scrapeRuns)
      .set({
        status: "done",
        completedAt: new Date(),
        eventsFound: totalInserted,
        errors: platformResults.filter((r) => r.error || r.extracted === 0).map((r) => ({
          platform: r.platform,
          url: r.url,
          extracted: r.extracted,
          inserted: r.inserted,
          updated: r.updated,
          error: r.error,
        })),
      })
      .where(eq(scrapeRuns.jobId, jobId));
  } catch (error) {
    await db
      .update(scrapeRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        errors: [{ message: String(error), ts: new Date().toISOString() }],
      })
      .where(eq(scrapeRuns.jobId, jobId));
  }
}
