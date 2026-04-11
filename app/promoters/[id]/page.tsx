import Link from "next/link";
import { StatusBadge, TypeBadge, IntlBadge } from "@/components/StatusBadge";
import type { PromoterDetail } from "@/lib/types";

function getMockPromoter(id: string): PromoterDetail {
  return {
    id,
    canonicalName: "OD Rock",
    activeEventCount: 4,
    platformsActive: ["Ticketmelon"],
    venuesUsed: ["The Street Ratchada", "Moonstar Studio"],
    organizerPageUrl: "https://www.ticketmelon.com/organizer/odrock",
    events: [
      { id: "e1", name: "Memphis May Fire Live in Bangkok", platform: "Ticketmelon", status: "ON_SALE", type: "Concert", date: "2026-04-20T10:00:00Z", venueName: "The Street Ratchada", isInternational: true },
      { id: "e2", name: "Nothing But Thieves Bangkok", platform: "Ticketmelon", status: "PRE_SALE", type: "Concert", date: "2026-06-15T10:00:00Z", venueName: "Moonstar Studio", isInternational: true },
      { id: "e3", name: "Rock Summer Fest 2026", platform: "Ticketmelon", status: "ON_SALE", type: "Festival", date: "2026-08-01T10:00:00Z", venueName: "Impact Challenger Hall", isInternational: false },
      { id: "e4", name: "Bring Me The Horizon Bangkok", platform: "Ticketmelon", status: "SOLD_OUT", type: "Concert", date: "2026-03-10T10:00:00Z", venueName: "Thunderdome", isInternational: true },
    ],
  };
}

async function getPromoter(id: string): Promise<PromoterDetail | null> {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("PASTE")) {
    return getMockPromoter(id);
  }
  try {
    const { getPromoterById } = await import("@/lib/db/queries");
    return await getPromoterById(id);
  } catch {
    return getMockPromoter(id);
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function PromoterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const promoter = await getPromoter(id);

  if (!promoter) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--ds-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "var(--ds-muted)" }}>
          <div style={{ fontSize: 15, marginBottom: 8 }}>Promoter not found</div>
          <Link href="/dashboard" className="events-back-link">← Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--ds-bg)" }}>
      {/* Header */}
      <header style={{
        background: "var(--ds-surface)", borderBottom: "1px solid var(--ds-border)",
        padding: "0 32px", height: 56, display: "flex", alignItems: "center",
        justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10,
      }}>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="events-back-link">← Dashboard</Link>
          <span style={{ color: "var(--ds-border)" }}>|</span>
          <span style={{ fontSize: 13, color: "var(--ds-muted)" }}>{promoter.canonicalName}</span>
        </div>
        {promoter.organizerPageUrl && (
          <a
            href={promoter.organizerPageUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12, color: "var(--ds-muted)", textDecoration: "none",
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            Organizer page ↗
          </a>
        )}
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 32px" }}>
        <div className="flex flex-col gap-5">

          {/* Promoter summary */}
          <div style={{ background: "var(--ds-surface)", border: "1px solid var(--ds-border)", borderRadius: 8, padding: "20px 24px" }}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--ds-text)", margin: "0 0 6px" }}>
                  {promoter.canonicalName}
                </h1>
                <div style={{ fontSize: 13, color: "var(--ds-muted)" }}>
                  {promoter.platformsActive.join(" · ") || "—"}
                </div>
                {promoter.venuesUsed.length > 0 && (
                  <div style={{ fontSize: 12, color: "var(--ds-xmuted)", marginTop: 4 }}>
                    {promoter.venuesUsed.join(", ")}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "var(--ds-accent)", fontFamily: "var(--font-geist-mono)", lineHeight: 1 }}>
                  {promoter.activeEventCount}
                </div>
                <div style={{ fontSize: 11, color: "var(--ds-xmuted)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  active events
                </div>
              </div>
            </div>
          </div>

          {/* Events table */}
          <div style={{ background: "var(--ds-surface)", border: "1px solid var(--ds-border)", borderRadius: 8 }}>
            <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: "1px solid var(--ds-border)" }}>
              <span className="label-xs">All Events</span>
              <span style={{
                background: "var(--ds-bg)", border: "1px solid var(--ds-border)", borderRadius: 20,
                fontSize: 11, fontFamily: "var(--font-geist-mono)", color: "var(--ds-muted)", padding: "1px 7px",
              }}>
                {promoter.events.length}
              </span>
            </div>

            {promoter.events.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--ds-muted)", fontSize: 13 }}>
                No events found for this promoter.
              </div>
            ) : (
              <>
                {/* Column headers */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 160px 90px 90px", gap: 8, padding: "8px 20px", borderBottom: "1px solid var(--ds-border-light)" }}>
                  <span className="col-header">Event</span>
                  <span className="col-header">Date</span>
                  <span className="col-header">Venue</span>
                  <span className="col-header">Platform</span>
                  <span className="col-header">Status</span>
                </div>
                {promoter.events.map((event, i) => (
                  <div
                    key={event.id}
                    style={{
                      display: "grid", gridTemplateColumns: "1fr 130px 160px 90px 90px",
                      gap: 8, padding: "10px 20px", alignItems: "center",
                      borderBottom: i < promoter.events.length - 1 ? "1px solid var(--ds-border-light)" : "none",
                    }}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/events/${event.id}`}
                        className="event-name-link"
                        style={{ fontSize: 13, fontWeight: 500 }}
                      >
                        {event.name}
                      </Link>
                      {event.isInternational && <IntlBadge />}
                      {event.type && <TypeBadge type={event.type} />}
                    </div>
                    <span style={{ fontSize: 12, color: "var(--ds-muted)", fontFamily: "var(--font-geist-mono)" }}>
                      {formatDate(event.date)}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--ds-muted)" }}>
                      {event.venueName ?? "—"}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--ds-xmuted)" }}>
                      {event.platform}
                    </span>
                    <StatusBadge status={event.status} />
                  </div>
                ))}
              </>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
