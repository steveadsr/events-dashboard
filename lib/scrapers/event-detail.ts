import FirecrawlApp from "firecrawl";
import { fal } from "@fal-ai/client";
import { db } from "@/lib/db";
import { events, promoters } from "@/lib/db/schema";
import { eq, isNull, sql, and, isNotNull } from "drizzle-orm";
import type { TicketTier, TierStatus } from "@/lib/types";
import { scrapeUrl } from "@/lib/scrapers/firecrawl";

// Platforms where we can meaningfully scrape event detail pages
const DETAIL_SCRAPE_PLATFORMS = new Set([
  "Ticketmelon", "Eventpop", "TheConcert", "ThaiTicketMajor", "AllTicket", "TicketTier",
  // Venue/promoter platforms — their individual event pages scrape fine
  "Impact", "LiveNationTero", "UOBLive", "Thunderdome",
]);

// How many event pages to enrich PER PLATFORM per scrape run
const MAX_DETAIL_PAGES_PER_PLATFORM = 10;
// Upper limit for a force-enrich run (per platform)
const MAX_DETAIL_PAGES_FORCE_PER_PLATFORM = 40;

// Per-platform waitFor (ms). Eventpop is a heavy SPA — needs more time.
const PLATFORM_WAIT_MS: Record<string, number> = {
  Eventpop: 8000,
  AllTicket: 8000,
};

interface ExtractedEventDetail {
  image_url: string | null;
  date_start: string | null;
  date_end: string | null;
  promoter_name: string | null;
  organizer_page_url: string | null;
  event_status: string | null;
  ticket_tiers: Array<{
    name: string;
    price_text: string | null;
    status: string | null;
    remaining: number | null;
  }>;
}

// Keep short — Firecrawl silently drops json for prompts over ~300 chars.
// Per-platform prompts tailored to each site's page structure.
const PLATFORM_DETAIL_PROMPTS: Record<string, string> = {
  Ticketmelon:
    `From this event page extract: image_url (hero image), date_start (ISO 8601 start date), date_end (ISO 8601 end date if multi-day, else null), promoter_name (organizer), organizer_page_url (link to organizer page, relative ok), ticket_tiers (array of {name, price_text, status: on_sale/sold_out/sale_ended/unavailable, remaining}). Return JSON. Null if not found.`,
  Eventpop:
    `Extract: image_url (event poster), date_start (ISO 8601 start date), date_end (ISO 8601 end date if multi-day, else null), promoter_name (Organizer section/tab name), organizer_page_url (organizer profile link), ticket_tiers ({name, price_text, status: on_sale/sold_out, remaining}), event_status (on_sale/sold_out/coming_soon). Return JSON. Null if not found.`,
  TheConcert:
    `Extract: image_url (event banner/poster), date_start (ISO 8601 start date), date_end (ISO 8601 end date if multi-day, else null), promoter_name (organizer or producer name — NOT "Verified fan" membership text, NOT platform name), ticket_tiers ({name, price_text, status: on_sale/sold_out/coming_soon}), event_status (on_sale/sold_out/coming_soon). Return JSON. Null if not found.`,
  ThaiTicketMajor:
    `Extract: image_url (event poster), date_start (ISO 8601 start date), date_end (ISO 8601 end date if multi-day, else null), promoter_name (organizer in notes/terms, often Live Nation Tero, BEC-Tero, or GMM Grammy), ticket_tiers ({name, price_text, status: on_sale/sold_out}), event_status (on_sale/sold_out/coming_soon). Return JSON. Null if not found.`,
  AllTicket:
    `Extract: image_url (event poster), date_start (ISO 8601 start date), date_end (ISO 8601 end date if multi-day, else null), promoter_name (organizer in description or terms, e.g. GMMShow, GMM Grammy, BEC-Tero), ticket_tiers ({name, price_text, status: on_sale/sold_out/coming_soon}), event_status (on_sale/sold_out/coming_soon). Return JSON. Null if not found.`,
  TicketTier:
    `Extract: image_url (event poster), date_start (ISO 8601 start date), date_end (ISO 8601 end date if multi-day, else null), promoter_name (Organizer box/section), organizer_page_url (organizer profile link), ticket_tiers ({name, price_text, status: on_sale/sold_out/coming_soon}), event_status (on_sale/sold_out/coming_soon). Return JSON. Null if not found.`,
  // Venue/promoter platforms — same basic extraction, no organizer profile links needed
  Impact:
    `Extract: image_url (event poster/banner), date_start (ISO 8601 start date), date_end (ISO 8601 end date if multi-day, else null), promoter_name (organizer company name), ticket_tiers ({name, price_text, status: on_sale/sold_out/coming_soon}), event_status (on_sale/sold_out/coming_soon). Return JSON. Null if not found.`,
  LiveNationTero:
    `Extract: image_url (event poster/banner), date_start (ISO 8601 start date), date_end (ISO 8601 end date if multi-day, else null), promoter_name (Live Nation Tero or specific organizer), ticket_tiers ({name, price_text, status: on_sale/sold_out/coming_soon}), event_status (on_sale/sold_out/coming_soon). Return JSON. Null if not found.`,
  UOBLive:
    `Extract: image_url (event poster/banner), date_start (ISO 8601 start date), date_end (ISO 8601 end date if multi-day, else null), promoter_name (organizer/presenter company name), ticket_tiers ({name, price_text, status: on_sale/sold_out/coming_soon}), event_status (on_sale/sold_out/coming_soon). Return JSON. Null if not found.`,
  Thunderdome:
    `Extract: image_url (event poster/banner), date_start (ISO 8601 start date), date_end (ISO 8601 end date if multi-day, else null), promoter_name (organizer company name), ticket_tiers ({name, price_text, status: on_sale/sold_out/coming_soon}), event_status (on_sale/sold_out/coming_soon). Return JSON. Null if not found.`,
};

