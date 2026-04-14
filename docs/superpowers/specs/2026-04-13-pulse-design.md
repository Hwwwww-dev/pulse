# Pulse — Lightweight Claude Code Statusline Design

**Status:** Draft
**Date:** 2026-04-13
**Owner:** hwwwww
**Scope:** v1 — initial spec before implementation

---

## 1. Purpose

**Pulse** is a lightweight Claude Code statusline implemented in Bun + TypeScript, distributed as a `bunx`-runnable package. It renders a customizable, multi-line statusline from stdin JSON supplied by Claude Code, augments it with session-level tool/agent counters parsed from the session `jsonl`, and persists a well-defined cache to `~/.pulse/.cache/` for consumption by external applications.

The name *Pulse* reflects the goal: a real-time, lightweight heartbeat of the Claude Code environment.

**Non-goals:**
- Long-running daemons, sockets, or IPC.
- Network uploads or cross-machine sync.
- User-supplied custom script hooks (v2 candidate).
- Template-string item expression (enumerated `type` only in v1).

---

## 2. Entry Semantics

Single binary, single entrypoint: `bunx pulse`. Mode is auto-detected via `process.stdin.isTTY`:

- **Non-TTY stdin** → statusline render mode. Reads JSON from stdin, outputs ANSI to stdout, exits.
- **TTY stdin** → interactive configuration UI (Ink + React), loaded via dynamic import so render mode never pays the React cost.

Claude Code configuration:
```json
"statusLine": { "type": "command", "command": "bunx pulse" }
```

---

## 3. Architecture Overview

### 3.1 High-Level Data Flow

```
                    ┌──────────────────────────────────┐
                    │         bunx pulse               │
                    └──────────────┬───────────────────┘
                                   │
                        isTTY? ────┴──── yes → Config UI (Ink)
                                   │              │
                                   no             │
                                   ↓              ↓
                          ┌─────────────────┐   read/write
                          │ Render Pipeline │   ~/.pulse/config.json
                          └─────────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        ▼                          ▼                          ▼
   stdin JSON              jsonl incremental          git subprocess
   (Claude Code           (tool / agent counts)       (branch/dirty)
    official schema)               │
        │                          │                          │
        └──────────────────────────┴──────────────────────────┘
                                   │
                                   ▼
                         core/aggregator.ts
                    (pure function → PulseSnapshot)
                                   │
                 ┌─────────────────┴─────────────────┐
                 ▼                                   ▼
          render/engine.ts                     core/cache.ts
          (ANSI → stdout)                 (atomic write to .cache/)
                 │                                   │
                 ▼                                   ▼
           Claude Code UI                  external applications
```

### 3.2 Module Layout

```
src/
├─ input/              # Data acquisition layer
│  ├─ stdin.ts         # Read + zod-validate Claude Code JSON
│  ├─ jsonl.ts         # Incremental cursor parsing → tool/agent counts
│  └─ git.ts           # git subprocess wrapper
├─ core/               # Domain layer (pure data)
│  ├─ types.ts         # Shared entity model (§4)
│  ├─ aggregator.ts    # (stdin, counters, git) → PulseSnapshot
│  ├─ cache.ts         # Atomic writes to ~/.pulse/.cache
│  └─ gc.ts            # Stale session cleanup
├─ render/
│  ├─ ansi.ts          # SGR / style composition
│  ├─ format.ts        # Number / time / token formatters
│  ├─ items/           # One pure renderer per ItemType
│  └─ engine.ts        # lines × items traversal with error isolation
├─ config/
│  ├─ schema.ts        # zod schema + defaults
│  ├─ store.ts         # Read/write ~/.pulse/config.json
│  └─ themes.ts        # Built-in themes
├─ ui/                 # Ink + React — dynamic import only
│  ├─ App.tsx
│  ├─ pages/           # Layout / Themes / Diagnostics / Help
│  └─ hooks/
├─ cli/
│  ├─ bin.ts           # bunx pulse entry, TTY routing
│  └─ render-mode.ts   # Statusline pipeline orchestration
└─ index.ts
```

**Dependency direction (strict):**
`cli → {render, core, input, config, ui}` ; `render → core` ; `input → core` ; `config` standalone ; `ui → config + core` (read-only). No cycles.

---

## 4. Entity Model (`core/types.ts`)

Single source of truth for input, render, and cache.

### 4.1 Claude Code stdin payload

Aligned with <https://code.claude.com/docs/en/statusline#available-data>.

```ts
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
```

