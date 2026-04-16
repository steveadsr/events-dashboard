"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge, TypeBadge, NewBadge } from "./StatusBadge";
import { EventNameCell } from "./EventNameCell";
import { shortenVenue, nullSafe, isExcludedEvent, formatDateRange } from "@/lib/utils";

interface Event {
  id: string;
  name: string;
  platform: string;
  status: "PRE_SALE" | "ON_SALE" | "SOLD_OUT" | "CANCELLED" | "COMING_SOON" | "UNKNOWN";
  type: string | null;
  date: string | null;
  dateEnd: string | null;
  firstSeenAt: string;
  imageUrl: string | null;
  promoterName: string | null;
  venueName: string | null;
  venueRaw: string | null;
  eventUrl: string | null;
  isNew24h: boolean;
  isInternational: boolean;
  isKeyVenue: boolean;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  ON_SALE:     { bg: "var(--onsale-bg)",    text: "var(--onsale-text)" },
  PRE_SALE:    { bg: "var(--presale-bg)",   text: "var(--presale-text)" },
  SOLD_OUT:    { bg: "var(--soldout-bg)",   text: "var(--soldout-text)" },
  COMING_SOON: { bg: "var(--presale-bg)",   text: "var(--presale-text)" },
  CANCELLED:   { bg: "var(--soldout-bg)",   text: "var(--soldout-text)" },
};

