"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface SearchResult {
  id: string;
  name: string;
  platform: string;
  status: string;
  date: string | null;
  imageUrl: string | null;
  promoterName: string | null;
  venueName: string | null;
  eventUrl: string | null;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  ON_SALE:     { bg: "var(--onsale-bg)",    text: "var(--onsale-text)" },
  PRE_SALE:    { bg: "var(--presale-bg)",   text: "var(--presale-text)" },
  SOLD_OUT:    { bg: "var(--soldout-bg)",   text: "var(--soldout-text)" },
  COMING_SOON: { bg: "var(--presale-bg)",   text: "var(--presale-text)" },
  CANCELLED:   { bg: "var(--soldout-bg)",   text: "var(--soldout-text)" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

function formatStatus(s: string): string {
  return s.replace(/_/g, " ");
}

export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/events/search?q=${encodeURIComponent(q)}`);
      const data = await res.json() as { results: SearchResult[] };
      setResults(data.results ?? []);
      setOpen(true);
      setActiveIndex(-1);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResults(val), 200);
  };

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    setQuery("");
    if (result.eventUrl) {
      window.open(result.eventUrl, "_blank", "noopener");
    } else {
      router.push(`/events?q=${encodeURIComponent(result.name)}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && results[activeIndex]) {
        handleSelect(results[activeIndex]);
      } else if (query.trim()) {
        setOpen(false);
        router.push(`/events?q=${encodeURIComponent(query.trim())}`);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div style={{ position: "relative" }}>
      {/* Input */}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        {/* Search icon */}
        <svg
          width="14" height="14" viewBox="0 0 16 16" fill="none"
          style={{ position: "absolute", left: 10, color: "var(--ds-muted)", pointerEvents: "none" }}
        >
          <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder="Search events…"
          style={{
            width: "220px",
            height: "32px",
            paddingLeft: 30,
            paddingRight: loading ? 30 : 12,
            borderRadius: 20,
            border: "1px solid var(--ds-border)",
            background: "var(--ds-bg)",
            color: "var(--ds-text)",
            fontSize: 13,
            outline: "none",
            fontFamily: "inherit",
            transition: "border-color 120ms, width 120ms",
          }}
          onFocusCapture={(e) => (e.currentTarget.style.borderColor = "var(--ds-accent)")}
          onBlurCapture={(e) => (e.currentTarget.style.borderColor = "var(--ds-border)")}
        />
        {/* Loading spinner */}
        {loading && (
          <div style={{
            position: "absolute", right: 10,
            width: "12px", height: "12px",
            border: "1.5px solid var(--ds-border)",
            borderTopColor: "var(--ds-accent)",
            borderRadius: "50%",
            animation: "spin 0.6s linear infinite",
          }} />
        )}
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div
          ref={dropdownRef}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 360,
            background: "var(--ds-surface)",
            border: "1px solid var(--ds-border)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
            zIndex: 100,
            overflow: "hidden",
          }}
        >
          {results.map((r, i) => {
            const statusStyle = STATUS_COLORS[r.status] ?? { bg: "var(--ds-bg)", text: "var(--ds-muted)" };
            const isActive = i === activeIndex;
            return (
              <div
                key={r.id}
                onMouseDown={() => handleSelect(r)}
                onMouseEnter={() => setActiveIndex(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  cursor: "pointer",
                  background: isActive ? "var(--ds-accent-bg)" : "transparent",
                  borderBottom: i < results.length - 1 ? "1px solid var(--ds-border-light)" : "none",
                  transition: "background 80ms",
                }}
              >
                {/* Thumbnail */}
                <div style={{
                  width: 36, height: 36, borderRadius: 6, flexShrink: 0,
                  overflow: "hidden", background: "var(--ds-bg)",
                  border: "1px solid var(--ds-border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: "var(--ds-xmuted)" }}>
                      <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
                      <circle cx="5.5" cy="6.5" r="1.2" fill="currentColor" />
                      <path d="M1 10l4-3 3 2.5 2.5-2 4.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 500, color: "var(--ds-text)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {r.name}
                  </div>
                  <div style={{
                    fontSize: 11, color: "var(--ds-muted)", marginTop: 1,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {[r.venueName, formatDate(r.date)].filter(Boolean).join(" · ")}
                  </div>
                </div>

                {/* Status pill + platform */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 20,
                    background: statusStyle.bg, color: statusStyle.text,
                    textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap",
                  }}>
                    {formatStatus(r.status)}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--ds-xmuted)", fontFamily: "var(--font-geist-mono)" }}>
                    {r.platform}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Footer: search all */}
          <div
            onMouseDown={() => { setOpen(false); router.push(`/events?q=${encodeURIComponent(query)}`); }}
            style={{
              padding: "8px 12px",
              fontSize: 12,
              color: "var(--ds-accent)",
              cursor: "pointer",
              borderTop: "1px solid var(--ds-border)",
              fontWeight: 500,
              textAlign: "center",
            }}
          >
            See all results for &ldquo;{query}&rdquo; →
          </div>
        </div>
      )}

      {open && results.length === 0 && !loading && query.length >= 2 && (
        <div
          ref={dropdownRef}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 280,
            background: "var(--ds-surface)",
            border: "1px solid var(--ds-border)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
            zIndex: 100,
            padding: "16px 12px",
            textAlign: "center",
            fontSize: 13,
            color: "var(--ds-muted)",
          }}
        >
          No events found for &ldquo;{query}&rdquo;
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
