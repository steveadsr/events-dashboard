"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { StatusBadge, TypeBadge } from "./StatusBadge";
import { EventNameCell } from "./EventNameCell";
import { shortenVenue, nullSafe, isExcludedEvent } from "@/lib/utils";

interface Event {
  id: string;
  name: string;
  platform: string;
  status: "PRE_SALE" | "ON_SALE" | "SOLD_OUT" | "CANCELLED" | "COMING_SOON" | "UNKNOWN";
  type: string | null;
  date: string | null;
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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

export function MarketRadar({ events }: { events: Event[] }) {
  const router = useRouter();
  const [platformFilter, setPlatformFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [newOnly, setNewOnly] = useState(false);
  const [keyVenueOnly, setKeyVenueOnly] = useState(true);

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

  return (
    <div style={{ background: "var(--ds-surface)", border: "1px solid var(--ds-border)", borderRadius: 8 }}>
      {/* Header — single row, all controls inline */}
      <div
        className="flex items-center gap-2 px-4"
        style={{ borderBottom: "1px solid var(--ds-border)", minHeight: 48 }}
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

        {/* Platform dropdown — replaces individual chips to save space */}
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
      </div>

      {/* Table — scrollable, 10 rows visible, 25 max */}
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
                      {formatDate(event.date)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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
