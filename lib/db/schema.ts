import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uuid,
  pgEnum,
  unique,
} from "drizzle-orm/pg-core";

export const eventStatusEnum = pgEnum("event_status", [
  "PRE_SALE",
  "ON_SALE",
  "SOLD_OUT",
  "CANCELLED",
  "COMING_SOON",
  "UNKNOWN",
]);

export const scrapeStatusEnum = pgEnum("scrape_status", [
  "queued",
  "running",
  "done",
  "failed",
]);

export const signalTypeEnum = pgEnum("signal_type", [
  "PRESALE_NOTICE",
  "LAUNCH_ANNOUNCEMENT",
  "PROMO_PUSH",
  "STATUS_CHANGE",
  "OTHER",
]);

export const venues = pgTable("venues", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  canonicalName: text("canonical_name").notNull().unique(),
  capacity: integer("capacity"),
  isKeyVenue: boolean("is_key_venue").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const promoters = pgTable("promoters", {
  id: uuid("id").defaultRandom().primaryKey(),
  canonicalName: text("canonical_name").notNull(),
  platformNames: jsonb("platform_names").default({}).$type<Record<string, string>>(),
  activeEventCount: integer("active_event_count").default(0).notNull(),
  platformsActive: jsonb("platforms_active").default([]).$type<string[]>(),
  venuesUsed: jsonb("venues_used").default([]).$type<string[]>(),
  organizerPageUrl: text("organizer_page_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  unique("promoters_canonical_name_unique").on(t.canonicalName),
]);

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  platform: text("platform").notNull(),
  externalId: text("external_id"),
  name: text("name").notNull(),
  date: timestamp("date"),
  dateEnd: timestamp("date_end"),
  venueId: uuid("venue_id").references(() => venues.id),
  promoterId: uuid("promoter_id").references(() => promoters.id),
  type: text("type"),
  status: eventStatusEnum("status").default("UNKNOWN").notNull(),
  capacity: integer("capacity"),
  ticketTiers: jsonb("ticket_tiers").default([]).$type<import("../types").TicketTier[]>(),
  imageUrl: text("image_url"),
  raw: jsonb("raw"),
  firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
});

export const emailSignals = pgTable("email_signals", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").references(() => events.id),
  promoterId: uuid("promoter_id").references(() => promoters.id),
  agentmailInboxId: text("agentmail_inbox_id"),
  subject: text("subject"),
  bodyText: text("body_text"),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  signalType: signalTypeEnum("signal_type").default("OTHER").notNull(),
});

export const dailyBriefs = pgTable("daily_briefs", {
  id: uuid("id").defaultRandom().primaryKey(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  bullets: jsonb("bullets").default([]).$type<string[]>(),
  eventsCovered: integer("events_covered").default(0).notNull(),
});

export const scrapeRuns = pgTable("scrape_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobId: uuid("job_id").notNull().unique(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  status: scrapeStatusEnum("status").default("queued").notNull(),
  eventsFound: integer("events_found"),
  errors: jsonb("errors").default([]).$type<object[]>(),
});
