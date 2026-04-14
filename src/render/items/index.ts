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
  textRenderer,
  spacerRenderer,
  clockRenderer,
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
export type FgOverrideFn = (snap: PulseSnapshot, item: Item) => string | undefined;

import { thresholdColor } from "./helpers.ts";

function contextFgOverride(snap: PulseSnapshot, item: Item): string | undefined {
  // Danger is always driven by the "used" percentage so colors stay semantic
  // (high usage = warning) regardless of display_mode.
  return thresholdColor(snap.claude.context_window.used_percentage, item);
}

function fiveHourFgOverride(snap: PulseSnapshot, item: Item): string | undefined {
  const used = snap.claude.rate_limits?.five_hour?.used_percentage;
  if (used === undefined) return undefined;
  return thresholdColor(used, item);
}

function sevenDayFgOverride(snap: PulseSnapshot, item: Item): string | undefined {
  const used = snap.claude.rate_limits?.seven_day?.used_percentage;
  if (used === undefined) return undefined;
  return thresholdColor(used, item);
}

export const FG_OVERRIDES: Partial<Record<ItemType, FgOverrideFn>> = {
  context_usage: contextFgOverride,
  context_bar: contextFgOverride,
  five_hour_limit: fiveHourFgOverride,
  five_hour_bar: fiveHourFgOverride,
  seven_day_limit: sevenDayFgOverride,
  seven_day_bar: sevenDayFgOverride,
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
  worktree: worktreeRenderer,
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
