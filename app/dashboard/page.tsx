import { DailyBrief } from "@/components/DailyBrief";
import { MarketRadar } from "@/components/MarketRadar";
import { PromoterGrid } from "@/components/PromoterGrid";
import { VenueGrid } from "@/components/VenueGrid";
import { BigEventTracker } from "@/components/BigEventTracker";
import { ScrapeButton } from "@/components/ScrapeButton";
import { SearchBar } from "@/components/SearchBar";

// Use mock data when DATABASE_URL is not configured
function getMockData() {
  return {
    dailyBrief: [
      "3 new international concerts launched today on ThaiTicketMajor",
      "BEC-Tero Entertainment has 6 active events across 2 platforms",
      "Impact Arena is hosting 3 upcoming events in Q3",
    ],
    briefGeneratedAt: new Date().toISOString(),
    newEvents: [
      {
        id: "1", name: "MAMAMOO World Tour Bangkok", platform: "ThaiTicketMajor",
        status: "PRE_SALE" as const, type: "Concert", date: "2026-07-12T00:00:00Z",
        firstSeenAt: new Date().toISOString(), promoterName: "BEC-Tero Entertainment",
        venueName: "Impact Arena", venueRaw: "Impact Arena", eventUrl: "https://www.thaiticketmajor.com/concert/mamamoo-2026",
        isNew24h: true, isInternational: true, isKeyVenue: true,
      },
      {
        id: "2", name: "Coldplay Music of the Spheres", platform: "ThaiTicketMajor",
        status: "SOLD_OUT" as const, type: "Concert", date: "2026-11-08T00:00:00Z",
        firstSeenAt: new Date(Date.now() - 3600000).toISOString(), promoterName: "BEC-Tero Entertainment",
        venueName: "Rajamangala National Stadium", venueRaw: "Rajamangala Stadium", eventUrl: "https://www.thaiticketmajor.com/concert/coldplay-2026",
        isNew24h: false, isInternational: true, isKeyVenue: true,
      },
      {
        id: "3", name: "สยามซอง ฟิน ฟิน", platform: "Ticketmelon",
        status: "ON_SALE" as const, type: "Thai Pop", date: "2026-06-20T00:00:00Z",
        firstSeenAt: new Date(Date.now() - 7200000).toISOString(), promoterName: "GMM Grammy",
        venueName: "Thunderdome", venueRaw: "Thunderdome", eventUrl: "https://www.ticketmelon.com/en/events/siam-song",
        isNew24h: true, isInternational: false, isKeyVenue: true,
      },
      {
        id: "4", name: "Bangkok EDM Festival 2026", platform: "Eventpop",
        status: "ON_SALE" as const, type: "Festival", date: "2026-08-03T00:00:00Z",
        firstSeenAt: new Date(Date.now() - 86400000 * 2).toISOString(), promoterName: "Change Music",
        venueName: "Impact Challenger Hall", venueRaw: "Impact Challenger Hall", eventUrl: null,
        isNew24h: false, isInternational: false, isKeyVenue: true,
      },
    ],
    promotersSummary: [
      { id: "p1", canonicalName: "BEC-Tero Entertainment", activeEventCount: 6, platformsActive: ["ThaiTicketMajor", "Ticketmelon"], venuesUsed: ["Impact Arena", "Rajamangala National Stadium"] },
      { id: "p2", canonicalName: "GMM Grammy", activeEventCount: 4, platformsActive: ["Ticketmelon"], venuesUsed: ["Thunderdome", "UOB Live"] },
      { id: "p3", canonicalName: "Change Music", activeEventCount: 3, platformsActive: ["Ticketmelon"], venuesUsed: ["Impact Challenger Hall"] },
      { id: "p4", canonicalName: "Live Nation Thailand", activeEventCount: 2, platformsActive: ["ThaiTicketMajor"], venuesUsed: ["Impact Arena"] },
    ],
    venueSummary: [
      { id: "v1", canonicalName: "Impact Arena", isKeyVenue: true, capacity: 12000, eventCount: 8 },
      { id: "v2", canonicalName: "Rajamangala National Stadium", isKeyVenue: true, capacity: 65000, eventCount: 3 },
      { id: "v3", canonicalName: "Thunderdome", isKeyVenue: true, capacity: 6000, eventCount: 5 },
      { id: "v4", canonicalName: "Impact Challenger Hall", isKeyVenue: true, capacity: 8000, eventCount: 4 },
      { id: "v5", canonicalName: "UOB Live", isKeyVenue: true, capacity: 8000, eventCount: 2 },
    ],
    bigEvents: [
      {
        id: "b1", name: "Coldplay Music of the Spheres", platform: "ThaiTicketMajor",
        status: "SOLD_OUT" as const, type: "Concert", date: "2026-11-08T00:00:00Z",
        firstSeenAt: new Date(Date.now() - 3600000).toISOString(), isNew24h: true,
        promoterId: null, promoterName: "BEC-Tero Entertainment",
        venueId: null, venueName: "Rajamangala National Stadium",
        venueRaw: "Rajamangala National Stadium", eventUrl: "https://www.thaiticketmajor.com/concert/coldplay-2026",
        capacity: 65000, isInternational: true, isKeyVenue: true,
      },
      {
        id: "b2", name: "MAMAMOO World Tour Bangkok", platform: "ThaiTicketMajor",
        status: "PRE_SALE" as const, type: "Concert", date: "2026-07-12T00:00:00Z",
        firstSeenAt: new Date(Date.now() - 86400000 * 3).toISOString(), isNew24h: false,
        promoterId: null, promoterName: "BEC-Tero Entertainment",
        venueId: null, venueName: "Impact Arena",
        venueRaw: "Impact Arena", eventUrl: "https://www.thaiticketmajor.com/concert/mamamoo-2026",
        capacity: 12000, isInternational: true, isKeyVenue: true,
      },
    ],
    lastScrape: { completedAt: new Date(Date.now() - 3600000 * 2).toISOString(), eventsFound: 47, status: "done" as const },
    radarEvents: [],
  };
}

