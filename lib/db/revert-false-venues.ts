/**
 * One-time: revert false-positive venue links where the raw venue text
 * does not contain the distinctive pattern for the linked venue.
 */
import { db } from "./index";
import { sql } from "drizzle-orm";

async function revert() {
  const res = await db.execute(sql`
    UPDATE events
    SET venue_id = NULL
    WHERE venue_id IS NOT NULL
      AND (raw->>'venueRaw') IS NOT NULL
      AND lower(raw->>'venueRaw') NOT LIKE '%rajamangala%'
      AND lower(raw->>'venueRaw') NOT LIKE '%impact%'
      AND lower(raw->>'venueRaw') NOT LIKE '%thunderdome%'
      AND lower(raw->>'venueRaw') NOT LIKE '%uob live%'
      AND lower(raw->>'venueRaw') NOT LIKE '%challenger%'
      AND lower(raw->>'venueRaw') NOT LIKE '%ราชมังคล%'
      AND lower(raw->>'venueRaw') NOT LIKE '%ธันเดอร์โดม%'
  `);
  console.log(`Reverted ${(res as unknown as unknown[]).length ?? 0} false-positive venue link(s).`);
}

if (require.main === module) {
  revert().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
