import type { ItemType } from "../../config/schema.ts";

/**
 * Per-item-type metadata driving the Edit modal:
 *  - `formats`: valid values for `options.format` (empty = type has no format enum)
 *  - `supportsVariant`: whether standard/compact has any rendering effect
 *  - `nameKey`: which options.* field holds a picker name (tool_name / agent_type / skill_name)
 *  - `extraFlags`: item-specific booleans to toggle (e.g. show_breakdown for *_calls)
 *  - `extraEnums`: secondary enum pickers beyond the primary `format` (e.g. limit_reset_format)
 *  - `extraTexts`: free-form single-line strings (e.g. custom_command.command)
 */
export interface ItemTypeDef {
  readonly formats: readonly string[];
  readonly supportsVariant: boolean;
  readonly supportsDynamicColor?: boolean;
  readonly supportsDisplayMode?: boolean;
  readonly supportsBarStyle?: boolean;
  readonly nameKey?: "tool_name" | "agent_type" | "skill_name";
  readonly extraFlags?: readonly ExtraFlag[];
  readonly extraEnums?: readonly ExtraEnum[];
  readonly extraNums?: readonly ExtraNum[];
  readonly extraTexts?: readonly ExtraText[];
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
  "braille",
  "vertical",
  "star",
  "heart",
  "flower",
  "chevron",
] as const;

export interface ExtraFlag {
  readonly label: string;
  /** Path under item.options.* — a single key */
  readonly key: string;
  /** Only shown when this boolean flag under options is truthy. */
  readonly requiresFlag?: string;
  /** Treat an unset options[key] as this boolean when rendering & toggling. */
  readonly defaultValue?: boolean;
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
  /** Base ←/→ step size (default 1). */
  readonly step?: number;
  /** Shift+←/→ step size (default step × 10). */
  readonly bigStep?: number;
  /** Per-field override for the "(all)" hint rendered when min===0 and val===0. */
  readonly zeroHint?: string;
  /**
   * When set, the value lives at `options[key][arrayIndex]` (not `options[key]`).
   * On first edit, the array is materialised from `arrayDefaults`. Multiple
   * sibling ExtraNums may target the same key with different indices to expose
   * one slot per scalar — used for ramp/threshold tuples.
   */
  readonly arrayIndex?: number;
  readonly arrayDefaults?: readonly number[];
  /** Clamp to neighbour values to keep the array ascending (used by ramp stops). */
  readonly enforceAscending?: boolean;
}

export interface ExtraText {
  readonly label: string;
  /** Path under item.options.* — a single key */
  readonly key: string;
  /** Placeholder shown when the value is empty. */
  readonly placeholder?: string;
}

const BREAKDOWN_TOP_N_NUM: ExtraNum = {
  label: "breakdown_top_n",
  key: "breakdown_top_n",
  defaultValue: 3,
  min: 0, // 0 = show all
  max: 20,
  requiresFlag: "show_breakdown",
};

const BREAKDOWN_MAX_CHARS_NUM: ExtraNum = {
  label: "breakdown_max_chars",
  key: "breakdown_max_chars",
  defaultValue: 0,
  min: 0, // 0 = no cap
  max: 200,
  requiresFlag: "show_breakdown",
  step: 10,
  bigStep: 50,
};

// Danger threshold (percentage) at which the blink effect kicks in. Gated
// on the `blink` flag so it only appears in the editor after the user opts
// into the behaviour.
const BLINK_FLAG: ExtraFlag = { label: "blink", key: "blink" };
const BLINK_AT_NUM: ExtraNum = {
  label: "blink_at",
  key: "blink_at",
  defaultValue: 80,
  min: 0,
  max: 100,
  requiresFlag: "blink",
  step: 1,
  bigStep: 5,
};

// Per-sub-part target toggles. Rendered as child flags under the master
// switch (dynamic_color / blink); all default to true so simply flipping
// the master lights up every part.
const COLOR_LABEL_FLAG: ExtraFlag = {
  label: "  ↳ dynamic: label", key: "color_label",
  requiresFlag: "dynamic_color", defaultValue: true,
};
const COLOR_BAR_FLAG: ExtraFlag = {
  label: "  ↳ dynamic: bar", key: "color_bar",
  requiresFlag: "dynamic_color", defaultValue: true,
};
const COLOR_VALUE_FLAG: ExtraFlag = {
  label: "  ↳ dynamic: value", key: "color_value",
  requiresFlag: "dynamic_color", defaultValue: true,
};
const BLINK_LABEL_FLAG: ExtraFlag = {
  label: "  ↳ blink: label", key: "blink_label",
  requiresFlag: "blink", defaultValue: true,
};
const BLINK_BAR_FLAG: ExtraFlag = {
  label: "  ↳ blink: bar", key: "blink_bar",
  requiresFlag: "blink", defaultValue: true,
};
const BLINK_VALUE_FLAG: ExtraFlag = {
  label: "  ↳ blink: value", key: "blink_value",
  requiresFlag: "blink", defaultValue: true,
};
const COLOR_RESET_FLAG: ExtraFlag = {
  label: "  ↳ dynamic: reset", key: "color_reset",
  requiresFlag: "dynamic_color", defaultValue: true,
};
const BLINK_RESET_FLAG: ExtraFlag = {
  label: "  ↳ blink: reset", key: "blink_reset",
  requiresFlag: "blink", defaultValue: true,
};
const COLOR_TARGET_FLAGS: readonly ExtraFlag[] = [
  COLOR_LABEL_FLAG, COLOR_BAR_FLAG, COLOR_VALUE_FLAG,
];

