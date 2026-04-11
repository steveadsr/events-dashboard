export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { recoverStaleScrapeRuns } = await import("./lib/db/migrate");
    await recoverStaleScrapeRuns().catch((e) =>
      console.error("[startup] Failed to recover stale runs:", e)
    );
  }
}
