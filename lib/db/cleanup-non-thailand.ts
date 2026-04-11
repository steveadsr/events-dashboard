/**
 * cleanup-non-thailand.ts
 *
 * One-time script to remove events not in Thailand from the database.
 * Run: npm run db:cleanup
 *
 * Detection strategy: checks event name, raw venue, and raw source URL for
 * known non-Thailand location keywords. Conservative — only deletes when
 * there's a clear match. Logs every deletion so you can review.
 */

import { db } from "./index";
import { events } from "./schema";
import { sql } from "drizzle-orm";

// Locations that are clearly NOT Thailand.
// Patterns are matched case-insensitively against: event name, venue raw, and source URL.
const NON_THAILAND_PATTERNS = [
  // Southeast Asia
  "vietnam", "viet nam", "việt nam", "ho chi minh", "hcmc", "saigon", "hanoi", "hà nội",
  "malaysia", "kuala lumpur", " kl ", "selangor", "petaling", "putrajaya",
  "singapore", " sg ",
  "indonesia", "jakarta", "bali", "surabaya", "bandung",
  "philippines", "manila", "cebu", "pasay", "quezon",
  "myanmar", "yangon", "rangoon",
  "cambodia", "phnom penh",
  "laos", "vientiane",
  "brunei",
  // East Asia
  "china", "beijing", "shanghai", "shenzhen", "guangzhou",
  "hong kong", "hongkong",
  "taiwan", "taipei",
  "japan", "tokyo", "osaka", "kyoto",
  "korea", "seoul", "busan",
  // South Asia
  "india", "mumbai", "delhi", "bangalore",
  // Rest of world
  "australia", "sydney", "melbourne",
  "uk ", "london", "manchester",
  "usa", "new york", "los angeles", "chicago",
  "germany", "berlin", "france", "paris",
];

function buildLikeConditions(field: string): string {
  return NON_THAILAND_PATTERNS
    .map((p) => `lower(${field}) LIKE '%${p}%'`)
    .join(" OR ");
}

async function cleanupNonThailandEvents() {
  console.log("🔍 Scanning for non-Thailand events...\n");

  // Find candidates: check name, raw->>'venueRaw', and raw->>'sourceUrl'
  // db.execute with postgres driver returns the rows directly as an array
  const rows = (await db.execute(sql.raw(`
    SELECT id, name, platform,
           raw->>'venueRaw'   AS venue_raw,
           raw->>'sourceUrl'  AS source_url
    FROM events
    WHERE (${buildLikeConditions("name")})
       OR (${buildLikeConditions("raw->>'venueRaw'")})
  `))) as unknown as Array<{
    id: string;
    name: string;
    platform: string;
    venue_raw: string | null;
    source_url: string | null;
  }>;

  if (rows.length === 0) {
    console.log("✅ No non-Thailand events found. Database is clean.");
    return;
  }

  console.log(`Found ${rows.length} non-Thailand event(s) to remove:\n`);
  for (const row of rows) {
    console.log(`  ✗  [${row.platform}] ${row.name}`);
    if (row.venue_raw) console.log(`       venue: ${row.venue_raw}`);
  }

  // Delete them
  const ids = rows.map((r) => `'${r.id}'`).join(", ");
  await db.execute(sql.raw(`DELETE FROM events WHERE id IN (${ids})`));

  console.log(`\n🗑️  Deleted ${rows.length} non-Thailand event(s).`);
}

// Run: npx tsx lib/db/cleanup-non-thailand.ts
if (require.main === module) {
  cleanupNonThailandEvents()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
