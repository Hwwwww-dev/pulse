import type { PulseSnapshot } from "../../core/types.ts";
import type { Item } from "../../config/schema.ts";
import { formatNumber, formatRelative, type RelativeFormat } from "../format.ts";
import { drawBar, subPartStyle } from "./helpers.ts";
import { wrapPartial } from "../ansi.ts";

function resolveLimitFormat(item: Item): "percent0" | "percent1" {
  if (item.options?.format === "percent0" || item.options?.format === "percent1") {
    return item.options.format;
  }
  return "percent0";
}

function fiveHour(snap: PulseSnapshot): { pct: number; reset: number } | undefined {
  const r = snap.claude.rate_limits?.five_hour;
  if (!r) return undefined;
  return { pct: r.used_percentage, reset: r.resets_at };
}

function sevenDay(snap: PulseSnapshot): { pct: number; reset: number } | undefined {
  const r = snap.claude.rate_limits?.seven_day;
  if (!r) return undefined;
  return { pct: r.used_percentage, reset: r.resets_at };
}

const RELATIVE_FORMATS = new Set<RelativeFormat>([
  "relative_eta",
  "relative_eta_compact",
  "relative_eta_long",
  "relative_eta_long_compact",
  "relative_ago",
  "relative_ago_compact",
  "relative_ago_long",
  "relative_ago_long_compact",
  "clock_at_12",
  "clock_at_24",
  "clock_at_smart_12",
  "clock_at_smart_24",
]);

function resolveRelativeFormat(item: Item): RelativeFormat {
  const f = item.options?.format;
  if (typeof f === "string" && RELATIVE_FORMATS.has(f as RelativeFormat)) {
    return f as RelativeFormat;
  }
  return "relative_eta_long_compact";
}

function resolveLimitResetFormat(item: Item): RelativeFormat {
  const f = item.options?.limit_reset_format;
  if (f && RELATIVE_FORMATS.has(f)) return f;
  return "relative_eta_long_compact";
}

// Bar↔value gap is HARDCODED at 2 spaces and never affected by
// parts_separator. Bars are visually heavy and always need that gap.
const BAR_VALUE_GAP = "  ";

// parts_separator controls value↔value joins only (here: pct↔reset).
// Default is " " so the user can collapse to 0 / 1 / N freely.
function partsSep(item: Item): string {
  return item.options?.parts_separator ?? " ";
}

function appendReset(
  body: string,
  item: Item,
  data: { pct: number; reset: number },
): string {
  if (!item.options?.limit_show_reset) return body;
  const rel = formatRelative(data.reset * 1000, Date.now(), resolveLimitResetFormat(item));
  // reset countdown is its own target so users can independently
  // blink/color it apart from the percent value (e.g. keep "1h30m"
  // static while the percent pulses).
  const resetStyle = subPartStyle(item, data.pct, "reset");
  return `${body}${partsSep(item)}${wrapPartial(rel, resetStyle)}`;
}

function displayPct(rawUsed: number, item: Item): number {
  return item.options?.display_mode === "remaining" ? Math.max(0, 100 - rawUsed) : rawUsed;
}

function renderLimit(
  data: { pct: number; reset: number },
  item: Item,
  mode: "percent" | "bar",
): string {
  const pct = displayPct(data.pct, item);
  // Danger always computed off raw "used" — semantics stay intuitive
  // regardless of display_mode flipping to "remaining".
  const dangerPct = data.pct;
  const barStyle = subPartStyle(item, dangerPct, "bar");
  const valStyle = subPartStyle(item, dangerPct, "value");
  const pieces: string[] = [];
  if (mode === "bar" || item.options?.show_bar) {
    pieces.push(wrapPartial(drawBar(pct, item), barStyle));
  }
  if (mode === "percent") {
    pieces.push(wrapPartial(formatNumber(pct, resolveLimitFormat(item)), valStyle));
  }
  const body = pieces.join(BAR_VALUE_GAP);
  return appendReset(body, item, data);
}

export const fiveHourLimitRenderer = (snap: PulseSnapshot, item: Item): string => {
  const data = fiveHour(snap);
  if (!data) return item.hide_when_empty ? "" : "—";
  return renderLimit(data, item, "percent");
};

export const sevenDayLimitRenderer = (snap: PulseSnapshot, item: Item): string => {
  const data = sevenDay(snap);
  if (!data) return item.hide_when_empty ? "" : "—";
  return renderLimit(data, item, "percent");
};

export const fiveHourBarRenderer = (snap: PulseSnapshot, item: Item): string => {
  const data = fiveHour(snap);
  if (!data) return item.hide_when_empty ? "" : "—";
  return renderLimit(data, item, "bar");
};

export const sevenDayBarRenderer = (snap: PulseSnapshot, item: Item): string => {
  const data = sevenDay(snap);
  if (!data) return item.hide_when_empty ? "" : "—";
  return renderLimit(data, item, "bar");
};

export const resetIn5hRenderer = (snap: PulseSnapshot, item: Item): string => {
  const data = fiveHour(snap);
  if (!data) return "";
  return formatRelative(data.reset * 1000, Date.now(), resolveRelativeFormat(item));
};

export const resetIn7dRenderer = (snap: PulseSnapshot, item: Item): string => {
  const data = sevenDay(snap);
  if (!data) return "";
  return formatRelative(data.reset * 1000, Date.now(), resolveRelativeFormat(item));
};
