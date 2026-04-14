import type { PulseSnapshot } from "../../core/types.ts";
import type { Item } from "../../config/schema.ts";

export const recentToolsRenderer = (snap: PulseSnapshot, item: Item): string => {
  const tools = snap.counters?.recent_tools ?? [];
  if (tools.length === 0) return "";
  const limit = (item.options?.recent_limit as number | undefined) ?? 5;
  const sep = (item.options?.parts_separator as string | undefined) ?? " ";
  const nameMax = (item.options?.recent_name_max as number | undefined) ?? 16;
  const group = item.options?.recent_group !== false;
  const countGlue = item.options?.recent_count_compact ? "" : " ";
  const slice = tools.slice(-limit);
  if (!group) {
    return slice.map((t) => truncateName(t.name, nameMax)).join(sep);
  }
  // group adjacent same-name
  const groups: Array<{ name: string; count: number }> = [];
  for (const t of slice) {
    const last = groups[groups.length - 1];
    if (last && last.name === t.name) last.count++;
    else groups.push({ name: t.name, count: 1 });
  }
  return groups
    .map((g) => g.count > 1 ? `${truncateName(g.name, nameMax)}${countGlue}\u00d7${g.count}` : truncateName(g.name, nameMax))
    .join(sep);
};

function truncateName(name: string, max: number): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + "\u2026";
}
