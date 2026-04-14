import type { ItemType } from "../../config/schema.ts";

/**
 * Per-item-type metadata driving the Edit modal:
 *  - `formats`: valid values for `options.format` (empty = type has no format enum)
 *  - `supportsVariant`: whether standard/compact has any rendering effect
 *  - `nameKey`: which options.* field holds a picker name (tool_name / agent_type / skill_name)
 *  - `extraFlags`: item-specific booleans to toggle (e.g. show_breakdown for *_calls)
 *  - `extraEnums`: secondary enum pickers beyond the primary `format` (e.g. limit_reset_format)
 */
export interface ItemTypeDef {
  readonly formats: readonly string[];
  readonly supportsVariant: boolean;
  readonly supportsAutoColor?: boolean;
  readonly supportsDisplayMode?: boolean;
  readonly supportsBarStyle?: boolean;
  readonly nameKey?: "tool_name" | "agent_type" | "skill_name";
  readonly extraFlags?: readonly ExtraFlag[];
  readonly extraEnums?: readonly ExtraEnum[];
  readonly extraNums?: readonly ExtraNum[];
}

export const BAR_STYLE_PRESETS = [
  "dingbat",
  "shaded",
  "block",
  "line",
  "double",
  "dot",
  "square",
  "ascii",
] as const;

export interface ExtraFlag {
  readonly label: string;
  /** Path under item.options.* — a single key */
  readonly key: string;
}

export interface ExtraEnum {
  readonly label: string;
  /** Path under item.options.* — a single key */
  readonly key: string;
  readonly options: readonly string[];
  readonly defaultValue: string;
}

export interface ExtraNum {
  readonly label: string;
  /** Path under item.options.* — a single key */
  readonly key: string;
  readonly defaultValue: number;
  readonly min: number;
  readonly max: number;
  /** Only shown when this boolean flag under options is truthy. */
  readonly requiresFlag?: string;
}

const BREAKDOWN_TOP_N_NUM: ExtraNum = {
  label: "breakdown_top_n",
  key: "breakdown_top_n",
  defaultValue: 3,
  min: 0, // 0 = show all
  max: 20,
  requiresFlag: "show_breakdown",
};

const LIMIT_RESET_FORMATS = [
  "relative_eta_long_compact",
  "relative_eta_long",
  "relative_eta_compact",
  "relative_eta",
  "clock_at_smart_12",
  "clock_at_smart_24",
  "clock_at_12",
  "clock_at_24",
] as const;

const LIMIT_RESET_FORMAT_ENUM: ExtraEnum = {
  label: "reset_format",
  key: "limit_reset_format",
  options: LIMIT_RESET_FORMATS,
  defaultValue: "relative_eta_long_compact",
};

const TODOS_MODES = ["compact", "bar", "detail"] as const;

const TODOS_MODE_ENUM: ExtraEnum = {
  label: "todos_mode",
  key: "todos_mode",
  options: TODOS_MODES,
  defaultValue: "compact",
};

const RATE_FORMATS = ["per_sec", "per_min"] as const;

const RATE_FORMAT_ENUM: ExtraEnum = {
  label: "rate_format",
  key: "rate_format",
  options: RATE_FORMATS,
  defaultValue: "per_sec",
};

const COST_FORMATS = ["usd2", "usd4", "compact"] as const;
const DURATION_FORMATS = ["duration_hms", "duration_compact", "duration_ms"] as const;
const CLOCK_FORMATS = [
  "clock_24",
  "clock_24_sec",
  "clock_12",
  "date_iso",
  "date_short",
  "date_long",
  "datetime_short_24",
  "datetime_short_12",
] as const;
const RELATIVE_FORMATS = [
  "relative_eta_long_compact",
  "relative_eta_long",
  "relative_eta_compact",
  "relative_eta",
  "clock_at_smart_12",
  "clock_at_smart_24",
  "clock_at_12",
  "clock_at_24",
] as const;
const PERCENT_FORMATS = ["percent0", "percent1"] as const;
const TOKENS_FORMATS = ["tokens_compact", "tokens_full"] as const;
const INTEGER_FORMATS = ["integer", "compact"] as const;

