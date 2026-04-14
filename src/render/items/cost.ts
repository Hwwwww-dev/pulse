import type { PulseSnapshot } from "../../core/types.ts";
import type { Item } from "../../config/schema.ts";
import { formatNumber, formatDuration } from "../format.ts";

function resolveCostFormat(item: Item): "usd2" | "usd4" {
  const f = item.options?.format;
  if (f === "usd2" || f === "usd4") return f;
  return "usd4";
}

function resolveDurationFormat(item: Item): "duration_hms" | "duration_compact" | "duration_ms" {
  const f = item.options?.format;
  if (f === "duration_hms" || f === "duration_compact" || f === "duration_ms") return f;
  return "duration_compact";
}

// Zero cost/duration/lines collapse to empty unless the user explicitly
// opts back in via hide_when_empty=false. Keeps fresh sessions from
// cluttering the statusline with "$0.00", "0s", "+0/-0".
function hideZero(item: Item): boolean {
  return item.hide_when_empty !== false;
}

export const costRenderer = (snap: PulseSnapshot, item: Item): string => {
  const v = snap.claude.cost.total_cost_usd;
  if (v === 0 && hideZero(item)) return "";
  return formatNumber(v, resolveCostFormat(item));
};

export const durationRenderer = (snap: PulseSnapshot, item: Item): string => {
  const v = snap.claude.cost.total_duration_ms;
  if (v === 0 && hideZero(item)) return "";
  return formatDuration(v, resolveDurationFormat(item));
};

export const apiDurationRenderer = (snap: PulseSnapshot, item: Item): string => {
  const v = snap.claude.cost.total_api_duration_ms;
  if (v === 0 && hideZero(item)) return "";
  return formatDuration(v, resolveDurationFormat(item));
};

export const linesChangedRenderer = (snap: PulseSnapshot, item: Item): string => {
  const added = snap.claude.cost.total_lines_added;
  const removed = snap.claude.cost.total_lines_removed;
  if (added === 0 && removed === 0 && item.hide_when_empty !== false) return "";
  return `+${added}/-${removed}`;
};
