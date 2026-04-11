import FirecrawlApp from "firecrawl";

export interface RawEvent {
  platform: string;
  sourceUrl: string;   // listing page URL (e.g. /en/events)
  eventUrl: string | null; // individual event page URL, if extractable
  name: string;
  dateRaw: string | null;
  venueRaw: string | null;
  promoterRaw: string | null;
  statusRaw: string | null;
  typeRaw: string | null;
  priceRaw: string | null;
}

// Shape Firecrawl's LLM should extract per page
interface ExtractedPageEvents {
  events: Array<{
    name: string;
    date: string | null;
    venue: string | null;
    promoter: string | null;
    status: string | null;
    type: string | null;
    price: string | null;
    url: string | null;
  }>;
}

// Base URLs per platform for resolving relative event links
const PLATFORM_BASE_URLS: Record<string, string> = {
  ThaiTicketMajor: "https://www.thaiticketmajor.com",
  Ticketmelon:     "https://www.ticketmelon.com",
  TheConcert:      "https://www.theconcert.com",
  Eventpop:        "https://www.eventpop.me",
  AllTicket:       "https://www.allticket.com",
  TicketTier:      "https://www.ticketier.com",
};

function resolveEventUrl(url: string | null, platformName: string): string | null {
  if (!url) return null;
  // Discard pure hash links — TheConcert uses JS routing so <a href="#"> anchors are not real URLs
  if (url === "#" || url.startsWith("#") || url === "/") return null;
  if (url.startsWith("http")) {
    // Discard homepage-level URLs (no meaningful path beyond domain)
    try {
      const parsed = new URL(url);
      if (parsed.pathname === "/" || parsed.pathname === "") return null;
      // Strip fragments and query params — they're client-side only and confuse Firecrawl detail scraping
      return parsed.origin + parsed.pathname;
    } catch { /* fall through */ }
    return url;
  }
  const base = PLATFORM_BASE_URLS[platformName];
  if (!base) return url;
  try {
    const resolved = new URL(url, base);
    // Discard if resolved to the bare homepage
    if (resolved.pathname === "/" || resolved.pathname === "") return null;
    // Strip fragments and query params
    return resolved.origin + resolved.pathname;
  } catch {
    return null;
  }
}

// Target platform configurations
// timeoutMs: per-URL scrape timeout. Sites that consistently time out get a shorter
// budget so they fail fast without blocking credits.
const PLATFORMS = [
  {
    name: "ThaiTicketMajor",
    // /all-event/ is the full listing; /concert/ and /performance/ as backups
    urls: [
      "https://www.thaiticketmajor.com/all-event/",
      "https://www.thaiticketmajor.com/concert/",
      "https://www.thaiticketmajor.com/performance/",
    ],
    timeoutMs: 90000,  // heavy JS — needs more time
    waitForMs: 8000,
  },
  {
    name: "Ticketmelon",
    urls: ["https://www.ticketmelon.com/"],
    timeoutMs: 120000,
    waitForMs: 5000,
  },
  {
    name: "TheConcert",
    // Homepage has a consent dialog; /concert is the clean listing page
    urls: ["https://www.theconcert.com/concert"],
    timeoutMs: 60000,
    waitForMs: 8000,
  },
  {
    name: "Eventpop",
    urls: ["https://www.eventpop.me/"],
    timeoutMs: 60000,
    waitForMs: 5000,
  },
  {
    name: "AllTicket",
    urls: ["https://www.allticket.com/"],
    timeoutMs: 60000,
    waitForMs: 5000,
  },
  {
    name: "TicketTier",
    urls: ["https://www.ticketier.com/home"],
    timeoutMs: 60000,
    waitForMs: 5000,
  },
  // ── Venue / promoter supplemental sources ──────────────────────────────────
  // Events from these sources are cross-matched against existing ticket-platform
  // events before inserting, to avoid duplicates.
  {
    name: "LiveNationTero",
    urls: [
      "https://www.livenationtero.co.th/en/event/allevents",
      "https://www.livenationtero.co.th/rajamangala-national-stadium-tickets-vdp914798",
    ],
    timeoutMs: 60000,
  },
  {
    name: "UOBLive",
    urls: [
      "https://www.uoblive.asia/whats-on/",
      "https://www.uoblive.asia/whats-on/?page=2",
      "https://www.uoblive.asia/whats-on/?page=3",
    ],
    timeoutMs: 60000,
  },
  {
    name: "Impact",
    urls: ["https://www.impact.co.th/en/visitors/event-calendar"],
    timeoutMs: 90000,
  },
  {
    name: "Thunderdome",
    urls: ["https://www.thunderdome.biz/en/events"],
    timeoutMs: 60000,
  },
];

// NOTE: Thailand-only filter — only extract events taking place in Thailand.
// Keep this prompt short — Firecrawl silently drops json extraction for long prompts.
// Limit: ~300 chars max (195 chars works, 586 fails).
export const EXTRACT_PROMPT = `List Thailand events only. Today is 2026. Each event: name, date (with year; if no year shown use 2026 or 2027 — whichever is in the future), venue, promoter, status, type, price, url. Return {"events": [...]}. Thai text ok.`;


/** Scrape a single URL and return raw events. Resolves to [] on failure. */
export async function scrapeUrl(
  app: FirecrawlApp,
  platformName: string,
  url: string,
  timeoutMs = 60000,
  waitForMs = 5000,
): Promise<RawEvent[]> {
  try {
    console.log(`[scraper] Scraping ${platformName} — ${url}`);

    const result = await app.scrapeUrl(url, {
      formats: ["markdown", "json"],
      jsonOptions: { prompt: EXTRACT_PROMPT },
      waitFor: waitForMs,
      timeout: timeoutMs,
    });

    if (!result.success) {
      const errMsg = (result as { error?: string; warning?: string }).error ?? (result as { warning?: string }).warning ?? "unknown";
      console.warn(`[scraper] Failed ${url}: ${errMsg}`);
      throw new Error(`Firecrawl failed: ${errMsg}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = result as any;
    const extracted = r.json as ExtractedPageEvents | null;
    if (!extracted?.events?.length) {
      console.warn(`[scraper] No events extracted from ${url}`);
      return [];
    }

    console.log(`[scraper] ${platformName}: ${extracted.events.length} events from ${url}`);

    const validEvents = extracted.events.filter((e) => e.name && e.name.trim().length >= 2);
    return validEvents.map((e) => ({
      platform: platformName,
      sourceUrl: url,
      eventUrl: resolveEventUrl(e.url ?? null, platformName),
      name: e.name.trim(),
      dateRaw: e.date ?? null,
      venueRaw: e.venue ?? null,
      promoterRaw: e.promoter ?? null,
      statusRaw: e.status ?? null,
      typeRaw: e.type ?? null,
      priceRaw: e.price ?? null,
    }));
  } catch (err) {
    console.error(`[scraper] Failed scraping ${url}:`, err);
    return [];
  }
}

export { PLATFORMS };

export async function scrapeAllPlatforms(): Promise<RawEvent[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not set");

  const app = new FirecrawlApp({ apiKey });
  const allEvents: RawEvent[] = [];

  for (const platform of PLATFORMS) {
    for (const url of platform.urls) {
      const events = await scrapeUrl(app, platform.name, url, platform.timeoutMs, platform.waitForMs ?? 5000);
      allEvents.push(...events);
    }
  }

  return allEvents;
}
