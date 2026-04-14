import type { Item } from "../../config/schema.ts";
import { hexToRgb } from "../ansi.ts";

export type BarStyleName =
  | "dingbat"
  | "shaded"
  | "block"
  | "line"
  | "double"
  | "dot"
  | "square"
  | "ascii";

export const BAR_STYLES: Record<BarStyleName, { filled: string; empty: string }> = {
  dingbat: { filled: "▰", empty: "▱" },
  shaded: { filled: "▓", empty: "░" },
  block: { filled: "█", empty: "·" },
  line: { filled: "━", empty: "─" },
  double: { filled: "═", empty: "─" },
  dot: { filled: "●", empty: "○" },
  square: { filled: "■", empty: "□" },
  ascii: { filled: "#", empty: "-" },
};

export function drawBar(percent: number, item: Item): string {
  const o = item.options ?? {};
  const width = o.bar_width ?? 10;
  const preset = BAR_STYLES[(o.bar_style as BarStyleName | undefined) ?? "dingbat"];
  // bar_filled / bar_empty override the preset when set.
  const filledChar = o.bar_filled ?? preset.filled;
  const emptyChar = o.bar_empty ?? preset.empty;
  const left = o.bar_left_cap ?? "";
  const right = o.bar_right_cap ?? "";
  const clamped = Math.max(0, Math.min(100, percent));
  const filledCount = Math.round((clamped / 100) * width);
  const emptyCount = width - filledCount;
  const bar = `${left}${filledChar.repeat(filledCount)}${emptyChar.repeat(emptyCount)}${right}`;
  // Coloring is handled centrally via FG_OVERRIDES at the engine level,
  // so the entire rendered item (label + bar + value) stays in one color span.
  return o.bar_show_value ? `${bar} ${Math.round(clamped)}%` : bar;
}

// P1-5: lerpHex helper for gradient interpolation
function lerpHex(a: string, b: string, t: number): string | undefined {
  const ra = hexToRgb(a), rb = hexToRgb(b);
  if (!ra || !rb) return undefined;
  const tt = Math.max(0, Math.min(1, t));
  const r = Math.round(ra[0] + (rb[0] - ra[0]) * tt);
  const g = Math.round(ra[1] + (rb[1] - ra[1]) * tt);
  const bl = Math.round(ra[2] + (rb[2] - ra[2]) * tt);
  return `#${[r, g, bl].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

// Default safe → caution → danger ramp used when auto_color is ON.
// Stepped at 20% granularity. Colors are pulled from the in-app palette
// (ColorPicker) so they blend with the rest of the UI rather than
// looking like vibrant tailwind defaults. Each hue band goes
// pastel → vibrant as severity rises.
//   safe     → pastel green   → vibrant green
//   warning  → pastel yellow  → vibrant yellow
//   danger   → vibrant red
export const DEFAULT_DANGER_RAMP: ReadonlyArray<{ at: number; fg: string }> = [
  { at: 0, fg: "#D8F0B1" },    // pastel green
  { at: 20, fg: "#C3E88D" },   // vibrant green
  { at: 40, fg: "#FFE4A1" },   // pastel yellow
  { at: 60, fg: "#FFCB6B" },   // vibrant yellow
  { at: 80, fg: "#F07178" },   // vibrant red
];

// Pick a color from a sorted ramp, optionally gradient-interpolating.
function rampColor(
  dangerPct: number,
  ramp: ReadonlyArray<{ at: number; fg: string }>,
  gradient: boolean,
): string | undefined {
  if (ramp.length === 0) return undefined;
  const d = Math.max(0, Math.min(100, dangerPct));
  let loIdx = -1;
  for (let i = 0; i < ramp.length; i++) {
    if (ramp[i]!.at <= d) loIdx = i;
    else break;
  }
  if (loIdx === -1) return undefined;
  const lo = ramp[loIdx]!;
  if (!gradient || loIdx === ramp.length - 1) return lo.fg;
  const hi = ramp[loIdx + 1]!;
  const span = hi.at - lo.at;
  if (span <= 0) return lo.fg;
  const t = (d - lo.at) / span;
  return lerpHex(lo.fg, hi.fg, t) ?? lo.fg;
}

// Threshold color used by FG_OVERRIDES. Returns undefined unless the user
// explicitly enabled `auto_color` — without the toggle, items keep their
// static `fg`. When ON, always uses DEFAULT_DANGER_RAMP (20% granularity).
// Legacy bar_thresholds in user configs are ignored on purpose: auto_color
// is meant to be a single, predictable, no-config switch.
export function thresholdColor(dangerPct: number, item: Item): string | undefined {
  if (!item.options?.auto_color) return undefined;
  const gradient = item.options?.bar_gradient ?? false;
  return rampColor(dangerPct, DEFAULT_DANGER_RAMP, gradient);
}
