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

export const costRenderer = (snap: PulseSnapshot, item: Item): string =>
  formatNumber(snap.claude.cost.total_cost_usd, resolveCostFormat(item));

export const durationRenderer = (snap: PulseSnapshot, item: Item): string =>
  formatDuration(snap.claude.cost.total_duration_ms, resolveDurationFormat(item));

export const apiDurationRenderer = (snap: PulseSnapshot, item: Item): string =>
  formatDuration(snap.claude.cost.total_api_duration_ms, resolveDurationFormat(item));

export const linesChangedRenderer = (snap: PulseSnapshot, _item: Item): string =>
  `+${snap.claude.cost.total_lines_added}/-${snap.claude.cost.total_lines_removed}`;
