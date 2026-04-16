"use client";

import { useState } from "react";
import { EventsInfiniteList } from "./EventsInfiniteList";
import { CalendarView } from "./CalendarView";

// Table icon
function TableIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ display: "block" }}>
      <rect x="1" y="1" width="14" height="3" rx="1" fill={active ? "var(--ds-text)" : "var(--ds-muted)"} />
      <rect x="1" y="6" width="14" height="3" rx="1" fill={active ? "var(--ds-text)" : "var(--ds-muted)"} />
      <rect x="1" y="11" width="14" height="3" rx="1" fill={active ? "var(--ds-text)" : "var(--ds-muted)"} />
    </svg>
  );
}

// Calendar icon
function CalendarIcon({ active }: { active: boolean }) {
  const c = active ? "var(--ds-text)" : "var(--ds-muted)";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ display: "block" }}>
      <rect x="1" y="3" width="14" height="12" rx="2" stroke={c} strokeWidth="1.5" />
      <path d="M1 7h14" stroke={c} strokeWidth="1.5" />
      <path d="M5 1v4M11 1v4" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      <rect x="4" y="9" width="2" height="2" rx="0.5" fill={c} />
      <rect x="7" y="9" width="2" height="2" rx="0.5" fill={c} />
      <rect x="10" y="9" width="2" height="2" rx="0.5" fill={c} />
      <rect x="4" y="12" width="2" height="2" rx="0.5" fill={c} />
      <rect x="7" y="12" width="2" height="2" rx="0.5" fill={c} />
    </svg>
  );
}

// Cards icon
function CardsIcon({ active }: { active: boolean }) {
  const c = active ? "var(--ds-text)" : "var(--ds-muted)";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ display: "block" }}>
      <rect x="1" y="1" width="6" height="7" rx="1.5" stroke={c} strokeWidth="1.5" />
      <rect x="9" y="1" width="6" height="7" rx="1.5" stroke={c} strokeWidth="1.5" />
      <rect x="1" y="10" width="6" height="5" rx="1.5" stroke={c} strokeWidth="1.5" />
      <rect x="9" y="10" width="6" height="5" rx="1.5" stroke={c} strokeWidth="1.5" />
    </svg>
  );
}

export function EventsView() {
  const [view, setView] = useState<"table" | "calendar" | "cards">("cards");

  const btnStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: 6,
    border: `1px solid ${active ? "var(--ds-border)" : "transparent"}`,
    background: active ? "var(--ds-bg)" : "transparent",
    cursor: "pointer",
    transition: "all 100ms",
  });

  return (
    <div>
      {/* View toggle — sits in the top-right of the card, above the filter bar */}
      <div
        className="flex items-center justify-end"
        style={{
          padding: "10px 16px 0",
          gap: 4,
        }}
      >
        <button
          style={btnStyle(view === "table")}
          onClick={() => setView("table")}
          title="Table view"
          aria-label="Table view"
        >
          <TableIcon active={view === "table"} />
        </button>
        <button
          style={btnStyle(view === "calendar")}
          onClick={() => setView("calendar")}
          title="Calendar view"
          aria-label="Calendar view"
        >
          <CalendarIcon active={view === "calendar"} />
        </button>
        <button
          style={btnStyle(view === "cards")}
          onClick={() => setView("cards")}
          title="Card view"
          aria-label="Card view"
        >
          <CardsIcon active={view === "cards"} />
        </button>
      </div>

      {view === "calendar" ? (
        <CalendarView />
      ) : (
        <EventsInfiniteList viewMode={view === "cards" ? "cards" : "table"} />
      )}
    </div>
  );
}
