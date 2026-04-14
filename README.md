[English](./README.md) | [中文](./README.zh.md)

# pulse

Lightweight, fully-customizable statusline for [Claude Code](https://claude.ai/code).

Displays model, context usage, token counts, cost, git status, rate limits and more — all in a compact, color-coded status bar that updates on every Claude Code action.

---

## Requirements

- [Bun](https://bun.sh) ≥ 1.3
- Claude Code

---

## Installation

```bash
npm install -g @hwwwww/pulse
# or
bunx @hwwwww/pulse
```

---

## Setup

Add one line to your Claude Code config (`~/.claude/settings.json`):

```json
"statusLine": { "type": "command", "command": "bunx @hwwwww/pulse" }
```

That's it. Claude Code pipes its state to pulse on every action and displays the rendered output as a status bar.

---

## Configuration

Run pulse interactively to open the TUI config editor:

```bash
bunx @hwwwww/pulse
```

The editor lets you add/remove/reorder items, pick colors from a palette, and preview the result live. Config is saved to `~/.pulse/config.json`.

You can also edit the JSON file directly.

---

## Available Items

### Session
| Type | Description |
|------|-------------|
| `model` | Active model name |
| `session_name` | Session name (falls back to short ID) |
| `session_id` | Full or short session ID |
| `version` | Claude Code version |
| `output_style` | Current output style |
| `vim_mode` | Vim mode indicator |
| `agent_name` | Current subagent name |
| `worktree` | Active git worktree |

### Context & Tokens
| Type | Description |
|------|-------------|
| `context_usage` | Context window usage % |
| `context_bar` | Context window progress bar |
| `tokens_input` | Input token count |
| `tokens_output` | Output token count |
| `tokens_cache_read` | Cache read tokens |
| `tokens_cache_create` | Cache creation tokens |
| `tokens_summary` | Composite token summary |
| `token_rate` | Tokens per second/minute |

### Cost & Duration
| Type | Description |
|------|-------------|
| `cost` | Session cost (USD) |
| `duration` | Total session duration |
| `api_duration` | Total API time |

### Rate Limits
| Type | Description |
|------|-------------|
| `five_hour_limit` | 5-hour usage limit % |
| `seven_day_limit` | 7-day usage limit % |
| `five_hour_bar` | 5-hour limit bar |
| `seven_day_bar` | 7-day limit bar |
| `reset_in_5h` | Time until 5-hour limit resets |
| `reset_in_7d` | Time until 7-day limit resets |

### Git
| Type | Description |
|------|-------------|
| `git_branch` | Branch name + dirty marker + ahead/behind |
| `lines_changed` | `+added/-removed` line counts |

### Workspace
| Type | Description |
|------|-------------|
| `cwd` | Current working directory |
| `project_dir` | Project root directory |

### Counters
| Type | Description |
|------|-------------|
| `tool_calls` | Total tool call count |
| `tool_call` | Count for a specific tool (set `tool_name`) |
| `agent_calls` | Total subagent call count |
| `skill_calls` | Total skill call count |
| `recent_agents` | Recent subagent activity |
| `recent_tools` | Recent tool call list |
| `todos_progress` | Todo list progress |

### Utilities
| Type | Description |
|------|-------------|
| `clock` | Current time |
| `text` | Static text literal |
| `spacer` | Empty gap |
| `custom_command` | Output of any shell command |

---

## Item Options

Every item supports these common fields:

```jsonc
{
  "id": "my-item",
  "type": "context_usage",
  "label": "Ctx:",           // prefix label
  "label_separator": " ",    // between label and value
  "show_label": true,
  "label_style": { "fg": "#808080", "dim": true },
  "style": { "fg": "#C3E88D", "bold": true },
  "hide_when_empty": true,
  "margin_left": " ",
  "margin_right": " ",
  "trailing_separator": " › ",
  "options": { ... }
}
```

Style fields: `fg` (hex or named color), `bg`, `bold`, `italic`, `underline`, `dim`.

### Key `options` by item type

**Bars** (`context_bar`, `five_hour_bar`, etc.)
```jsonc
{
  "bar_width": 10,
  "bar_style": "dingbat",   // dingbat | shaded | block | line | double | dot | square | ascii
  "bar_show_value": true,
  "auto_color": true,        // green → yellow → red ramp
  "bar_thresholds": [{ "at": 80, "fg": "#F07178" }]
}
```

**Limits** (`five_hour_limit`, `seven_day_limit`)
```jsonc
{
  "format": "percent1",
  "show_bar": true,
  "bar_width": 10,
  "limit_show_reset": true,
  "limit_reset_format": "relative_eta_compact",
  "display_mode": "used"     // used | remaining
}
```

**`custom_command`**
```jsonc
{
  "command": "uptime | awk '{print $1}'",
  "command_timeout_ms": 200,
  "command_cache_ms": 5000   // cache stdout for 5s
}
```

**`git_branch`**
```jsonc
{
  "git_dirty_marker": "*",
  "git_show_ahead_behind": true
}
```

**`cwd` / `project_dir`**
```jsonc
{
  "path_mode": "tilde"   // basename | tilde | short | full
}
```

**`tokens_summary`**
```jsonc
{
  "tokens_parts": ["input", "output", "total"],
  "format": "tokens_compact"
}
```

---

## Themes

Set `theme` in config: `minimal` (default) · `pastel` · `powerline`

---

## Example Config

```json
{
  "schema_version": 1,
  "theme": "minimal",
  "default_separator": "  ",
  "lines": [
    {
      "items": [
        { "id": "i1", "type": "model", "style": { "fg": "#C792EA", "bold": true } },
        { "id": "i2", "type": "context_usage", "label": "Ctx:", "label_separator": " ",
          "options": { "format": "percent1", "auto_color": true } },
        { "id": "i3", "type": "git_branch", "style": { "fg": "#C3E88D" } },
        { "id": "i4", "type": "cost", "label": "Cost:", "label_separator": " ",
          "options": { "format": "usd2" }, "style": { "fg": "#FFCB6B" } }
      ]
    }
  ],
  "jsonl": { "enabled": true, "max_bytes_per_call": 2097152 },
  "git":   { "enabled": true, "timeout_ms": 200 },
  "cache": { "enabled": true, "gc_after_days": 7 },
  "runtime": { "render_timeout_ms": 500, "debug_log": false }
}
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PULSE_HOME` | Override base directory (default: `~`) |
| `NO_COLOR` | Disable all ANSI colors |
| `COLORTERM` | Set to `truecolor` or `24bit` for full color |

---

## Acknowledgements

- [claude-hud](https://github.com/jarrodwatts/claude-hud) — Claude Code plugin showing context usage, active tools, running agents and todo progress; inspired pulse's item design
- [ccstatusline](https://github.com/sirmalloc/ccstatusline) — Beautiful, highly customizable statusline with powerline support and themes; inspired pulse's theming and rendering approach

---

## License

MIT
