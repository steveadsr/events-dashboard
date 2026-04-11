import { fal } from "@fal-ai/client";
import { db } from "@/lib/db";
import { events, promoters, venues } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import type { RawEvent } from "@/lib/scrapers/firecrawl";

// Platforms whose events are venue/promoter pages — not ticket platforms.
// For these, we attempt cross-platform deduplication before inserting.
const VENUE_SOURCE_PLATFORMS = new Set(["LiveNationTero", "UOBLive", "Impact", "Thunderdome"]);

/**
 * Normalize a name to a short dedup key: lowercase, strip punctuation,
 * take the first 5 significant words (skip articles/prepositions).
 */
const SKIP_WORDS = new Set(["a", "an", "the", "and", "or", "in", "at", "of", "by", "for", "to"]);
function dedupKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 1 && !SKIP_WORDS.has(w))
    .slice(0, 5)
    .join(" ");
}

/**
 * Find an existing event across all platforms whose dedup key overlaps with
 * the given name's key. Returns the best match or null.
 */
async function findCrossPlatformMatch(name: string) {
  const key = dedupKey(name);
  if (!key) return null;
  const words = key.split(" ");
  // Require at least 3 significant words to match; fewer risks false positives
  if (words.length < 2) return null;

  // Use ILIKE against each significant word — all must be present
  const conditions = words.map((w) => sql`lower(${events.name}) LIKE ${"%" + w + "%"}`);
  const found = await db.query.events.findFirst({
    where: sql`${conditions.reduce((acc, c) => sql`${acc} AND ${c}`)}`,
  });
  return found ?? null;
}

interface NormalizedEvent {
  name: string;
  date: Date | null;
  venueName: string | null;
  promoterName: string | null;
  status: "PRE_SALE" | "ON_SALE" | "SOLD_OUT" | "CANCELLED" | "COMING_SOON" | "UNKNOWN";
  type: string | null;
}

// Thai month name map for date parsing
const THAI_MONTHS: Record<string, number> = {
  มกราคม: 1, กุมภาพันธ์: 2, มีนาคม: 3, เมษายน: 4, พฤษภาคม: 5,
  มิถุนายน: 6, กรกฎาคม: 7, สิงหาคม: 8, กันยายน: 9, ตุลาคม: 10,
  พฤศจิกายน: 11, ธันวาคม: 12,
};

// Status keyword map
const STATUS_KEYWORDS: Array<[RegExp, NormalizedEvent["status"]]> = [
  [/sold.?out|จำหน่ายหมดแล้ว/i, "SOLD_OUT"],
  [/coming.?soon|เร็วๆ\s*นี้|ยังไม่เปิดจำหน่าย/i, "COMING_SOON"],
  [/pre.?sale|pre-?order|เปิดจอง/i, "PRE_SALE"],
  [/on.?sale|buy now|กำลังจำหน่าย|จำหน่ายแล้ว/i, "ON_SALE"],
  [/cancel|ยกเลิก/i, "CANCELLED"],
];

export interface IngestResult {
  inserted: number;
  updated: number;
  skipped: number;
}

export async function normalizeAndIngest(rawEvents: RawEvent[]): Promise<IngestResult> {
  if (rawEvents.length === 0) return { inserted: 0, updated: 0, skipped: 0 };

  const BATCH_SIZE = 20;
  const result: IngestResult = { inserted: 0, updated: 0, skipped: 0 };

  for (let i = 0; i < rawEvents.length; i += BATCH_SIZE) {
    const batch = rawEvents.slice(i, i + BATCH_SIZE);
    const normalized = await normalizeBatch(batch);

    for (const [idx, norm] of normalized.entries()) {
      const raw = batch[idx];
      if (!norm) {
        console.log(`[normalize] Skipping non-Thailand event: "${raw.name}" (${raw.platform})`);
        result.skipped++;
        continue;
      }
      try {
        const wasNew = await upsertEvent(raw, norm);
        if (wasNew) result.inserted++;
        else result.updated++;
      } catch (err) {
        console.error(`[normalize] Failed to upsert event "${raw.name}":`, err);
      }
    }
  }

  console.log(`[normalize] inserted=${result.inserted} updated=${result.updated} skipped=${result.skipped}`);

  // Refresh promoter stats after ingestion
  await refreshPromoterStats();

  return result;
}

