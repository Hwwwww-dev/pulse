import type { PulseSnapshot } from "../../core/types.ts";
import type { Item } from "../../config/schema.ts";
import { formatDuration, type DurationFormat } from "../format.ts";

function resolveDurationFormat(item: Item): DurationFormat {
  const f = item.options?.format;
  if (f === "duration_hms" || f === "duration_compact" || f === "duration_ms") return f;
  return "duration_compact";
}

export const recentAgentsRenderer = (snap: PulseSnapshot, item: Item): string => {
  const entries = snap.counters?.agent_entries ?? [];
  if (entries.length === 0) return "";
  const limit = (item.options?.agents_limit as number | undefined) ?? 3;
  const sep = (item.options?.parts_separator as string | undefined) ?? " ";
  const showCompleted = item.options?.agents_show_completed !== false;
  const filtered = showCompleted ? entries : entries.filter((e) => e.end_ts === undefined);
  const slice = filtered.slice(-limit);
  const now = snap.captured_at;
  const fmt = resolveDurationFormat(item);
  const parts = slice.map((e) => {
    const elapsed = (e.end_ts ?? now) - e.start_ts;
    const inFlight = e.end_ts === undefined;
    return `${e.type}: ${formatDuration(elapsed, fmt)}${inFlight ? "*" : ""}`;
  });
  return parts.join(sep);
};