// Five movable breakpoints for the dynamic-color ramp. Colors stay fixed
// (DEFAULT_DANGER_RAMP); the user only shifts the `at` values. Gated on
// `dynamic_color` so they only surface after opt-in.
const COLOR_RAMP_DEFAULTS = [0, 20, 40, 60, 80] as const;
const COLOR_RAMP_LABELS = [
  "  ↳ stop1 (safe)",
  "  ↳ stop2 (ok)",
  "  ↳ stop3 (warn)",
  "  ↳ stop4 (high)",
  "  ↳ stop5 (danger)",
] as const;
const COLOR_RAMP_STOP_NUMS: readonly ExtraNum[] = COLOR_RAMP_DEFAULTS.map(
  (dflt, i) => ({
    label: COLOR_RAMP_LABELS[i]!,
    key: "color_ramp_stops",
    defaultValue: dflt,
    min: 0,
    max: 100,
    requiresFlag: "dynamic_color",
    step: 1,
    bigStep: 5,
    arrayIndex: i,
    arrayDefaults: COLOR_RAMP_DEFAULTS,
    enforceAscending: true,
  }),
);
const BLINK_TARGET_FLAGS: readonly ExtraFlag[] = [
  BLINK_LABEL_FLAG, BLINK_BAR_FLAG, BLINK_VALUE_FLAG,
];
// Limit items (five_hour_*, seven_day_*) additionally have a reset
// countdown sub-part, so they get the extra target flag.
const LIMIT_COLOR_TARGET_FLAGS: readonly ExtraFlag[] = [
  ...COLOR_TARGET_FLAGS, COLOR_RESET_FLAG,
];
const LIMIT_BLINK_TARGET_FLAGS: readonly ExtraFlag[] = [
  ...BLINK_TARGET_FLAGS, BLINK_RESET_FLAG,
];


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
    supportsDynamicColor: true,
    supportsDisplayMode: true,
    supportsBarStyle: true,
    extraFlags: [
      ...COLOR_TARGET_FLAGS,
      { label: "show_bar", key: "show_bar" },
      { label: "show_absolute", key: "ctx_show_absolute" },
      BLINK_FLAG,
      ...BLINK_TARGET_FLAGS,
    ],
    extraNums: [...COLOR_RAMP_STOP_NUMS, BLINK_AT_NUM],
  },
  context_bar: {
    formats: [],
    supportsVariant: false,
    supportsDynamicColor: true,
    supportsDisplayMode: true,
    supportsBarStyle: true,
    extraFlags: [...COLOR_TARGET_FLAGS, BLINK_FLAG, ...BLINK_TARGET_FLAGS],
    extraNums: [...COLOR_RAMP_STOP_NUMS, BLINK_AT_NUM],
  },
  exceeds_200k: {
    formats: [],
    supportsVariant: false,
    extraTexts: [{ label: "literal", key: "literal", placeholder: "⚠ 200k+" }],
  },

  tokens_input: { formats: TOKENS_FORMATS, supportsVariant: true },
  tokens_output: { formats: TOKENS_FORMATS, supportsVariant: true },
  tokens_cache_read: { formats: TOKENS_FORMATS, supportsVariant: true },
  tokens_cache_create: { formats: TOKENS_FORMATS, supportsVariant: true },
  tokens_summary: { formats: TOKENS_FORMATS, supportsVariant: true },

  five_hour_limit: {
    formats: PERCENT_FORMATS,
    supportsVariant: true,
    supportsDynamicColor: true,
    supportsDisplayMode: true,
    supportsBarStyle: true,
    extraFlags: [
      ...LIMIT_COLOR_TARGET_FLAGS,
      { label: "show_bar", key: "show_bar" },
      { label: "show_reset", key: "limit_show_reset" },
      BLINK_FLAG,
      ...LIMIT_BLINK_TARGET_FLAGS,
    ],
    extraEnums: [LIMIT_RESET_FORMAT_ENUM],
    extraNums: [...COLOR_RAMP_STOP_NUMS, BLINK_AT_NUM],
  },
  seven_day_limit: {
    formats: PERCENT_FORMATS,
    supportsVariant: true,
    supportsDynamicColor: true,
    supportsDisplayMode: true,
    supportsBarStyle: true,
    extraFlags: [
      ...LIMIT_COLOR_TARGET_FLAGS,
      { label: "show_bar", key: "show_bar" },
      { label: "show_reset", key: "limit_show_reset" },
      BLINK_FLAG,
      ...LIMIT_BLINK_TARGET_FLAGS,
    ],
    extraEnums: [LIMIT_RESET_FORMAT_ENUM],
    extraNums: [...COLOR_RAMP_STOP_NUMS, BLINK_AT_NUM],
  },
  five_hour_bar: {
    formats: [],
    supportsVariant: false,
    supportsDynamicColor: true,
    supportsDisplayMode: true,
    supportsBarStyle: true,
    extraFlags: [
      ...LIMIT_COLOR_TARGET_FLAGS,
      { label: "show_reset", key: "limit_show_reset" },
      BLINK_FLAG,
      ...LIMIT_BLINK_TARGET_FLAGS,
    ],
    extraEnums: [LIMIT_RESET_FORMAT_ENUM],
    extraNums: [...COLOR_RAMP_STOP_NUMS, BLINK_AT_NUM],
  },
  seven_day_bar: {
    formats: [],
    supportsVariant: false,
    supportsDynamicColor: true,
    supportsDisplayMode: true,
    supportsBarStyle: true,
    extraFlags: [
      ...LIMIT_COLOR_TARGET_FLAGS,
      { label: "show_reset", key: "limit_show_reset" },
      BLINK_FLAG,
      ...LIMIT_BLINK_TARGET_FLAGS,
    ],
    extraEnums: [LIMIT_RESET_FORMAT_ENUM],
    extraNums: [...COLOR_RAMP_STOP_NUMS, BLINK_AT_NUM],
  },
  reset_in_5h: { formats: RELATIVE_FORMATS, supportsVariant: true },
  reset_in_7d: { formats: RELATIVE_FORMATS, supportsVariant: true },

  tool_calls: {
    formats: INTEGER_FORMATS,
    supportsVariant: false,
    extraFlags: [{ label: "show_breakdown", key: "show_breakdown" }],
    extraNums: [BREAKDOWN_TOP_N_NUM, BREAKDOWN_MAX_CHARS_NUM],
  },
  agent_calls: {
    formats: INTEGER_FORMATS,
    supportsVariant: false,
    extraFlags: [{ label: "show_breakdown", key: "show_breakdown" }],
    extraNums: [BREAKDOWN_TOP_N_NUM, BREAKDOWN_MAX_CHARS_NUM],
  },
  skill_calls: {
    formats: INTEGER_FORMATS,
    supportsVariant: false,
    extraFlags: [{ label: "show_breakdown", key: "show_breakdown" }],
    extraNums: [BREAKDOWN_TOP_N_NUM, BREAKDOWN_MAX_CHARS_NUM],
  },
  tool_call: { formats: INTEGER_FORMATS, supportsVariant: false, nameKey: "tool_name" },

  agent_name: { formats: [], supportsVariant: false },
  output_style: { formats: [], supportsVariant: false },
  vim_mode: { formats: [], supportsVariant: false },
  thinking_effort: {
    formats: [],
    supportsVariant: false,
    supportsDynamicColor: true,
  },
  worktree: { formats: [], supportsVariant: false },
  worktree_branch: { formats: [], supportsVariant: false },
  version: { formats: [], supportsVariant: false },
  clock: { formats: CLOCK_FORMATS, supportsVariant: false },
  text: { formats: [], supportsVariant: false },
  spacer: { formats: [], supportsVariant: false },
  custom_command: {
    formats: [],
    supportsVariant: false,
    extraTexts: [
      { label: "command", key: "command", placeholder: "e.g. git rev-parse --short HEAD" },
    ],
    extraFlags: [
      { label: "command_trim", key: "command_trim", defaultValue: true },
    ],
    extraNums: [
      {
        label: "command_timeout_ms",
        key: "command_timeout_ms",
        defaultValue: 1000,
        min: 100,
        max: 60000,
        step: 100,
        bigStep: 1000,
      },
      {
        label: "command_cache_ms",
        key: "command_cache_ms",
        defaultValue: 0,
        min: 0,
        max: 3600000,
        step: 100,
        bigStep: 10000,
        zeroHint: " (off)",
      },
    ],
  },
  recent_agents: {
    formats: DURATION_FORMATS,
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
