import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

const byPlatform = await db.execute(sql`
  SELECT platform,
    count(*) as total,
    sum(case when status='UNKNOWN' then 1 else 0 end) as unknown_status,
    sum(case when promoter_id is null then 1 else 0 end) as no_promoter,
    sum(case when raw->>'promoterRaw' ilike 'unknown' or raw->>'promoterRaw' is null then 1 else 0 end) as no_promoter_raw
  FROM events GROUP BY platform ORDER BY platform
`);
console.log("By platform:\n", JSON.stringify(byPlatform.rows, null, 2));

const promoterNames = await db.execute(sql`
  SELECT canonical_name, active_event_count FROM promoters ORDER BY active_event_count DESC
`);
console.log("\nPromoters:\n", JSON.stringify(promoterNames.rows, null, 2));

const ticketmelonSample = await db.execute(sql`
  SELECT name, status, promoter_id, raw->>'eventUrl' as event_url, raw->>'promoterRaw' as promoter_raw
  FROM events WHERE platform = 'Ticketmelon' LIMIT 5
`);
console.log("\nTicketmelon sample:\n", JSON.stringify(ticketmelonSample.rows, null, 2));

await client.end();