### 4.2 Session counters (derived from jsonl)

```ts
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
}
```

### 4.3 jsonl cursor, git info, snapshot

```ts
/** Incremental cursor state persisted to avoid re-scanning */
export interface JsonlCursor {
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
  schema_version: 1;
  /** Snapshot capture time (unix ms) */
  captured_at: number;
  /** Raw Claude Code stdin payload, embedded verbatim */
  claude: ClaudeStdinPayload;
  /** Counters aggregated from jsonl */
  counters: SessionCounters;
  /** Git info; absent on failure */
  git?: GitInfo;
}
```

### 4.4 Persistence files

```ts
/**
 * ~/.pulse/.cache/general.json — cross-session snapshot
 * External apps (menu bars, dashboards) can read this alone without
 * iterating sessions/*.json.
 */
export interface GeneralCacheFile {
  schema_version: 1;
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
  schema_version: 1;
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
  schema_version: 1;
  /** Sorted by last_updated_at desc */
  sessions: Array<{
    session_id: string;
    session_name?: string;
    project_dir: string;
    last_updated_at: number;
    total_cost_usd: number;
  }>;
}
```

### 4.5 stdin field coverage

| Official field | Pulse mapping |
|---|---|
| `session_id` / `session_name` / `transcript_path` | `claude.*` |
| `cwd`, `workspace.*` | `claude.workspace.*` |
| `version`, `model.*`, `output_style.*` | `claude.*` |
| `cost.*` (5 fields) | `claude.cost.*` |
| `context_window.*` (+ `current_usage.*`) | `claude.context_window.*` |
| `exceeds_200k_tokens` | `claude.exceeds_200k_tokens` |
| `rate_limits.five_hour.*` / `rate_limits.seven_day.*` | `claude.rate_limits.*` |
| `vim.mode` | `claude.vim.mode` |
| `agent.name` | `claude.agent.name` |
| `worktree.*` (5 fields) | `claude.worktree.*` |

All documented stdin fields are captured.

---

## 5. Configuration Schema (`~/.pulse/config.json`)

### 5.1 Item types

```ts
export type ItemType =
  | "model"              // model.display_name
  | "session_name"       // session_name; fallback to session_id[:6]
  | "cwd"                // workspace.current_dir
  | "project_dir"        // workspace.project_dir
  | "git_branch"         // git.branch + dirty marker
  | "cost"               // cost.total_cost_usd
  | "duration"           // cost.total_duration_ms
  | "api_duration"       // cost.total_api_duration_ms
  | "lines_changed"      // cost.total_lines_added / _removed
  | "context_usage"      // context_window.used_percentage
  | "context_bar"        // progress bar for context_window
  | "tokens_input"       // context_window.total_input_tokens
  | "tokens_output"      // context_window.total_output_tokens
  | "tokens_cache_read"  // current_usage.cache_read_input_tokens
  | "tokens_cache_create"// current_usage.cache_creation_input_tokens
  | "tokens_summary"     // composite in/out/cache display
  | "five_hour_limit"    // rate_limits.five_hour.used_percentage
  | "seven_day_limit"    // rate_limits.seven_day.used_percentage
  | "five_hour_bar"      // rate_limits.five_hour progress bar
  | "seven_day_bar"      // rate_limits.seven_day progress bar
  | "reset_in_5h"        // rate_limits.five_hour.resets_at countdown
  | "reset_in_7d"        // rate_limits.seven_day.resets_at countdown
  | "tool_calls"         // counters.tool_calls_total
  | "agent_calls"        // counters.agent_calls_total
  | "agent_name"         // agent.name
  | "output_style"       // output_style.name
  | "vim_mode"           // vim.mode
  | "worktree"           // worktree.name / workspace.git_worktree
  | "version"            // claude.version
  | "clock"              // local wall clock
  | "text"               // literal string decoration
  | "spacer";            // elastic spacer (v1 placeholder; v2 alignment)
```

### 5.2 Item, Line, PulseConfig