// Fallback prompt if platform not in map above
const DETAIL_EXTRACT_PROMPT = PLATFORM_DETAIL_PROMPTS["Ticketmelon"];

/** False-positive promoter names that should never be stored (TheConcert specific). */
const JUNK_DETAIL_PROMOTER_PATTERNS = [
  /verified.?fan/i,
  /สมาชิกยืนยัน/,
  /ยืนยันตัวตน/,
];
function isJunkDetailPromoter(name: string | null): boolean {
  if (!name) return true;
  return JUNK_DETAIL_PROMOTER_PATTERNS.some((p) => p.test(name));
}

/** Map a detail-page event_status string to our DB enum value. */
type EventStatus = "PRE_SALE" | "ON_SALE" | "SOLD_OUT" | "CANCELLED" | "COMING_SOON" | "UNKNOWN";
function mapDetailStatus(raw: string | null): EventStatus | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  if (s === "on_sale" || s === "on sale") return "ON_SALE";
  if (s === "sold_out" || s === "sold out") return "SOLD_OUT";
  if (s === "coming_soon" || s === "coming soon") return "COMING_SOON";
  if (s === "pre_sale" || s === "pre sale") return "PRE_SALE";
  return null;
}

function normalizeTierStatus(raw: string | null): TierStatus {
  if (!raw) return "unknown";
  const s = raw.toLowerCase().trim();
  if (s === "on_sale" || s === "on sale") return "on_sale";
  if (s === "sold_out" || s === "sold out") return "sold_out";
  if (s === "sale_ended" || s === "sale ended") return "sale_ended";
  if (s === "unavailable") return "unavailable";
  return "unknown";
}

function parsePriceThb(priceText: string | null): number | null {
  if (!priceText) return null;
  const match = priceText.replace(/,/g, "").match(/\d+/);
  return match ? parseInt(match[0]) : null;
}

/**
 * Vision-based extraction fallback for platforms where Firecrawl LLM extraction fails.
 * Takes a Firecrawl screenshot (base64 PNG) and uses Claude vision to extract
 * image_url (from og:image meta), ticket tiers, and event status.
 *
 * Used for Eventpop and AllTicket where JS rendering makes JSON extraction unreliable.
 */
