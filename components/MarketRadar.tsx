"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  imageUrl: string | null;
  promoterId: string | null;
  promoterName: string | null;
  venueId: string | null;
  venueName: string | null;
  venueRaw: string | null;
  eventUrl: string | null;
  isNew24h: boolean;
  isInternational: boolean;
  isKeyVenue: boolean;
}

const STATUSES = ["All", "ON_SALE", "PRE_SALE", "COMING_SOON", "SOLD_OUT"];

const CELL_LINK_STYLE: React.CSSProperties = {
  fontSize: 13,
  color: "var(--ds-text)",
  textDecoration: "none",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  display: "block",
};

const STATUS_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  ON_SALE:     { bg: "var(--onsale-bg)",  text: "var(--onsale-text)" },
  PRE_SALE:    { bg: "var(--presale-bg)", text: "var(--presale-text)" },
  SOLD_OUT:    { bg: "var(--soldout-bg)", text: "var(--soldout-text)" },
  COMING_SOON: { bg: "var(--presale-bg)", text: "var(--presale-text)" },
  CANCELLED:   { bg: "var(--soldout-bg)", text: "var(--soldout-text)" },
  UNKNOWN:     { bg: "var(--ds-bg)",      text: "var(--ds-muted)" },
};

// Table/card toggle icons
function TableIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ color: active ? "var(--ds-accent)" : "var(--ds-muted)" }}>
      <rect x="1" y="1" width="13" height="3" rx="1" fill="currentColor" opacity={active ? 1 : 0.5} />
      <rect x="1" y="6" width="13" height="3" rx="1" fill="currentColor" opacity={active ? 1 : 0.5} />
      <rect x="1" y="11" width="13" height="3" rx="1" fill="currentColor" opacity={active ? 1 : 0.5} />
    </svg>
  );
}

function CardsIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ color: active ? "var(--ds-accent)" : "var(--ds-muted)" }}>
      <rect x="1" y="1" width="6" height="7" rx="1.5" fill="currentColor" opacity={active ? 1 : 0.5} />
      <rect x="9" y="1" width="5" height="7" rx="1.5" fill="currentColor" opacity={active ? 1 : 0.5} />
      <rect x="1" y="10" width="4" height="4" rx="1.5" fill="currentColor" opacity={active ? 1 : 0.5} />
      <rect x="7" y="10" width="7" height="4" rx="1.5" fill="currentColor" opacity={active ? 1 : 0.5} />
    </svg>
  );
}

/** Placeholder shown when an event has no image */
function ImagePlaceholder() {
  return (
    <div style={{
      width: "100%", height: "100%",
      background: "linear-gradient(135deg, var(--ds-bg) 0%, #EDE9E4 100%)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 6,
    }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: "var(--ds-border)" }}>
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
        <path d="M3 15l5-4 4 3.5 3-2.5 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <span style={{ fontSize: 9, color: "var(--ds-xmuted)", fontWeight: 500, letterSpacing: "0.5px", textTransform: "uppercase" }}>
        No image
      </span>
    </div>
  );
}

