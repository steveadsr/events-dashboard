import { db } from "./index";
import { events, promoters, venues, dailyBriefs, scrapeRuns } from "./schema";
import { desc, gte, lt, sql, eq, and } from "drizzle-orm";
import type { TicketTier } from "@/lib/types";
import type { SQL } from "drizzle-orm";
import { KEY_VENUE_PATTERNS } from "@/lib/utils";

function jsIsKeyVenue(sqlResult: boolean | null, venueRaw: string | null): boolean {
  if (sqlResult) return true;
  if (!venueRaw) return false;
  return KEY_VENUE_PATTERNS.some((r) => r.test(venueRaw));
}

// Computed as functions to stay fresh — module-level Date constants go stale on long-running servers
const TWENTY_FOUR_HOURS = () => new Date(Date.now() - 24 * 60 * 60 * 1000);
const SEVEN_DAYS = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

// Shared select shape for event lists
const EVENT_SELECT = (e = events, p = promoters, v = venues) => ({
  id: e.id,
  name: e.name,
  platform: e.platform,
  status: e.status,
  type: e.type,
  date: e.date,
  firstSeenAt: e.firstSeenAt,
  promoterId: e.promoterId,
  promoterName: p.canonicalName,
  venueId: e.venueId,
  venueName: v.canonicalName,
  venueRaw: sql<string | null>`(${e.raw}->>'venueRaw')`,
  eventUrl: sql<string | null>`(${e.raw}->>'eventUrl')`,
  isKeyVenue: sql<boolean>`(
    COALESCE(${v.isKeyVenue}, false) OR
    lower(COALESCE(${e.raw}->>'venueRaw', '')) ~*
      'rajamangala|rajamangkala|impact.{0,6}arena|thunder.{0,6}dome|uob.{0,6}live|impact.{0,6}challenger|ราชมังคล|ธันเดอร์โดม'
  )`,
});