async function extractViaVision(
  firecrawlApp: FirecrawlApp,
  eventUrl: string,
  platformName: string,
): Promise<ExtractedEventDetail | null> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    console.warn("[event-detail] FAL_KEY not set — skipping vision fallback");
    return null;
  }

  try {
    // Fetch screenshot + raw HTML (for og:image parsing) in one call
    const result = await firecrawlApp.scrapeUrl(eventUrl, {
      formats: ["screenshot", "rawHtml"],
      waitFor: 8000,
      timeout: 60000,
    });

    if (!result.success) {
      console.warn(`[event-detail] Vision fallback: scrape failed for ${eventUrl}`);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = result as any;
    const screenshot: string | null = r.screenshot ?? null;
    const rawHtml: string | null = r.rawHtml ?? null;

    if (!screenshot) {
      console.warn(`[event-detail] Vision fallback: no screenshot returned for ${eventUrl}`);
      return null;
    }

    // Extract og:image from raw HTML (fast, no LLM needed)
    let imageUrl: string | null = null;
    if (rawHtml) {
      const ogImageMatch = rawHtml.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        ?? rawHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      if (ogImageMatch) {
        imageUrl = ogImageMatch[1];
      }
    }

    // Firecrawl v1+ returns a hosted URL; older versions return raw base64.
    // OpenRouter image_url accepts both: a URL directly, or a data URI for base64.
    const imageUrlForModel = screenshot.startsWith("http")
      ? screenshot
      : `data:image/png;base64,${screenshot.replace(/^data:image\/\w+;base64,/, "")}`;

    const model = process.env.LLM_MODEL ?? "anthropic/claude-3.5-sonnet";
    fal.config({ credentials: falKey });

    const falResult = await fal.run("openrouter/router" as Parameters<typeof fal.run>[0], {
      input: {
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrlForModel } },
              {
                type: "text",
                text: `This is a ${platformName} event ticketing page. Extract:
1. ticket_tiers: array of {name, price_text (Thai baht amount as string), status: "on_sale"|"sold_out"|"unavailable"}
2. event_status: "on_sale"|"sold_out"|"coming_soon"|"pre_sale"
3. promoter_name: the organizer/promoter name if clearly shown

Return ONLY valid JSON: {"ticket_tiers": [...], "event_status": "...", "promoter_name": null}
Use null for fields not visible. If no tiers visible, use empty array.`,
              },
            ],
          },
        ],
        max_tokens: 1024,
        temperature: 0.1,
      },
    }) as { output?: { choices?: Array<{ message?: { content?: string } }> } };

    const responseText = falResult?.output?.choices?.[0]?.message?.content ?? null;
    if (!responseText) return null;

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      ticket_tiers?: Array<{ name?: string; price_text?: string; status?: string }>;
      event_status?: string;
      promoter_name?: string | null;
    };

    console.log(`[event-detail] Vision: image=${!!imageUrl} tiers=${parsed.ticket_tiers?.length ?? 0} status=${parsed.event_status ?? "—"}`);

    return {
      image_url: imageUrl,
      date_start: null,
      date_end: null,
      promoter_name: parsed.promoter_name ?? null,
      organizer_page_url: null,
      event_status: parsed.event_status ?? null,
      ticket_tiers: (parsed.ticket_tiers ?? []).map((t) => ({
        name: t.name ?? "Unknown",
        price_text: t.price_text ?? null,
        status: t.status ?? null,
        remaining: null,
      })),
    };
  } catch (err) {
    console.error(`[event-detail] Vision fallback error for ${eventUrl}:`, err);
    return null;
  }
}

// Platforms where Firecrawl LLM extraction consistently fails — use vision fallback
const VISION_FALLBACK_PLATFORMS = new Set(["Eventpop", "AllTicket"]);

/**
 * Second-pass scrape: visit individual event pages for events that are missing
 * promoter, image, or ticket tier data. Updates events in place.
 * @param forceAll - if true, re-enriches ALL events with URLs, not just those missing data
 * Returns the number of events enriched.
 */
