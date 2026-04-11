"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isExcludedEvent } from "@/lib/utils";

interface CalEvent {
  id: string;
  name: string;
  platform: string;
  status: string;
  type: string | null;
  date: string | null;
  promoterId: string | null;
  promoterName: string | null;
  venueId: string | null;
  venueName: string | null;
  venueRaw: string | null;
  eventUrl: string | null;
  isKeyVenue: boolean;
}

const TICKET_PLATFORMS = [
  "ThaiTicketMajor", "Ticketmelon", "TheConcert", "Eventpop", "AllTicket", "TicketTier",
];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function statusColor(status: string): string {
  switch (status) {
    case "ON_SALE":     return "#16a34a";
    case "PRE_SALE":    return "var(--ds-accent)";
    case "COMING_SOON": return "#d97706";
    case "SOLD_OUT":    return "#dc2626";
    case "CANCELLED":   return "var(--ds-xmuted)";
    default:            return "var(--ds-muted)";
  }
}

function statusBg(status: string): string {
  switch (status) {
    case "ON_SALE":     return "#dcfce7";
    case "PRE_SALE":    return "var(--ds-accent-bg)";
    case "COMING_SOON": return "#fef3c7";
    case "SOLD_OUT":    return "#fee2e2";
    case "CANCELLED":   return "var(--ds-bg)";
    default:            return "var(--ds-bg)";
  }
}

