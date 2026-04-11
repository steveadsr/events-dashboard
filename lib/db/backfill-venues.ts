/**
 * backfill-venues.ts
 *
 * One-time script: for events where venue_id is null, fuzzy-match the raw venue
 * text against the venues table and set venue_id where there's a clear match.
 * Safe to re-run — only updates records where venue_id IS NULL.
 *
 * Run: npm run db:backfill-venues
 */

import { db } from "./index";
import { events, venues } from "./schema";
import { eq, isNull, sql } from "drizzle-orm";

async function backfillVenues() {
  console.log("🔍 Finding events with no venue_id...\n");

  const unlinked = await db
    .select({
      id: events.id,
      name: events.name,
      platform: events.platform,
      venueRaw: sql<string | null>`(${events.raw}->>'venueRaw')`,
    })
    .from(events)
    .where(isNull(events.venueId));

  if (unlinked.length === 0) {
    console.log("✅ All events already have venue_id set.");
    return;
  }

  console.log(`Found ${unlinked.length} events without a venue_id. Attempting fuzzy match...\n`);

  // Venue-specific patterns: ALL listed words must appear in the raw text.
  // Avoids false positives from generic words like "arena", "national", "stadium".
  const VENUE_PATTERNS: { name: string; required: string[] }[] = [
    { name: "Rajamangala National Stadium", required: ["rajamangala"] },
    { name: "Impact Arena",                 required: ["impact", "arena"] },
    { name: "Impact Challenger Hall",        required: ["impact", "challenger"] },
    { name: "Thunderdome",                   required: ["thunderdome"] },
    { name: "UOB Live",                      required: ["uob"] },
  ];

  const allVenues = await db.query.venues.findMany();
  const venueByName = new Map(allVenues.map((v) => [v.canonicalName, v]));
  let matched = 0;

  for (const event of unlinked) {
    const combined = (event.venueRaw ?? "").toLowerCase();
    if (!combined) continue;

    for (const pattern of VENUE_PATTERNS) {
      const allMatch = pattern.required.every((w) => combined.includes(w));
      if (allMatch) {
        const venue = venueByName.get(pattern.name);
        if (!venue) continue;

        await db
          .update(events)
          .set({ venueId: venue.id })
          .where(eq(events.id, event.id));

        console.log(`  ✓  [${event.platform}] "${event.name}"`);
        console.log(`       raw: "${event.venueRaw}"`);
        console.log(`       → linked to: "${venue.canonicalName}"\n`);
        matched++;
        break;
      }
    }
  }

  if (matched === 0) {
    console.log("No additional venue matches found.");
  } else {
    console.log(`✅ Linked ${matched} event(s) to their correct venue.`);
  }
}

if (require.main === module) {
  backfillVenues()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