export async function getDashboardData() {
  const [latestBrief, newEvents, radarEvents, bigEvents, promotersSummary, venueSummary, lastScrape] =
    await Promise.all([
      // Latest daily brief
      db.query.dailyBriefs.findFirst({
        orderBy: [desc(dailyBriefs.generatedAt)],
      }),

      // New events in last 24h — for the "New" badges on the dashboard header (limit 50)
      db
        .select(EVENT_SELECT())
        .from(events)
        .leftJoin(promoters, eq(events.promoterId, promoters.id))
        .leftJoin(venues, eq(events.venueId, venues.id))
        .where(and(gte(events.firstSeenAt, TWENTY_FOUR_HOURS()), THAILAND_ONLY_FILTER, FAN_EVENT_FILTER, FUTURE_DATES_FILTER))
        .orderBy(desc(events.firstSeenAt))
        .limit(50),

      // Market Radar events — last 7 days so events don't vanish after 24h (limit 200)
      db
        .select(EVENT_SELECT())
        .from(events)
        .leftJoin(promoters, eq(events.promoterId, promoters.id))
        .leftJoin(venues, eq(events.venueId, venues.id))
        .where(and(gte(events.firstSeenAt, SEVEN_DAYS()), THAILAND_ONLY_FILTER, FAN_EVENT_FILTER, FUTURE_DATES_FILTER))
        .orderBy(desc(events.firstSeenAt))
        .limit(200),

      // Big events: key venue OR concert/festival type OR capacity > 1000 (limit 20)
      db
        .select({ ...EVENT_SELECT(), capacity: events.capacity })
        .from(events)
        .leftJoin(promoters, eq(events.promoterId, promoters.id))
        .leftJoin(venues, eq(events.venueId, venues.id))
        .where(
          and(
            THAILAND_ONLY_FILTER,
            FAN_EVENT_FILTER,
            FUTURE_DATES_FILTER,
            sql`(${venues.isKeyVenue} = true OR ${events.type} ILIKE '%concert%' OR ${events.type} ILIKE '%festival%' OR ${events.capacity} > 1000) AND ${events.status} != 'CANCELLED' AND (${events.type} IS NULL OR (${events.type} NOT ILIKE '%workshop%' AND ${events.type} NOT ILIKE '%exhibition%'))`
          )
        )
        .orderBy(desc(events.firstSeenAt))
        .limit(20),

      // Promoters summary (limit 20)
      db
        .select({
          id: promoters.id,
          canonicalName: promoters.canonicalName,
          activeEventCount: promoters.activeEventCount,
          platformsActive: promoters.platformsActive,
          venuesUsed: promoters.venuesUsed,
        })
        .from(promoters)
        .where(sql`${promoters.activeEventCount} > 0`)
        .orderBy(desc(promoters.activeEventCount))
        .limit(20),

      // Venue summary (limit 10)
      db
        .select({
          id: venues.id,
          canonicalName: venues.canonicalName,
          isKeyVenue: venues.isKeyVenue,
          capacity: venues.capacity,
          eventCount: sql<number>`count(${events.id})::int`,
        })
        .from(venues)
        .leftJoin(events, eq(events.venueId, venues.id))
        .groupBy(venues.id)
        .orderBy(desc(sql`count(${events.id})`))
        .limit(10),

      // Last scrape run
      db.query.scrapeRuns.findFirst({
        orderBy: [desc(scrapeRuns.startedAt)],
      }),
    ]);

  const toISO = (d: Date | null | undefined) => d?.toISOString() ?? null;

  const mapEvent = (e: typeof newEvents[number], forceNew?: boolean) => ({
    ...e,
    date: toISO(e.date),
    firstSeenAt: toISO(e.firstSeenAt) ?? new Date().toISOString(),
    isNew24h: forceNew ?? (e.firstSeenAt ? e.firstSeenAt >= TWENTY_FOUR_HOURS() : false),
    isInternational: detectInternational(e.name, e.venueName, e.venueRaw),
    isKeyVenue: jsIsKeyVenue(e.isKeyVenue, e.venueRaw ?? null),
    venueRaw: e.venueRaw ?? null,
    eventUrl: e.eventUrl ?? null,
  });

  return {
    dailyBrief: latestBrief?.bullets ?? [],
    briefGeneratedAt: toISO(latestBrief?.generatedAt),
    newEvents: newEvents.map((e) => mapEvent(e, true)),
    radarEvents: radarEvents.map((e) => mapEvent(e)),
    promotersSummary: promotersSummary.map((p) => ({
      ...p,
      platformsActive: p.platformsActive ?? [],
      venuesUsed: p.venuesUsed ?? [],
    })),
    venueSummary,
    bigEvents: bigEvents.map((e) => ({
      ...e,
      date: toISO(e.date),
      firstSeenAt: toISO(e.firstSeenAt) ?? new Date().toISOString(),
      isNew24h: e.firstSeenAt ? e.firstSeenAt >= TWENTY_FOUR_HOURS() : false,
      isInternational: detectInternational(e.name, e.venueName, e.venueRaw),
      isKeyVenue: jsIsKeyVenue(e.isKeyVenue, e.venueRaw ?? null),
      venueRaw: e.venueRaw ?? null,
      eventUrl: e.eventUrl ?? null,
      promoterId: e.promoterId ?? null,
      venueId: e.venueId ?? null,
    })),
    lastScrape: lastScrape
      ? {
          completedAt: toISO(lastScrape.completedAt),
          eventsFound: lastScrape.eventsFound,
          status: lastScrape.status,
        }
      : null,
  };
}

export async function getRunningJob() {
  return db.query.scrapeRuns.findFirst({
    where: sql`${scrapeRuns.status} IN ('queued', 'running')`,
    orderBy: [desc(scrapeRuns.startedAt)],
  });
}

export async function getScrapeRun(jobId: string) {
  return db.query.scrapeRuns.findFirst({
    where: eq(scrapeRuns.jobId, jobId as string),
  });
}

