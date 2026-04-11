/**
 * One-off cleanup: remove garbage promoter records created by LLM returning
 * "Unknown", "null", "Not specified", platform names, etc.
 * Also unlinks events that pointed to those promoters.
 *
 * Run with: DATABASE_URL=... npx tsx lib/db/cleanup-promoters.ts
 */
import { db } from "./index";
import { promoters, events } from "./schema";
import { sql } from "drizzle-orm";

const JUNK_NAMES = [
  "unknown", "not specified", "null", "n/a", "tba", "tbd", "none",
  "to be announced", "various", "organizer", "promoter",
  "ticketmelon", "thaiticketmajor", "eventpop", "allticket",
  "tickettier", "theconcert", "livenationtero", "uoblive",
  "impact", "thunderdome",
];

async function main() {
  const junkCondition = sql`lower(trim(${promoters.canonicalName})) IN (${sql.join(JUNK_NAMES.map(n => sql`${n}`), sql`, `)})`;

  // Find junk promoter IDs
  const junkPromoters = await db
    .select({ id: promoters.id, name: promoters.canonicalName })
    .from(promoters)
    .where(junkCondition);

  if (junkPromoters.length === 0) {
    console.log("No garbage promoters found.");
    process.exit(0);
  }

  console.log(`Found ${junkPromoters.length} garbage promoters:`, junkPromoters.map(p => p.name));

  // Unlink events that point to these promoters
  for (const p of junkPromoters) {
    const unlinked = await db
      .update(events)
      .set({ promoterId: null })
      .where(sql`${events.promoterId} = ${p.id}`)
      .returning({ id: events.id });
    if (unlinked.length > 0) {
      console.log(`Unlinked ${unlinked.length} events from promoter "${p.name}"`);
    }
  }

  // Delete the garbage promoters
  const deleted = await db
    .delete(promoters)
    .where(junkCondition)
    .returning({ name: promoters.canonicalName });

  console.log(`Deleted promoters: ${deleted.map(p => p.name).join(", ")}`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
