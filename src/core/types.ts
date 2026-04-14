// ============================================================
// Pulse — shared entity model
// Single source of truth for input, render, and cache.
// ============================================================

// -----------------------------------------------------------
// 4.1 Claude Code stdin payload
// -----------------------------------------------------------

/** Aligned with https://code.claude.com/docs/en/statusline#available-data */
export interface ClaudeStdinPayload {
  /** Unique session ID; maps to ~/.claude/projects/<proj>/<session_id>.jsonl */
  session_id: string;
  /** Custom name set via --name or /rename; absent if unset */
  session_name?: string;
  /** Absolute path to session transcript file; used for incremental jsonl parsing */
  transcript_path: string;
  /** Current working directory; equivalent to workspace.current_dir */
  cwd: string;
  /** Claude Code version, e.g. "2.1.90" */
  version: string;

  /** Current model */
  model: {
    /** Model ID, e.g. "claude-opus-4-6" */
    id: string;
    /** Friendly display name, e.g. "Opus" */
    display_name: string;
  };

  /** Workspace info */
  workspace: {
    /** Current working dir; changes if the session cd's */
    current_dir: string;
    /** Project root Claude Code was launched from */
    project_dir: string;
    /** Extra dirs added via /add-dir or --add-dir; empty array if none */
    added_dirs: string[];
    /**
     * Git worktree name when current_dir is inside a linked worktree.
     * Absent in main working tree. Distinct from worktree.* which applies
     * only to --worktree sessions.
     */
    git_worktree?: string;
  };

  /** Current output style, e.g. "default" / "explanatory" */
  output_style?: { name: string };

  /** Cost and duration statistics */
  cost: {
    /** Total session cost in USD */
    total_cost_usd: number;
    /** Wall-clock time since session start (ms) */
    total_duration_ms: number;
    /** Time spent awaiting API responses (ms); always ≤ total_duration_ms */
    total_api_duration_ms: number;
    /** Lines of code added this session */
    total_lines_added: number;
    /** Lines of code removed this session */
    total_lines_removed: number;
  };

  /** Context window usage */
  context_window: {
    /** Cumulative input tokens across the session */
    total_input_tokens: number;
    /** Cumulative output tokens across the session */
    total_output_tokens: number;
    /** Max window size; 200000 default or 1000000 for extended context */
    context_window_size: number;
    /** Pre-computed used percentage (0–100 integer) */
    used_percentage: number;
    /** Pre-computed remaining percentage (0–100 integer) */
    remaining_percentage: number;
    /** Token breakdown for the most recent API call */
    current_usage: {
      /** Input tokens sent in the latest request */
      input_tokens: number;
      /** Output tokens received in the latest response */
      output_tokens: number;
      /** Input tokens consumed creating prompt cache */
      cache_creation_input_tokens: number;
      /** Input tokens saved by hitting prompt cache */
      cache_read_input_tokens: number;
    };
  };

  /** Whether the latest API response exceeded a fixed 200k token threshold */
  exceeds_200k_tokens: boolean;

  /** Rate limit windows; may be absent on some account types */
  rate_limits?: {
    /** 5-hour rolling window */
    five_hour?: {
      /** Consumption percentage (0–100, may be fractional) */
      used_percentage: number;
      /** Window reset time in unix seconds */
      resets_at: number;
    };
    /** 7-day rolling window */
    seven_day?: {
      used_percentage: number;
      resets_at: number;
    };
  };

  /** Vim mode info; only present when vim mode is enabled */
  vim?: { mode: "NORMAL" | "INSERT" };

  /** Running agent; only present under --agent or configured agent */
  agent?: { name: string };

  /** Active worktree info; only present during --worktree sessions */
  worktree?: {
    name: string;
    path: string;
    /** Worktree branch; may be absent for hook-based worktrees */
    branch?: string;
    /** Original cwd before entering worktree */
    original_cwd?: string;
    /** Original branch before entering worktree; may be absent for hook-based */
    original_branch?: string;
  };
}

// -----------------------------------------------------------
// 4.2 Session counters (derived from jsonl)
// -----------------------------------------------------------

export interface SessionUsageTotals {
  /** Sum of message.usage.input_tokens across all assistant messages */
  input_tokens: number;
  /** Sum of message.usage.output_tokens across all assistant messages */
  output_tokens: number;
  /** Sum of message.usage.cache_read_input_tokens across all assistant messages */
  cache_read_input_tokens: number;
  /** Sum of message.usage.cache_creation_input_tokens across all assistant messages */
  cache_creation_input_tokens: number;
}

// -----------------------------------------------------------
// 4.2a HUD enrichment types (added in schema v2)
// -----------------------------------------------------------

export interface AgentEntry {
  id: string;              // tool_use id (used for tool_result pairing)
  type: string;            // subagent_type (e.g. "Explore")
  description?: string;    // tool_use input.description (if present)
  start_ts: number;        // unix ms
  end_ts?: number;         // unix ms; undefined when in-flight
}

export interface RecentToolCall {
  name: string;            // tool name
  ts: number;              // unix ms
}

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export interface UsageSample {
  ts: number;              // unix ms
  in_delta: number;
  out_delta: number;
}

