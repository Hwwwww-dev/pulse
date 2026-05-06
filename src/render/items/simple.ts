import type { PulseSnapshot, ThinkingEffortLevel } from "../../core/types.ts";
import type { Item } from "../../config/schema.ts";
import { formatClock, type ClockFormat } from "../format.ts";
import { wrapPartial } from "../ansi.ts";

// Effort ladder mirrors Claude Code's Speed↔Intelligence slider:
// low=amber, medium=green, high=blue, xhigh=violet. `max` instead
// paints each character with a *distinct* random hue from
// MAX_RAINBOW_POOL + bold (partial Fisher–Yates, no repeats), so the
// word reshuffles colors on every statusline refresh — mimicking the
// multi-hue shimmer of the slider's rightmost stop.
// Applied only when `dynamic_color` is on.
const THINKING_EFFORT_COLORS: Record<ThinkingEffortLevel, string> = {
  low: "#FFCB6B",
  medium: "#98BB6C",
  high: "#7E9CD8",
  xhigh: "#A78BFA",
  max: "#A78BFA",
};
const MAX_RAINBOW_POOL = [
  "#E06C75", // red
  "#E5C07B", // yellow
  "#98C379", // green
  "#56B6C2", // cyan
  "#61AFEF", // blue
  "#C678DD", // purple
  "#D19A66", // orange
  "#FF6699", // pink
] as const;

// Dead code removal: modelRenderer simplified (show_context_size ternary was always base)
export const modelRenderer = (snap: PulseSnapshot, _item: Item): string =>
  snap.claude.model.display_name.replace(/ context(?=\))/g, "");

export const sessionNameRenderer = (snap: PulseSnapshot, _item: Item): string =>
  snap.claude.session_name ?? snap.claude.session_id.slice(0, 6);

export const sessionIdRenderer = (snap: PulseSnapshot, item: Item): string => {
  const id = snap.claude.session_id;
  const fmt = item.options?.format;
  if (fmt === "id_short") return id.slice(0, 8);
  return id;
};

export const versionRenderer = (snap: PulseSnapshot, _item: Item): string => snap.claude.version;

export const outputStyleRenderer = (snap: PulseSnapshot, _item: Item): string =>
  snap.claude.output_style?.name ?? snap.claude_settings?.outputStyle ?? "-";

export const vimModeRenderer = (snap: PulseSnapshot, _item: Item): string =>
  snap.claude.vim?.mode ?? "";

export const agentNameRenderer = (snap: PulseSnapshot, _item: Item): string =>
  snap.claude.agent?.name ?? "";

export const worktreeRenderer = (snap: PulseSnapshot, _item: Item): string =>
  snap.claude.worktree?.name ?? snap.claude.workspace.git_worktree ?? "";

export const worktreeBranchRenderer = (snap: PulseSnapshot, _item: Item): string =>
  snap.claude.worktree?.branch ?? "";

export const textRenderer = (_snap: PulseSnapshot, item: Item): string =>
  item.options?.literal ?? "";

export const spacerRenderer = (_snap: PulseSnapshot, _item: Item): string => " ";

// Dead code removal: cast to full ClockFormat (all 8 formats), drop narrow type-narrowing cast
export const clockRenderer = (_snap: PulseSnapshot, item: Item): string => {
  const fmt = (item.options?.format ?? "clock_24") as ClockFormat;
  return formatClock(Date.now(), fmt);
};

export const sandboxEnabledRenderer = (snap: PulseSnapshot, item: Item): string => {
  const v = snap.claude_settings?.sandboxEnabled;
  if (v === undefined) return "-";
  const fmt = (item.options?.format ?? "sandbox_on_off") as string;
  if (fmt === "sandbox_bool") return v ? "true" : "false";
  if (fmt === "sandbox_icon") return v ? "🔒" : "🔓";
  return v ? "on" : "off";
};

export const thinkingRenderer = (snap: PulseSnapshot, item: Item): string => {
  const v = snap.claude.thinking?.enabled;
  if (v === undefined) return "-";
  const fmt = (item.options?.format ?? "thinking_on_off") as string;
  if (fmt === "thinking_bool") return v ? "true" : "false";
  if (fmt === "thinking_icon") return v ? "💭" : "💤";
  return v ? "on" : "off";
};

export const fastModeRenderer = (snap: PulseSnapshot, item: Item): string => {
  const v = snap.claude.fast_mode;
  if (v === undefined) return "-";
  const fmt = (item.options?.format ?? "fast_mode_on_off") as string;
  if (fmt === "fast_mode_bool") return v ? "true" : "false";
  if (fmt === "fast_mode_icon") return v ? "⚡" : "🐢";
  return v ? "on" : "off";
};

export const thinkingEffortRenderer = (snap: PulseSnapshot, item: Item): string => {
  // stdin `effort.level` is the freshest source (Claude Code ≥ 2.1.119,
  // updated synchronously on /model or /effort). Fall back to settings.json
  // then JSONL echo for older CC versions. Dash when nothing is available.
  const level: ThinkingEffortLevel | undefined =
    snap.claude.effort?.level
    ?? snap.claude_settings?.effortLevel
    ?? snap.counters.thinking_effort;
  if (!level) return "-";
  if (!item.options?.dynamic_color) return level;
  if (level === "max") {
    // Per-character random rainbow with *no color repeats*. Partial
    // Fisher–Yates: pick `chars.length` distinct hues from the pool,
    // reshuffled on every refresh.
    const chars = [..."max"];
    const pool = [...MAX_RAINBOW_POOL];
    for (let i = 0; i < chars.length; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return chars.map((ch, i) => wrapPartial(ch, { fg: pool[i]!, bold: true })).join("");
  }
  return wrapPartial(level, { fg: THINKING_EFFORT_COLORS[level] });
};