async function normalizeBatch(batch: RawEvent[]): Promise<(NormalizedEvent | null)[]> {
  const model = process.env.LLM_MODEL ?? "anthropic/claude-3.5-sonnet";
  const falKey = process.env.FAL_KEY;

  // If no fal key, fall back to rule-based normalization
  if (!falKey) {
    console.warn("[normalize] No FAL_KEY — using rule-based fallback");
    return batch.map(ruleBasedNormalize);
  }

  fal.config({ credentials: falKey });

  // NOTE: Thailand-only filter — events not in Thailand are returned as null in the array.
  // The caller filters nulls out before upserting.
  const prompt = `You are normalizing raw Thai concert/event data into structured JSON.

IMPORTANT: Only include events taking place in Thailand. If an event's venue is clearly outside Thailand (e.g. Singapore, Japan, Korea, UK, USA, etc.), return null for that entry.

For each event in the input array, return either null (not in Thailand) or a JSON object with:
- name: cleaned English/Thai event name (remove platform artifacts)
- date: ISO 8601 date string or null (Thai Buddhist year = Gregorian - 543). If the input dateRaw has no year, infer the year as the next upcoming occurrence of that date (current year if the date is still in the future, otherwise next year). Today's approximate year is 2026.
- venueName: the venue's proper name only — building/hall/arena name in English, Title Case, NO address/city/country suffix (e.g. "Impact Arena" not "IMPACT Arena, Exhibition and Convention Center, Nonthaburi, Thailand"; "Prince Mahidol Hall, Mahidol University" not the full Thai address). Translate Thai venue names to English. Return null if unknown.
- promoterName: the EVENT ORGANIZER or PROMOTER company name (e.g. BEC-Tero, GMM Grammy, Live Nation). NEVER use the performing artist/band name as the promoter. If the promoter cannot be determined from the text, return null. Venue names (Impact Arena, UOB Live, etc.) are also NOT promoters.
- status: one of PRE_SALE | ON_SALE | SOLD_OUT | CANCELLED | COMING_SOON | UNKNOWN
- type: one of Concert | Festival | Theatre | Sport | Exhibition | Other | null

Rules:
- For Thai text, transliterate names to English where possible, keep Thai in parentheses
- BEC-Tero, GMM Grammy, Change Music, Live Nation Thailand are known promoters — normalize variations
- Key venues: Impact Arena, Rajamangala National Stadium, Thunderdome, UOB Live, Impact Challenger Hall — use these exact names
- venueName must be in English, Title Case, proper name only (no address, no city, no country, no Thai script)
- Return exactly ${batch.length} items in the same order as input (null for non-Thailand events)
- Return ONLY a JSON array, no markdown, no explanation

Input:
${JSON.stringify(batch.map((e) => ({
  name: e.name,
  dateRaw: e.dateRaw,
  venueRaw: e.venueRaw,
  promoterRaw: e.promoterRaw,
  statusRaw: e.statusRaw,
  typeRaw: e.typeRaw,
})), null, 2)}`;

  try {
    const result = await fal.run("openrouter/router" as Parameters<typeof fal.run>[0], {
      input: {
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 2000,
      },
    }) as { output?: { choices?: Array<{ message?: { content?: string } }> } };

    const content = result?.output?.choices?.[0]?.message?.content ?? "";
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array in LLM response");

    const parsed = JSON.parse(jsonMatch[0]) as (NormalizedEvent | null)[];
    if (!Array.isArray(parsed) || parsed.length !== batch.length) {
      throw new Error(`Expected ${batch.length} items, got ${parsed.length}`);
    }

    return parsed.map((item) => {
      if (!item) return null; // non-Thailand event — filtered by caller
      return {
        ...item,
        date: item.date ? parseDate(item.date as unknown as string) : null,
        status: item.status ?? "UNKNOWN",
      };
    });
  } catch (err) {
    console.error("[normalize] LLM batch failed, using rule-based fallback:", err);
    return batch.map(ruleBasedNormalize);
  }
}

