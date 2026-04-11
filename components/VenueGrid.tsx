"use client";

import { useRouter } from "next/navigation";

interface Venue {
  id: string;
  canonicalName: string;
  isKeyVenue: boolean;
  capacity: number | null;
  eventCount: number;
}

export function VenueGrid({ venues }: { venues: Venue[] }) {
  const router = useRouter();
  return (
    <div style={{ background: "var(--ds-surface)", border: "1px solid var(--ds-border)", borderRadius: 8 }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--ds-border)" }}>
        <span className="label-xs">Venue Tracker</span>
        <span style={{
          background: "var(--ds-bg)", border: "1px solid var(--ds-border)", borderRadius: 20,
          fontSize: 11, fontFamily: "var(--font-geist-mono)", color: "var(--ds-muted)", padding: "1px 7px",
        }}>
          {venues.length}
        </span>
      </div>
      {venues.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--ds-muted)", fontSize: 14 }}>
          No venue data yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2">
          {venues.map((v, i) => (
            <div
              key={v.id}
              style={{
                padding: "14px 16px",
                borderBottom: i < venues.length - 1 ? "1px solid var(--ds-border-light)" : "none",
                borderRight: i % 2 === 0 && i < venues.length - 1 ? "1px solid var(--ds-border-light)" : "none",
                cursor: "pointer",
                transition: "background 100ms",
              }}
              onClick={() => router.push(`/venues/${v.id}`)}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ds-accent-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ds-text)" }}>{v.canonicalName}</span>
                  {v.isKeyVenue && (
                    <span style={{
                      marginLeft: 6, fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                      letterSpacing: "0.3px", color: "var(--venue-text)", background: "var(--venue-bg)",
                      border: "1px solid var(--venue-border)", borderRadius: 20, padding: "1px 6px",
                    }}>Key</span>
                  )}
                </div>
                <span style={{
                  fontFamily: "var(--font-geist-mono)", fontSize: 13, fontWeight: 600,
                  color: "var(--ds-accent)", flexShrink: 0,
                }}>
                  {v.eventCount}
                </span>
              </div>
              {v.capacity && (
                <div style={{ fontSize: 12, color: "var(--ds-muted)", marginTop: 2 }}>
                  Cap: {v.capacity.toLocaleString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
