import { db } from "./index";
import { scrapeRuns } from "./schema";
import { sql, lt, and, eq } from "drizzle-orm";

/**
 * On startup: mark any scrape_run stuck in 'running' > 30min as 'failed'.
 * Called from the Next.js instrumentation hook.
 */
export async function recoverStaleScrapeRuns() {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  const result = await db
    .update(scrapeRuns)
    .set({ status: "failed", completedAt: new Date() })
    .where(
      and(
        eq(scrapeRuns.status, "running"),
        lt(scrapeRuns.startedAt, thirtyMinutesAgo)
      )
    )
    .returning({ id: scrapeRuns.id });

  if (result.length > 0) {
    console.log(`[startup] Recovered ${result.length} stale scrape run(s)`);
  }
}