/** Build calendar grid: array of 6 rows × 7 cols, each cell is a Date or null (padding) */
function buildGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month - 1, 1);
  // Monday = 0, Sunday = 6
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month - 1, i + 1)),
  ];

  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const grid: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) grid.push(cells.slice(i, i + 7));
  return grid;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function CalendarView() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rawEvents, setRawEvents] = useState<CalEvent[]>([]);
  const [allKeyVenues, setAllKeyVenues] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [platformFilter, setPlatformFilter] = useState("");
  const [venueFilter, setVenueFilter] = useState("");
  const [promoterFilter, setPromoterFilter] = useState("");

  // Fetch events + key venues when month changes
  useEffect(() => {
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    setLoading(true);
    fetch(`/api/events/calendar?month=${monthStr}`)
      .then((r) => r.json())
      .then((data: { events: CalEvent[]; keyVenues: string[] }) => {
        setRawEvents(data.events ?? []);
        setAllKeyVenues(data.keyVenues ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [year, month]);

  // Venue options: all key venues (always) + any extra venues from this month's events
  const venueOptions = useMemo(() => {
    const fromEvents = rawEvents.map((e) => e.venueName).filter(Boolean) as string[];
    const combined = [...new Set([...allKeyVenues, ...fromEvents])].sort();
    return combined;
  }, [rawEvents, allKeyVenues]);

  // Promoter options derived from this month's events
  const promoterOptions = useMemo(() => {
    const names = [...new Set(rawEvents.map((e) => e.promoterName).filter(Boolean) as string[])].sort();
    return names;
  }, [rawEvents]);

  // Apply filters + exclusions
  const events = useMemo(() => rawEvents.filter((e) => {
    if (isExcludedEvent(e.name, e.type)) return false;
    if (platformFilter && e.platform !== platformFilter) return false;
    if (venueFilter && e.venueName !== venueFilter) return false;
    if (promoterFilter && e.promoterName !== promoterFilter) return false;
    return true;
  }), [rawEvents, platformFilter, venueFilter, promoterFilter]);

  // Map day string → events
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events) {
      if (!e.date) continue;
      const day = e.date.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(e);
    }
    return map;
  }, [events]);

  const grid = useMemo(() => buildGrid(year, month), [year, month]);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const today = isoDay(new Date());

  const selStyle: React.CSSProperties = {
    border: "1px solid var(--ds-border)",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: 12,
    color: "var(--ds-text)",
    background: "var(--ds-surface)",
    cursor: "pointer",
    height: 30,
  };

  const navBtn: React.CSSProperties = {
    ...selStyle,
    padding: "0 12px",
    fontWeight: 600,
    fontSize: 16,
    lineHeight: "28px",
    display: "flex",
    alignItems: "center",
  };

  return (
    <div>
      {/* Controls bar — single row */}
      <div
        style={{
          position: "sticky",
          top: 56,
          zIndex: 8,
          background: "var(--ds-surface)",
          borderBottom: "1px solid var(--ds-border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 16px",
          flexWrap: "nowrap",
          overflow: "visible",
        }}
      >
        {/* Month navigation */}
        <button onClick={prevMonth} style={navBtn} aria-label="Previous month">‹</button>
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--ds-text)",
          whiteSpace: "nowrap",
          minWidth: 120,
          textAlign: "center",
        }}>
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button onClick={nextMonth} style={navBtn} aria-label="Next month">›</button>

        <div style={{ width: 1, height: 20, background: "var(--ds-border)", margin: "0 4px", flexShrink: 0 }} />

        {/* Platform dropdown */}
        <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} style={selStyle}>
          <option value="">All Sites</option>
          {TICKET_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        {/* Venue dropdown — always shows all key venues */}
        <select value={venueFilter} onChange={(e) => setVenueFilter(e.target.value)} style={selStyle}>
          <option value="">All Venues</option>
          {venueOptions.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        {/* Promoter dropdown */}
        <select value={promoterFilter} onChange={(e) => setPromoterFilter(e.target.value)} style={selStyle}>
          <option value="">All Promoters</option>
          {promoterOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        {loading && (
          <span style={{ fontSize: 11, color: "var(--ds-muted)", marginLeft: 4, whiteSpace: "nowrap" }}>Loading…</span>
        )}
      </div>

      {/* Calendar grid */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 700 }}>
          <thead>
            <tr>
              {DAY_LABELS.map((d) => (
                <th
                  key={d}
                  style={{
                    padding: "8px 10px",
                    textAlign: "left",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: "var(--ds-muted)",
                    borderBottom: "1px solid var(--ds-border)",
                    background: "var(--ds-bg)",
                  }}
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((week, wi) => (
              <tr key={wi}>
                {week.map((day, di) => {
                  const key = day ? isoDay(day) : `pad-${wi}-${di}`;
                  const dayEvents = day ? (eventsByDay.get(isoDay(day)) ?? []) : [];
                  const isToday = day ? isoDay(day) === today : false;
                  const isPast = day ? isoDay(day) < today : false;

                  return (
                    <td
                      key={key}
                      style={{
                        verticalAlign: "top",
                        padding: "6px 8px",
                        border: "1px solid var(--ds-border-light)",
                        minHeight: 90,
                        height: 90,
                        background: !day ? "var(--ds-bg)" : isToday ? "var(--ds-accent-bg)" : "var(--ds-surface)",
                        opacity: isPast && !isToday ? 0.6 : 1,
                        position: "relative",
                      }}
                    >
                      {day && (
                        <>
                          {/* Day number */}
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: isToday ? 700 : 400,
                              color: isToday ? "var(--ds-accent)" : "var(--ds-muted)",
                              marginBottom: 4,
                              lineHeight: 1,
                            }}
                          >
                            {day.getDate()}
                          </div>

                          {/* Event pills */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 2, overflow: "hidden" }}>
                            {dayEvents.slice(0, 4).map((ev) => (
                              <button
                                key={ev.id}
                                onClick={() => router.push(`/events/${ev.id}`)}
                                title={`${ev.name}${ev.venueName ? ` @ ${ev.venueName}` : ""}`}
                                style={{
                                  display: "block",
                                  width: "100%",
                                  textAlign: "left",
                                  background: statusBg(ev.status),
                                  border: `1px solid ${statusColor(ev.status)}30`,
                                  borderLeft: `3px solid ${statusColor(ev.status)}`,
                                  borderRadius: 3,
                                  padding: "2px 5px",
                                  fontSize: 11,
                                  color: "var(--ds-text)",
                                  cursor: "pointer",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  lineHeight: 1.4,
                                }}
                              >
                                {ev.name}
                              </button>
                            ))}
                            {dayEvents.length > 4 && (
                              <span style={{ fontSize: 10, color: "var(--ds-muted)", paddingLeft: 4 }}>
                                +{dayEvents.length - 4} more
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div
        className="flex items-center gap-4"
        style={{ padding: "12px 16px", borderTop: "1px solid var(--ds-border)", flexWrap: "wrap" }}
      >
        {[
          { label: "On Sale", status: "ON_SALE" },
          { label: "Pre-Sale", status: "PRE_SALE" },
          { label: "Coming Soon", status: "COMING_SOON" },
          { label: "Sold Out", status: "SOLD_OUT" },
        ].map(({ label, status }) => (
          <div key={status} className="flex items-center gap-1">
            <div style={{ width: 10, height: 10, borderRadius: 2, background: statusColor(status) }} />
            <span style={{ fontSize: 11, color: "var(--ds-muted)" }}>{label}</span>
          </div>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ds-xmuted)" }}>
          {events.length} event{events.length !== 1 ? "s" : ""} this month
        </span>
      </div>
    </div>
  );
}
