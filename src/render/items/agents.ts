import type { PulseSnapshot } from "../../core/types.ts";
import type { Item } from "../../config/schema.ts";

export const recentAgentsRenderer = (snap: PulseSnapshot, item: Item): string => {
  const entries = snap.counters?.agent_entries ?? [];
  if (entries.length === 0) return "";
  const limit = (item.options?.agents_limit as number | undefined) ?? 3;
  const sep = (item.options?.parts_separator as string | undefined) ?? " ";
  const showCompleted = item.options?.agents_show_completed !== false;
  const filtered = showCompleted ? entries : entries.filter((e) => e.end_ts === undefined);
  const slice = filtered.slice(-limit);
  const now = snap.captured_at;
  const parts = slice.map((e) => {
    const elapsed = (e.end_ts ?? now) - e.start_ts;
    const inFlight = e.end_ts === undefined;
    return `${e.type} ${formatElapsed(elapsed)}${inFlight ? "*" : ""}`;
  });
  return parts.join(sep);
};

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs > 0 ? `${m}m${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}
