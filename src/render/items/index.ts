import type { PulseSnapshot } from "../../core/types.ts";
import type { Item, ItemType } from "../../config/schema.ts";
import {
  modelRenderer,
  sessionNameRenderer,
  sessionIdRenderer,
  versionRenderer,
  outputStyleRenderer,
  vimModeRenderer,
  agentNameRenderer,
  worktreeRenderer,
  worktreeBranchRenderer,
  textRenderer,
  spacerRenderer,
  clockRenderer,
  thinkingEffortRenderer,
  thinkingRenderer,
  fastModeRenderer,
  sandboxEnabledRenderer,
} from "./simple.ts";
import { cwdRenderer, projectDirRenderer } from "./paths.ts";
import {
  fiveHourLimitRenderer,
  sevenDayLimitRenderer,
  fiveHourBarRenderer,
  sevenDayBarRenderer,
  resetIn5hRenderer,
  resetIn7dRenderer,
} from "./limits.ts";
import {
  toolCallsRenderer,
  agentCallsRenderer,
  skillCallsRenderer,
  toolCallRenderer,
} from "./counters.ts";
import { gitBranchRenderer } from "./git.ts";
import {
  costRenderer,
  durationRenderer,
  apiDurationRenderer,
  linesChangedRenderer,
} from "./cost.ts";
import {
  contextUsageRenderer,
  contextBarRenderer,
  exceeds200kRenderer,
  tokensInputRenderer,
  tokensOutputRenderer,
  tokensCacheReadRenderer,
  tokensCacheCreateRenderer,
  tokensSummaryRenderer,
} from "./context.ts";
import { customCommandRenderer } from "./customCommand.ts";
import { recentAgentsRenderer } from "./agents.ts";
import { recentToolsRenderer } from "./recentTools.ts";
import { todosProgressRenderer } from "./todos.ts";
import { tokenRateRenderer } from "./tokenRate.ts";

export type ItemRenderer = (snap: PulseSnapshot, item: Item) => string;
import type { TextStyleInput } from "../ansi.ts";
export type StyleOverrideFn = (
  snap: PulseSnapshot,
  item: Item,
) => Partial<TextStyleInput> | undefined;

import { subPartStyle } from "./helpers.ts";

// Label-only override: engine consults this to decide whether the item's
// label should pick up the dynamic_color / blink effects. Value and bar
// are handled inside their own renderers (see context.ts / limits.ts) so
// each sub-part can be targeted independently.
function labelPatchFromPct(item: Item, pct: number): Partial<TextStyleInput> | undefined {
  const patch = subPartStyle(item, pct, "label");
  if (!patch.fg && !patch.blink && !patch.bold) return undefined;
  return patch;
}

function contextLabelOverride(snap: PulseSnapshot, item: Item): Partial<TextStyleInput> | undefined {
  return labelPatchFromPct(item, snap.claude.context_window.used_percentage);
}

function fiveHourLabelOverride(snap: PulseSnapshot, item: Item): Partial<TextStyleInput> | undefined {
  const used = snap.claude.rate_limits?.five_hour?.used_percentage;
  if (used === undefined) return undefined;
  return labelPatchFromPct(item, used);
}

function sevenDayLabelOverride(snap: PulseSnapshot, item: Item): Partial<TextStyleInput> | undefined {
  const used = snap.claude.rate_limits?.seven_day?.used_percentage;
  if (used === undefined) return undefined;
  return labelPatchFromPct(item, used);
}

export const LABEL_STYLE_OVERRIDES: Partial<Record<ItemType, StyleOverrideFn>> = {
  context_usage: contextLabelOverride,
  context_bar: contextLabelOverride,
  five_hour_limit: fiveHourLabelOverride,
  five_hour_bar: fiveHourLabelOverride,
  seven_day_limit: sevenDayLabelOverride,
  seven_day_bar: sevenDayLabelOverride,
};

export const RENDERERS: Record<ItemType, ItemRenderer> = {
  model: modelRenderer,
  session_name: sessionNameRenderer,
  session_id: sessionIdRenderer,
  cwd: cwdRenderer,
  project_dir: projectDirRenderer,
  git_branch: gitBranchRenderer,
  cost: costRenderer,
  duration: durationRenderer,
  api_duration: apiDurationRenderer,
  lines_changed: linesChangedRenderer,
  context_usage: contextUsageRenderer,
  context_bar: contextBarRenderer,
  exceeds_200k: exceeds200kRenderer,
  tokens_input: tokensInputRenderer,
  tokens_output: tokensOutputRenderer,
  tokens_cache_read: tokensCacheReadRenderer,
  tokens_cache_create: tokensCacheCreateRenderer,
  tokens_summary: tokensSummaryRenderer,
  five_hour_limit: fiveHourLimitRenderer,
  seven_day_limit: sevenDayLimitRenderer,
  five_hour_bar: fiveHourBarRenderer,
  seven_day_bar: sevenDayBarRenderer,
  reset_in_5h: resetIn5hRenderer,
  reset_in_7d: resetIn7dRenderer,
  tool_calls: toolCallsRenderer,
  agent_calls: agentCallsRenderer,
  skill_calls: skillCallsRenderer,
  tool_call: toolCallRenderer,
  agent_name: agentNameRenderer,
  output_style: outputStyleRenderer,
  vim_mode: vimModeRenderer,
  thinking_effort: thinkingEffortRenderer,
  thinking: thinkingRenderer,
  fast_mode: fastModeRenderer,
  sandbox_enabled: sandboxEnabledRenderer,
  worktree: worktreeRenderer,
  worktree_branch: worktreeBranchRenderer,
  version: versionRenderer,
  clock: clockRenderer,
  text: textRenderer,
  spacer: spacerRenderer,
  custom_command: customCommandRenderer,
  recent_agents: recentAgentsRenderer,
  recent_tools: recentToolsRenderer,
  todos_progress: todosProgressRenderer,
  token_rate: tokenRateRenderer,
};
