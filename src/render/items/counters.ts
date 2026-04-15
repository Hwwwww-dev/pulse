import type { PulseSnapshot } from "../../core/types.ts";
import type { Item } from "../../config/schema.ts";
import { compact } from "../format.ts";

const ELLIPSIS = "\u2026";

// tool_calls/agent_calls/skill_calls/tool_call expose `format` (integer|compact)
// in the editor; honor it instead of dumping String(total). Default = integer
// so existing configs render unchanged.
function fmtCount(item: Item, n: number): string {
  return item.options?.format === "compact" ? compact(n) : String(Math.trunc(n));
}

function breakdown(counts: Record<string, number>, n: number, maxChars: number): string {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  // n <= 0 means "show all"
  const entries = n <= 0 ? sorted : sorted.slice(0, n);
  // Match recent_tools grouping style: `Name×Count`.
  const pieces = entries.map(([k, v]) => `${k}\u00d7${v}`);
  const joined = pieces.join(" ");
  if (maxChars <= 0 || joined.length <= maxChars) return joined;
  // Truncate at piece boundary; reserve 1 char for the trailing ellipsis.
  const kept: string[] = [];
  let len = 0;
  for (const p of pieces) {
    const add = kept.length === 0 ? p.length : p.length + 1; // +1 for space
    if (len + add + ELLIPSIS.length > maxChars) break;
    kept.push(p);
    len += add;
  }
  return kept.length === 0 ? ELLIPSIS : kept.join(" ") + ELLIPSIS;
}

function partsSep(item: Item): string {
  return item.options?.parts_separator ?? " ";
}

function breakdownOpts(item: Item): { n: number; max: number } {
  return {
    n: (item.options?.breakdown_top_n as number | undefined) ?? 3,
    max: (item.options?.breakdown_max_chars as number | undefined) ?? 0,
  };
}

// Zero-valued counters collapse to empty unless the user explicitly opts back
// in via hide_when_empty=false. Rationale: when a capability was never used
// in a session (e.g. no agents dispatched), showing "0" is pure noise and
// competes for statusline real estate with data that matters. Users who want
// the constant "0" sentinel can override per-item.
function hideZero(item: Item): boolean {
  return item.hide_when_empty !== false;
}

export const toolCallsRenderer = (snap: PulseSnapshot, item: Item): string => {
  const total = snap.counters.tool_calls_total;
  if (total === 0 && hideZero(item)) return "";
  const head = fmtCount(item, total);
  if (!item.options?.show_breakdown) return head;
  const { n, max } = breakdownOpts(item);
  return `${head}${partsSep(item)}(${breakdown(snap.counters.tool_calls_by_name, n, max)})`;
};

export const agentCallsRenderer = (snap: PulseSnapshot, item: Item): string => {
  const total = snap.counters.agent_calls_total;
  if (total === 0 && hideZero(item)) return "";
  const head = fmtCount(item, total);
  if (!item.options?.show_breakdown) return head;
  const { n, max } = breakdownOpts(item);
  return `${head}${partsSep(item)}(${breakdown(snap.counters.agent_calls_by_type, n, max)})`;
};

export const skillCallsRenderer = (snap: PulseSnapshot, item: Item): string => {
  const total = snap.counters.skill_calls_total;
  if (total === 0 && hideZero(item)) return "";
  const head = fmtCount(item, total);
  if (!item.options?.show_breakdown) return head;
  const { n, max } = breakdownOpts(item);
  return `${head}${partsSep(item)}(${breakdown(snap.counters.skill_calls_by_name, n, max)})`;
};

export const toolCallRenderer = (snap: PulseSnapshot, item: Item): string => {
  const name = item.options?.tool_name;
  if (!name) return item.hide_when_empty ? "" : "?";
  const count = snap.counters.tool_calls_by_name[name] ?? 0;
  if (count === 0 && item.hide_when_empty) return "";
  return fmtCount(item, count);
};
