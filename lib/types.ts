export type EventStatus = "PRE_SALE" | "ON_SALE" | "SOLD_OUT" | "CANCELLED" | "COMING_SOON" | "UNKNOWN";

export type TierStatus = "on_sale" | "sold_out" | "sale_ended" | "unavailable" | "unknown";

export interface TicketTier {
  name: string;
  priceThb: number | null;
  status: TierStatus;
  remaining: number | null;
}
export type ScrapeStatus = "queued" | "running" | "done" | "failed";
export type SignalType = "PRESALE_NOTICE" | "LAUNCH_ANNOUNCEMENT" | "PROMO_PUSH" | "STATUS_CHANGE" | "OTHER";

export interface DashboardEvent {
  id: string;
  name: string;
  platform: string;
  status: EventStatus;
  type: string | null;
  date: Date | null;
  firstSeenAt: Date;
  promoterName: string | null;
  venueName: string | null;
  isNew24h: boolean;
  isInternational: boolean;
  isKeyVenue: boolean;
}

export interface PromoterSummary {
  id: string;
  canonicalName: string;
  activeEventCount: number;
  platformsActive: string[];
  venuesUsed: string[];
}

export interface VenueSummary {
  id: string;
  canonicalName: string;
  isKeyVenue: boolean;
  capacity: number | null;
  eventCount: number;
}

export interface BigEvent {
  id: string;
  name: string;
  platform: string;
  status: EventStatus;
  type: string | null;
  date: Date | null;
  promoterName: string | null;
  venueName: string | null;
  capacity: number | null;
}

export interface EventDetail {
  id: string;
  name: string;
  platform: string;
  status: EventStatus;
  type: string | null;
  date: string | null;
  dateEnd: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  imageUrl: string | null;
  ticketTiers: TicketTier[];
  eventUrl: string | null;
  promoterId: string | null;
  promoterName: string | null;
  venueId: string | null;
  venueName: string | null;
  isInternational: boolean;
}

export interface PromoterDetail {
  id: string;
  canonicalName: string;
  activeEventCount: number;
  platformsActive: string[];
  venuesUsed: string[];
  organizerPageUrl: string | null;
  events: Array<{
    id: string;
    name: string;
    platform: string;
    status: EventStatus;
    type: string | null;
    date: string | null;
    venueName: string | null;
    isInternational: boolean;
  }>;
}

export interface DashboardData {
  dailyBrief: string[];
  briefGeneratedAt: Date | null;
  newEvents: DashboardEvent[];
  promotersSummary: PromoterSummary[];
  venueSummary: VenueSummary[];
  bigEvents: BigEvent[];
  lastScrape: {
    completedAt: Date | null;
    eventsFound: number | null;
    status: ScrapeStatus;
  } | null;
}