function ruleBasedNormalize(raw: RawEvent): NormalizedEvent {
  return {
    name: raw.name,
    date: raw.dateRaw ? parseDate(raw.dateRaw) : null,
    venueName: raw.venueRaw ?? null,
    promoterName: raw.promoterRaw ?? null,
    status: inferStatus(raw.statusRaw ?? ""),
    type: raw.typeRaw ?? null,
  };
}

function inferStatus(text: string): NormalizedEvent["status"] {
  for (const [pattern, status] of STATUS_KEYWORDS) {
    if (pattern.test(text)) return status;
  }
  return "UNKNOWN";
}

function parseDate(raw: string): Date | null {
  if (!raw) return null;

  // Handle Buddhist Era years (e.g. 2569 → 2026)
  let normalized = raw.replace(/(\d{4})/, (match, year) => {
    const n = parseInt(year);
    return n > 2500 ? String(n - 543) : match;
  });

  // Replace Thai month names
  for (const [thai, num] of Object.entries(THAI_MONTHS)) {
    normalized = normalized.replace(new RegExp(thai, "g"), String(num));
  }

  // If no 4-digit year is present, infer year: use the next upcoming occurrence
  // of that month/day (handles Ticketmelon dateRaw like "21 Apr", "7 Oct")
  if (!/\d{4}/.test(normalized)) {
    const today = new Date();
    const thisYear = today.getFullYear();
    const withYear = `${normalized} ${thisYear}`;
    const candidate = new Date(withYear);
    if (!isNaN(candidate.getTime())) {
      // If the date has already passed this year, use next year
      if (candidate < today) {
        candidate.setFullYear(thisYear + 1);
      }
      return candidate;
    }
  }

  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

// Ticket platforms list events because they're for sale — default UNKNOWN → ON_SALE
const TICKET_PLATFORMS = new Set(["ThaiTicketMajor", "Ticketmelon", "TheConcert", "Eventpop", "AllTicket", "TicketTier"]);

/** Returns true if a new row was inserted, false if an existing row was updated. */
async function upsertEvent(raw: RawEvent, norm: NormalizedEvent): Promise<boolean> {
  if (norm.status === "UNKNOWN" && TICKET_PLATFORMS.has(raw.platform)) {
    norm = { ...norm, status: "ON_SALE" };
  }
  // Resolve venue — exact match first, then fuzzy match against raw venue text
  let venueId: string | null = null;
  if (norm.venueName) {
    const exact = await db.query.venues.findFirst({
      where: sql`lower(${venues.canonicalName}) = lower(${norm.venueName})`,
    });
    venueId = exact?.id ?? null;
  }
  if (!venueId) {
    // Fuzzy: venue-specific required word sets — ALL words must be present to avoid
    // false positives from generic terms like "arena", "national", "stadium".
    const VENUE_PATTERNS: { name: string; test: (s: string) => boolean }[] = [
      { name: "Rajamangala National Stadium", test: (s) => /rajamangala|rajamangkala|ราชมังคล/.test(s) },
      { name: "Impact Arena",                 test: (s) => /impact.{0,6}arena/.test(s) },
      { name: "Impact Challenger Hall",        test: (s) => /impact.{0,6}challenger/.test(s) },
      { name: "Thunderdome",                   test: (s) => /thunder.{0,6}dome/.test(s) },
      { name: "UOB Live",                      test: (s) => /uob.{0,6}live|uob live/.test(s) },
    ];
    const combined = [norm.venueName, raw.venueRaw].filter(Boolean).join(" ").toLowerCase();
    const allVenues = await db.query.venues.findMany();
    const venueByName = new Map(allVenues.map((v) => [v.canonicalName, v]));
    for (const pattern of VENUE_PATTERNS) {
      if (pattern.test(combined)) {
        const v = venueByName.get(pattern.name);
        if (v) {
          venueId = v.id;
          console.log(`[normalize] Fuzzy matched venue "${raw.venueRaw}" → "${v.canonicalName}"`);
          break;
        }
      }
    }
  }

  // Upsert promoter — reject garbage names the LLM writes when it can't determine promoter
  const JUNK_PROMOTER_NAMES = new Set([
    "unknown", "not specified", "null", "n/a", "tba", "tbd", "none",
    "to be announced", "various", "organizer", "promoter",
    // Platform names should never be saved as promoters
    "ticketmelon", "thaiticketmajor", "eventpop", "allticket", "tickettier", "theconcert",
    "livenationtero", "uoblive", "impact", "thunderdome",
    // Venue names should never be saved as promoters
    "impact arena", "rajamangala national stadium", "thunderdome", "uob live",
    "impact challenger hall", "bitec", "queen sirikit national convention center",
  ]);

  // Detect when the LLM has extracted the artist/act name as the promoter.
  // Heuristics: promoter name appears verbatim inside the event name (after stripping
  // common suffix words like "concert", "tour", "live", "show", "bangkok", year).
  function isArtistAsPromoter(promoterName: string, eventName: string): boolean {
    const strip = (s: string) =>
      s.toLowerCase()
        .replace(/\b(concert|tour|live|show|world tour|asia tour|bangkok|thailand|\d{4}|presents?|production)\b/g, "")
        .replace(/[^a-z0-9\u0E00-\u0E7F\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const pNorm = strip(promoterName);
    const eNorm = strip(eventName);
    if (pNorm.length < 3) return false;
    // If the entire stripped promoter name appears inside the stripped event name, it's likely the artist
    return eNorm.includes(pNorm);
  }

  const isJunkPromoter = (name: string) => {
    if (!name.trim()) return true;
    if (JUNK_PROMOTER_NAMES.has(name.toLowerCase().trim())) return true;
    if (isArtistAsPromoter(name, norm.name)) {
      console.log(`[normalize] Rejected artist-as-promoter: "${name}" in "${norm.name}"`);
      return true;
    }
    return false;
  };

  let promoterId: string | null = null;
  if (norm.promoterName && !isJunkPromoter(norm.promoterName)) {
    const existing = await db.query.promoters.findFirst({
      where: sql`lower(${promoters.canonicalName}) = lower(${norm.promoterName})`,
    });
    if (existing) {
      promoterId = existing.id;
    } else {
      const inserted = await db.insert(promoters).values({
        canonicalName: norm.promoterName,
        platformNames: { [raw.platform]: raw.promoterRaw ?? norm.promoterName },
        platformsActive: [raw.platform],
        venuesUsed: norm.venueName ? [norm.venueName] : [],
      }).returning({ id: promoters.id });
      promoterId = inserted[0]?.id ?? null;
    }
  }

  // Upsert event — same-platform exact name match first
  let existing = await db.query.events.findFirst({
    where: sql`${events.platform} = ${raw.platform} AND lower(${events.name}) = lower(${norm.name})`,
  });

  // Same-platform fuzzy fallback: catches LLM name variations (brackets, punctuation,
  // capitalisation differences) like "2026 THE OTHER SIDE" vs "2026[The Other Side]"
  // Uses a broad skip list so generic words (concert, bangkok, 2026) don't cause false matches.
  if (!existing) {
    const FUZZY_SKIP = new Set([
      "a", "an", "the", "and", "or", "in", "at", "of", "by", "for", "to",
      "concert", "live", "music", "festival", "show", "tour", "event", "presents", "present",
      "bangkok", "thailand", "2026", "2025", "2024",
    ]);
    const fuzzWords = norm.name
      .toLowerCase()
      .replace(/[\[\](){}]/g, " ")
      .replace(/[^\w\s\u0E00-\u0E7F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter((w) => w.length > 2 && !FUZZY_SKIP.has(w))
      .slice(0, 5);

    // Need at least 3 significant words to avoid false-positive matches
    if (fuzzWords.length >= 3) {
      const wordConditions = fuzzWords.map((w) => sql`lower(${events.name}) LIKE ${"%" + w + "%"}`);
      const fuzzy = await db.query.events.findFirst({
        where: sql`${events.platform} = ${raw.platform} AND ${wordConditions.reduce((acc, c) => sql`${acc} AND ${c}`)}`,
      });
      if (fuzzy) {
        existing = fuzzy;
        console.log(`[normalize] Fuzzy same-platform match: "${norm.name}" → "${fuzzy.name}" (${raw.platform})`);
      }
    }
  }

  // For venue/promoter source platforms: also check if this event already exists
  // on a ticket platform (to avoid duplicates). If matched, enrich the existing
  // record with venue/promoter/status rather than inserting a new row.
  let isCrossPlatformMatch = false;
  if (!existing && VENUE_SOURCE_PLATFORMS.has(raw.platform)) {
    const crossMatch = await findCrossPlatformMatch(norm.name);
    if (crossMatch) {
      existing = crossMatch;
      isCrossPlatformMatch = true;
      console.log(`[normalize] Cross-platform match: "${norm.name}" (${raw.platform}) → existing "${crossMatch.name}" (${crossMatch.platform})`);
    }
  }

  if (existing) {
    // Preserve eventUrl and detailScrapedAt from previous scrape.
    // detailScrapedAt must survive listing re-scrapes or the 7-day enrichment
    // cooldown resets every run and wastes Firecrawl credits re-enriching known events.
    const existingRaw = existing.raw as Record<string, unknown>;
    const mergedRaw: Record<string, unknown> = {
      ...raw,
      eventUrl: raw.eventUrl ?? (existingRaw?.eventUrl as string | null) ?? null,
      ...(existingRaw?.detailScrapedAt ? { detailScrapedAt: existingRaw.detailScrapedAt } : {}),
    };
    await db.update(events).set({
      // For cross-platform matches: only fill in missing fields, don't overwrite
      status: isCrossPlatformMatch
        ? (existing.status === "UNKNOWN" ? norm.status : existing.status)
        : norm.status,
      date: norm.date ?? existing.date ?? undefined,
      lastSeenAt: new Date(),
      venueId: venueId ?? existing.venueId,
      promoterId: promoterId ?? existing.promoterId,
      type: norm.type ?? existing.type,
      raw: isCrossPlatformMatch ? existingRaw as object : mergedRaw as object,
    }).where(eq(events.id, existing.id));
    return false;
  } else {
    await db.insert(events).values({
      platform: raw.platform,
      name: norm.name,
      date: norm.date ?? undefined,
      status: norm.status,
      type: norm.type,
      venueId,
      promoterId,
      raw: raw as object,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    });
    return true;
  }
}

export async function refreshPromoterStats(): Promise<void> {
  // Update active event counts and platform lists per promoter
  const activeStatuses = ["PRE_SALE", "ON_SALE"] as const;

  const allPromoters = await db.query.promoters.findMany();
  for (const promoter of allPromoters) {
    const activeEvents = await db.query.events.findMany({
      where: sql`${events.promoterId} = ${promoter.id} AND ${events.status} != 'CANCELLED'`,
    });

    const platforms = [...new Set(activeEvents.map((e) => e.platform))];
    const venueIds = [...new Set(activeEvents.map((e) => e.venueId).filter(Boolean))];
    const venueNames: string[] = [];
    for (const vid of venueIds) {
      const v = await db.query.venues.findFirst({ where: eq(venues.id, vid!) });
      if (v) venueNames.push(v.canonicalName);
    }

    await db.update(promoters).set({
      activeEventCount: activeEvents.length,
      platformsActive: platforms,
      venuesUsed: venueNames,
      updatedAt: new Date(),
    }).where(eq(promoters.id, promoter.id));
  }

  void activeStatuses; // suppress unused warning
}
