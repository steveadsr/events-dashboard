"use client";

import { useRouter } from "next/navigation";

interface Promoter {
  id: string;
  canonicalName: string;
  activeEventCount: number;
  platformsActive: string[];
  venuesUsed: string[];
}

export function PromoterGrid({ promoters }: { promoters: Promoter[] }) {
  const router = useRouter();

  return (
    <div style={{ background: "var(--ds-surface)", border: "1px solid var(--ds-border)", borderRadius: 8, display: "flex", flexDirection: "column" }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--ds-border)", flexShrink: 0 }}>
        <span className="label-xs">Promoter Activity</span>
        <span style={{
          background: "var(--ds-bg)", border: "1px solid var(--ds-border)", borderRadius: 20,
          fontSize: 11, fontFamily: "var(--font-geist-mono)", color: "var(--ds-muted)", padding: "1px 7px",
        }}>
          {promoters.length}
        </span>
      </div>

      {promoters.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--ds-muted)", fontSize: 14 }}>
          No promoter data yet.
        </div>
      ) : (
        <div
          className="promoter-scroll"
          style={{ overflowY: "auto", maxHeight: 320, flexGrow: 1 }}
        >
          {promoters.map((p, i) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/promoters/${p.id}`)}
              onKeyDown={(e) => e.key === "Enter" && router.push(`/promoters/${p.id}`)}
              style={{
                padding: "12px 16px",
                borderBottom: i < promoters.length - 1 ? "1px solid var(--ds-border-light)" : "none",
                cursor: "pointer",
                transition: "background 100ms",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ds-accent-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ds-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.canonicalName}
                </div>
                <div style={{ fontSize: 11, color: "var(--ds-xmuted)", marginTop: 2 }}>
                  {(p.platformsActive ?? []).join(" · ") || "—"}
                </div>
              </div>
              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                <span style={{
                  fontFamily: "var(--font-geist-mono)", fontSize: 14, fontWeight: 600,
                  color: "var(--ds-accent)",
                }}>
                  {p.activeEventCount}
                </span>
                <span style={{ fontSize: 11, color: "var(--ds-xmuted)" }}>→</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
