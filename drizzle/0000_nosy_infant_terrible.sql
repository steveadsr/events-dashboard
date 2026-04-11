CREATE TYPE "public"."event_status" AS ENUM('PRE_SALE', 'ON_SALE', 'SOLD_OUT', 'CANCELLED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."scrape_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."signal_type" AS ENUM('PRESALE_NOTICE', 'LAUNCH_ANNOUNCEMENT', 'PROMO_PUSH', 'STATUS_CHANGE', 'OTHER');--> statement-breakpoint
CREATE TABLE "daily_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"bullets" jsonb DEFAULT '[]'::jsonb,
	"events_covered" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"promoter_id" uuid,
	"agentmail_inbox_id" text,
	"subject" text,
	"body_text" text,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"signal_type" "signal_type" DEFAULT 'OTHER' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"external_id" text,
	"name" text NOT NULL,
	"date" timestamp,
	"venue_id" uuid,
	"promoter_id" uuid,
	"type" text,
	"status" "event_status" DEFAULT 'UNKNOWN' NOT NULL,
	"capacity" integer,
	"ticket_tiers" jsonb DEFAULT '[]'::jsonb,
	"image_url" text,
	"raw" jsonb,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promoters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_name" text NOT NULL,
	"platform_names" jsonb DEFAULT '{}'::jsonb,
	"active_event_count" integer DEFAULT 0 NOT NULL,
	"platforms_active" jsonb DEFAULT '[]'::jsonb,
	"venues_used" jsonb DEFAULT '[]'::jsonb,
	"organizer_page_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "promoters_canonical_name_unique" UNIQUE("canonical_name")
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"status" "scrape_status" DEFAULT 'queued' NOT NULL,
	"events_found" integer,
	"errors" jsonb DEFAULT '[]'::jsonb,
	CONSTRAINT "scrape_runs_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"canonical_name" text NOT NULL,
	"capacity" integer,
	"is_key_venue" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "venues_canonical_name_unique" UNIQUE("canonical_name")
);
--> statement-breakpoint
ALTER TABLE "email_signals" ADD CONSTRAINT "email_signals_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_signals" ADD CONSTRAINT "email_signals_promoter_id_promoters_id_fk" FOREIGN KEY ("promoter_id") REFERENCES "public"."promoters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_promoter_id_promoters_id_fk" FOREIGN KEY ("promoter_id") REFERENCES "public"."promoters"("id") ON DELETE no action ON UPDATE no action;