// International detection: event name or venue name contains non-Thai country/city indicators
function detectInternational(name: string, venueName?: string | null, venueRaw?: string | null): boolean {
  const NON_TH = /\b(malaysia|kuala lumpur|\bkl\b|singapore|indonesia|jakarta|manila|philippines|vietnam|korea|japan|taiwan|hong kong|china|india|australia)\b/i;
  if (NON_TH.test(name)) return true;
  if (venueName && NON_TH.test(venueName)) return true;
  if (venueRaw && NON_TH.test(venueRaw)) return true;
  return false;
}

// SQL condition that excludes clearly non-Thailand events based on name + venue keywords
const THAILAND_ONLY_FILTER = sql<boolean>`NOT (
  lower(COALESCE(${events.raw}->>'venueRaw', '')) ~*
    'malaysia|kuala lumpur|\\mkl\\M|singapore|indonesia|jakarta|manila|philippines|vietnam|korea|japan|taiwan|hong kong'
  OR lower(${events.name}) ~*
    'malaysia|kuala lumpur|singapore|indonesia|jakarta|philippines|vietnam'
)`;

// Exclude fan meetings, fan parties, health events, and similar non-commercial events.
// Type field is matched broadly (substring) — "Fan Party", "Fan Meeting", "Health • Experience" all caught.
const FAN_EVENT_FILTER = sql<boolean>`NOT (
  lower(${events.name}) ~*
    'fan meet|fanmeet|fan party|fanparty|fan fest|fan sign|fansign|fan con|fancon|fan engagement|fan call|fancall|fan cafe|meet (and|&) greet|hi([-\s])?touch|high touch|fan talk|fan event|fan day|fan showcase'
  OR lower(${events.name}) ~*
    'health (fair|expo|talk|seminar|forum|summit|check|screening)|wellness (fair|expo|seminar)|medical (fair|expo|seminar)|hospital (fair|event)|health (and|&) wellness|\blife expo\b'
  OR lower(COALESCE(${events.type}, '')) ~*
    '\bfan\b|health|wellness|medical|seminar|conference|forum|summit|trade fair|exhibition|expo|fan meet|fan party|fan meeting|fan engagement'
)`;

// Only show events with a future date, or no date at all (unknown date = still relevant)
const FUTURE_DATES_FILTER = sql<boolean>`(${events.date} IS NULL OR ${events.date} >= CURRENT_DATE)`;

