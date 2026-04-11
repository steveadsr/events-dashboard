"use client";

interface DailyBriefProps {
  bullets: string[];
  generatedAt: string | null;
}

function formatBriefTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    + " · "
    + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function DailyBrief({ bullets, generatedAt }: DailyBriefProps) {
  if (!bullets || bullets.length === 0) {
    return (
      <div
        style={{
          background: "var(--ds-surface)",
          borderWidth: "1px 1px 1px 3px",
          borderStyle: "solid",
          borderColor: "var(--ds-border)",
          borderRadius: 8,
          padding: "20px 24px",
        }}
      >
        <p style={{ color: "var(--ds-muted)", fontSize: 14 }}>
          No brief generated yet. Run a scrape to populate.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--ds-surface)",
        borderWidth: "1px 1px 1px 3px",
        borderStyle: "solid",
        borderColor: `var(--ds-border) var(--ds-border) var(--ds-border) var(--ds-accent)`,
        borderRadius: 8,
        padding: "20px 24px",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="label-xs">Daily Brief</span>
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--font-geist-mono)",
            color: "var(--ds-accent)",
          }}
        >
          {formatBriefTime(generatedAt)}
        </span>
      </div>
      <ul className="space-y-2">
        {bullets.map((bullet, i) => (
          <li key={i} className="flex gap-3" style={{ fontSize: 14, color: "var(--ds-text)" }}>
            <span style={{ color: "var(--ds-accent)", marginTop: 2, flexShrink: 0 }}>•</span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
