import { NextResponse } from "next/server";
import FirecrawlApp from "firecrawl";

/**
 * GET /api/scrape/debug?url=https://...
 * Test what Firecrawl extracts from a single URL. Dev only.
 * Add &full=1 to use the real EXTRACT_PROMPT from the scraper.
 * Add &scrapeUrl=1 to run through the actual scrapeUrl() pipeline.
 */
export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Dev only" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "?url= required" }, { status: 400 });
  }

  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "FIRECRAWL_API_KEY not set" }, { status: 500 });

  // &scrapeUrl=1 — test simple vs full EXTRACT_PROMPT, with json-only format
  if (searchParams.get("scrapeUrl") === "1") {
    const { EXTRACT_PROMPT } = await import("@/lib/scrapers/firecrawl");
    const app2 = new FirecrawlApp({ apiKey });

    const SIMPLE_PROMPT = `Extract all events/shows/concerts listed on this page as a JSON array.
For each event include: name, date, venue, promoter, status, type, price.
Return {"events": [...]}. Include Thai text as-is.`;

    // Test 1: simple prompt, json only (known to work)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r1 = await (app2 as any).scrapeUrl(url, { formats: ["json"], jsonOptions: { prompt: SIMPLE_PROMPT }, waitFor: 5000, timeout: 120000 }) as Record<string, unknown>;

    // Test 2: full EXTRACT_PROMPT, json only
    const app3 = new FirecrawlApp({ apiKey });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r2 = await (app3 as any).scrapeUrl(url, { formats: ["json"], jsonOptions: { prompt: EXTRACT_PROMPT }, waitFor: 5000, timeout: 120000 }) as Record<string, unknown>;

    return NextResponse.json({
      simple_prompt: { keys: Object.keys(r1), eventCount: Array.isArray((r1 as any).json?.events) ? (r1 as any).json.events.length : null },
      full_prompt: { keys: Object.keys(r2), eventCount: Array.isArray((r2 as any).json?.events) ? (r2 as any).json.events.length : null, warning: r2.warning },
      promptLength: { simple: SIMPLE_PROMPT.length, full: EXTRACT_PROMPT.length },
      url,
    });
  }

  const app = new FirecrawlApp({ apiKey });

  try {
    const result = await app.scrapeUrl(url, {
      formats: ["json"],
      jsonOptions: {
        prompt: `Extract all events/shows/concerts listed on this page as a JSON array.
For each event include: name, date, venue, promoter, status, type, price.
Return {"events": [...]}. Include Thai text as-is.`,
      },
      waitFor: 5000,
      timeout: 120000,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: result.success, json: (result as any).json, url });
  } catch (err) {
    return NextResponse.json({ error: String(err), url }, { status: 500 });
  }
}