export async function getEventsPage(
  cursor?: string,
  platform?: string,
  status?: string,
  keyVenue?: boolean,
  limit = 25
) {
  const KEY_VENUE_SQL = sql<boolean>`(
    COALESCE(${venues.isKeyVenue}, false) OR
    lower(COALESCE(${events.raw}->>'venueRaw', '')) ~*
      'rajamangala|rajamangkala|impact.{0,6}arena|thunder.{0,6}dome|uob.{0,6}live|impact.{0,6}challenger|ราชมังคล|ธันเดอร์โดม'
  )`;

  const conditions: SQL[] = [THAILAND_ONLY_FILTER, FAN_EVENT_FILTER, FUTURE_DATES_FILTER];
  if (cursor) conditions.push(lt(events.firstSeenAt, new Date(cursor)));
  if (platform && platform !== "All") conditions.push(eq(events.platform, platform));
  if (status && status !== "All") conditions.push(sql`${events.status} = ${status}`);
  if (keyVenue) conditions.push(KEY_VENUE_SQL);

  const rows = await db
    .select({
      id: events.id,
      name: events.name,
      platform: events.platform,
      status: events.status,
      type: events.type,
      date: events.date,
      firstSeenAt: events.firstSeenAt,
      promoterName: promoters.canonicalName,
      venueName: venues.canonicalName,
      venueRaw: sql<string | null>`(${events.raw}->>'venueRaw')`,
      eventUrl: sql<string | null>`(${events.raw}->>'eventUrl')`,
      isKeyVenue: sql<boolean>`(
        COALESCE(${venues.isKeyVenue}, false) OR
        lower(COALESCE(${events.raw}->>'venueRaw', '')) ~*
          'rajamangala|rajamangkala|impact.{0,6}arena|thunder.{0,6}dome|uob.{0,6}live|impact.{0,6}challenger|ราชมังคล|ธันเดอร์โดม'
      )`,
    })
    .from(events)
    .leftJoin(promoters, eq(events.promoterId, promoters.id))
    .leftJoin(venues, eq(events.venueId, venues.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(events.firstSeenAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);
  const toISO = (d: Date | null | undefined) => d?.toISOString() ?? null;

  return {
    events: data.map((e) => ({
      ...e,
      date: toISO(e.date),
      firstSeenAt: toISO(e.firstSeenAt) ?? new Date().toISOString(),
      isNew24h: e.firstSeenAt ? Date.now() - e.firstSeenAt.getTime() < 86400000 : false,
      isInternational: detectInternational(e.name, e.venueName, e.venueRaw),
      isKeyVenue: jsIsKeyVenue(e.isKeyVenue, e.venueRaw ?? null),
      venueRaw: e.venueRaw ?? null,
      eventUrl: e.eventUrl ?? null,
    })),
    nextCursor: hasMore ? data[data.length - 1].firstSeenAt?.toISOString() ?? null : null,
    hasMore,
  };
}

export async function getCalendarEvents(year: number, month: number) {
  // month is 1-based (1=Jan, 12=Dec)
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1); // exclusive

  // Fetch events and all key venues in parallel
  const [rows, allKeyVenues] = await Promise.all([
    db
      .select({
        id: events.id,
        name: events.name,
        platform: events.platform,
        status: events.status,
        type: events.type,
        date: events.date,
        promoterId: events.promoterId,
        promoterName: promoters.canonicalName,
        venueId: events.venueId,
        venueName: venues.canonicalName,
        venueRaw: sql<string | null>`(${events.raw}->>'venueRaw')`,
        eventUrl: sql<string | null>`(${events.raw}->>'eventUrl')`,
        isKeyVenue: sql<boolean>`(
          COALESCE(${venues.isKeyVenue}, false) OR
          lower(COALESCE(${events.raw}->>'venueRaw', '')) ~*
            'rajamangala|rajamangkala|impact.{0,6}arena|thunder.{0,6}dome|uob.{0,6}live|impact.{0,6}challenger|ราชมังคล|ธันเดอร์โดม'
        )`,
      })
      .from(events)
      .leftJoin(promoters, eq(events.promoterId, promoters.id))
      .leftJoin(venues, eq(events.venueId, venues.id))
      .where(and(
        THAILAND_ONLY_FILTER,
        FAN_EVENT_FILTER,
        gte(events.date, start),
        lt(events.date, end),
      ))
      .orderBy(events.date, events.name),

    // All key venues for the filter dropdown — independent of the current month
    db
      .select({ id: venues.id, canonicalName: venues.canonicalName })
      .from(venues)
      .where(eq(venues.isKeyVenue, true))
      .orderBy(venues.canonicalName),
  ]);

  const toISO = (d: Date | null | undefined) => d?.toISOString() ?? null;
  return {
    events: rows.map((e) => ({
      ...e,
      date: toISO(e.date),
      venueName: e.venueName ?? null,
      venueRaw: e.venueRaw ?? null,
      promoterName: e.promoterName ?? null,
      promoterId: e.promoterId ?? null,
      venueId: e.venueId ?? null,
      eventUrl: e.eventUrl ?? null,
      isKeyVenue: jsIsKeyVenue(e.isKeyVenue, e.venueRaw ?? null),
    })),
    keyVenues: allKeyVenues.map((v) => v.canonicalName),
  };
}

export async function getEventById(id: string) {
  const rows = await db
    .select({
      id: events.id,
      name: events.name,
      platform: events.platform,
      status: events.status,
      type: events.type,
      date: events.date,
      firstSeenAt: events.firstSeenAt,
      lastSeenAt: events.lastSeenAt,
      imageUrl: events.imageUrl,
      ticketTiers: events.ticketTiers,
      raw: events.raw,
      promoterId: events.promoterId,
      promoterName: promoters.canonicalName,
      venueId: events.venueId,
      venueName: venues.canonicalName,
      venueRaw: sql<string | null>`(${events.raw}->>'venueRaw')`,
      promoterRaw: sql<string | null>`(${events.raw}->>'promoterRaw')`,
    })
    .from(events)
    .leftJoin(promoters, eq(events.promoterId, promoters.id))
    .leftJoin(venues, eq(events.venueId, venues.id))
    .where(eq(events.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const toISO = (d: Date | null | undefined) => d?.toISOString() ?? null;
  const raw = row.raw as Record<string, unknown> | null;

  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    status: row.status,
    type: row.type,
    date: toISO(row.date),
    firstSeenAt: toISO(row.firstSeenAt) ?? new Date().toISOString(),
    lastSeenAt: toISO(row.lastSeenAt) ?? new Date().toISOString(),
    imageUrl: row.imageUrl ?? null,
    ticketTiers: (row.ticketTiers ?? []) as TicketTier[],
    eventUrl: (raw?.eventUrl as string | null) ?? null,
    promoterId: row.promoterId ?? null,
    promoterName: row.promoterName ?? row.promoterRaw ?? null,
    venueId: row.venueId ?? null,
    venueName: row.venueName ?? row.venueRaw ?? null,
    isInternational: detectInternational(row.name),
  };
}

export async function getVenueById(id: string) {
  const venue = await db.query.venues.findFirst({
    where: eq(venues.id, id),
  });
  if (!venue) return null;

  const venueEvents = await db
    .select({
      id: events.id,
      name: events.name,
      platform: events.platform,
      status: events.status,
      type: events.type,
      date: events.date,
      promoterId: events.promoterId,
      promoterName: promoters.canonicalName,
      eventUrl: sql<string | null>`(${events.raw}->>'eventUrl')`,
    })
    .from(events)
    .leftJoin(promoters, eq(events.promoterId, promoters.id))
    .where(eq(events.venueId, id))
    .orderBy(desc(events.date));

  const toISO = (d: Date | null | undefined) => d?.toISOString() ?? null;

  return {
    id: venue.id,
    canonicalName: venue.canonicalName,
    capacity: venue.capacity ?? null,
    isKeyVenue: venue.isKeyVenue,
    events: venueEvents.map((e) => ({
      id: e.id,
      name: e.name,
      platform: e.platform,
      status: e.status,
      type: e.type,
      date: toISO(e.date),
      promoterId: e.promoterId ?? null,
      promoterName: e.promoterName ?? null,
      eventUrl: e.eventUrl ?? null,
      isInternational: detectInternational(e.name),
    })),
  };
}

export async function getPromoterById(id: string) {
  const promoter = await db.query.promoters.findFirst({
    where: eq(promoters.id, id),
  });
  if (!promoter) return null;

  const promoterEvents = await db
    .select({
      id: events.id,
      name: events.name,
      platform: events.platform,
      status: events.status,
      type: events.type,
      date: events.date,
      venueName: venues.canonicalName,
    })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .where(eq(events.promoterId, id))
    .orderBy(desc(events.date));

  const toISO = (d: Date | null | undefined) => d?.toISOString() ?? null;

  return {
    id: promoter.id,
    canonicalName: promoter.canonicalName,
    activeEventCount: promoter.activeEventCount,
    platformsActive: (promoter.platformsActive ?? []) as string[],
    venuesUsed: (promoter.venuesUsed ?? []) as string[],
    organizerPageUrl: promoter.organizerPageUrl ?? null,
    events: promoterEvents.map((e) => ({
      id: e.id,
      name: e.name,
      platform: e.platform,
      status: e.status,
      type: e.type,
      date: toISO(e.date),
      venueName: e.venueName ?? null,
      isInternational: detectInternational(e.name),
    })),
  };
}