/** Single event card for the carousel */
function EventCard({ event, onClick }: { event: Event; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const venue = event.venueName ?? shortenVenue(event.venueRaw);
  const statusStyle = STATUS_BADGE_COLORS[event.status] ?? STATUS_BADGE_COLORS.UNKNOWN;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flexShrink: 0,
        width: 168,
        borderRadius: 10,
        border: `1px solid ${hovered ? "var(--ds-border)" : "var(--ds-border-light)"}`,
        background: "var(--ds-surface)",
        cursor: "pointer",
        overflow: "hidden",
        boxShadow: hovered ? "0 4px 16px rgba(0,0,0,0.10)" : "0 1px 3px rgba(0,0,0,0.04)",
        transform: hovered ? "translateY(-1px)" : "none",
        transition: "box-shadow 150ms, transform 150ms, border-color 150ms",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Image area */}
      <div style={{ position: "relative", width: "100%", height: 192, flexShrink: 0, overflow: "hidden" }}>
        {event.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.imageUrl}
            alt={event.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <ImagePlaceholder />
        )}

        {/* Status badge — top-right overlay */}
        <span style={{
          position: "absolute", top: 7, right: 7,
          fontSize: 9, fontWeight: 700, padding: "2px 6px",
          borderRadius: 20, letterSpacing: "0.5px", textTransform: "uppercase",
          background: statusStyle.bg, color: statusStyle.text,
          backdropFilter: "blur(4px)",
        }}>
          {event.status.replace(/_/g, " ")}
        </span>

        {/* NEW badge — top-left */}
        {event.isNew24h && (
          <div style={{ position: "absolute", top: 7, left: 7 }}>
            <NewBadge />
          </div>
        )}

        {/* Key venue indicator */}
        {event.isKeyVenue && (
          <span style={{
            position: "absolute", bottom: 7, left: 7,
            fontSize: 9, fontWeight: 600, padding: "2px 6px",
            borderRadius: 20, letterSpacing: "0.4px",
            background: "var(--venue-bg)", color: "var(--venue-text)",
          }}>
            Key Venue
          </span>
        )}
      </div>

      {/* Content area */}
      <div style={{ padding: "10px 11px 11px", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        {/* Event name */}
        <div style={{
          fontSize: 12, fontWeight: 600, color: "var(--ds-text)",
          lineHeight: 1.35,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {event.name}
        </div>

        {/* Venue */}
        {venue && (
          <div style={{
            fontSize: 11, color: "var(--ds-muted)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {venue}
          </div>
        )}

        {/* Date + platform */}
        <div style={{
          marginTop: "auto", paddingTop: 6,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 11, fontFamily: "var(--font-geist-mono)", color: "var(--ds-muted)" }}>
            {formatDateRange(event.date, event.dateEnd)}
          </span>
          <span style={{ fontSize: 10, color: "var(--ds-xmuted)", fontFamily: "var(--font-geist-mono)" }}>
            {event.platform}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Venue cell: shows shortened/translated name; links to venue page if id available */
function VenueCell({ venueName, venueRaw, venueId }: { venueName: string | null; venueRaw: string | null; venueId: string | null }) {
  const display = venueName ?? shortenVenue(venueRaw);
  const tooltip = !venueName && venueRaw && venueRaw !== display ? venueRaw : undefined;

  if (!display) return <span style={{ color: "var(--ds-xmuted)", fontSize: 13 }}>—</span>;

  if (venueId) {
    return (
      <Link
        href={`/venues/${venueId}`}
        title={tooltip}
        onClick={(e) => e.stopPropagation()}
        style={{ ...CELL_LINK_STYLE, maxWidth: 180 }}
        onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
        onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
      >
        {display}
      </Link>
    );
  }

  return (
    <span title={tooltip} style={{ ...CELL_LINK_STYLE, maxWidth: 180 }}>
      {display}
    </span>
  );
}

function formatDate(iso: string | null, isoEnd?: string | null): string {
  return formatDateRange(iso, isoEnd);
}

export function MarketRadar({ events }: { events: Event[] }) {
  const router = useRouter();
  const [platformFilter, setPlatformFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [newOnly, setNewOnly] = useState(false);
  const [keyVenueOnly, setKeyVenueOnly] = useState(true);
  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");

  // Derive unique platforms from actual event data
  const platforms = useMemo(() => {
    const unique = [...new Set(events.map((e) => e.platform))].sort();
    return ["All", ...unique];
  }, [events]);

  const filtered = events.filter((e) => {
    if (isExcludedEvent(e.name, e.type)) return false;
    if (platformFilter !== "All" && e.platform !== platformFilter) return false;
    if (statusFilter !== "All" && e.status !== statusFilter) return false;
    if (newOnly && !e.isNew24h) return false;
    if (keyVenueOnly && !e.isKeyVenue) return false;
    return true;
  });

  // Show max 25 in the dashboard widget
  const visible = filtered.slice(0, 25);
  const totalCount = filtered.length;

  const iconBtnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? "var(--ds-accent-bg)" : "transparent",
    border: `1px solid ${active ? "var(--ds-accent)" : "var(--ds-border)"}`,
    borderRadius: 6,
    width: 28, height: 28,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer",
    padding: 0,
    transition: "background 100ms, border-color 100ms",
  });

  return (
    <div style={{ background: "var(--ds-surface)", border: "1px solid var(--ds-border)", borderRadius: 8 }}>
      {/* Header — single row, all controls inline */}
      <div
        className="flex items-center gap-2 px-4"
        style={{ borderBottom: "1px solid var(--ds-border)", minHeight: 48, flexWrap: "nowrap" }}
      >
        {/* Left: label + count + see-all */}
        <span className="label-xs" style={{ whiteSpace: "nowrap" }}>Market Radar</span>
        <span
          style={{
            background: "var(--ds-bg)",
            border: "1px solid var(--ds-border)",
            borderRadius: 20,
            fontSize: 11,
            fontFamily: "var(--font-geist-mono)",
            color: "var(--ds-muted)",
            padding: "1px 7px",
            whiteSpace: "nowrap",
          }}
        >
          {totalCount}
        </span>
        <Link
          href="/events"
          style={{ fontSize: 11, color: "var(--ds-accent)", textDecoration: "none", fontWeight: 500, whiteSpace: "nowrap" }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
        >
          See all →
        </Link>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* New 24h chip */}
        <button
          onClick={() => setNewOnly(!newOnly)}
          style={{
            background: newOnly ? "var(--ds-accent)" : "var(--ds-surface)",
            border: `1px solid ${newOnly ? "var(--ds-accent)" : "var(--ds-border)"}`,
            color: newOnly ? "#fff" : "var(--ds-muted)",
            borderRadius: 20,
            padding: "3px 10px",
            fontSize: 11,
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          New 24h
        </button>

        {/* Key Venue chip */}
        <button
          onClick={() => setKeyVenueOnly(!keyVenueOnly)}
          style={{
            background: keyVenueOnly ? "var(--venue-text)" : "var(--ds-surface)",
            border: `1px solid ${keyVenueOnly ? "var(--venue-text)" : "var(--ds-border)"}`,
            color: keyVenueOnly ? "#fff" : "var(--ds-muted)",
            borderRadius: 20,
            padding: "3px 10px",
            fontSize: 11,
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Key Venue
        </button>

        {/* Platform dropdown */}
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          style={{
            border: "1px solid var(--ds-border)",
            borderRadius: 6,
            padding: "3px 6px",
            fontSize: 11,
            color: "var(--ds-text)",
            background: "var(--ds-surface)",
            cursor: "pointer",
          }}
        >
          {platforms.map((p) => <option key={p}>{p}</option>)}
        </select>

        {/* Status dropdown */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            border: "1px solid var(--ds-border)",
            borderRadius: 6,
            padding: "3px 6px",
            fontSize: 11,
            color: "var(--ds-text)",
            background: "var(--ds-surface)",
            cursor: "pointer",
          }}
        >
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>

        {/* View toggle */}
        <div style={{ display: "flex", gap: 4, marginLeft: 4 }}>
          <button
            onClick={() => setViewMode("table")}
            style={iconBtnStyle(viewMode === "table")}
            title="Table view"
          >
            <TableIcon active={viewMode === "table"} />
          </button>
          <button
            onClick={() => setViewMode("cards")}
            style={iconBtnStyle(viewMode === "cards")}
            title="Card view"
          >
            <CardsIcon active={viewMode === "cards"} />
          </button>
        </div>
      </div>

      {/* Card carousel view */}
      {viewMode === "cards" && (
        <div style={{ padding: "16px 16px 20px" }}>
          {visible.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ds-muted)", fontSize: 14 }}>
              No events match the current filters.
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                gap: 12,
                overflowX: "auto",
                paddingBottom: 8,
                scrollbarWidth: "thin",
                scrollbarColor: "var(--ds-border) transparent",
              }}
            >
              {visible.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onClick={() => {
                    if (event.eventUrl) window.open(event.eventUrl, "_blank", "noopener");
                    else router.push(`/events/${event.id}`);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Table view */}
      {viewMode === "table" && (
        <div style={{ overflowX: "auto" }}>
          <div className="market-radar-scroll" style={{ overflowY: "scroll", maxHeight: 460 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    background: "var(--ds-bg)",
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  {["Event", "Platform", "Promoter", "Venue", "Status", "Type", "Date"].map((col) => (
                    <th
                      key={col}
                      className="col-header"
                      style={{
                        padding: "8px 12px",
                        textAlign: "left",
                        borderBottom: "1px solid var(--ds-border)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "32px 16px", textAlign: "center", color: "var(--ds-muted)", fontSize: 14 }}>
                      No events match the current filters.
                    </td>
                  </tr>
                ) : (
                  visible.map((event, i) => (
                    <tr
                      key={event.id}
                      style={{
                        borderBottom: i < visible.length - 1 ? "1px solid var(--ds-border-light)" : "none",
                        cursor: "pointer",
                        transition: "background 100ms",
                      }}
                      onClick={() => router.push(`/events/${event.id}`)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ds-accent-bg)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <td style={{ padding: "10px 12px", maxWidth: 280 }}>
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
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        {event.promoterId && nullSafe(event.promoterName) ? (
                          <Link
                            href={`/promoters/${event.promoterId}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ ...CELL_LINK_STYLE }}
                            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                          >
                            {event.promoterName}
                          </Link>
                        ) : (
                          <span style={{ fontSize: 13, color: nullSafe(event.promoterName) ? "var(--ds-text)" : "var(--ds-xmuted)" }}>
                            {nullSafe(event.promoterName) ?? "—"}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", maxWidth: 180 }}>
                        <VenueCell venueName={nullSafe(event.venueName)} venueRaw={event.venueRaw} venueId={event.venueId} />
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        <StatusBadge status={event.status} />
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        {event.type ? <TypeBadge type={event.type} /> : <span style={{ color: "var(--ds-xmuted)", fontSize: 13 }}>—</span>}
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
        </div>
      )}

      {/* See all footer bar */}
      <Link
        href="/events"
        style={{
          display: "block",
          borderTop: "1px solid var(--ds-border)",
          padding: "10px 16px",
          textAlign: "center",
          fontSize: 12,
          fontWeight: 500,
          color: "var(--ds-accent)",
          textDecoration: "none",
          transition: "background 100ms",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ds-accent-bg)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
      >
        See all events →
      </Link>
    </div>
  );
}