```ts
/** Color: named color, #RRGGBB, #RGB, or "default" */
export type Color = string;

export interface TextStyle {
  fg?: Color;
  bg?: Color;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  dim?: boolean;
}

export interface Item {
  /** Stable ID used by UI selection + persisted order */
  id: string;
  /** Item type */
  type: ItemType;
  /** Optional prefix label / icon (Nerd Font or emoji) */
  label?: string;
  /** Separator between label and value; defaults to " " */
  label_separator?: string;
  /** Text style */
  style?: TextStyle;
  /** Hide the whole item when its value is empty / zero */
  hide_when_empty?: boolean;
  /** Type-specific options */
  options?: ItemOptions;
}

export interface ItemOptions {
  /** Numeric / time / token formatter */
  format?:
    | "usd2" | "usd4"
    | "compact" | "integer"
    | "percent0" | "percent1"
    | "duration_hms"      // "1h 23m 45s"
    | "duration_compact"  // "1h23m" / "45s"
    | "duration_ms"       // "123ms"
    | "clock_24"          // "14:30"
    | "clock_24_sec"      // "14:30:45"
    | "clock_12"          // "2:30 PM"
    | "date_iso"          // "2026-04-13"
    | "relative_eta"      // "in 1h 23m"
    | "relative_ago"      // "2m ago"
    | "tokens_compact"    // "12.3k" / "1.2M"
    | "tokens_full";      // "12345"

  /** Path rendering mode for cwd / project_dir */
  path_mode?: "basename" | "tilde" | "short" | "full";

  /** Progress bar options — shared by *_bar types */
  bar_width?: number;                    // default 10
  bar_filled?: string;                   // default "▓"
  bar_empty?: string;                    // default "░"
  bar_left_cap?: string;                 // default ""
  bar_right_cap?: string;                // default ""
  bar_show_value?: boolean;              // append "45%" after bar
  bar_thresholds?: Array<{ at: number; fg: Color }>;

  /** Literal for type "text" */
  literal?: string;

  /** Git options */
  git_dirty_marker?: string;             // default "*"
  git_show_ahead_behind?: boolean;       // default true

  /** Rate limit options */
  limit_show_reset?: boolean;            // default true
  limit_warn_at?: number;                // default 80

  /** tool_calls / agent_calls options */
  show_breakdown?: boolean;              // default false
  breakdown_top_n?: number;              // default 3

  /** tokens_summary options */
  tokens_parts?: Array<"input" | "output" | "cache_read" | "cache_create">;
  tokens_icons?: Partial<Record<"input" | "output" | "cache_read" | "cache_create", string>>;
}

export interface Line {
  /** Inter-item separator; defaults to config.default_separator */
  separator?: string;
  /** Line background color */
  bg?: Color;
  /** Items rendered in order */
  items: Item[];
}

export interface PulseConfig {
  schema_version: 1;
  /** Theme affects default color palette only */
  theme: "minimal" | "pastel" | "powerline" | string;
  /** Multi-line layout */
  lines: Line[];
  /** Global fallback item separator */
  default_separator: string;
  jsonl:  { enabled: boolean; max_bytes_per_call: number };
  git:    { enabled: boolean; timeout_ms: number };
  cache:  { enabled: boolean; gc_after_days: number };
  runtime:{ render_timeout_ms: number; debug_log: boolean };
}
```

### 5.3 Default configuration

```json
{
  "schema_version": 1,
  "theme": "minimal",
  "default_separator": " │ ",
  "lines": [
    {
      "items": [
        { "id": "i1", "type": "model", "style": { "fg": "#C792EA", "bold": true } },
        { "id": "i2", "type": "cwd", "label": "📁", "options": { "path_mode": "tilde" }, "style": { "fg": "#82AAFF" } },
        { "id": "i3", "type": "git_branch", "label": "🌿", "style": { "fg": "#C3E88D" } },
        { "id": "i4", "type": "clock", "options": { "format": "clock_24" }, "style": { "dim": true } }
      ]
    },
    {
      "items": [
        { "id": "i5", "type": "context_bar", "label": "ctx",
          "options": { "bar_width": 12, "bar_show_value": true,
            "bar_thresholds": [
              { "at": 0,  "fg": "#C3E88D" },
              { "at": 60, "fg": "#FFCB6B" },
              { "at": 85, "fg": "#F07178" }
            ]
          }
        },
        { "id": "i6", "type": "tokens_summary",
          "options": {
            "tokens_parts": ["input", "output", "cache_read"],
            "tokens_icons": { "input": "↑", "output": "↓", "cache_read": "⚡" },
            "format": "tokens_compact"
          }
        },
        { "id": "i7", "type": "cost", "label": "💰", "options": { "format": "usd4" }, "style": { "fg": "#FFCB6B" } },
        { "id": "i8", "type": "duration", "label": "⏱", "options": { "format": "duration_compact" }, "style": { "dim": true } }
      ]
    },
    {
      "items": [
        { "id": "i9",  "type": "five_hour_bar", "label": "5h",
          "options": { "bar_width": 10, "bar_show_value": true,
            "bar_thresholds": [{ "at": 80, "fg": "#F07178" }] }
        },
        { "id": "i10", "type": "reset_in_5h", "options": { "format": "relative_eta" }, "style": { "dim": true } },
        { "id": "i11", "type": "seven_day_bar", "label": "7d",
          "options": { "bar_width": 10, "bar_show_value": true,
            "bar_thresholds": [{ "at": 80, "fg": "#F07178" }] }
        },
        { "id": "i12", "type": "tool_calls", "label": "🔧" },
        { "id": "i13", "type": "agent_calls", "label": "🤖" }
      ]
    }
  ],
  "jsonl":  { "enabled": true, "max_bytes_per_call": 2097152 },
  "git":    { "enabled": true, "timeout_ms": 200 },
  "cache":  { "enabled": true, "gc_after_days": 7 },
  "runtime":{ "render_timeout_ms": 500, "debug_log": false }
}
```