async function getDashboardData() {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("PASTE")) {
    return getMockData();
  }
  try {
    const { getDashboardData: queryDB } = await import("@/lib/db/queries");
    return await queryDB();
  } catch {
    return getMockData();
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div style={{ minHeight: "100vh", background: "var(--ds-bg)" }}>
      {/* Header */}
      <header
        style={{
          background: "var(--ds-surface)",
          borderBottom: "1px solid var(--ds-border)",
          padding: "0 32px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ds-text)" }}>
            Event Intelligence
          </span>
          <span
            style={{
              fontSize: 11,
              color: "var(--ds-muted)",
              background: "var(--ds-bg)",
              border: "1px solid var(--ds-border)",
              borderRadius: 20,
              padding: "2px 10px",
              fontFamily: "var(--font-geist-mono)",
            }}
          >
            Thailand Market
          </span>
        </div>
        <div className="flex items-center gap-3">
          <SearchBar />
          <ScrapeButton lastScrape={data.lastScrape} />
        </div>
      </header>

      {/* Main content */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 32px" }}>
        <div className="flex flex-col gap-6">

          {/* Daily Brief */}
          <DailyBrief
            bullets={data.dailyBrief}
            generatedAt={data.briefGeneratedAt}
          />

          {/* Market Radar — exclude venue-only platforms (supplemental sources, not ticketing) */}
          <MarketRadar events={data.radarEvents.filter((e) => !["LiveNationTero", "UOBLive", "Impact", "Thunderdome"].includes(e.platform))} />

          {/* Promoter + Venue 2-col */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PromoterGrid promoters={data.promotersSummary} />
            <VenueGrid venues={data.venueSummary} />
          </div>

          {/* Big Event Tracker */}
          <BigEventTracker events={data.bigEvents} />

        </div>
      </main>
    </div>
  );
}