export async function enrichEventDetails(forceAll = false): Promise<number> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.warn("[event-detail] FIRECRAWL_API_KEY not set — skipping detail enrichment");
    return 0;
  }

  const limitPerPlatform = forceAll ? MAX_DETAIL_PAGES_FORCE_PER_PLATFORM : MAX_DETAIL_PAGES_PER_PLATFORM;
  // In force mode: re-enrich everything (clear detailScrapedAt check).
  // In normal mode: only pick events missing data AND either never attempted or attempted > 7 days ago.
  // The 7-day cooldown prevents a permanent feedback loop where Firecrawl-failed events
  // consume all enrichment slots every run.
  const needsDataFilter = forceAll
    ? ""
    : `AND (promoter_id IS NULL OR image_url IS NULL OR date_end IS NULL OR jsonb_array_length(COALESCE(ticket_tiers, '[]'::jsonb)) = 0)
       AND (raw->>'detailScrapedAt' IS NULL OR (raw->>'detailScrapedAt')::timestamptz < NOW() - INTERVAL '7 days')`;

  // Select up to N events PER PLATFORM so all platforms get enrichment slots each run.
  // Without this, a platform with many events (e.g. Ticketmelon) would exhaust the limit
  // before other platforms get any credits.
  // Order by detailScrapedAt NULLS FIRST so never-attempted events are always tried before retries.
  const rows = await db.execute(sql`
    SELECT * FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY platform ORDER BY (raw->>'detailScrapedAt') NULLS FIRST, id) AS rn
      FROM events
      WHERE platform IN ('Ticketmelon','Eventpop','TheConcert','ThaiTicketMajor','AllTicket','TicketTier',
                         'Impact','LiveNationTero','UOBLive','Thunderdome')
        AND raw->>'eventUrl' IS NOT NULL
        AND raw->>'eventUrl' NOT ILIKE '%/N/A%'
        AND raw->>'eventUrl' NOT ILIKE '%/null%'
        AND raw->>'eventUrl' NOT SIMILAR TO 'https?://[^/]+/?#?'
        AND status IN ('PRE_SALE','ON_SALE','COMING_SOON','UNKNOWN','SOLD_OUT')
        ${sql.raw(needsDataFilter)}
    ) ranked
    WHERE rn <= ${limitPerPlatform}
    ORDER BY platform, id
  `);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidates = rows as unknown as (typeof events.$inferSelect)[];

  if (candidates.length === 0) {
    console.log("[event-detail] No events need enrichment");
    return 0;
  }

  console.log(`[event-detail] Enriching ${candidates.length} event detail pages`);

  const app = new FirecrawlApp({ apiKey });
  let enriched = 0;

  for (const event of candidates) {
    const raw = event.raw as Record<string, unknown> | null;
    const eventUrl = raw?.eventUrl as string | null;
    if (!eventUrl) continue;

    if (!DETAIL_SCRAPE_PLATFORMS.has(event.platform)) continue;

    const prompt = PLATFORM_DETAIL_PROMPTS[event.platform] ?? DETAIL_EXTRACT_PROMPT;

    try {
      console.log(`[event-detail] Scraping ${event.platform} detail: ${eventUrl}`);

      // Stamp the attempt time BEFORE scraping so the 7-day cooldown always kicks in,
      // even if scrapeUrl() throws (network error, quota exceeded, etc.).
      // Without this, a permanently-failing URL would retry on every scrape run.
      const nowIso = new Date().toISOString();
      await db.execute(sql`
        UPDATE events
        SET raw = jsonb_set(COALESCE(raw, '{}'::jsonb), '{detailScrapedAt}', ${JSON.stringify(nowIso)}::jsonb)
        WHERE id = ${event.id}
      `);

      const waitFor = PLATFORM_WAIT_MS[event.platform] ?? 6000;
      const result = await app.scrapeUrl(eventUrl, {
        formats: ["json"],
        jsonOptions: { prompt },
        waitFor,
        timeout: 45000,
      });

      if (!result.success) {
        console.warn(`[event-detail] Failed ${eventUrl}`);
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = result as any;
      let extracted = r.json as ExtractedEventDetail | null;

      // Metadata fallback: Firecrawl always returns og:image in metadata even when
      // LLM JSON extraction misses it. Use it to fill a missing image_url before
      // triggering the expensive vision fallback.
      if (extracted && !extracted.image_url) {
        const ogImage = r.metadata?.ogImage as string | null | undefined;
        if (ogImage) {
          extracted = { ...extracted, image_url: ogImage };
          console.log(`[event-detail] Using og:image metadata fallback for ${event.platform}`);
        }
      }

      // Vision fallback: if Firecrawl LLM extraction returned nothing (common on Eventpop/AllTicket
      // due to JS rendering complexity), re-scrape with screenshot + Claude vision.
      if (!extracted || (!extracted.image_url && !extracted.ticket_tiers?.length)) {
        if (VISION_FALLBACK_PLATFORMS.has(event.platform)) {
          console.log(`[event-detail] LLM extraction empty for ${event.platform} — trying vision fallback`);
          extracted = await extractViaVision(app, eventUrl, event.platform);
        }
      }

      if (!extracted) continue;

      // Normalize ticket tiers
      const tiers: TicketTier[] = (extracted.ticket_tiers ?? []).map((t) => ({
        name: t.name ?? "Unknown",
        priceThb: parsePriceThb(t.price_text),
        status: normalizeTierStatus(t.status),
        remaining: t.remaining ?? null,
      }));

      // Resolve event status from detail page (only upgrade specificity — don't clear known states)
      const detailStatus = mapDetailStatus(extracted.event_status);

      // Resolve organizer_page_url to absolute (Ticketmelon paths can be relative, e.g. /odrock)
      const resolvedOrgUrl = resolveOrganizerUrl(extracted.organizer_page_url, eventUrl);

      // Resolve or create promoter — skip junk names (TheConcert "Verified fan" etc.)
      let promoterId: string | null = event.promoterId ?? null;
      const promoterName = isJunkDetailPromoter(extracted.promoter_name)
        ? null
        : extracted.promoter_name;

      if (!promoterId && promoterName) {
        const existing = await db.query.promoters.findFirst({
          where: sql`lower(${promoters.canonicalName}) = lower(${promoterName})`,
        });
        if (existing) {
          promoterId = existing.id;
        } else {
          const inserted = await db.insert(promoters).values({
            canonicalName: promoterName,
            platformNames: { [event.platform]: promoterName },
            platformsActive: [event.platform],
            venuesUsed: [],
            organizerPageUrl: resolvedOrgUrl ?? undefined,
          }).returning({ id: promoters.id });
          promoterId = inserted[0]?.id ?? null;
          console.log(`[event-detail] Created promoter: ${promoterName}`);
        }

        // Update organizer page URL if we have it and it's missing
        if (promoterId && resolvedOrgUrl) {
          await db.update(promoters)
            .set({ organizerPageUrl: resolvedOrgUrl })
            .where(and(
              eq(promoters.id, promoterId),
              isNull(promoters.organizerPageUrl),
            ));
        }
      }

      // Build the update — use detail-page status if it's more specific than what we have.
      // The scrape pipeline heals UNKNOWN → ON_SALE before enrichment runs, so we must also
      // allow transitions like ON_SALE → SOLD_OUT / COMING_SOON from the detail page.
      // Priority: SOLD_OUT > PRE_SALE ≈ COMING_SOON > ON_SALE > UNKNOWN
      const STATUS_PRIORITY: Record<string, number> = { SOLD_OUT: 4, PRE_SALE: 3, COMING_SOON: 3, ON_SALE: 2, UNKNOWN: 0 };
      const currentPriority = STATUS_PRIORITY[event.status] ?? 0;
      const newPriority = detailStatus ? (STATUS_PRIORITY[detailStatus] ?? 0) : 0;
      const statusUpdate = newPriority > currentPriority ? detailStatus : undefined;

      // Parse date_start / date_end from enrichment if provided
      const enrichedStart = extracted.date_start ? new Date(extracted.date_start) : null;
      const enrichedEnd = extracted.date_end ? new Date(extracted.date_end) : null;

      // Update the event record
      await db.update(events).set({
        promoterId: promoterId ?? event.promoterId,
        imageUrl: extracted.image_url ?? event.imageUrl ?? undefined,
        ticketTiers: tiers.length > 0 ? tiers : event.ticketTiers ?? [],
        ...(statusUpdate ? { status: statusUpdate } : {}),
        // Use enriched dates only if they look valid and provide new info
        ...(enrichedStart && !isNaN(enrichedStart.getTime()) && !event.date
          ? { date: enrichedStart } : {}),
        ...(enrichedEnd && !isNaN(enrichedEnd.getTime()) && !event.dateEnd
          ? { dateEnd: enrichedEnd } : {}),
      }).where(eq(events.id, event.id));

      enriched++;
      console.log(`[event-detail] Enriched "${event.name}": promoter=${promoterName ?? "—"} image=${!!extracted.image_url} tiers=${tiers.length} status=${statusUpdate ?? "—"}`);

    } catch (err) {
      console.error(`[event-detail] Failed enriching "${event.name}":`, err);
    }
  }

  return enriched;
}

