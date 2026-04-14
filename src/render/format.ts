export type NumberFormat =
  | "usd2"
  | "usd4"
  | "compact"
  | "integer"
  | "percent0"
  | "percent1";

export type DurationFormat = "duration_hms" | "duration_compact" | "duration_ms";

export type ClockFormat =
  | "clock_24"
  | "clock_24_sec"
  | "clock_12"
  | "date_iso"
  | "date_short"
  | "date_long"
  | "datetime_short_24"
  | "datetime_short_12";

/**
 * Eta variants (future countdown) only — pulse surfaces reset countdowns via
 * reset_in_5h / reset_in_7d. The _compact suffix drops the space between units
 * ("1h 23m" → "1h23m"). The _long suffix enables the day unit when the delta
 * exceeds 24h ("48h 5m" → "2d 5m").
 */
export type RelativeFormat =
  | "relative_eta"
  | "relative_eta_compact"
  | "relative_eta_long"
  | "relative_eta_long_compact"
  | "relative_ago"
  | "relative_ago_compact"
  | "relative_ago_long"
  | "relative_ago_long_compact"
  /** "at 5pm" — same-day target, 12h clock */
  | "clock_at_12"
  /** "at 17:00" — same-day target, 24h clock */
  | "clock_at_24"
  /** Auto-prepend short date when target is not today; 12h clock */
  | "clock_at_smart_12"
  /** Auto-prepend short date when target is not today; 24h clock */
  | "clock_at_smart_24";

export type TokensFormat = "tokens_compact" | "tokens_full";

export function compact(n: number): string {
  if (n < 1000) return String(Math.trunc(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
}

export function formatNumber(n: number, fmt: NumberFormat): string {
  switch (fmt) {
    case "usd2":
      return `$${n.toFixed(2)}`;
    case "usd4":
      return `$${n.toFixed(4)}`;
    case "compact":
      return compact(n);
    case "integer":
      return String(Math.trunc(n));
    case "percent0":
      return `${Math.round(n)}%`;
    case "percent1":
      return `${n.toFixed(1)}%`;
  }
}

export function formatDuration(ms: number, fmt: DurationFormat): string {
  if (fmt === "duration_ms") return `${Math.trunc(ms)}ms`;
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (fmt === "duration_hms") {
    // Drop zero-valued units entirely so "1h 0m 5s" → "1h 5s" and exact
    // boundaries render as "1h" / "2m" instead of "1h 0m 0s".
    const parts: string[] = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0) parts.push(`${s}s`);
    return parts.length > 0 ? parts.join(" ") : "0s";
  }
  // duration_compact — same zero-skip rule, no padding on omitted units.
  if (h > 0) return m > 0 ? `${h}h${String(m).padStart(2, "0")}m` : `${h}h`;
  if (m > 0) return s > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${m}m`;
  return `${s}s`;
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function clock12(d: Date): string {
  const h24 = d.getHours();
  const ampm = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const m = d.getMinutes();
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`;
}

export function formatClock(unixMs: number, fmt: ClockFormat): string {
  const d = new Date(unixMs);
  const pad = (n: number): string => String(n).padStart(2, "0");
  switch (fmt) {
    case "clock_24":
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    case "clock_24_sec":
      return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    case "clock_12": {
      const h24 = d.getHours();
      const ampm = h24 < 12 ? "am" : "pm";
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      return `${h12}:${pad(d.getMinutes())} ${ampm}`;
    }
    case "date_iso":
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    case "date_short":
      return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
    case "date_long":
      return `${MONTH_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    case "datetime_short_24":
      return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    case "datetime_short_12":
      return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()} ${clock12(d)}`;
  }
}

function buildRelativeBody(absSec: number, opts: { long: boolean; compact: boolean }): string {
  const sep = opts.compact ? "" : " ";
  const d = Math.floor(absSec / 86400);
  const h24 = Math.floor((absSec % 86400) / 3600);
  const totalH = Math.floor(absSec / 3600);
  const m = Math.floor((absSec % 3600) / 60);

  if (opts.long && d > 0) {
    // Day-level decomposition: drop trailing zero units.
    const parts: string[] = [`${d}d`];
    if (h24 > 0 || m > 0) parts.push(`${h24}h`);
    if (m > 0) parts.push(`${m}m`);
    return parts.join(sep);
  }
  if (totalH > 0) {
    return m > 0 ? `${totalH}h${sep}${m}m` : `${totalH}h`;
  }
  if (m > 0) return `${m}m`;
  return "<1m";
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatClockAt(targetMs: number, nowMs: number, mode: "12" | "24", smart: boolean): string {
  const target = new Date(targetMs);
  const now = new Date(nowMs);
  const time = mode === "12" ? clock12(target) : `${String(target.getHours()).padStart(2, "0")}:${String(target.getMinutes()).padStart(2, "0")}`;
  if (!smart || isSameDay(target, now)) return `at ${time}`;
  const date = `${MONTH_SHORT[target.getMonth()]} ${target.getDate()}`;
  return `${date} at ${time}`;
}

export function formatRelative(
  targetMs: number,
  nowMs: number,
  fmt: RelativeFormat,
): string {
  switch (fmt) {
    case "clock_at_12":
      return formatClockAt(targetMs, nowMs, "12", false);
    case "clock_at_24":
      return formatClockAt(targetMs, nowMs, "24", false);
    case "clock_at_smart_12":
      return formatClockAt(targetMs, nowMs, "12", true);
    case "clock_at_smart_24":
      return formatClockAt(targetMs, nowMs, "24", true);
  }
  const absSec = Math.abs(Math.round((targetMs - nowMs) / 1000));
  const isEta = fmt.startsWith("relative_eta");
  const compact = fmt.endsWith("_compact");
  const long = fmt.includes("_long");
  const body = buildRelativeBody(absSec, { long, compact });
  return isEta ? `in ${body}` : `${body} ago`;
}

export function formatTokens(n: number, fmt: TokensFormat): string {
  if (fmt === "tokens_full") return String(Math.trunc(n));
  return compact(n);
}
