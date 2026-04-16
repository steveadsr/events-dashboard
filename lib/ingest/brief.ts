import { db } from "@/lib/db";
import { events, promoters, venues, dailyBriefs } from "@/lib/db/schema";
import { desc, gte, sql, eq, and } from "drizzle-orm";
import { FAN_EVENT_FILTER, THAILAND_ONLY_FILTER } from "@/lib/db/queries";

const TWENTY_FOUR_HOURS = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

/** Generate a daily brief and write it to the daily_briefs table. */
export async function generateDailyBrief(): Promise<void> {
  const since = TWENTY_FOUR_HOURS();

  // New events in last 24h — apply same filters as the UI (no fan meetings, Thailand only)
  const newEvents = await db
    .select({
      id: events.id,
      name: events.name,
      type: events.type,
      platform: events.platform,
      promoterName: promoters.canonicalName,
      venueName: venues.canonicalName,
      isKeyVenue: venues.isKeyVenue,
    })
    .from(events)
    .leftJoin(promoters, eq(events.promoterId, promoters.id))
    .leftJoin(venues, eq(events.venueId, venues.id))
    .where(and(gte(events.firstSeenAt, since), THAILAND_ONLY_FILTER, FAN_EVENT_FILTER))
    .orderBy(desc(events.firstSeenAt))
    .limit(100);

  // Promoters with 2+ active events
  const activePromoters = await db
    .select({
      canonicalName: promoters.canonicalName,
      activeEventCount: promoters.activeEventCount,
      platformsActive: promoters.platformsActive,
    })
    .from(promoters)
    .where(sql`${promoters.activeEventCount} >= 2`)
    .orderBy(desc(promoters.activeEventCount))
    .limit(10);

  // Venues with 2+ events
  const activeVenues = await db
    .select({
      canonicalName: venues.canonicalName,
      eventCount: sql<number>`count(${events.id})::int`,
    })
    .from(venues)
    .leftJoin(events, eq(events.venueId, venues.id))
    .groupBy(venues.id)
    .having(sql`count(${events.id}) >= 2`)
    .orderBy(desc(sql`count(${events.id})`))
    .limit(5);

  const bullets: string[] = [];

  // Bullet 1: new event count
  if (newEvents.length > 0) {
    const intlCount = newEvents.filter((e) => isInternational(e.name)).length;
    const concertCount = newEvents.filter(
      (e) => e.type && /concert|festival/i.test(e.type) && !isExcludedType(e.type)
    ).length;

    if (intlCount > 0) {
      bullets.push(
        `${intlCount} new international concert${intlCount !== 1 ? "s" : ""} detected in the last 24 hours`
      );
    }
    if (concertCount > 0 && concertCount !== intlCount) {
      bullets.push(
        `${concertCount} new concert/festival event${concertCount !== 1 ? "s" : ""} added across platforms`
      );
    }
    if (bullets.length === 0) {
      bullets.push(`${newEvents.length} new event${newEvents.length !== 1 ? "s" : ""} detected in the last 24 hours`);
    }
  } else {
    bullets.push("No new events detected in the last 24 hours");
  }

  // Bullet 2: most active promoter
  if (activePromoters.length > 0) {
    const top = activePromoters[0];
    const platforms = (top.platformsActive ?? []).join(", ");
    bullets.push(
      `${top.canonicalName} has ${top.activeEventCount} active event${top.activeEventCount !== 1 ? "s" : ""} on sale` +
        (platforms ? ` across ${platforms}` : "")
    );
  }

  // Bullet 3: busiest venue
  if (activeVenues.length > 0) {
    const top = activeVenues[0];
    bullets.push(
      `${top.canonicalName} is hosting ${top.eventCount} upcoming event${top.eventCount !== 1 ? "s" : ""}`
    );
  }

  // Bullet 4: platform breakdown for new events
  if (newEvents.length > 0) {
    const byPlatform: Record<string, number> = {};
    for (const e of newEvents) {
      byPlatform[e.platform] = (byPlatform[e.platform] ?? 0) + 1;
    }
    const parts = Object.entries(byPlatform)
      .sort((a, b) => b[1] - a[1])
      .map(([p, n]) => `${n} on ${p}`)
      .join(", ");
    if (Object.keys(byPlatform).length > 1) {
      bullets.push(`New events by platform: ${parts}`);
    }
  }

  await db.insert(dailyBriefs).values({
    bullets,
    eventsCovered: newEvents.length,
    generatedAt: new Date(),
  });

  console.log(`[brief] Generated daily brief with ${bullets.length} bullets covering ${newEvents.length} events`);
}

// True international = event name contains a non-Thailand country or city indicator.
// Matches the same logic as detectInternational() in queries.ts.
function isInternational(name: string): boolean {
  return /\b(malaysia|kuala lumpur|\bkl\b|singapore|indonesia|jakarta|manila|philippines|vietnam|korea|japan|taiwan|hong kong|china|india|australia)\b/i.test(name);
}

function isExcludedType(type: string): boolean {
  return /workshop|exhibition|fan\s*meet/i.test(type);
}