/**
 * Resolve a potentially-relative organizer page URL to absolute.
 * Uses the event URL's origin as the base for relative paths.
 */
function resolveOrganizerUrl(orgUrl: string | null, eventUrl: string): string | null {
  if (!orgUrl) return null;
  if (orgUrl.startsWith("http")) return orgUrl;
  try {
    const base = new URL(eventUrl).origin;
    return new URL(orgUrl, base).href;
  } catch {
    return null;
  }
}

// Platforms that are venue/promoter sites (not ticketing platforms)
const VENUE_PLATFORMS = ["LiveNationTero", "UOBLive", "Impact", "Thunderdome"];

// Ticketing platform domain patterns → platform name
const TICKETING_DOMAINS: Array<{ pattern: RegExp; platform: string }> = [
  { pattern: /thaiticketmajor\.com/i, platform: "ThaiTicketMajor" },
  { pattern: /ticketmelon\.com/i,     platform: "Ticketmelon" },
  { pattern: /eventpop\.me/i,         platform: "Eventpop" },
  { pattern: /allticket\.com/i,       platform: "AllTicket" },
  { pattern: /ticketier\.com/i,       platform: "TicketTier" },
  { pattern: /theconcert\.com/i,      platform: "TheConcert" },
];

// Keep short — Firecrawl silently drops json for prompts over ~300 chars.
const VENUE_TICKET_LINK_PROMPT = `Find the external ticket purchase link. Return JSON: {"ticketing_url": "..."} where ticketing_url is a URL to thaiticketmajor.com, ticketmelon.com, eventpop.me, allticket.com, tickettier.com, or theconcert.com. Null if not found.`;

