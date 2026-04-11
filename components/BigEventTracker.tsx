"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "./StatusBadge";
import { shortenVenue, nullSafe, isExcludedEvent } from "@/lib/utils";

interface BigEvent {
  id: string;
  name: string;
  platform: string;
  status: "PRE_SALE" | "ON_SALE" | "SOLD_OUT" | "CANCELLED" | "COMING_SOON" | "UNKNOWN";
  type: string | null;
  date: string | null;
  firstSeenAt: string;
  isNew24h: boolean;
  promoterId: string | null;
  promoterName: string | null;
  venueId: string | null;
  venueName: string | null;
  venueRaw: string | null;
  eventUrl: string | null;
  capacity: number | null;
  isInternational: boolean;
  isKeyVenue: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function BigEventTracker({ events }: { events: BigEvent[] }) {
  const router = useRouter();
  const [newOnly, setNewOnly] = useState(false);
  const [keyVenueOnly, setKeyVenueOnly] = useState(true);

  const filtered = events.filter((e) => {
    if (isExcludedEvent(e.name, e.type)) return false;
    if (newOnly && !e.isNew24h) return false;
    if (keyVenueOnly && !e.isKeyVenue) return false;
    return true;
  });

  const chipStyle = (active: boolean, activeColor = "var(--ds-accent)"): React.CSSProperties => ({
    background: active ? activeColor : "var(--ds-surface)",
    border: `1px solid ${active ? activeColor : "var(--ds-border)"}`,
    color: active ? "#fff" : "var(--ds-muted)",
    borderRadius: 20,
    padding: "3px 10px",
    fontSize: 11,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ background: "var(--ds-surface)", border: "1px solid var(--ds-border)", borderRadius: 8 }}>
      <div className="flex items-center gap-2 px-4" style={{ borderBottom: "1px solid var(--ds-border)", minHeight: 48 }}>
        <span className="label-xs" style={{ whiteSpace: "nowrap" }}>Big Event Tracker</span>
        <span style={{
          background: "var(--ds-bg)", border: "1px solid var(--ds-border)", borderRadius: 20,
          fontSize: 11, fontFamily: "var(--font-geist-mono)", color: "var(--ds-muted)", padding: "1px 7px",
        }}>
          {filtered.length}
        </span>
        <div style={{ flex: 1 }} />
        <button style={chipStyle(newOnly)} onClick={() => setNewOnly(!newOnly)}>New 24h</button>
        <button style={chipStyle(keyVenueOnly, "var(--venue-text)")} onClick={() => setKeyVenueOnly(!keyVenueOnly)}>Key Venue</button>
      </div>
      {filtered.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--ds-muted)", fontSize: 14 }}>
          No events match the current filters.
        </div>
      ) : (
        <div>
          {filtered.map((event, i) => {
            const venueDisplay = nullSafe(event.venueName) ?? shortenVenue(event.venueRaw);
            return (
              <div
                key={event.id}
                style={{
                  padding: "14px 16px",
                  borderBottom: i < filtered.length - 1 ? "1px solid var(--ds-border-light)" : "none",
                  background: event.isKeyVenue ? "var(--venue-bg)" : undefined,
                  cursor: "pointer",
                  transition: "background 100ms",
                }}
                onClick={() => router.push(`/events/${event.id}`)}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ds-accent-bg)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = event.isKeyVenue ? "var(--venue-bg)" : "")}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 4 }}>
                      <Link
                        href={`/events/${event.id}`}
                        className="big-event-name-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {event.name}
                      </Link>
                      {event.isNew24h && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                          background: "var(--ds-accent)", color: "#fff",
                          borderRadius: 4, padding: "1px 5px",
                        }}>NEW</span>
                      )}
                      {event.eventUrl && (
                        <a
                          href={event.eventUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open on ticketing site"
                          style={{ fontSize: 11, color: "var(--ds-xmuted)", textDecoration: "none" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--ds-accent)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ds-xmuted)")}
                          onClick={(e) => e.stopPropagation()}
                        >↗</a>
                      )}
                      {event.isInternational && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, letterSpacing: "0.05em",
                          background: "var(--ds-accent-bg)", color: "var(--ds-accent)",
                          border: "1px solid var(--ds-accent)", borderRadius: 4, padding: "1px 5px",
                        }}>INTL</span>
                      )}
                      {event.isKeyVenue && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px",
                          color: "var(--venue-text)", background: "var(--venue-bg)",
                          border: "1px solid var(--venue-border)", borderRadius: 4, padding: "1px 5px",
                        }}>Key Venue</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {nullSafe(event.promoterName) && (
                        event.promoterId ? (
                          <Link
                            href={`/promoters/${event.promoterId}`}
                            className="big-event-meta-link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {nullSafe(event.promoterName)}
                          </Link>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--ds-muted)" }}>{nullSafe(event.promoterName)}</span>
                        )
                      )}
                      {venueDisplay && (
                        <span
                          title={!event.venueName && event.venueRaw && event.venueRaw !== venueDisplay ? event.venueRaw : undefined}
                        >
                          {event.venueId ? (
                            <Link
                              href={`/venues/${event.venueId}`}
                              className="big-event-meta-link"
                              style={{ fontWeight: event.isKeyVenue ? 500 : 400, color: event.isKeyVenue ? "var(--venue-text)" : undefined }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              @ {venueDisplay}
                            </Link>
                          ) : (
                            <span style={{
                              fontSize: 12,
                              color: event.isKeyVenue ? "var(--venue-text)" : "var(--ds-muted)",
                              fontWeight: event.isKeyVenue ? 500 : 400,
                            }}>
                              @ {venueDisplay}
                            </span>
                          )}
                        </span>
                      )}
                      {event.capacity && (
                        <span style={{ fontSize: 12, color: "var(--ds-xmuted)", fontFamily: "var(--font-geist-mono)" }}>
                          {event.capacity.toLocaleString()} cap
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <StatusBadge status={event.status} />
                    <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: 12, color: "var(--ds-muted)", whiteSpace: "nowrap" }}>
                      {formatDate(event.date)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