/** FIFO cap for agent_entries */
export const MAX_AGENT_ENTRIES = 20;
/** FIFO cap for recent_tools */
export const MAX_RECENT_TOOLS = 32;
/** GC window for usage_samples (10 minutes in ms) */
export const USAGE_SAMPLES_GC_MS = 600_000;

export interface SessionCounters {
  /** Total tool_use blocks across all assistant messages */
  tool_calls_total: number;
  /** Per-tool-name counts, e.g. { Read: 12, Edit: 5, Bash: 8 } */
  tool_calls_by_name: Record<string, number>;
  /** Total Task-tool agent invocations */
  agent_calls_total: number;
  /** Per-subagent-type counts, e.g. { Explore: 3, Plan: 1 } */
  agent_calls_by_type: Record<string, number>;
  /** User/assistant message counts */
  message_count: { user: number; assistant: number };
  /** Total Skill tool invocations */
  skill_calls_total: number;
  /** Per-skill counts keyed by input.skill */
  skill_calls_by_name: Record<string, number>;
  /**
   * Cumulative token usage summed from JSONL `message.usage` blocks.
   * Source of truth for session totals; survives Claude Code --resume
   * where stdin's context_window.total_* may only reflect the latest frame.
   */
  usage_totals: SessionUsageTotals;
  /** FIFO list of agent (Task/Agent tool) invocations with pairing; capped at MAX_AGENT_ENTRIES */
  agent_entries?: AgentEntry[];
  /** FIFO list of recent tool calls; capped at MAX_RECENT_TOOLS */
  recent_tools?: RecentToolCall[];
  /** Latest TodoWrite snapshot; undefined if no TodoWrite seen */
  todos?: TodoItem[];
  /** Per-message usage samples for rate calculation; GC'd to USAGE_SAMPLES_GC_MS window */
  usage_samples?: UsageSample[];
}

// -----------------------------------------------------------
// 4.3 jsonl cursor, git info, snapshot
// -----------------------------------------------------------

/** Incremental cursor state persisted to avoid re-scanning */
export interface JsonlCursor {
  /** Schema version; used to detect stale cursors and force replay */
  schema_version?: number;
  /** Transcript path this cursor applies to; rotation detection key */
  transcript_path: string;
  /** Last byte offset parsed; next read seeks here */
  last_byte_offset: number;
  /** Last line index parsed; for diagnostics */
  last_line_number: number;
  /** Counters snapshot at last_byte_offset */
  counters: SessionCounters;
  /** Cursor update time (unix ms) */
  updated_at: number;
}

/** Git subprocess result; overall undefined on failure */
export interface GitInfo {
  /** Current branch; absent in detached HEAD */
  branch?: string;
  /** Working tree has uncommitted changes */
  is_dirty: boolean;
  /** Commits ahead of upstream */
  ahead: number;
  /** Commits behind upstream */
  behind: number;
}

/** Complete snapshot — single input to render + cache */
export interface PulseSnapshot {
  /** Entity schema version; bump on breaking changes */
  schema_version: 2;
  /** Snapshot capture time (unix ms) */
  captured_at: number;
  /** Raw Claude Code stdin payload, embedded verbatim */
  claude: ClaudeStdinPayload;
  /** Counters aggregated from jsonl */
  counters: SessionCounters;
  /** Git info; absent on failure */
  git?: GitInfo;
}

// -----------------------------------------------------------
// 4.4 Persistence files
// -----------------------------------------------------------

/**
 * ~/.pulse/.cache/general.json — cross-session snapshot
 * External apps (menu bars, dashboards) can read this alone without
 * iterating sessions/*.json.
 */
export interface GeneralCacheFile {
  schema_version: 2;
  /** Last update time (unix ms) */
  updated_at: number;
  /** Most recently active session ID */
  last_session_id: string;
  /** Most recently seen model info */
  model: { id: string; display_name: string };
  /** Latest known rate limits (copied from stdin) */
  rate_limits?: ClaudeStdinPayload["rate_limits"];
  /** Rolling 24h aggregate — saves consumers from summing sessions/ */
  today: {
    sessions_seen: number;
    total_cost_usd: number;
    total_tool_calls: number;
  };
}

/** ~/.pulse/.cache/sessions/<session_id>.json — per-session detail */
export interface SessionCacheFile {
  schema_version: 2;
  session_id: string;
  session_name?: string;
  /** First time pulse saw this session (unix ms) */
  first_seen_at: number;
  /** Last update time (unix ms) */
  last_updated_at: number;
  /** Full snapshot */
  snapshot: PulseSnapshot;
  /** jsonl cursor — internal use; external apps may ignore */
  cursor: JsonlCursor;
}

/** ~/.pulse/.cache/index.json — lightweight listing of all sessions */
export interface CacheIndexFile {
  schema_version: 2;
  /** Sorted by last_updated_at desc */
  sessions: Array<{
    session_id: string;
    session_name?: string;
    project_dir: string;
    last_updated_at: number;
    total_cost_usd: number;
  }>;
}

// -----------------------------------------------------------
// TextStyle (referenced by spec §5)
// -----------------------------------------------------------

export interface TextStyle {
  fg?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  dim?: boolean;
}
