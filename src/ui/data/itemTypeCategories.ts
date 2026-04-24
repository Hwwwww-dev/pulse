import type { ItemType } from "../../config/schema.ts";

/**
 * Ordered categories for the type picker. Each category has an ordered list
 * of item types — the picker renders them top-to-bottom in this order so that
 * related items stay visually grouped even without filtering.
 *
 * Every ItemType must appear in exactly one category; a unit-style assertion
 * at module load flags missing entries so adding a new item type fails loudly.
 */
export interface ItemTypeCategory {
  name: string;
  types: readonly ItemType[];
}

export const ITEM_TYPE_CATEGORIES: readonly ItemTypeCategory[] = [
  {
    name: "Identity",
    types: ["model", "session_name", "session_id", "version", "output_style", "vim_mode", "thinking_effort", "thinking", "fast_mode", "sandbox_enabled"],
  },
  {
    name: "Filesystem & Git",
    types: ["cwd", "project_dir", "git_branch", "worktree", "worktree_branch"],
  },
  {
    name: "Usage",
    types: [
      "cost",
      "duration",
      "api_duration",
      "tokens_input",
      "tokens_output",
      "tokens_cache_read",
      "tokens_cache_create",
      "tokens_summary",
      "token_rate",
    ],
  },
  {
    name: "Context",
    types: ["context_usage", "context_bar", "exceeds_200k"],
  },
  {
    name: "Rate Limits",
    types: [
      "five_hour_limit",
      "seven_day_limit",
      "five_hour_bar",
      "seven_day_bar",
      "reset_in_5h",
      "reset_in_7d",
    ],
  },
  {
    name: "Activity",
    types: [
      "tool_calls",
      "agent_calls",
      "skill_calls",
      "tool_call",
      "agent_name",
      "recent_tools",
      "recent_agents",
      "todos_progress",
      "lines_changed",
    ],
  },
  {
    name: "Layout & Misc",
    types: ["clock", "text", "spacer", "custom_command"],
  },
];

/** Reverse lookup for fast "which category is this type in?" queries. */
export const CATEGORY_OF: Record<ItemType, string> = (() => {
  const out: Partial<Record<ItemType, string>> = {};
  for (const cat of ITEM_TYPE_CATEGORIES) {
    for (const t of cat.types) out[t] = cat.name;
  }
  return out as Record<ItemType, string>;
})();
