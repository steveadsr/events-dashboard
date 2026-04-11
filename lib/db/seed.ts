import { db } from "./index";
import { venues } from "./schema";

const KEY_VENUES = [
  { name: "Rajamangala National Stadium", canonicalName: "Rajamangala National Stadium", capacity: 65000, isKeyVenue: true },
  { name: "Impact Arena", canonicalName: "Impact Arena", capacity: 12000, isKeyVenue: true },
  { name: "Impact Challenger Hall", canonicalName: "Impact Challenger Hall", capacity: 8000, isKeyVenue: true },
  { name: "Thunderdome", canonicalName: "Thunderdome", capacity: 6000, isKeyVenue: true },
  { name: "UOB Live", canonicalName: "UOB Live", capacity: 8000, isKeyVenue: true },
];

export async function seedVenues() {
  console.log("Seeding key venues...");
  for (const venue of KEY_VENUES) {
    await db
      .insert(venues)
      .values(venue)
      .onConflictDoNothing();
  }
  console.log("Seeded", KEY_VENUES.length, "key venues.");
}

// Run: npx tsx lib/db/seed.ts
if (require.main === module) {
  seedVenues()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
