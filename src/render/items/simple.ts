import type { PulseSnapshot } from "../../core/types.ts";
import type { Item } from "../../config/schema.ts";
import { formatClock, type ClockFormat } from "../format.ts";

// Dead code removal: modelRenderer simplified (show_context_size ternary was always base)
export const modelRenderer = (snap: PulseSnapshot, _item: Item): string => snap.claude.model.display_name;

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
  snap.claude.output_style?.name ?? "";

export const vimModeRenderer = (snap: PulseSnapshot, _item: Item): string =>
  snap.claude.vim?.mode ?? "";

export const agentNameRenderer = (snap: PulseSnapshot, _item: Item): string =>
  snap.claude.agent?.name ?? "";

export const worktreeRenderer = (snap: PulseSnapshot, _item: Item): string =>
  snap.claude.worktree?.name ?? snap.claude.workspace.git_worktree ?? "";

export const textRenderer = (_snap: PulseSnapshot, item: Item): string =>
  item.options?.literal ?? "";

export const spacerRenderer = (_snap: PulseSnapshot, _item: Item): string => " ";

// Dead code removal: cast to full ClockFormat (all 8 formats), drop narrow type-narrowing cast
export const clockRenderer = (_snap: PulseSnapshot, item: Item): string => {
  const fmt = (item.options?.format ?? "clock_24") as ClockFormat;
  return formatClock(Date.now(), fmt);
};