export const ITEM_TYPE_DEFS: Record<ItemType, ItemTypeDef> = {
  model: { formats: [], supportsVariant: false },
  session_name: { formats: [], supportsVariant: false },
  session_id: { formats: ["id_short", "id_full"], supportsVariant: false },
  cwd: { formats: [], supportsVariant: false },
  project_dir: { formats: [], supportsVariant: false },
  git_branch: { formats: [], supportsVariant: false },

  cost: { formats: COST_FORMATS, supportsVariant: true },
  duration: { formats: DURATION_FORMATS, supportsVariant: true },
  api_duration: { formats: DURATION_FORMATS, supportsVariant: true },
  lines_changed: { formats: [], supportsVariant: false },

  context_usage: {
    formats: PERCENT_FORMATS,
    supportsVariant: true,
    supportsAutoColor: true,
    supportsDisplayMode: true,
    supportsBarStyle: true,
    extraFlags: [
      { label: "show_bar", key: "show_bar" },
      { label: "show_absolute", key: "ctx_show_absolute" },
    ],
  },
  context_bar: {
    formats: [],
    supportsVariant: false,
    supportsAutoColor: true,
    supportsDisplayMode: true,
    supportsBarStyle: true,
  },

  tokens_input: { formats: TOKENS_FORMATS, supportsVariant: true },
  tokens_output: { formats: TOKENS_FORMATS, supportsVariant: true },
  tokens_cache_read: { formats: TOKENS_FORMATS, supportsVariant: true },
  tokens_cache_create: { formats: TOKENS_FORMATS, supportsVariant: true },
  tokens_summary: { formats: TOKENS_FORMATS, supportsVariant: true },

  five_hour_limit: {
    formats: PERCENT_FORMATS,
    supportsVariant: true,
    supportsAutoColor: true,
    supportsDisplayMode: true,
    supportsBarStyle: true,
    extraFlags: [
      { label: "show_bar", key: "show_bar" },
      { label: "show_reset", key: "limit_show_reset" },
    ],
    extraEnums: [LIMIT_RESET_FORMAT_ENUM],
  },
  seven_day_limit: {
    formats: PERCENT_FORMATS,
    supportsVariant: true,
    supportsAutoColor: true,
    supportsDisplayMode: true,
    supportsBarStyle: true,
    extraFlags: [
      { label: "show_bar", key: "show_bar" },
      { label: "show_reset", key: "limit_show_reset" },
    ],
    extraEnums: [LIMIT_RESET_FORMAT_ENUM],
  },
  five_hour_bar: {
    formats: [],
    supportsVariant: false,
    supportsAutoColor: true,
    supportsDisplayMode: true,
    supportsBarStyle: true,
    extraFlags: [{ label: "show_reset", key: "limit_show_reset" }],
    extraEnums: [LIMIT_RESET_FORMAT_ENUM],
  },
  seven_day_bar: {
    formats: [],
    supportsVariant: false,
    supportsAutoColor: true,
    supportsDisplayMode: true,
    supportsBarStyle: true,
    extraFlags: [{ label: "show_reset", key: "limit_show_reset" }],
    extraEnums: [LIMIT_RESET_FORMAT_ENUM],
  },
  reset_in_5h: { formats: RELATIVE_FORMATS, supportsVariant: true },
  reset_in_7d: { formats: RELATIVE_FORMATS, supportsVariant: true },

  tool_calls: {
    formats: INTEGER_FORMATS,
    supportsVariant: false,
    extraFlags: [{ label: "show_breakdown", key: "show_breakdown" }],
    extraNums: [BREAKDOWN_TOP_N_NUM],
  },
  agent_calls: {
    formats: INTEGER_FORMATS,
    supportsVariant: false,
    extraFlags: [{ label: "show_breakdown", key: "show_breakdown" }],
    extraNums: [BREAKDOWN_TOP_N_NUM],
  },
  skill_calls: {
    formats: INTEGER_FORMATS,
    supportsVariant: false,
    extraFlags: [{ label: "show_breakdown", key: "show_breakdown" }],
    extraNums: [BREAKDOWN_TOP_N_NUM],
  },
  tool_call: { formats: INTEGER_FORMATS, supportsVariant: false, nameKey: "tool_name" },

  agent_name: { formats: [], supportsVariant: false },
  output_style: { formats: [], supportsVariant: false },
  vim_mode: { formats: [], supportsVariant: false },
  worktree: { formats: [], supportsVariant: false },
  version: { formats: [], supportsVariant: false },
  clock: { formats: CLOCK_FORMATS, supportsVariant: false },
  text: { formats: [], supportsVariant: false },
  spacer: { formats: [], supportsVariant: false },
  custom_command: { formats: [], supportsVariant: false },
  recent_agents: {
    formats: [],
    supportsVariant: false,
    extraFlags: [{ label: "show_completed", key: "agents_show_completed" }],
  },
  recent_tools: {
    formats: [],
    supportsVariant: false,
    extraFlags: [
      { label: "group_adjacent", key: "recent_group" },
      { label: "count_compact", key: "recent_count_compact" },
    ],
  },
  todos_progress: {
    formats: [],
    supportsVariant: false,
    supportsBarStyle: true,
    extraFlags: [{ label: "show_current", key: "todos_show_current" }],
    extraEnums: [TODOS_MODE_ENUM],
  },
  token_rate: {
    formats: [],
    supportsVariant: false,
    extraEnums: [RATE_FORMAT_ENUM],
  },
};

export function defForType(t: ItemType): ItemTypeDef {
  return ITEM_TYPE_DEFS[t];
}
