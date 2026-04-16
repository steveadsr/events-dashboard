import Link from "next/link";
import { StatusBadge, TypeBadge, IntlBadge } from "@/components/StatusBadge";
import type { EventDetail, TicketTier } from "@/lib/types";

// Mock for when DB is unavailable
function getMockEvent(id: string): EventDetail {
  return {
    id,
    name: "Memphis May Fire Live in Bangkok",
    platform: "Ticketmelon",
    status: "ON_SALE",
    type: "Concert",
    date: "2026-04-20T10:00:00Z",
    firstSeenAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    lastSeenAt: new Date(Date.now() - 3600000).toISOString(),
    imageUrl: null,
    ticketTiers: [
      { name: "Early Bird", priceThb: 2000, status: "sale_ended", remaining: null },
      { name: "Pre Sale", priceThb: 2500, status: "on_sale", remaining: null },
      { name: "At Door", priceThb: 3000, status: "unavailable", remaining: null },
      { name: "Meet & Greet Ticket", priceThb: 2500, status: "on_sale", remaining: null },
    ],
    eventUrl: "https://www.ticketmelon.com/odrock/memphismayfire",
    promoterId: "p1",
    promoterName: "OD Rock",
    venueId: null,
    venueName: "The Street Ratchada",
    isInternational: true,
  };
}

async function getEvent(id: string): Promise<EventDetail | null> {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("PASTE")) {
    return getMockEvent(id);
  }
  try {
    const { getEventById } = await import("@/lib/db/queries");
    return await getEventById(id);
  } catch {
    return getMockEvent(id);
  }
}

const TIER_STATUS_LABEL: Record<string, string> = {
  on_sale: "On Sale",
  sold_out: "Sold Out",
  sale_ended: "Sale Ended",
  unavailable: "Unavailable",
  unknown: "—",
};

const TIER_STATUS_COLOR: Record<string, { text: string; bg: string; border: string }> = {
  on_sale:     { text: "var(--onsale-text)",   bg: "var(--onsale-bg)",   border: "var(--onsale-border)" },
  sold_out:    { text: "var(--soldout-text)",  bg: "var(--soldout-bg)",  border: "var(--soldout-border)" },
  sale_ended:  { text: "var(--soldout-text)",  bg: "var(--soldout-bg)",  border: "var(--soldout-border)" },
  unavailable: { text: "var(--soldout-text)",  bg: "var(--soldout-bg)",  border: "var(--soldout-border)" },
  unknown:     { text: "var(--ds-xmuted)",     bg: "var(--ds-bg)",       border: "var(--ds-border)" },
};

