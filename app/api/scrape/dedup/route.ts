import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/scrape/dedup
 * Finds all same-platform duplicate events using dedupKey word overlap,
 * merges richer data into the surviving record, deletes the weaker duplicate.
 *
 * "Richer" = has imageUrl > has ticketTiers > has venueId > has promoterId > older firstSeenAt
 */

function dedupKey(name: string): string {
  // Broad skip list: articles + prepositions + words that appear in virtually every Thai event
  const SKIP_WORDS = new Set([
    "a", "an", "the", "and", "or", "in", "at", "of", "by", "for", "to", "is", "are",
    // Common event suffixes — not specific enough to identify an event
    "concert", "live", "music", "festival", "show", "tour", "event", "presents",
    "present", "bangkok", "thailand", "2026", "2025", "2024",
  ]);
  return name
    .toLowerCase()
    .replace(/[\[\](){}]/g, " ") // strip brackets
    .replace(/[^\w\s\u0E00-\u0E7F]/g, " ") // keep Thai chars
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 2 && !SKIP_WORDS.has(w))
    .slice(0, 5)
    .join(" ");
}

function richness(e: typeof events.$inferSelect): number {
  let score = 0;
  if (e.imageUrl) score += 100;
  const tiers = e.ticketTiers as unknown[];
  if (Array.isArray(tiers) && tiers.length > 0) score += 50;
  if (e.venueId) score += 20;
  if (e.promoterId) score += 10;
  const raw = e.raw as Record<string, unknown> | null;
  if (raw?.eventUrl) score += 5;
  return score;
}

// Platforms that are ticket-selling sites — cross-platform dedup runs between these
const TICKET_PLATFORMS = new Set([
  "Ticketmelon", "ThaiTicketMajor", "TheConcert", "Eventpop", "AllTicket", "TicketTier",
]);

function sameOrNearDate(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false; // both must have dates
  const diff = Math.abs(a.getTime() - b.getTime());
  return diff <= 2 * 24 * 60 * 60 * 1000; // within 2 days
}

function keyOverlap(keyA: string, keyB: string): { overlap: number; minLen: number } {
  const aWords = new Set(keyA.split(" "));
  const bWords = keyB.split(" ");
  const overlap = bWords.filter((w) => aWords.has(w)).length;
  const minLen = Math.min(aWords.size, bWords.length);
  return { overlap, minLen };
}

