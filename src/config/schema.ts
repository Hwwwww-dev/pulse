import { z } from "zod";

export const ItemTypeSchema = z.enum([
  "model",
  "session_name",
  "session_id",
  "cwd",
  "project_dir",
  "git_branch",
  "cost",
  "duration",
  "api_duration",
  "lines_changed",
  "context_usage",
  "context_bar",
  "exceeds_200k",
  "tokens_input",
  "tokens_output",
  "tokens_cache_read",
  "tokens_cache_create",
  "tokens_summary",
  "five_hour_limit",
  "seven_day_limit",
  "five_hour_bar",
  "seven_day_bar",
  "reset_in_5h",
  "reset_in_7d",
  "tool_calls",
  "agent_calls",
  "skill_calls",
  "tool_call",
  "agent_name",
  "output_style",
  "vim_mode",
  "thinking_effort",
  "thinking",
  "fast_mode",
  "sandbox_enabled",
  "worktree",
  "worktree_branch",
  "version",
  "clock",
  "text",
  "spacer",
  "custom_command",
  "recent_agents",
  "recent_tools",
  "todos_progress",
  "token_rate",
]);
export type ItemType = z.infer<typeof ItemTypeSchema>;

const ColorSchema = z.string();

/**
 * User-facing style for items and labels. Exposes a single semantic
 * `color` field instead of fg/bg — the render engine decides whether to
 * paint that color as a foreground (classic themes) or as a background
 * slot override (powerline), so users don't have to think about
 * terminal plumbing when editing their bar.
 */
export const TextStyleSchema = z
  .object({
    color: ColorSchema.optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    dim: z.boolean().optional(),
  })
  .strict();

export const FormatSchema = z.enum([
  "usd2",
  "usd4",
  "compact",
  "integer",
  "percent0",
  "percent1",
  "duration_hms",
  "duration_compact",
  "duration_ms",
  "clock_24",
  "clock_24_sec",
  "clock_12",
  "date_iso",
  "date_short",
  "date_long",
  "datetime_short_24",
  "datetime_short_12",
  "relative_eta",
  "relative_eta_compact",
  "relative_eta_long",
  "relative_eta_long_compact",
  "relative_ago",
  "relative_ago_compact",
  "relative_ago_long",
  "relative_ago_long_compact",
  "clock_at_12",
  "clock_at_24",
  "clock_at_smart_12",
  "clock_at_smart_24",
  "tokens_compact",
  "tokens_full",
  "id_short",
  "id_full",
  "sandbox_on_off",
  "sandbox_bool",
  "sandbox_icon",
  "thinking_on_off",
  "thinking_bool",
  "thinking_icon",
  "fast_mode_on_off",
  "fast_mode_bool",
  "fast_mode_icon",
]);

const BarThresholdSchema = z.object({
  at: z.number().min(0).max(100),
  color: ColorSchema,
});

