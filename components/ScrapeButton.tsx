"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface ScrapeButtonProps {
  lastScrape: { completedAt: string | null; eventsFound: number | null; status: string } | null;
}

const SCHEDULE_OPTIONS = [
  "04:00", "05:00", "06:00", "07:00", "08:00", "09:00",
  "10:00", "12:00", "14:00", "18:00", "21:00",
];

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ScrapeButton({ lastScrape }: ScrapeButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [scheduledTime, setScheduledTime] = useState("06:00");
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    }
    if (showPicker) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPicker]);

  async function triggerScrape() {
    setStatus("running");
    try {
      const res = await fetch("/api/scrape", { method: "POST" });
      if (res.status === 409) {
        setStatus("running");
        return;
      }
      const data = await res.json();
      setJobId(data.job_id);
      pollJob(data.job_id);
    } catch {
      setStatus("error");
    }
  }

  async function pollJob(id: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/scrape/${id}`);
        const data = await res.json();

        // Refresh the page data on every poll so events appear as they're ingested
        router.refresh();

        if (data.status === "done" || data.status === "failed") {
          clearInterval(interval);
          setStatus(data.status === "done" ? "done" : "error");
          setTimeout(() => { setStatus("idle"); setJobId(null); }, 3000);
        }
      } catch {
        clearInterval(interval);
        setStatus("error");
      }
    }, 5000);
  }

  const isRunning = status === "running";

  return (
    <div className="flex items-center gap-4">
      <div style={{ fontSize: 11, color: "var(--ds-muted)", textAlign: "right" as const, lineHeight: 1.5, position: "relative" }}>
        <div>
          Runs daily at{" "}
          <span
            onClick={() => setShowPicker(!showPicker)}
            style={{
              textDecoration: "underline",
              textUnderlineOffset: 2,
              cursor: "pointer",
              color: "var(--ds-text)",
              fontFamily: "var(--font-geist-mono)",
              fontWeight: 500,
            }}
          >
            {scheduledTime}
          </span>
          {showPicker && (
            <div
              ref={pickerRef}
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: 4,
                background: "var(--ds-surface, #fff)",
                border: "1px solid var(--ds-border, #E7E5E0)",
                borderRadius: 8,
                padding: 4,
                zIndex: 50,
                display: "flex",
                flexDirection: "column",
                gap: 1,
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                minWidth: 80,
              }}
            >
              {SCHEDULE_OPTIONS.map((t) => (
                <button
                  key={t}
                  onClick={() => { setScheduledTime(t); setShowPicker(false); }}
                  style={{
                    background: t === scheduledTime ? "var(--ds-bg, #FAFAF8)" : "transparent",
                    border: "none",
                    borderRadius: 4,
                    padding: "4px 8px",
                    fontSize: 11,
                    fontFamily: "var(--font-geist-mono)",
                    fontWeight: t === scheduledTime ? 500 : 400,
                    color: t === scheduledTime ? "var(--ds-text)" : "var(--ds-muted)",
                    cursor: "pointer",
                    textAlign: "right" as const,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
        <div suppressHydrationWarning style={{ fontFamily: "var(--font-geist-mono)", color: "var(--ds-text)", fontWeight: 500 }}>
          Last run {timeAgo(lastScrape?.completedAt ?? null)} · {lastScrape?.eventsFound ?? 0} events
        </div>
      </div>
      <button
        onClick={triggerScrape}
        disabled={isRunning}
        style={{
          backgroundColor: isRunning ? "var(--ds-border)" : status === "done" ? "#166534" : "var(--ds-text)",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 500,
          cursor: isRunning ? "not-allowed" : "pointer",
          transition: "background-color 80ms",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "var(--font-poppins)",
        }}
      >
        {isRunning && (
          <span
            style={{
              width: 12, height: 12,
              border: "2px solid rgba(255,255,255,0.3)",
              borderTopColor: "#fff",
              borderRadius: "50%",
              display: "inline-block",
              animation: "spin 0.8s linear infinite",
            }}
          />
        )}
        {status === "idle" && "Run"}
        {status === "running" && "Running…"}
        {status === "done" && "Done ✓"}
        {status === "error" && "Retry"}
      </button>
    </div>
  );
}
