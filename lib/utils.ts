import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const THAI_CHAR = /[\u0E00-\u0E7F]/;

// Known Thai venue names → canonical English names.
// Add more here as new venues appear.
const THAI_VENUE_MAP: [RegExp, string][] = [
  [/ราชมังคลากีฬาสถาน|สนามราชมังคลา/, "Rajamangala National Stadium"],
  [/ธันเดอร์โดม/, "Thunderdome"],
  [/อิมแพค อารีนา|อิมแพ็ค อารีนา/, "Impact Arena"],
  [/อิมแพค ชาเลนเจอร์/, "Impact Challenger Hall"],
  [/ยูโอบี ไลฟ์|UOB Live/, "UOB Live"],
  [/ศูนย์การประชุมแห่งชาติสิริกิติ์/, "Queen Sirikit National Convention Center"],
  [/ศูนย์วัฒนธรรมแห่งประเทศไทย/, "Thailand Cultural Centre"],
  [/หอประชุมใหญ่ มหาวิทยาลัยมหิดล|มหิดลสิทธาคาร/, "Mahidol University Hall"],
  [/เมืองทองธานี/, "Muang Thong Thani"],
  [/สวนลุมพินี/, "Lumpini Park"],
  [/สนามกีฬาไทย-ญี่ปุ่น/, "Thai-Japanese Stadium"],
];

// Known English spelling/spacing variations → canonical name.
// Handles scraped text like "Thunder Dome" → "Thunderdome", "Rajamangkala" → correct spelling, etc.
const ENGLISH_VENUE_NORMALIZE: [RegExp, string][] = [
  [/thunder\s*dome/i, "Thunderdome"],
  [/rajamangkala/i, "Rajamangala National Stadium"],
  [/rajamangala/i, "Rajamangala National Stadium"],
  [/impact\s+arena/i, "Impact Arena"],
  [/impact\s+challenger/i, "Impact Challenger Hall"],
  [/uob\s+live/i, "UOB Live"],
];

/**
 * Shorten a raw scraped venue string to a clean display name:
 * 1. Check known Thai → English translation map
 * 2. Handle "Thai (English Name)" → extract English from parens
 * 3. Handle "English Name (Thai)" → take part before "("
 * 4. Handle "English / Thai" → take English part
 * 5. Fall back: take before first comma, apply Title Case
 */
export function shortenVenue(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // 1. Known Thai venue translations (match anywhere in the string)
  for (const [pattern, english] of THAI_VENUE_MAP) {
    if (pattern.test(raw)) return english;
  }

  // 1b. Known English spelling/spacing variations → canonical name
  for (const [pattern, canonical] of ENGLISH_VENUE_NORMALIZE) {
    if (pattern.test(raw)) return canonical;
  }

  // 2. "Thai text (English Name)" — extract the English from parentheses
  if (THAI_CHAR.test(raw)) {
    const parenMatch = raw.match(/\(([A-Za-z][^)]{3,})\)/);
    if (parenMatch) return toTitleCase(parenMatch[1].trim());
  }

  // 3. "English Name (Thai text)" — take the part before "("
  if (THAI_CHAR.test(raw) && raw.match(/^[A-Za-z]/)) {
    const beforeParen = raw.split("(")[0].trim().replace(/,\s*$/, "");
    if (beforeParen) return toTitleCase(beforeParen);
  }

  // 4. "English / Thai" or "Thai / English" — take the English segment
  if (raw.includes(" / ")) {
    const parts = raw.split(" / ");
    const englishPart = parts.find((p) => !THAI_CHAR.test(p));
    if (englishPart) return toTitleCase(englishPart.trim().split(",")[0].trim());
    // All parts are Thai — take first
    return parts[0].trim();
  }

  // 5. Mostly Thai with no English fallback — return shortened as-is
  if (THAI_CHAR.test(raw) && !/[A-Za-z]{4,}/.test(raw)) {
    return raw.split(",")[0].trim();
  }

  // 6. English / mixed — take before first comma, title-case
  return toTitleCase(raw.split(",")[0].trim());
}

function toTitleCase(str: string): string {
  const SMALL_WORDS = new Set(["a", "an", "the", "and", "at", "by", "for", "in", "of", "on", "or", "to"]);
  return str.replace(/\b\w+/g, (word, offset) => {
    const lower = word.toLowerCase();
    // Keep short ALL-CAPS acronyms like UOB, TTM, QSNCC
    if (word.length <= 4 && word === word.toUpperCase() && /^[A-Z]+$/.test(word)) return word;
    // Small words lowercase (except first word)
    if (offset > 0 && SMALL_WORDS.has(lower)) return lower;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

/**
 * Guard against LLM returning the literal string "null" instead of JS null.
 */
export function nullSafe(value: string | null | undefined): string | null {
  if (!value || value === "null" || value === "undefined") return null;
  return value;
}

/** Known key venue regex patterns for fuzzy matching (JS-side) */
export const KEY_VENUE_PATTERNS: RegExp[] = [
  /rajamangala|rajamangkala/i,
  /impact.{0,6}arena/i,
  /thunder.{0,6}dome/i,
  /uob.{0,6}live/i,
  /impact.{0,6}challenger/i,
];

/** Client-side guard for fan/health events that slip through the SQL filter */
const FAN_NAME_RE = /fan\s*(meet|party|fest|sign|con|engagement|call|cafe|talk|event|day|showcase)|fanmeet|fanparty|fansign|fancon|meet\s*&\s*greet|hi[-\s]?touch|high\s*touch/i;
const FAN_TYPE_RE = /\bfan\b|fan\s*(meet|party|meeting|engagement|fest)|health|wellness|medical|seminar|conference|forum|summit|trade\s*fair|exhibition|\bexpo\b/i;
const HEALTH_NAME_RE = /health\s*(fair|expo|talk|seminar|forum|summit|check|screening)|wellness\s*(fair|expo|seminar)|medical\s*(fair|expo)|life\s*expo/i;

export function isExcludedEvent(name: string, type: string | null): boolean {
  if (FAN_NAME_RE.test(name)) return true;
  if (HEALTH_NAME_RE.test(name)) return true;
  if (type && FAN_TYPE_RE.test(type)) return true;
  return false;
}

/**
 * Format a date or date range for display.
 * Single: "9 Jun 2026"
 * Same month: "9–10 Jun 2026"
 * Cross month: "30 Jun – 2 Jul 2026"
 */
export function formatDateRange(date: string | null, dateEnd?: string | null): string {
  if (!date) return "—";
  const start = new Date(date);
  if (!dateEnd || dateEnd === date || dateEnd.slice(0, 10) === date.slice(0, 10)) {
    return start.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
  }
  const end = new Date(dateEnd);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    const d1 = start.toLocaleDateString("en-GB", { day: "numeric" });
    const d2 = end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
    return `${d1}–${d2}`;
  }
  const d1 = start.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const d2 = end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
  return `${d1} – ${d2}`;
}
