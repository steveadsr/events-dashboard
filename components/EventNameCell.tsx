"use client";

import Link from "next/link";
import { NewBadge, IntlBadge, VenueBadge } from "./StatusBadge";

interface EventNameCellProps {
  id: string;
  name: string;
  eventUrl: string | null;
  isNew24h: boolean;
  isInternational: boolean;
  isKeyVenue: boolean;
}

export function EventNameCell({ id, name, eventUrl, isNew24h, isInternational, isKeyVenue }: EventNameCellProps) {
  return (
    <div className="flex items-start gap-2 flex-wrap">
      <div className="flex items-center gap-1">
        <Link
          href={`/events/${id}`}
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--ds-text)",
            lineHeight: 1.4,
            textDecoration: "none",
          }}
          onMouseOver={(e) => ((e.target as HTMLElement).style.color = "var(--ds-accent)")}
          onMouseOut={(e) => ((e.target as HTMLElement).style.color = "var(--ds-text)")}
        >
          {name}
        </Link>
        {eventUrl && (
          <a
            href={eventUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open on ticketing site"
            style={{ fontSize: 11, color: "var(--ds-xmuted)", textDecoration: "none", marginLeft: 4, lineHeight: 1 }}
            onMouseOver={(e) => ((e.target as HTMLElement).style.color = "var(--ds-accent)")}
            onMouseOut={(e) => ((e.target as HTMLElement).style.color = "var(--ds-xmuted)")}
            onClick={(e) => e.stopPropagation()}
          >
            ↗
          </a>
        )}
      </div>
      <div className="flex gap-1 flex-wrap">
        {isNew24h && <NewBadge />}
        {isInternational && <IntlBadge />}
        {isKeyVenue && <VenueBadge />}
      </div>
    </div>
  );
}