function TierStatusBadge({ status }: { status: TicketTier["status"] }) {
  const cfg = TIER_STATUS_COLOR[status] ?? TIER_STATUS_COLOR.unknown;
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 20,
      whiteSpace: "nowrap", fontFamily: "var(--font-geist-mono)",
      backgroundColor: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`,
    }}>
      {TIER_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function formatDate(iso: string | null, isoEnd?: string | null): string {
  if (!iso) return "—";
  if (isoEnd && isoEnd.slice(0, 10) !== iso.slice(0, 10)) {
    const s = new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
    const e = new Date(isoEnd).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    return `${s} – ${e}`;
  }
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function formatPrice(priceThb: number | null): string {
  if (priceThb === null) return "—";
  return `${priceThb.toLocaleString()} THB`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "< 1h ago";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);

  if (!event) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--ds-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "var(--ds-muted)" }}>
          <div style={{ fontSize: 15, marginBottom: 8 }}>Event not found</div>
          <Link href="/dashboard" className="events-back-link">← Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const hasTiers = event.ticketTiers.length > 0;

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
          <Link href="/events" className="events-back-link">All Events</Link>
          <span style={{ color: "var(--ds-border)" }}>|</span>
          <span style={{ fontSize: 13, color: "var(--ds-muted)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {event.name}
          </span>
        </div>
        <span style={{
          fontSize: 11, color: "var(--ds-muted)", background: "var(--ds-bg)",
          border: "1px solid var(--ds-border)", borderRadius: 20, padding: "2px 10px",
          fontFamily: "var(--font-geist-mono)",
        }}>
          {event.platform}
        </span>
      </header>

      <main style={{ maxWidth: 880, margin: "0 auto", padding: "32px 32px" }}>
        <div className="flex flex-col gap-5">

          {/* Hero block */}
          <div style={{ background: "var(--ds-surface)", border: "1px solid var(--ds-border)", borderRadius: 8, overflow: "hidden", display: "flex", alignItems: "stretch" }}>
            {event.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={event.imageUrl}
                alt={event.name}
                style={{ width: 220, flexShrink: 0, objectFit: "cover", objectPosition: "top", display: "block" }}
              />
            )}
            <div style={{ padding: "20px 24px", flexGrow: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div className="flex items-start gap-3 flex-wrap mb-2">
                <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--ds-text)", margin: 0, lineHeight: 1.3 }}>
                  {event.name}
                </h1>
                {event.isInternational && <IntlBadge />}
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-3">
                <StatusBadge status={event.status} />
                {event.type && <TypeBadge type={event.type} />}
                {event.date && (
                  <span style={{ fontSize: 13, color: "var(--ds-muted)" }}>
                    {formatDate(event.date, event.dateEnd)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Ticket tiers */}
          <div style={{ background: "var(--ds-surface)", border: "1px solid var(--ds-border)", borderRadius: 8 }}>
            <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: "1px solid var(--ds-border)" }}>
              <span className="label-xs">Ticket Types</span>
            </div>
            {!hasTiers ? (
              <div style={{ padding: "20px 24px", fontSize: 13, color: "var(--ds-xmuted)" }}>
                Ticket tier data not yet available — will be fetched on next scrape.
              </div>
            ) : (
              <div>
                {event.ticketTiers.map((tier, i) => {
                  const isSoldOrEnded = tier.status === "sold_out" || tier.status === "sale_ended";
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "12px 20px", gap: 16,
                        borderBottom: i < event.ticketTiers.length - 1 ? "1px solid var(--ds-border-light)" : "none",
                      }}
                    >
                      <span style={{
                        fontSize: 13, fontWeight: 500, color: isSoldOrEnded ? "var(--ds-xmuted)" : "var(--ds-text)",
                        textDecoration: isSoldOrEnded ? "line-through" : "none",
                      }}>
                        {tier.name}
                      </span>
                      <div className="flex items-center gap-4">
                        {tier.remaining !== null && tier.remaining > 0 && (
                          <span style={{ fontSize: 11, color: "var(--presale-text)", background: "var(--presale-bg)", border: "1px solid var(--presale-border)", borderRadius: 20, padding: "1px 8px", fontFamily: "var(--font-geist-mono)" }}>
                            {tier.remaining} remaining
                          </span>
                        )}
                        <span style={{
                          fontSize: 13, fontWeight: 600, color: isSoldOrEnded ? "var(--ds-xmuted)" : "var(--ds-text)",
                          textDecoration: isSoldOrEnded ? "line-through" : "none",
                          fontFamily: "var(--font-geist-mono)", minWidth: 100, textAlign: "right",
                        }}>
                          {formatPrice(tier.priceThb)}
                        </span>
                        <TierStatusBadge status={tier.status} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Details + Source 2-col */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Details */}
            <div style={{ background: "var(--ds-surface)", border: "1px solid var(--ds-border)", borderRadius: 8 }}>
              <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--ds-border)" }}>
                <span className="label-xs">Details</span>
              </div>
              <div style={{ padding: "16px 20px" }} className="flex flex-col gap-3">
                <DetailRow label="Venue">
                  {event.venueName ?? <span style={{ color: "var(--ds-xmuted)" }}>—</span>}
                </DetailRow>
                <DetailRow label="Promoter">
                  {event.promoterId ? (
                    <Link
                      href={`/promoters/${event.promoterId}`}
                      style={{ color: "var(--ds-accent)", fontSize: 13, textDecoration: "none" }}
                    >
                      {event.promoterName ?? event.promoterId}
                    </Link>
                  ) : (
                    <span style={{ color: "var(--ds-xmuted)" }}>—</span>
                  )}
                </DetailRow>
                <DetailRow label="Date">
                  {event.date ? formatDate(event.date, event.dateEnd) : <span style={{ color: "var(--ds-xmuted)" }}>—</span>}
                </DetailRow>
                <DetailRow label="Type">
                  {event.type ?? <span style={{ color: "var(--ds-xmuted)" }}>—</span>}
                </DetailRow>
              </div>
            </div>

            {/* Source */}
            <div style={{ background: "var(--ds-surface)", border: "1px solid var(--ds-border)", borderRadius: 8 }}>
              <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--ds-border)" }}>
                <span className="label-xs">Source</span>
              </div>
              <div style={{ padding: "16px 20px" }} className="flex flex-col gap-3">
                <DetailRow label="Platform">{event.platform}</DetailRow>
                <DetailRow label="First seen">{timeAgo(event.firstSeenAt)}</DetailRow>
                <DetailRow label="Last scraped">{timeAgo(event.lastSeenAt)}</DetailRow>
                <DetailRow label="Ticketing page">
                  {event.eventUrl ? (
                    <a
                      href={event.eventUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--ds-accent)", fontSize: 13, textDecoration: "none" }}
                    >
                      Open ↗
                    </a>
                  ) : (
                    <span style={{ color: "var(--ds-xmuted)" }}>—</span>
                  )}
                </DetailRow>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 justify-between">
      <span style={{ fontSize: 12, color: "var(--ds-xmuted)", flexShrink: 0, paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 13, color: "var(--ds-text)", textAlign: "right" }}>{children}</span>
    </div>
  );
}