/**
 * Follow-links pass for venue platform events.
 * Visits each venue event page, extracts ticketing platform URLs,
 * and ingests those events attributed to the correct ticketing platform.
 * Returns the number of new ticketing-platform events inserted.
 */
export async function enrichVenuePlatformTicketingLinks(): Promise<number> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.warn("[event-detail] FIRECRAWL_API_KEY not set — skipping venue link enrichment");
    return 0;
  }

  // Find venue platform events that have an eventUrl
  const candidates = await db.execute(
    sql`SELECT id, name, platform, raw->>'eventUrl' as event_url
        FROM events
        WHERE platform = ANY(ARRAY['LiveNationTero','UOBLive','Impact','Thunderdome'])
          AND raw->>'eventUrl' IS NOT NULL
          AND status IN ('ON_SALE','PRE_SALE','UNKNOWN')
        LIMIT 60`
  );

  const rows = Array.from(candidates) as Array<{ id: string; name: string; platform: string; event_url: string }>;

  if (rows.length === 0) {
    console.log("[event-detail] No venue platform events to follow");
    return 0;
  }

  console.log(`[event-detail] Following ticketing links for ${rows.length} venue platform events`);

  const app = new FirecrawlApp({ apiKey });
  let inserted = 0;

  for (const row of rows) {
    const { name, platform, event_url } = row;

    try {
      console.log(`[event-detail] Venue link follow: ${platform} — ${event_url}`);

      const result = await app.scrapeUrl(event_url, {
        formats: ["json"],
        jsonOptions: { prompt: VENUE_TICKET_LINK_PROMPT },
        waitFor: 5000,
        timeout: 45000,
      });

      if (!result.success) {
        console.warn(`[event-detail] Failed scraping ${event_url}`);
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extracted = (result as any).json as { ticketing_url: string | null } | null;
      const ticketingUrl = extracted?.ticketing_url ?? null;

      if (!ticketingUrl) {
        console.log(`[event-detail] No ticketing URL found for "${name}" (${platform})`);
        continue;
      }

      // Identify which platform this URL belongs to
      const match = TICKETING_DOMAINS.find((d) => d.pattern.test(ticketingUrl));
      if (!match) {
        console.log(`[event-detail] Unrecognized ticketing domain in ${ticketingUrl}`);
        continue;
      }

      // Remove Megatix events if any slip through
      if (/megatix/i.test(ticketingUrl)) {
        console.log(`[event-detail] Skipping Megatix link for "${name}"`);
        continue;
      }

      console.log(`[event-detail] Found ${match.platform} link for "${name}": ${ticketingUrl}`);

      // Scrape the ticketing page and ingest as a proper ticketing-platform event
      const { normalizeAndIngest } = await import("@/lib/ingest/normalize");
      const { scrapeUrl: firecrawlScrape } = await import("@/lib/scrapers/firecrawl");
      const rawEvents = await firecrawlScrape(app, match.platform, ticketingUrl, 60000, 5000);

      if (rawEvents.length > 0) {
        const ingestResult = await normalizeAndIngest(rawEvents);
        inserted += ingestResult.inserted;
        console.log(`[event-detail] Ingested ${ingestResult.inserted} events from ${match.platform} via ${ticketingUrl}`);
      } else {
        // Couldn't extract from the ticketing page — at minimum store the ticketingUrl
        // on the existing venue event record so it's queryable
        await db.execute(
          sql`UPDATE events
              SET raw = jsonb_set(COALESCE(raw, '{}'::jsonb), '{ticketingUrl}', ${JSON.stringify(ticketingUrl)}::jsonb)
              WHERE id = ${row.id}`
        );
      }
    } catch (err) {
      console.error(`[event-detail] Failed venue link follow for "${name}":`, err);
    }
  }

  return inserted;
}