export const ItemOptionsSchema = z
  .object({
    format: FormatSchema.optional(),
    path_mode: z.enum(["basename", "tilde", "short", "full"]).optional(),
    bar_width: z.number().int().min(1).max(80).optional(),
    /** Preset character pair for bar rendering. Overridden by bar_filled/empty. */
    bar_style: z
      .enum([
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
      ])
      .optional(),
    bar_filled: z.string().optional(),
    bar_empty: z.string().optional(),
    bar_left_cap: z.string().optional(),
    bar_right_cap: z.string().optional(),
    bar_show_value: z.boolean().optional(),
    bar_thresholds: z.array(BarThresholdSchema).optional().transform((arr) => arr ? arr.slice().sort((a, b) => a.at - b.at) : arr),
    bar_gradient: z.boolean().optional(),
    /** Apply default green→yellow→red threshold ramp when bar_thresholds is unset. */
    dynamic_color: z.boolean().optional(),
    /**
     * Custom breakpoints for the 5-tier dynamic-color ramp. Length must be
     * exactly 5, ascending, each in [0, 100]. Colors stay fixed
     * (DEFAULT_DANGER_RAMP); only the `at` values shift. Unset → default
     * stops [0, 20, 40, 60, 80].
     */
    color_ramp_stops: z
      .array(z.number().min(0).max(100))
      .length(5)
      .refine(
        (arr) => arr.every((v, i) => i === 0 || v >= arr[i - 1]!),
        { message: "color_ramp_stops must be ascending" },
      )
      .optional(),
    literal: z.string().optional(),
    git_dirty_marker: z.string().optional(),
    git_show_ahead_behind: z.boolean().optional(),
    limit_show_reset: z.boolean().optional(),
    limit_warn_at: z.number().min(0).max(100).optional(),
    /**
     * Glue string between sub-components of a single fused item
     * (e.g. bar↔percent↔reset on *_limit, type↔elapsed inside each
     * recent_agents entry, total↔(top) on *_calls). Empty string
     * collapses the gap entirely. Each item type keeps its own
     * default to preserve existing visuals when this is unset.
     */
    parts_separator: z.string().optional(),
    /** context_usage / *_limit / *_bar: show used vs remaining percentage */
    display_mode: z.enum(["used", "remaining"]).optional(),
    /** context_usage / *_limit: render an inline bar alongside the percentage */
    show_bar: z.boolean().optional(),
    show_breakdown: z.boolean().optional(),
    // 0 = show all
    breakdown_top_n: z.number().int().min(0).max(20).optional(),
    // 0 = no char cap
    breakdown_max_chars: z.number().int().min(0).max(500).optional(),
    tokens_parts: z
      .array(z.enum(["input", "output", "cache_read", "cache_create", "total"]))
      .optional(),
    tokens_icons: z
      .object({
        input: z.string().optional(),
        output: z.string().optional(),
        cache_read: z.string().optional(),
        cache_create: z.string().optional(),
        total: z.string().optional(),
      })
      .partial()
      .optional(),
    show_context_size: z.enum(["auto", "never"]).optional(),
    /** context_usage: also show absolute used tokens (e.g. "6.0%  57.7k") */
    ctx_show_absolute: z.boolean().optional(),
    /** context_usage: format for the absolute token count */
    ctx_absolute_format: z.enum(["tokens_compact", "tokens_full"]).optional(),
    /** *_limit / *_bar: reset countdown format when limit_show_reset=true */
    limit_reset_format: z
      .enum([
        "relative_eta",
        "relative_eta_compact",
        "relative_eta_long",
        "relative_eta_long_compact",
        "clock_at_12",
        "clock_at_24",
        "clock_at_smart_12",
        "clock_at_smart_24",
      ])
      .optional(),
    tool_name: z.string().optional(),
    agent_type: z.string().optional(),
    skill_name: z.string().optional(),
    zero_display: z.string().optional(),
    /** custom_command: shell command to execute */
    command: z.string().optional(),
    /** custom_command: per-call timeout in ms (default 1000) */
    command_timeout_ms: z.number().int().positive().optional(),
    /** custom_command: cache stdout for N ms on disk (0 = no cache, default) */
    command_cache_ms: z.number().int().min(0).optional(),
    /** custom_command: trim trailing whitespace from stdout (default true) */
    command_trim: z.boolean().optional(),
    /** recent_agents: max number of agent entries to show */
    agents_limit: z.number().int().positive().optional(),
    /** recent_agents: whether to include completed agents (default true) */
    agents_show_completed: z.boolean().optional(),
    /** recent_tools: max number of tool calls to show */
    recent_limit: z.number().int().positive().optional(),
    /** recent_tools: max length of tool name before truncation */
    recent_name_max: z.number().int().positive().optional(),
    /** recent_tools: group adjacent same-name calls (default true) */
    recent_group: z.boolean().optional(),
    /** recent_tools: drop the space between name and ×N (e.g. Bash×2) */
    recent_count_compact: z.boolean().optional(),
    /** todos_progress: display mode — compact | bar | detail */
    todos_mode: z.enum(["compact", "bar", "detail"]).optional(),
    /** todos_progress: show in-progress todo item text */
    todos_show_current: z.boolean().optional(),
    /** todos_progress: max chars for current todo text */
    todos_current_max: z.number().int().positive().optional(),
    /** token_rate: sliding window size in seconds (default 60) */
    rate_window_sec: z.number().int().positive().optional(),
    /** token_rate: display unit — per_sec | per_min */
    rate_format: z.enum(["per_sec", "per_min"]).optional(),
    /** token_rate: which parts to show — in, out, total */
    rate_parts: z.array(z.enum(["in", "out", "total"])).optional(),
    /**
     * Emit a bold + slow-blink SGR when the danger percentage crosses
     * `blink_at` (default 80). Intended for context_usage / *_limit items
     * where sustained high usage warrants visual alarm. Terminals that
     * strip blink fall back to just bold; colour is unaffected.
     */
    blink: z.boolean().optional(),
    /** Danger percentage (0-100) at which `blink` activates. Default 80. */
    blink_at: z.number().min(0).max(100).optional(),
    /**
     * Per-sub-part targeting for `dynamic_color` and `blink`. Each flag
     * defaults to `true`, so turning on the master switch lights up every
     * part (label + bar + value). Untoggle a specific flag to exempt that
     * sub-part. Example: `blink: true, blink_bar: false` makes only label
     * and percent/reset text pulse while the bar stays static.
     */
    color_label: z.boolean().optional(),
    color_bar: z.boolean().optional(),
    color_value: z.boolean().optional(),
    /** *_limit only: reset countdown (e.g. "1h30m"). Default true. */
    color_reset: z.boolean().optional(),
    blink_label: z.boolean().optional(),
    blink_bar: z.boolean().optional(),
    blink_value: z.boolean().optional(),
    /** *_limit only: reset countdown (e.g. "1h30m"). Default true. */
    blink_reset: z.boolean().optional(),
    /**
     * Minimum display width (in characters) for the rendered value. Values
     * shorter than this are right-aligned with leading spaces, stabilising
     * width as numbers grow/shrink (e.g. cost "$0.10" → "$10.00"). Label,
     * margins, and ANSI escapes are NOT counted. 0 disables padding.
     */
    min_width: z.number().int().min(0).max(40).optional(),
    /**
     * Alignment when min_width pads the value: "right" (default, leading
     * spaces — good for numbers) or "left" (trailing spaces).
     */
    min_width_align: z.enum(["left", "right"]).optional(),
  })
  // strip unknown keys instead of rejecting: preserves forward/backward
  // compat when fields are added/removed across pulse versions. Without
  // this, a single unknown key from an older/newer config causes Zod to
  // fail, loadConfig silently falls back to defaults, and save then
  // clobbers the user's real config.
  .strip();

