import Link from "next/link";
import { StatusBadge, TypeBadge, IntlBadge } from "@/components/StatusBadge";

async function getVenue(id: string) {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("PASTE")) {
    return null;
  }
  try {
    const { getVenueById } = await import("@/lib/db/queries");
    return await getVenueById(id);
  } catch {
    return null;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function VenueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const venue = await getVenue(id);

  if (!venue) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--ds-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "var(--ds-muted)" }}>
          <div style={{ fontSize: 15, marginBottom: 8 }}>Venue not found</div>
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
          <span style={{ fontSize: 13, color: "var(--ds-muted)" }}>{venue.canonicalName}</span>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 32px" }}>
        <div className="flex flex-col gap-5">

          {/* Venue summary */}
          <div style={{ background: "var(--ds-surface)", border: "1px solid var(--ds-border)", borderRadius: 8, padding: "20px 24px" }}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--ds-text)", margin: "0 0 6px" }}>
                  {venue.canonicalName}
                </h1>
                <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 4 }}>
                  {venue.isKeyVenue && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px",
                      color: "var(--venue-text)", background: "var(--venue-bg)",
                      border: "1px solid var(--venue-border)", borderRadius: 4, padding: "2px 6px",
                    }}>Key Venue</span>
                  )}
                  {venue.capacity && (
                    <span style={{ fontSize: 12, color: "var(--ds-muted)", fontFamily: "var(--font-geist-mono)" }}>
                      {venue.capacity.toLocaleString()} capacity
                    </span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "var(--ds-accent)", fontFamily: "var(--font-geist-mono)", lineHeight: 1 }}>
                  {venue.events.length}
                </div>
                <div style={{ fontSize: 11, color: "var(--ds-xmuted)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  events
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
                {venue.events.length}
              </span>
            </div>

            {venue.events.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--ds-muted)", fontSize: 13 }}>
                No events found for this venue.
              </div>
            ) : (
              <>
                {/* Column headers */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 160px 90px 90px", gap: 8, padding: "8px 20px", borderBottom: "1px solid var(--ds-border-light)" }}>
                  <span className="col-header">Event</span>
                  <span className="col-header">Date</span>
                  <span className="col-header">Promoter</span>
                  <span className="col-header">Platform</span>
                  <span className="col-header">Status</span>
                </div>
                {venue.events.map((event, i) => (
                  <div
                    key={event.id}
                    style={{
                      display: "grid", gridTemplateColumns: "1fr 130px 160px 90px 90px",
                      gap: 8, padding: "10px 20px", alignItems: "center",
                      borderBottom: i < venue.events.length - 1 ? "1px solid var(--ds-border-light)" : "none",
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
                      {event.promoterId ? (
                        <Link
                          href={`/promoters/${event.promoterId}`}
                          style={{ color: "var(--ds-accent)", textDecoration: "none", fontSize: 12 }}
                        >
                          {event.promoterName ?? "—"}
                        </Link>
                      ) : (
                        event.promoterName ?? "—"
                      )}
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
