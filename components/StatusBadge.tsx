type Status = "PRE_SALE" | "ON_SALE" | "SOLD_OUT" | "CANCELLED" | "COMING_SOON" | "UNKNOWN";

const statusConfig: Record<Status, { label: string; bg: string; text: string; border: string }> = {
  PRE_SALE:    { label: "Pre-sale",    bg: "var(--presale-bg)",  text: "var(--presale-text)",  border: "var(--presale-border)" },
  ON_SALE:     { label: "On Sale",     bg: "var(--onsale-bg)",   text: "var(--onsale-text)",   border: "var(--onsale-border)" },
  SOLD_OUT:    { label: "Sold Out",    bg: "var(--soldout-bg)",  text: "var(--soldout-text)",  border: "var(--soldout-border)" },
  CANCELLED:   { label: "Cancelled",   bg: "var(--soldout-bg)",  text: "var(--soldout-text)",  border: "var(--soldout-border)" },
  COMING_SOON: { label: "Coming Soon", bg: "var(--new-bg)",      text: "var(--new-text)",      border: "var(--new-border)" },
  UNKNOWN:     { label: "Unknown",     bg: "var(--type-bg)",     text: "var(--type-text)",     border: "var(--type-border)" },
};

export function StatusBadge({ status }: { status: Status }) {
  const cfg = statusConfig[status] ?? statusConfig.UNKNOWN;
  return (
    <span
      style={{
        backgroundColor: cfg.bg,
        color: cfg.text,
        border: `1px solid ${cfg.border}`,
        fontSize: 11,
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: 20,
        whiteSpace: "nowrap",
        fontFamily: "var(--font-geist-mono)",
      }}
    >
      {cfg.label}
    </span>
  );
}

export function NewBadge() {
  return (
    <span
      style={{
        backgroundColor: "var(--new-bg)",
        color: "var(--new-text)",
        border: "1px solid var(--new-border)",
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: 20,
        whiteSpace: "nowrap",
        letterSpacing: "0.3px",
        textTransform: "uppercase" as const,
      }}
    >
      New
    </span>
  );
}

export function IntlBadge() {
  return (
    <span
      style={{
        backgroundColor: "var(--intl-bg)",
        color: "var(--intl-text)",
        border: "1px solid var(--intl-border)",
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: 20,
        whiteSpace: "nowrap",
        letterSpacing: "0.3px",
        textTransform: "uppercase" as const,
      }}
    >
      Intl
    </span>
  );
}

export function VenueBadge() {
  return (
    <span
      style={{
        backgroundColor: "var(--venue-bg)",
        color: "var(--venue-text)",
        border: "1px solid var(--venue-border)",
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: 20,
        whiteSpace: "nowrap",
        letterSpacing: "0.3px",
        textTransform: "uppercase" as const,
      }}
    >
      Key Venue
    </span>
  );
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span
      style={{
        backgroundColor: "var(--type-bg)",
        color: "var(--type-text)",
        border: "1px solid var(--type-border)",
        fontSize: 11,
        fontWeight: 400,
        padding: "2px 8px",
        borderRadius: 20,
        whiteSpace: "nowrap",
      }}
    >
      {type}
    </span>
  );
}