export const ItemSchema = z
  .object({
    id: z.string(),
    type: ItemTypeSchema,
    icon: z.string().optional(),
    label: z.string().optional(),
    label_separator: z.string().optional(),
    style: TextStyleSchema.optional(),
    label_style: TextStyleSchema.optional(),
    hide_when_empty: z.boolean().optional(),
    show_label: z.boolean().optional(),
    variant: z.enum(["standard", "compact"]).optional(),
    trailing_separator: z.string().optional(),
    /** Raw string prepended to the rendered item (outside of style) */
    margin_left: z.string().optional(),
    /** Raw string appended to the rendered item (outside of style) */
    margin_right: z.string().optional(),
    options: ItemOptionsSchema.optional(),
  })
  .strict();

export type Item = z.infer<typeof ItemSchema>;

export const LineSchema = z
  .object({
    separator: z.string().optional(),
    bg: ColorSchema.optional(),
    items: z.array(ItemSchema),
  })
  .strict();

export const PulseConfigSchema = z
  .object({
    schema_version: z.literal(1),
    theme: z.string(),
    lines: z.array(LineSchema),
    default_separator: z.string(),
    jsonl: z
      .object({
        enabled: z.boolean(),
        max_bytes_per_call: z.number().int().positive(),
      })
      .strict(),
    git: z
      .object({
        enabled: z.boolean(),
        timeout_ms: z.number().int().positive(),
      })
      .strict(),
    cache: z
      .object({
        enabled: z.boolean(),
        gc_after_days: z.number().int().positive(),
      })
      .strict(),
    runtime: z
      .object({
        /** @deprecated render_timeout_ms is no longer actively used; kept for backward compat */
        render_timeout_ms: z.number().int().positive(),
        debug_log: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type PulseConfig = z.infer<typeof PulseConfigSchema>;

export const defaultConfig: PulseConfig = {
  schema_version: 1,
  theme: "minimal",
  default_separator: "  ",
  lines: [
    {
      items: [
        {
          id: "model",
          type: "model",
          label: "Model:",
          style: { color: "#957FB8", bold: true },
        },
        {
          id: "git_branch",
          type: "git_branch",
          label: "Git:",
          style: { color: "#98BB6C" },
          trailing_separator: "  ",
        },
        {
          id: "context_usage",
          type: "context_usage",
          label: "Ctx:",
          label_separator: " ",
          options: {
            format: "percent1",
            dynamic_color: true,
            show_bar: true,
            ctx_show_absolute: true,
            blink: true,
            blink_at: 20,
          },
        },
        {
          id: "five_hour_limit",
          type: "five_hour_limit",
          label: "Session:",
          label_separator: " ",
          options: {
            format: "percent1",
            bar_width: 10,
            dynamic_color: true,
            limit_show_reset: true,
            show_bar: true,
            limit_reset_format: "clock_at_12",
            blink: true,
            blink_at: 80,
          },
        },
      ],
    },
    {
      items: [
        {
          id: "tokens_input",
          type: "tokens_input",
          label: "In:",
          label_separator: " ",
          style: { color: "#E46876" },
        },
        {
          id: "tokens_output",
          type: "tokens_output",
          label: "Out:",
          label_separator: " ",
          style: { color: "#7E9CD8" },
        },
        {
          id: "tokens_cache_read",
          type: "tokens_cache_read",
          label: "Cached:",
          label_separator: " ",
          style: { color: "#C5B8DF" },
        },
        {
          id: "cost",
          type: "cost",
          label: "Cost:",
          label_separator: " ",
          style: { color: "#B9C5E6" },
          options: { format: "usd2" },
        },
        {
          id: "seven_day_limit",
          type: "seven_day_limit",
          label: "Weekly:",
          label_separator: " ",
          style: { color: "#A29E92" },
          options: {
            format: "percent1",
            bar_width: 10,
            dynamic_color: false,
            limit_show_reset: true,
            show_bar: true,
            limit_reset_format: "relative_eta_long_compact",
          },
        },
      ],
    },
    {
      items: [
        {
          id: "tool_calls",
          type: "tool_calls",
          label: "Tools:",
          style: { color: "#A29E92" },
          trailing_separator: " ",
          options: {
            show_breakdown: true,
            breakdown_top_n: 5,
          },
        },
      ],
    },
    {
      items: [
        {
          id: "recent_agents",
          type: "recent_agents",
          label: "Agents:",
          style: { color: "#A29E92" },
          options: {
            agents_show_completed: true,
          },
        },
      ],
    },
  ],
  jsonl: { enabled: true, max_bytes_per_call: 2_097_152 },
  git: { enabled: true, timeout_ms: 200 },
  cache: { enabled: true, gc_after_days: 7 },
  runtime: { render_timeout_ms: 500, debug_log: false },
};