// Known Ticketmelon organizer slug → canonical name mapping.
// Slug is the first path segment of a Ticketmelon event URL.
const TICKETMELON_SLUG_TO_NAME: Record<string, string> = {
  crewave: "CREWAVE",
  odrock: "OD Rock",
  aeg: "AEG",
  cloud9: "Cloud 9",
  grandstarconnext: "Grand Star Connext",
  kawaiifriday: "Kawaii Friday",
  "lol-asia": "LOL Asia",
  maiseat: "Mais Eat",
  oneasia: "One Asia",
  very: "Very Live",
  viji: "Viji",
  vjela: "Vjela",
  voxnationlive: "Vox Nation Live",
  retoxsessions: "Retox Sessions",
  sunsetbyneon: "Sunset by NEON",
  verkniptmy: "Verknipt Malaysia",
  daycon: "Daycon",
  cafeshow: "Cafe Show",
};

/** Extract the organizer slug from a Ticketmelon URL (first path segment). */
function extractTicketmelonOrganizerSlug(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("ticketmelon.com")) return null;
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 1) return null;
    const slug = segments[0];
    // Exclude non-organizer system paths
    const SYSTEM_PATHS = new Set(["events", "search", "category", "explore", "user", "help", "blog", "en", "th"]);
    if (SYSTEM_PATHS.has(slug)) return null;
    return slug;
  } catch {
    return null;
  }
}

