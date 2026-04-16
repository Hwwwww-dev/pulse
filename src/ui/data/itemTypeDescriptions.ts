import type { ItemType } from "../../config/schema.ts";

/**
 * Multi-line description shown in the Edit modal directly beneath the `type:`
 * field so the user knows what an item renders and which options matter before
 * committing. `summary` is the one-line headline; `details` holds extra lines
 * with format options, example output, or notable flags. Keep each line short
 * enough to fit the modal width (~70 chars).
 */
export interface ItemTypeDoc {
  summary: string;
  details?: string[];
}

export const ITEM_TYPE_DESCRIPTIONS: Record<ItemType, ItemTypeDoc> = {
  model: {
    summary: "Claude model display name from the active session.",
    details: ["e.g. \"Opus\", \"Sonnet\". No format options."],
  },
  session_name: {
    summary: "Session label (first-seen id or the name you gave it).",
    details: ["Stable across restarts of the same session."],
  },
  session_id: {
    summary: "Raw session UUID.",
    details: ["format: id_short (first 8 chars) | id_full (36 chars)."],
  },
  cwd: {
    summary: "Current working directory that Claude Code is running in.",
    details: ["format: basename | relative_home (~/foo) | absolute."],
  },
  project_dir: {
    summary: "Project root directory (one level up from cwd if inside a subdir).",
    details: ["format: basename | relative_home | absolute."],
  },
  git_branch: {
    summary: "Active git branch with dirty / ahead / behind markers.",
    details: [
      "Shows *, ↑N, ↓N suffixes when the working tree diverges.",
      "Hidden automatically outside a git repo.",
    ],
  },
  cost: {
    summary: "Session cost billed to your Claude account, in USD.",
    details: ["format: usd2 ($9.99) | usd4 ($9.9999) | compact ($9.9k)."],
  },
  duration: {
    summary: "Wall-clock time since the session started.",
    details: [
      "format: compact (1h02m) | duration_hms (1h 2m 5s) | duration_ms (ms).",
      "Ticks live as the session grows.",
    ],
  },
  api_duration: {
    summary: "Cumulative time spent waiting on Claude API calls.",
    details: ["Same format options as duration. Excludes local tool time."],
  },
  lines_changed: {
    summary: "Total +added / -removed lines across all Edit/Write tool calls.",
    details: ["Rendered as \"+123/-45\"."],
  },
  context_usage: {
    summary: "Context window usage for the current turn (percentage).",
    details: [
      "format: percent0 (42%) | percent1 (42.3%).",
      "flags: show_bar (inline bar), ctx_show_absolute (e.g. 85.3k/200k).",
    ],
  },
  context_bar: {
    summary: "Context window usage as a standalone bar.",
    details: ["Options: bar_style, bar_width, bar_show_value, dynamic_color."],
  },
  exceeds_200k: {
    summary: "Warning badge when context exceeds 200k tokens (1M-context sessions).",
    details: [
      "Renders the literal option (default \"⚠ 200k+\") when true; hidden otherwise.",
      "Use with hide_when_empty and dynamic styling.",
    ],
  },
  tokens_input: {
    summary: "Total input tokens this session (non-cache).",
    details: ["format: tokens_compact (12.3k) | tokens_full (12345)."],
  },
  tokens_output: {
    summary: "Total output tokens this session.",
    details: ["Same format options as tokens_input."],
  },
  tokens_cache_read: {
    summary: "Input tokens served from the prompt cache.",
    details: ["Counted separately so you can see cache hit volume."],
  },
  tokens_cache_create: {
    summary: "Input tokens written into the prompt cache this session.",
    details: ["High values = lots of cache-creating prompts."],
  },
  tokens_summary: {
    summary: "Compact input / output tokens summary in one slot.",
    details: ["Rendered as \"↑12.3k ↓4.5k\". Uses tokens_compact by default."],
  },
  five_hour_limit: {
    summary: "5-hour rate-limit usage percentage with optional reset countdown.",
    details: [
      "format: percent0 | percent1.",
      "flags: show_bar, limit_show_reset. Tune reset via limit_reset_format.",
    ],
  },
  seven_day_limit: {
    summary: "7-day rate-limit usage percentage with optional reset countdown.",
    details: ["Same options as five_hour_limit."],
  },
  five_hour_bar: {
    summary: "5-hour rate-limit usage as a bar.",
    details: [
      "Optional %-value inline via bar_show_value.",
      "Reset countdown appended when limit_show_reset is on.",
    ],
  },
  seven_day_bar: {
    summary: "7-day rate-limit usage as a bar.",
    details: ["Same options as five_hour_bar."],
  },
  reset_in_5h: {
    summary: "Countdown until the 5-hour window resets.",
    details: ["format: relative_eta_*, relative_ago_*, or clock_at_* presets."],
  },
  reset_in_7d: {
    summary: "Countdown until the 7-day window resets.",
    details: ["Same format options as reset_in_5h."],
  },
  tool_calls: {
    summary: "Number of built-in tool invocations in this session.",
    details: ["flag: show_breakdown = per-tool mini list."],
  },
  agent_calls: {
    summary: "Number of sub-agent / Task-tool invocations this session.",
    details: ["flag: show_breakdown = per-agent mini list."],
  },
  skill_calls: {
    summary: "Number of skill invocations (slash-commands, etc.) this session.",
    details: ["flag: show_breakdown = per-skill mini list."],
  },
  tool_call: {
    summary: "Invocation count for a specific tool (pick via name field).",
    details: ["Auto-hides when the named tool has not been used yet."],
  },
  agent_name: {
    summary: "Currently running sub-agent name.",
    details: ["Empty when no agent is active."],
  },
  output_style: {
    summary: "Active Claude Code output style (terse, verbose, etc.).",
  },
  vim_mode: {
    summary: "Vim-mode indicator (NORMAL / INSERT / …).",
    details: ["Only renders when Claude Code reports vim mode."],
  },
  thinking_effort: {
    summary: "Thinking effort level (low / medium / high / xhigh / max).",
    details: [
      "Detected from /model command echoes in the transcript.",
      "Empty until the user sets effort via /model in this session.",
    ],
  },
  worktree: {
    summary: "Git worktree name when you are inside a worktree.",
    details: ["Empty on the primary checkout — pair with hide_when_empty."],
  },
  worktree_branch: {
    summary: "Git branch name inside a --worktree session.",
    details: ["Empty when not in a worktree. Pair with worktree for (name → branch) display."],
  },
  version: {
    summary: "Claude Code CLI version string.",
  },
  clock: {
    summary: "Current wall-clock time. Ticks every render.",
    details: [
      "format: clock_24 (17:30) | clock_12 (5:30 pm) | clock_24_sec.",
      "date variants: date_iso | date_short | date_long | datetime_short_*.",
    ],
  },
  text: {
    summary: "Literal text injected from options.literal.",
    details: ["Useful for separators, emoji labels, or fixed prefixes."],
  },
  spacer: {
    summary: "Blank horizontal space / padding.",
    details: ["Combine with min_width to push neighbours apart."],
  },
  custom_command: {
    summary: "Runs a shell command and shows its stdout.",
    details: [
      "Options: literal (command), timeout_ms, cache_ttl_ms.",
      "Non-zero exit hides the item. Stdout is trimmed.",
    ],
  },
  recent_agents: {
    summary: "Recent sub-agent calls with elapsed time.",
    details: ["In-flight calls marked with *. Capped by a max_items flag."],
  },
  recent_tools: {
    summary: "Most recent tool calls with adjacent-name grouping.",
    details: ["Collapses runs like \"Read × 3\". Capped by max_items."],
  },
  todos_progress: {
    summary: "TodoWrite progress rendered compact, as a bar, or as a detail list.",
    details: ["Mode chosen via format; bar mode shares bar_style options."],
  },
  token_rate: {
    summary: "Input / output token rate over a sliding window (default 60 s).",
    details: ["Window length configurable via the rate_window_sec option."],
  },
};