### 5.4 Style precedence

Theme palette → `Line.bg` → `Item.style`. Each layer overrides the previous.

---

## 6. Key Algorithms

### 6.1 Render pipeline (`cli/render-mode.ts`)

```ts
export async function runRenderMode(): Promise<void> {
  const t0 = Date.now();

  // 1. Read stdin with timeout guard
  const payload = await readStdinJson(200);
  if (!payload.ok) { process.stdout.write(""); return; }

  // 2. Load config (fallback to defaults on error)
  const config = await loadConfig();

  // 3. Parallel collection — jsonl + git independently time-bounded
  const [counters, git] = await Promise.all([
    config.jsonl.enabled
      ? readJsonlIncremental(payload.data.transcript_path, payload.data.session_id, config)
      : Promise.resolve(emptyCounters()),
    config.git.enabled
      ? readGitInfo(payload.data.workspace.current_dir, config.git.timeout_ms)
      : Promise.resolve(undefined),
  ]);

  // 4. Aggregate (pure function)
  const snapshot = aggregate(payload.data, counters, git);

  // 5. Render + stdout (never throws)
  const text = renderSafe(snapshot, config);
  process.stdout.write(text + "\n");

  // 6. Best-effort cache write (does not block output)
  if (config.cache.enabled) {
    queueMicrotask(() => writeCache(snapshot).catch(() => {}));
  }

  // 7. Low-probability GC trigger
  if (Math.random() < 0.01) {
    queueMicrotask(() => runGc(config).catch(() => {}));
  }

  if (config.runtime.debug_log) logTiming(Date.now() - t0);
}
```

### 6.2 Incremental jsonl parsing

1. `Bun.file(path).size` — current file size.
2. If cursor missing, `transcript_path` changed, or `file.size < cursor.last_byte_offset` (truncate/rotate), reset to offset 0.
3. Cap a single read at `max_bytes_per_call` (default 2MB); remainder deferred to next call.
4. Read `Bun.file(path).slice(offset, end).text()`.
5. `split("\n")`, `JSON.parse` each line, accumulate:
   - `type === "user"` → `message_count.user++`
   - `type === "assistant"` → `message_count.assistant++`, iterate `message.content[]`:
     - `{ type: "tool_use", name }` → `tool_calls_total++`, `tool_calls_by_name[name]++`
     - If `name === "Task"` and `input.subagent_type` present → `agent_calls_total++`, `agent_calls_by_type[subagent_type]++`
6. Update cursor and return counters.

**Robustness:**
- Incomplete trailing line (no `\n`): do not consume, resume next call.
- `JSON.parse` failures: log under `debug_log`, skip that line, continue.
- File missing: return empty counters.

### 6.3 Atomic write