/** Prettify an organizer slug as a fallback canonical name (e.g. "my-events" → "My Events"). */
function prettifySlug(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Zero-cost pass: for Ticketmelon events that have an eventUrl but no promoter,
 * extract the organizer slug from the URL path and link/create the promoter.
 * Ticketmelon URLs follow: ticketmelon.com/ORGANIZER_SLUG/EVENT_SLUG
 * Returns the number of events linked.
 */
export async function linkTicketmelonPromotersFromUrls(): Promise<number> {
  const candidates = await db.execute(
    sql`SELECT id, name, raw->>'eventUrl' as event_url
        FROM events
        WHERE platform = 'Ticketmelon'
          AND raw->>'eventUrl' IS NOT NULL
          AND promoter_id IS NULL
        LIMIT 500`
  );

  const rows = Array.from(candidates) as Array<{ id: string; name: string; event_url: string }>;
  if (rows.length === 0) {
    console.log("[event-detail] No Ticketmelon events need URL-based promoter linking");
    return 0;
  }

  console.log(`[event-detail] Linking promoters for ${rows.length} Ticketmelon events via URL slugs`);
  let linked = 0;

  for (const row of rows) {
    const slug = extractTicketmelonOrganizerSlug(row.event_url);
    if (!slug) continue;

    const orgPageUrl = `https://www.ticketmelon.com/${slug}`;

    // Find existing promoter by organizer page URL
    let promoter = await db.query.promoters.findFirst({
      where: sql`${promoters.organizerPageUrl} ILIKE ${`%ticketmelon.com/${slug}%`}`,
    });

    if (!promoter) {
      // Also try by canonical name in case it was created without an organizer URL
      const name = TICKETMELON_SLUG_TO_NAME[slug];
      if (name) {
        promoter = await db.query.promoters.findFirst({
          where: sql`lower(${promoters.canonicalName}) = lower(${name})`,
        });
      }
    }

    if (!promoter) {
      const canonicalName = TICKETMELON_SLUG_TO_NAME[slug] ?? prettifySlug(slug);
      const inserted = await db.insert(promoters).values({
        canonicalName,
        platformNames: { Ticketmelon: canonicalName },
        platformsActive: ["Ticketmelon"],
        venuesUsed: [],
        organizerPageUrl: orgPageUrl,
      }).returning({ id: promoters.id });
      const insertedId = inserted[0]?.id;
      if (!insertedId) continue;
      console.log(`[event-detail] Created promoter: ${canonicalName} (${orgPageUrl})`);
      promoter = await db.query.promoters.findFirst({ where: eq(promoters.id, insertedId) });
    }

    if (promoter) {
      await db.update(events).set({ promoterId: promoter.id }).where(eq(events.id, row.id));
      linked++;
    }
  }

  console.log(`[event-detail] Linked ${linked} Ticketmelon events to promoters via URL slugs`);
  return linked;
}

// Bootstrap organizer pages: scraped every run even before promoters are discovered
// via enrichment. Add known organizer slugs here as you discover them.
// Format: https://www.ticketmelon.com/{organizer-slug}
// These are only used until the promoter's organizerPageUrl is stored in the DB.
const SEED_TICKETMELON_ORGANIZERS: string[] = [
  "https://www.ticketmelon.com/crewave",       // CREWAVE
  "https://www.ticketmelon.com/odrock",        // OD Rock
  "https://www.ticketmelon.com/aeg",           // AEG
  "https://www.ticketmelon.com/cloud9",        // Cloud 9
  "https://www.ticketmelon.com/grandstarconnext", // Grand Star Connect
  "https://www.ticketmelon.com/kawaiifriday",  // Kawaii Friday
  "https://www.ticketmelon.com/lol-asia",      // LOL Asia
  "https://www.ticketmelon.com/maiseat",       // Mais Eat
  "https://www.ticketmelon.com/oneasia",       // One Asia
  "https://www.ticketmelon.com/very",          // Very Live
  "https://www.ticketmelon.com/viji",          // Viji
  "https://www.ticketmelon.com/vjela",         // Vjela
  "https://www.ticketmelon.com/voxnationlive", // Vox Nation
];

/**
 * Third-pass discovery: visit each Ticketmelon promoter's organizer page and
 * ingest any new events listed there that weren't found on the main listing.
 * Also scrapes a hardcoded bootstrap list of known organizer pages.
 * Returns the number of new events inserted.
 */
export async function enrichFromPromoterPages(): Promise<number> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.warn("[event-detail] FIRECRAWL_API_KEY not set — skipping promoter page enrichment");
    return 0;
  }

  // Find promoters that have a Ticketmelon organizer page URL
  const promoWithPages = await db.query.promoters.findMany({
    where: and(
      isNotNull(promoters.organizerPageUrl),
      sql`${promoters.organizerPageUrl} ILIKE '%ticketmelon.com%'`,
    ),
  });

  // Build the full list: DB promoter pages + seed URLs not already in DB
  const dbUrls = new Set(promoWithPages.map((p) => p.organizerPageUrl!.toLowerCase().replace(/\/$/, "")));
  const seedsToAdd = SEED_TICKETMELON_ORGANIZERS.filter(
    (url) => !dbUrls.has(url.toLowerCase().replace(/\/$/, ""))
  );

  // Combine: DB promoters (with canonical name) + seeds (no canonical name yet)
  const pagesToScrape: Array<{ url: string; canonicalName: string | null }> = [
    ...promoWithPages.map((p) => ({ url: p.organizerPageUrl!, canonicalName: p.canonicalName })),
    ...seedsToAdd.map((url) => ({ url, canonicalName: null })),
  ];

  if (pagesToScrape.length === 0) {
    console.log("[event-detail] No promoter pages to scrape");
    return 0;
  }

  console.log(`[event-detail] Scraping ${pagesToScrape.length} promoter pages (${promoWithPages.length} from DB, ${seedsToAdd.length} seeds)`);

  const app = new FirecrawlApp({ apiKey });
  const { normalizeAndIngest } = await import("@/lib/ingest/normalize");
  let totalInserted = 0;

  for (const { url, canonicalName } of pagesToScrape) {
    try {
      console.log(`[event-detail] Promoter page: ${canonicalName ?? "(seed)"} — ${url}`);
      // Scrape as a Ticketmelon listing page — same extraction prompt, same link patterns
      const rawEvents = await scrapeUrl(app, "Ticketmelon", url, 60000, 5000);
      if (rawEvents.length === 0) continue;

      // Inject known promoter name so normalization doesn't have to guess
      const withPromoter = canonicalName
        ? rawEvents.map((e) => ({ ...e, promoterRaw: e.promoterRaw ?? canonicalName }))
        : rawEvents;

      const result = await normalizeAndIngest(withPromoter);
      totalInserted += result.inserted;
      console.log(`[event-detail] ${canonicalName ?? url}: ${result.inserted} new, ${result.updated} updated`);
    } catch (err) {
      console.error(`[event-detail] Failed scraping promoter page ${url}:`, err);
    }
  }

  return totalInserted;
}
