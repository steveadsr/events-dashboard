import Link from "next/link";
import { EventsView } from "@/components/EventsView";

export default function EventsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--ds-bg)" }}>
      {/* Header — server component, no event handlers on Link */}
      <header
        style={{
          background: "var(--ds-surface)",
          borderBottom: "1px solid var(--ds-border)",
          padding: "0 32px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="events-back-link"
          >
            ← Dashboard
          </Link>
          <span style={{ color: "var(--ds-border)" }}>|</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ds-text)" }}>
            All Events
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            color: "var(--ds-muted)",
            background: "var(--ds-bg)",
            border: "1px solid var(--ds-border)",
            borderRadius: 20,
            padding: "2px 10px",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          Thailand Market
        </span>
      </header>

      {/* Main content */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 32px" }}>
        <div
          style={{
            background: "var(--ds-surface)",
            border: "1px solid var(--ds-border)",
            borderRadius: 8,
          }}
        >
          <EventsView />
        </div>
      </main>
    </div>
  );
}
