/**
 * Backfill eventUrl for existing DB events that have eventUrl: null.
 *
 * Strategy:
 * 1. Scrape each ticket platform listing page with markdown + links format
 * 2. Extract [event name](url) pairs from the markdown
 * 3. Filter URLs that match the platform's event URL pattern
 * 4. Fuzzy-match extracted event names against existing DB events by word overlap
 * 5. Update raw JSONB with the matched eventUrl
 *
 * After this runs, the next enrichEventDetails() call will have URLs to scrape
 * for ticket tiers, images, and promoter data.
 */

import FirecrawlApp from "firecrawl";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";

const PLATFORMS_TO_BACKFILL = [
  {
    name: "Ticketmelon",
    urls: ["https://www.ticketmelon.com/"],
    pattern: /^https:\/\/www\.ticketmelon\.com\/[^/?#]+\/[^/?#]+\/?(?:[?#].*)?$/,
    // Also try mapUrl — Ticketmelon uses JS routing so <a> tags aren't always extractable
    mapUrl: "https://www.ticketmelon.com",
    waitForMs: 5000,
    timeoutMs: 60000,
  },
  {
    name: "Eventpop",
    urls: ["https://www.eventpop.me/"],
    pattern: /^https:\/\/www\.eventpop\.me\/e\/[^/?#]+/,
    // Eventpop may use JS-rendered event cards — mapUrl fallback catches what markdown misses
    mapUrl: "https://www.eventpop.me",
    waitForMs: 5000,
    timeoutMs: 60000,
  },
  {
    name: "AllTicket",
    urls: ["https://www.allticket.com/"],
    pattern: /^https:\/\/www\.allticket\.com\/[^/?#]+-\d+/,
    // AllTicket also uses JS rendering — try mapUrl fallback
    mapUrl: "https://www.allticket.com",
    waitForMs: 5000,
    timeoutMs: 60000,
  },
  {
    name: "TicketTier",
    urls: ["https://www.ticketier.com/home"],
    pattern: /^https:\/\/www\.ticketier\.com\/events\/[^/?#]+/,
    mapUrl: undefined as string | undefined,
    waitForMs: 5000,
    timeoutMs: 60000,
  },
  {
    name: "TheConcert",
    urls: ["https://www.theconcert.com/concert"],
    pattern: /^https:\/\/www\.theconcert\.com\/[^/?#]+\/[^/?#]+/,
    // TheConcert uses JS routing — <a href="#"> on listing page, so markdown extraction finds 0 links.
    // mapUrl crawls the domain to find actual event URLs.
    mapUrl: "https://www.theconcert.com",
    waitForMs: 8000,
    timeoutMs: 60000,
  },
  {
    name: "ThaiTicketMajor",
    urls: [
      "https://www.thaiticketmajor.com/all-event/",
      "https://www.thaiticketmajor.com/concert/",
    ],
    pattern: /^https:\/\/www\.thaiticketmajor\.com\/[a-z]+\/[^/?#]+\.html/,
    // Standard HTML links — markdown extraction should work, but add mapUrl as fallback
    mapUrl: "https://www.thaiticketmajor.com",
    waitForMs: 8000,
    timeoutMs: 90000,
  },
];

/** Extract [text](url) pairs from markdown content. */
function extractMarkdownLinks(markdown: string): Array<{ text: string; url: string }> {
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  const results: Array<{ text: string; url: string }> = [];
  let match;
  while ((match = linkPattern.exec(markdown)) !== null) {
    const text = match[1].trim();
    const url = match[2].trim();
    if (text.length >= 2) results.push({ text, url });
  }
  return results;
}

/** Word-overlap similarity between two strings (0–1). */
function nameSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);
  const wordsA = new Set(normalize(a));
  const wordsB = new Set(normalize(b));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let common = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) common++;
  }
  return common / Math.max(wordsA.size, wordsB.size);
}

export interface BackfillResult {
  platform: string;
  linksFound: number;
  eventsUpdated: number;
}

export async function backfillEventUrls(): Promise<BackfillResult[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not set");

  const app = new FirecrawlApp({ apiKey });
  const results: BackfillResult[] = [];

  for (const platform of PLATFORMS_TO_BACKFILL) {
    const result: BackfillResult = { platform: platform.name, linksFound: 0, eventsUpdated: 0 };

    // Find all events for this platform that are missing an eventUrl
    const eventsNeedingUrl = await db.query.events.findMany({
      where: sql`${events.platform} = ${platform.name} AND (${events.raw}->>'eventUrl') IS NULL`,
    });

    if (eventsNeedingUrl.length === 0) {
      console.log(`[backfill] ${platform.name}: no events need URL backfill`);
      results.push(result);
      continue;
    }

    console.log(`[backfill] ${platform.name}: ${eventsNeedingUrl.length} events need URLs`);

    // Collect event links from all listing pages for this platform
    const eventLinks: Array<{ text: string; url: string }> = [];

    for (const url of platform.urls) {
      try {
        console.log(`[backfill] Scraping ${url}`);
        const scraped = await app.scrapeUrl(url, {
          formats: ["markdown", "links"],
          waitFor: platform.waitForMs,
          timeout: platform.timeoutMs,
        });

        if (!scraped.success) {
          console.warn(`[backfill] Failed to scrape ${url}`);
          continue;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = scraped as any;
        const markdown: string = r.markdown ?? "";
        const rawLinks: string[] = r.links ?? [];

        // From markdown: extract [text](url) where url matches event pattern
        const mdLinks = extractMarkdownLinks(markdown).filter((l) => platform.pattern.test(l.url));
        eventLinks.push(...mdLinks);

        // From raw link list: collect matching URLs (no text, used as fallback for name matching via URL path)
        const rawEventLinks = rawLinks
          .filter((l) => platform.pattern.test(l))
          .map((l) => ({ text: extractNameFromUrl(l, platform.name), url: l }))
          .filter((l) => l.text.length > 2);
        // Only add raw links that don't already have a markdown version
        const existingUrls = new Set(eventLinks.map((l) => l.url));
        for (const l of rawEventLinks) {
          if (!existingUrls.has(l.url)) {
            eventLinks.push(l);
            existingUrls.add(l.url);
          }
        }

        console.log(`[backfill] ${url}: ${mdLinks.length} markdown links, ${rawLinks.filter(l => platform.pattern.test(l)).length} raw event links`);
      } catch (err) {
        console.error(`[backfill] Error scraping ${url}:`, err);
      }
    }

    // Fallback: use mapUrl for platforms that use JS routing (event cards without <a href> tags)
    if (eventLinks.length === 0 && platform.mapUrl) {
      try {
        console.log(`[backfill] ${platform.name}: no links from scrape — trying mapUrl on ${platform.mapUrl}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapResult = await (app as any).mapUrl(platform.mapUrl, { limit: 200 }) as { links?: string[]; urls?: string[] };
        const allMapLinks: string[] = mapResult.links ?? mapResult.urls ?? [];
        const mapEventLinks = allMapLinks
          .filter((l) => platform.pattern.test(l))
          .map((l) => {
            // Strip query/hash to get clean URL
            const clean = l.split("?")[0].split("#")[0];
            return { text: extractNameFromUrl(clean, platform.name), url: clean };
          })
          .filter((l) => l.text.length > 2);
        // Dedup
        const seen = new Set<string>();
        for (const l of mapEventLinks) {
          if (!seen.has(l.url)) {
            eventLinks.push(l);
            seen.add(l.url);
          }
        }
        console.log(`[backfill] ${platform.name}: mapUrl found ${mapEventLinks.length} event links`);
      } catch (err) {
        console.warn(`[backfill] ${platform.name}: mapUrl failed:`, err);
      }
    }

    result.linksFound = eventLinks.length;
    console.log(`[backfill] ${platform.name}: ${eventLinks.length} total event links`);

    if (eventLinks.length === 0) {
      results.push(result);
      continue;
    }

    // Match each DB event to its best candidate link
    const MATCH_THRESHOLD = 0.4;
    for (const event of eventsNeedingUrl) {
      let bestUrl: string | null = null;
      let bestScore = MATCH_THRESHOLD;

      for (const link of eventLinks) {
        const score = nameSimilarity(event.name, link.text);
        if (score > bestScore) {
          bestScore = score;
          bestUrl = link.url;
        }
      }

      if (bestUrl) {
        const existingRaw = (event.raw ?? {}) as Record<string, unknown>;
        await db.update(events)
          .set({ raw: { ...existingRaw, eventUrl: bestUrl } as object })
          .where(eq(events.id, event.id));
        result.eventsUpdated++;
        console.log(`[backfill] "${event.name}" → ${bestUrl} (score: ${bestScore.toFixed(2)})`);
      }
    }

    results.push(result);
  }

  return results;
}

/** Derive a human-readable name from a URL path slug. */
function extractNameFromUrl(url: string, platformName: string): string {
  try {
    const path = new URL(url).pathname;
    const segments = path.split("/").filter(Boolean);

    // Platform-specific: grab the meaningful segment
    if (platformName === "Ticketmelon" && segments.length >= 2) {
      // /organizer/event-slug → "event slug"
      return segments[segments.length - 1].replace(/-/g, " ").replace(/_/g, " ");
    }
    if (platformName === "Eventpop" && segments.length >= 2) {
      // /e/event-slug → "event slug"
      return segments[segments.length - 1].replace(/-/g, " ");
    }
    if (platformName === "AllTicket") {
      // /event-name-12345 → "event name"
      return segments[segments.length - 1].replace(/-\d+$/, "").replace(/-/g, " ");
    }
    if (platformName === "TicketTier") {
      // /events/event-slug → "event slug"
      return segments[segments.length - 1].replace(/-/g, " ");
    }
    if (platformName === "TheConcert") {
      return segments[segments.length - 1].replace(/-/g, " ");
    }
    if (platformName === "ThaiTicketMajor") {
      // /concert/event-name.html → "event name"
      return segments[segments.length - 1].replace(/\.html$/, "").replace(/-/g, " ");
    }
    return segments[segments.length - 1].replace(/[-_]/g, " ");
  } catch {
    return "";
  }
}