function ImagePlaceholder() {
  return (
    <div style={{
      width: "100%", height: "100%",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--ds-bg)",
    }}>
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ color: "var(--ds-border)" }}>
        <rect x="2" y="6" width="28" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="11" cy="13" r="2.5" fill="currentColor" />
        <path d="M2 21l8-6 6 5 5-4 9 8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function EventGridCard({ event, onClick }: { event: Event; onClick: () => void }) {
  const statusStyle = STATUS_COLORS[event.status] ?? { bg: "var(--ds-bg)", text: "var(--ds-muted)" };
  const venue = event.venueName ?? shortenVenue(event.venueRaw);

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--ds-surface)",
        border: "1px solid var(--ds-border)",
        borderRadius: 10,
        overflow: "hidden",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        transition: "border-color 100ms, box-shadow 100ms",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--ds-accent)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--ds-border)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      {/* Image area */}
      <div style={{ position: "relative", height: 160, flexShrink: 0, overflow: "hidden" }}>
        {event.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <ImagePlaceholder />
        )}
        {/* Overlay badges */}
        <div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {event.isNew24h && <NewBadge />}
          {event.isKeyVenue && (
            <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 20, background: "rgba(0,0,0,0.55)", color: "#fff", textTransform: "uppercase", letterSpacing: "0.4px" }}>
              Key Venue
            </span>
          )}
        </div>
        {/* Status badge bottom-right */}
        <div style={{ position: "absolute", bottom: 8, right: 8 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 20,
            background: statusStyle.bg, color: statusStyle.text,
            textTransform: "uppercase", letterSpacing: "0.5px",
          }}>
            {event.status.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "10px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: "var(--ds-text)",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {event.name}
        </div>
        {venue && (
          <div style={{
            fontSize: 11, color: "var(--ds-muted)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {venue}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 6 }}>
          <span style={{ fontSize: 11, color: "var(--ds-muted)", fontFamily: "var(--font-geist-mono)" }}>
            {formatDate(event.date, event.dateEnd)}
          </span>
          <span style={{ fontSize: 10, color: "var(--ds-xmuted)", fontFamily: "var(--font-geist-mono)" }}>
            {event.platform}
          </span>
        </div>
      </div>
    </div>
  );
}

const ALL_PLATFORMS = [
  "All",
  "ThaiTicketMajor", "Ticketmelon", "TheConcert", "Eventpop", "AllTicket", "TicketTier",
];

/** Venue cell: shortened/translated name; hover shows full original in native tooltip */
function VenueCell({ venueName, venueRaw }: { venueName: string | null; venueRaw: string | null }) {
  const display = venueName ?? shortenVenue(venueRaw);
  const tooltip = !venueName && venueRaw && venueRaw !== display ? venueRaw : undefined;

  if (!display) return <span style={{ color: "var(--ds-xmuted)", fontSize: 13 }}>—</span>;

  return (
    <span
      title={tooltip}
      style={{
        display: "block",
        fontSize: 13,
        color: "var(--ds-text)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: 200,
      }}
    >
      {display}
    </span>
  );
}
const STATUSES = ["All", "ON_SALE", "PRE_SALE", "COMING_SOON", "SOLD_OUT", "CANCELLED"];

// formatDate kept for legacy; card/table now use formatDateRange from utils
function formatDate(iso: string | null, isoEnd?: string | null): string {
  return formatDateRange(iso, isoEnd);
}

export function EventsInfiniteList({ viewMode = "table" }: { viewMode?: "table" | "cards" }) {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [platform, setPlatform] = useState("All");
  const [status, setStatus] = useState("All");
  const [keyVenue, setKeyVenue] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);

  const fetchPage = useCallback(async (cursor?: string, plt = platform, st = status, kv = keyVenue, reset = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      if (plt !== "All") params.set("platform", plt);
      if (st !== "All") params.set("status", st);
      if (kv) params.set("keyVenue", "1");

      const res = await fetch(`/api/events?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json() as { events: Event[]; nextCursor: string | null; hasMore: boolean };

      const clean = data.events.filter((e) => !isExcludedEvent(e.name, e.type));
      setEvents((prev) => reset ? clean : [...prev, ...clean]);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error("[EventsInfiniteList] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [platform, status, keyVenue]);

  // Initial load
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      fetchPage(undefined, platform, status, keyVenue, true);
    }
  }, [fetchPage, platform, status, keyVenue]);

  // Reset + reload when filters change
  useEffect(() => {
    if (!isFirstLoad.current) {
      fetchPage(undefined, platform, status, keyVenue, true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, status, keyVenue]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && nextCursor) {
          fetchPage(nextCursor, platform, status, keyVenue);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, nextCursor, fetchPage, platform, status]);

  return (
    <div>
      {/* Sticky filter bar — sits just below the 56px page header */}
      <div
        className="flex items-center gap-2 flex-wrap"
        style={{
          position: "sticky",
          top: 56,
          zIndex: 8,
          background: "var(--ds-surface)",
          paddingTop: 12,
          paddingBottom: 12,
          borderBottom: "1px solid var(--ds-border)",
        }}
      >
        {/* Key Venues chip */}
        <button
          onClick={() => setKeyVenue(!keyVenue)}
          style={{
            background: keyVenue ? "var(--venue-text)" : "var(--ds-surface)",
            border: `1px solid ${keyVenue ? "var(--venue-text)" : "var(--ds-border)"}`,
            color: keyVenue ? "#fff" : "var(--ds-muted)",
            borderRadius: 20,
            padding: "4px 14px",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 100ms",
          }}
        >
          Key Venues
        </button>

        {/* Platform chips */}
        {ALL_PLATFORMS.map((p) => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            style={{
              background: platform === p ? "var(--ds-text)" : "var(--ds-surface)",
              border: `1px solid ${platform === p ? "var(--ds-text)" : "var(--ds-border)"}`,
              color: platform === p ? "#fff" : "var(--ds-muted)",
              borderRadius: 20,
              padding: "4px 14px",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 100ms",
            }}
          >
            {p}
          </button>
        ))}

        {/* Status dropdown */}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{
            border: "1px solid var(--ds-border)",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 12,
            color: "var(--ds-text)",
            background: "var(--ds-surface)",
            cursor: "pointer",
            marginLeft: "auto",
          }}
        >
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Card grid */}
      {viewMode === "cards" && (
        <div style={{ padding: "16px 0" }}>
          {events.length === 0 && !loading ? (
            <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--ds-muted)", fontSize: 14 }}>
              No events found.
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 16,
            }}>
              {events.map((event) => (
                <EventGridCard
                  key={event.id}
                  event={event}
                  onClick={() => router.push(`/events/${event.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {viewMode === "table" && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Event", "Platform", "Promoter", "Venue", "Status", "Type", "Date"].map((col) => (
                  <th
                    key={col}
                    className="col-header"
                    style={{
                      padding: "10px 12px",
                      textAlign: "left",
                      borderBottom: "1px solid var(--ds-border)",
                      borderTop: "1px solid var(--ds-border)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && !loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: "48px 16px", textAlign: "center", color: "var(--ds-muted)", fontSize: 14 }}>
                    No events found.
                  </td>
                </tr>
              ) : (
                events.map((event, i) => (
                  <tr
                    key={event.id}
                    style={{
                      borderBottom: i < events.length - 1 ? "1px solid var(--ds-border-light)" : "none",
                      cursor: "pointer",
                      transition: "background 100ms",
                    }}
                    onClick={() => router.push(`/events/${event.id}`)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ds-accent-bg)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  >
                    <td style={{ padding: "10px 12px", maxWidth: 300 }}>
                      <EventNameCell
                        id={event.id}
                        name={event.name}
                        eventUrl={event.eventUrl}
                        isNew24h={event.isNew24h}
                        isInternational={event.isInternational}
                        isKeyVenue={event.isKeyVenue}
                      />
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--ds-muted)", whiteSpace: "nowrap" }}>
                      {event.platform}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 13, color: "var(--ds-text)", whiteSpace: "nowrap" }}>
                      {nullSafe(event.promoterName) ?? <span style={{ color: "var(--ds-xmuted)" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 12px", maxWidth: 200 }}>
                      <VenueCell venueName={nullSafe(event.venueName)} venueRaw={event.venueRaw} />
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <StatusBadge status={event.status} />
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      {event.type
                        ? <TypeBadge type={event.type} />
                        : <span style={{ color: "var(--ds-xmuted)", fontSize: 13 }}>—</span>
                      }
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap", fontFamily: "var(--font-geist-mono)", fontSize: 12, color: "var(--ds-muted)" }}>
                      {formatDate(event.date, event.dateEnd)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} style={{ height: 1 }} />

      {/* Loading indicator */}
      {loading && (
        <div style={{ padding: "20px 16px", textAlign: "center" }}>
          <span
            style={{
              display: "inline-block",
              width: 16,
              height: 16,
              border: "2px solid var(--ds-border)",
              borderTopColor: "var(--ds-accent)",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
        </div>
      )}

      {/* End of list */}
      {!hasMore && events.length > 0 && (
        <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12, color: "var(--ds-xmuted)" }}>
          {events.length} events total
        </div>
      )}
    </div>
  );
}
