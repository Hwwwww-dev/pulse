import type { PulseSnapshot } from "../../core/types.ts";
import type { Item } from "../../config/schema.ts";

function topN(counts: Record<string, number>, n: number): string {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
  return entries.map(([k, v]) => `${k}:${v}`).join(" ");
}

function partsSep(item: Item): string {
  return item.options?.parts_separator ?? " ";
}

export const toolCallsRenderer = (snap: PulseSnapshot, item: Item): string => {
  const total = snap.counters.tool_calls_total;
  return item.options?.show_breakdown
    ? `${total}${partsSep(item)}(${topN(snap.counters.tool_calls_by_name, item.options?.breakdown_top_n ?? 3)})`
    : String(total);
};

export const agentCallsRenderer = (snap: PulseSnapshot, item: Item): string => {
  const total = snap.counters.agent_calls_total;
  return item.options?.show_breakdown
    ? `${total}${partsSep(item)}(${topN(snap.counters.agent_calls_by_type, item.options?.breakdown_top_n ?? 3)})`
    : String(total);
};

export const skillCallsRenderer = (snap: PulseSnapshot, item: Item): string => {
  const total = snap.counters.skill_calls_total;
  return item.options?.show_breakdown
    ? `${total}${partsSep(item)}(${topN(snap.counters.skill_calls_by_name, item.options?.breakdown_top_n ?? 3)})`
    : String(total);
};

export const toolCallRenderer = (snap: PulseSnapshot, item: Item): string => {
  const name = item.options?.tool_name;
  if (!name) return item.hide_when_empty ? "" : "?";
  const count = snap.counters.tool_calls_by_name[name] ?? 0;
  if (count === 0 && item.hide_when_empty) return "";
  return String(count);
};