export async function POST() {
  // Fetch all events grouped by platform
  const allEvents = await db
    .select()
    .from(events)
    .orderBy(events.platform, events.firstSeenAt);

  // Group by platform
  const byPlatform = new Map<string, typeof allEvents>();
  for (const e of allEvents) {
    if (!byPlatform.has(e.platform)) byPlatform.set(e.platform, []);
    byPlatform.get(e.platform)!.push(e);
  }

  const duplicatePairs: Array<{ keep: string; drop: string; keepName: string; dropName: string }> = [];
  const toDelete = new Set<string>();

  // ── Pass 1: same-platform dedup ──────────────────────────────────────────
  for (const [, platformEvents] of byPlatform) {
    // Build dedupKey → events[] map
    const keyMap = new Map<string, typeof allEvents>();
    for (const e of platformEvents) {
      if (toDelete.has(e.id)) continue;
      const key = dedupKey(e.name);
      if (!key || key.split(" ").length < 2) continue;

      // Check if any existing key overlaps significantly with this one
      let matched = false;
      for (const [existingKey, group] of keyMap.entries()) {
        const { overlap, minLen } = keyOverlap(key, existingKey);
        // Require 80% word overlap AND at least 3 matching words to avoid false positives
        if (overlap >= 3 && overlap / minLen >= 0.8) {
          group.push(e);
          matched = true;
          break;
        }
      }
      if (!matched) keyMap.set(key, [e]);
    }

    // For any group with 2+ events: keep richest, delete rest
    for (const group of keyMap.values()) {
      if (group.length < 2) continue;

      group.sort((a, b) => {
        const rd = richness(b) - richness(a);
        if (rd !== 0) return rd;
        return (a.firstSeenAt?.getTime() ?? 0) - (b.firstSeenAt?.getTime() ?? 0);
      });

      const [keep, ...drops] = group;
      for (const drop of drops) {
        if (toDelete.has(drop.id)) continue;
        toDelete.add(drop.id);
        duplicatePairs.push({
          keep: keep.id, keepName: keep.name,
          drop: drop.id, dropName: drop.name,
        });
      }
    }
  }

  // ── Pass 2: cross-platform dedup between ticket platforms ─────────────────
  // Same event sold on multiple ticket sites (e.g. Ticketmelon + ThaiTicketMajor).
  // Requires: same date (±2 days) + 3+ significant word overlap at 80%.
  const ticketEvents = allEvents.filter(
    (e) => TICKET_PLATFORMS.has(e.platform) && !toDelete.has(e.id)
  );

  // Group surviving ticket events by dedupKey, then check cross-platform within each group
  const crossKeyMap = new Map<string, typeof allEvents>();
  for (const e of ticketEvents) {
    if (toDelete.has(e.id)) continue;
    const key = dedupKey(e.name);
    if (!key || key.split(" ").length < 2) continue;

    let matched = false;
    for (const [existingKey, group] of crossKeyMap.entries()) {
      const { overlap, minLen } = keyOverlap(key, existingKey);
      if (overlap >= 3 && overlap / minLen >= 0.8) {
        group.push(e);
        matched = true;
        break;
      }
    }
    if (!matched) crossKeyMap.set(key, [e]);
  }

  for (const group of crossKeyMap.values()) {
    // Only consider groups that span multiple platforms
    const platforms = new Set(group.map((e) => e.platform));
    if (platforms.size < 2) continue;

    // Within the group, find pairs that are same date
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (toDelete.has(a.id) || toDelete.has(b.id)) continue;
        if (a.platform === b.platform) continue; // already handled in pass 1
        if (!sameOrNearDate(a.date, b.date)) continue;

        // Keep the richer one
        const [keep, drop] = richness(a) >= richness(b) ? [a, b] : [b, a];
        toDelete.add(drop.id);
        duplicatePairs.push({
          keep: keep.id, keepName: keep.name,
          drop: drop.id, dropName: drop.name,
        });
        console.log(`[dedup] Cross-platform: keep "${keep.name}" (${keep.platform}) / drop "${drop.name}" (${drop.platform})`);
      }
    }
  }

  // Merge data from dropped records into keeper before deleting
  let merged = 0;
  let deleted = 0;
  for (const { keep, drop } of duplicatePairs) {
    const keeper = allEvents.find((e) => e.id === keep);
    const dropper = allEvents.find((e) => e.id === drop);
    if (!keeper || !dropper) continue;

    const keeperRaw = (keeper.raw ?? {}) as Record<string, unknown>;
    const dropperRaw = (dropper.raw ?? {}) as Record<string, unknown>;

    // Merge: fill any missing fields in keeper from dropper
    const updates: Partial<typeof events.$inferInsert> = {};
    if (!keeper.imageUrl && dropper.imageUrl) updates.imageUrl = dropper.imageUrl;
    if (!keeper.venueId && dropper.venueId) updates.venueId = dropper.venueId;
    if (!keeper.promoterId && dropper.promoterId) updates.promoterId = dropper.promoterId;
    if (!keeper.date && dropper.date) updates.date = dropper.date;
    if (!keeperRaw.eventUrl && dropperRaw.eventUrl) {
      updates.raw = { ...keeperRaw, eventUrl: dropperRaw.eventUrl };
    }

    const dropTiers = dropper.ticketTiers as unknown[];
    const keepTiers = keeper.ticketTiers as unknown[];
    if ((!keepTiers || (keepTiers as unknown[]).length === 0) && Array.isArray(dropTiers) && dropTiers.length > 0) {
      updates.ticketTiers = dropTiers as typeof events.$inferInsert["ticketTiers"];
    }

    if (Object.keys(updates).length > 0) {
      await db.update(events).set(updates).where(eq(events.id, keep));
      merged++;
    }

    // Delete the duplicate
    await db.delete(events).where(eq(events.id, drop));
    deleted++;
  }

  console.log(`[dedup] Found ${duplicatePairs.length} duplicate pairs. Merged data into ${merged} keepers. Deleted ${deleted} duplicates.`);

  return NextResponse.json({
    ok: true,
    duplicatesFound: duplicatePairs.length,
    merged,
    deleted,
    pairs: duplicatePairs.map((p) => ({ keepName: p.keepName, dropName: p.dropName })),
  });
}
