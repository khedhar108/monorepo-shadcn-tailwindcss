/**
 * Parse ISO or SQLite datetime strings into a Date.
 * SQLite `datetime('now')` values lack timezone — treat as UTC.
 */
export function parseToDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = new Date(trimmed);
  if (!Number.isNaN(iso.getTime())) return iso;

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    const sqlite = new Date(trimmed.replace(" ", "T") + "Z");
    if (!Number.isNaN(sqlite.getTime())) return sqlite;
  }

  return null;
}

/** Human-readable relative time from a timestamp string or Date. */
export function formatRelativeTime(value: string | Date): string {
  const date =
    typeof value === "string" ? parseToDate(value) : value;

  if (!date || Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "just now";

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";

  const diffMins = Math.floor(diffSec / 60);
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Pick the more recent of two timestamp strings (ISO or SQLite). */
export function pickLatestTimestamp(a?: string, b?: string): string | undefined {
  const da = parseToDate(a);
  const db = parseToDate(b);
  if (da && db) return da >= db ? a! : b!;
  return a ?? b;
}