```ts
async function atomicWriteJson(path: string, data: unknown): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`;
  await Bun.write(tmp, JSON.stringify(data));
  await rename(tmp, path); // POSIX rename is atomic
}
```

Single-session is single-writer (Claude Code does not parallelize statusline calls per session). `index.json` updates follow read → merge → atomic rename.

### 6.4 Render error isolation

A single `Item` failure produces a `?` placeholder in its position; other items and lines proceed normally. All renderer errors are captured in `debug_log` when enabled.

### 6.5 Dynamic import for UI

`cli/bin.ts` only imports `ui/*` when `process.stdin.isTTY` is true. Render mode cold start excludes the React/Ink cost entirely.

---

## 7. Interactive Configuration UI

### 7.1 Page map

```
App
├─ Top bar: "Pulse vX.Y   [Tab] page switch"
├─ Router
│   ├─ 1. Layout (default)
│   ├─ 2. Themes
│   ├─ 3. Diagnostics
│   └─ 4. Help
└─ Bottom: LivePreview (always mounted)
```

### 7.2 Global keybindings

| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Switch pages |
| `s` | Save to `~/.pulse/config.json` |
| `r` | Reload config (discard unsaved changes) |
| `q` / `Ctrl+C` | Quit (confirm if unsaved) |

### 7.3 Layout page

- Hierarchical list of `Line > Item`.
- Arrow keys navigate; `Enter` opens the edit modal; `a` / `d` add/remove items; `J`/`K` swap; `n` / `D` add/remove lines.
- Edit modal: type selector, label, separator, TextStyle editors, type-specific `ItemOptions` sub-form (rebuilds when type changes), live mini-preview.
- Color picker: cycles through named palette; `h` opens hex input.

### 7.4 Themes page

- Radio list of built-in themes: `minimal`, `pastel`, `powerline`.
- Apply replaces palette without clobbering items whose `style.fg` / `style.bg` were manually set.

### 7.5 Diagnostics page

- Paths & sizes: config path, cache dir, general.json, session count.
- Last stdin received (session id + age).
- Last render duration.
- Runtime versions: Bun, Pulse, Claude Code (from last stdin).
- Health checks: stdin parse, jsonl readable, git binary, `exceeds_200k_tokens` warning.
- Actions: Open cache dir, Clear cache, Run self-test (synthetic stdin through full pipeline, no cache write).

### 7.6 Live preview

Bottom bar renders a sample statusline using `general.json` data if present, otherwise a built-in mock. Updates on every config change.

---

## 8. Testing Strategy

| Layer | Target | Tool | Focus |
|---|---|---|---|
| Unit | `core/aggregator.ts` | bun:test | Three-source merge, missing field fallback |
| Unit | `render/items/*` | bun:test | Snapshot per ItemType × common options |
| Unit | `render/format.ts` | bun:test | Boundary cases: 0, negative, large, undefined, expired `resets_at` |
| Unit | `input/jsonl.ts` | bun:test | Truncation, rotation, append, partial last line, parse errors |
| Unit | `config/schema.ts` | bun:test | Invalid color, unknown type, schema_version mismatch |
| Unit | `core/cache.ts` | bun:test | tmp file, rename overwrite, failure fallback |
| Integration | `cli/render-mode.ts` | bun:test | Fixture stdin + jsonl → assert stdout and cache state |
| Integration | Missing / corrupt config | bun:test | Falls back to defaults, no crash |
| E2E | `bun src/cli/bin.ts < fixture.json` | shell | Real process, exit code, latency budget |
| UI smoke | Ink App mount | ink-testing-library | Mount, page switch, save dispatch |

**Fixtures:**
- `test/fixtures/stdin/` — minimal, 1M-context, missing rate_limits, with worktree, with agent.
- `test/fixtures/jsonl/` — short/medium/long transcripts with Task, tool use, multi-turn.

**Performance target:** with 2000-line transcript + default config, `bun src/cli/bin.ts < stdin.json` completes in <80ms (≈20ms Bun cold start + <60ms pipeline).

**Coverage target:** `core/`, `render/`, `input/jsonl.ts`, `config/schema.ts` ≥ 90%. `ui/` smoke-level only.

---

## 9. Implementation Decisions

- **Theme palettes:** `minimal` applies no color overrides (pure terminal defaults). `pastel` and `powerline` ship with concrete hex palettes defined inline in `config/themes.ts`; palette values are code-level constants and do not need to be fixed in this spec.
- **ANSI color fallback:** `render/ansi.ts` detects truecolor support via `COLORTERM === "truecolor"` or `"24bit"`. When absent, colors degrade silently to nearest 256-color and then to 16-color. Terminal without any color (`NO_COLOR` env var set) emits plain text.
- **Nerd Font assumption:** Pulse assumes the user has a Nerd Font installed when Nerd Font glyphs are used. The default shipped config uses only emoji and plain Unicode, so a fresh install works without Nerd Font.
- **Self-test fixture:** v1 ships a single canned `stdin` JSON fixture for the Diagnostics self-test action.

---

## 10. Out of Scope for v1

- Daemon mode, sockets, IPC.
- Template string item expression.
- Custom user-supplied item scripts.
- Cross-machine sync.
- Per-project overrides (single global config in v1).
- `spacer` alignment semantics (reserved placeholder only).
