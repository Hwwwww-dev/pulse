[English](./README.md) | [中文](./README.zh-CN.md)

# pulse

[![npm version](https://img.shields.io/npm/v/@hwwwww/pulse?color=crimson&logo=npm)](https://www.npmjs.com/package/@hwwwww/pulse)
[![npm downloads](https://img.shields.io/npm/dm/@hwwwww/pulse?color=blue&logo=npm)](https://www.npmjs.com/package/@hwwwww/pulse)
[![license](https://img.shields.io/npm/l/@hwwwww/pulse?color=green)](./LICENSE)
[![bun](https://img.shields.io/badge/bun-%E2%89%A51.3-black?logo=bun)](https://bun.sh)
[![typescript](https://img.shields.io/badge/typescript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![stars](https://img.shields.io/github/stars/Hwwwww-dev/pulse?style=flat&logo=github)](https://github.com/Hwwwww-dev/pulse)

> Lightweight, fully-customizable statusline for [Claude Code](https://claude.ai/code) — model, context, tokens, cost, git, rate limits.

![pulse screenshot](./assets/screenshot.png)

## Features

- **Powerline ribbon** with arrow transitions and an 8-slot palette that auto-maps across themes — a config saved under `minimal` stays readable under `powerline` and vice versa.
- **Dynamic bars & blink warnings** — `context_usage`, `*_limit` and `context_bar` tint their bar/value/label with a green→yellow→red ramp and pulse when a danger threshold is crossed.
- **Incremental jsonl cursor** — session counters are accumulated via byte-offset replay, so each one-shot render stays fast even on long transcripts.
- **Rich activity items** — `token_rate` (sliding window), `recent_tools` / `recent_agents` trail, `todos_progress` snapshot from `TodoWrite`, per-tool / per-agent / per-skill counters with breakdowns.
- **Searchable TUI editor** with categorized type picker, 24-color palette, live preview, and in-place threshold/blink tuning.
- **Portable cache** at `~/.pulse/.cache/` — external dashboards can read `general.json` / `sessions/*.json` without re-parsing jsonl.

## Install

```bash
npm i -g @hwwwww/pulse
```

## Setup

Add to `~/.claude/settings.json`:

```json
"statusLine": { "type": "command", "command": "bunx @hwwwww/pulse" }
```

## Configure

```bash
bunx @hwwwww/pulse
```

Opens an interactive TUI editor with live preview. Config saved to `~/.pulse/config.json`.

## Items

<details>
<summary>30+ built-in items (click to expand)</summary>

| Category | Items |
|----------|-------|
| Session | `model` `session_name` `session_id` `version` `output_style` `vim_mode` `agent_name` `worktree` |
| Context & Tokens | `context_usage` `context_bar` `tokens_input` `tokens_output` `tokens_cache_read` `tokens_cache_create` `tokens_summary` `token_rate` |
| Cost & Duration | `cost` `duration` `api_duration` |
| Rate Limits | `five_hour_limit` `seven_day_limit` `five_hour_bar` `seven_day_bar` `reset_in_5h` `reset_in_7d` |
| Git | `git_branch` `lines_changed` |
| Workspace | `cwd` `project_dir` |
| Counters | `tool_calls` `tool_call` `agent_calls` `skill_calls` `recent_tools` `recent_agents` `todos_progress` |
| Utilities | `clock` `text` `spacer` `custom_command` |

</details>

Every item supports `label` / `style` / `margin_*` / `trailing_separator` / `hide_when_empty` and type-specific `options`. Bars (`*_bar`) take `bar_width`, `bar_style`, `dynamic_color`. Paths (`cwd`, `project_dir`) take `path_mode: basename|tilde|short|full`. See the TUI editor for the full set.

### Styling

`style.color` is a single semantic field: on classic themes (`minimal` / `pastel`) it paints the text foreground; on `powerline` it becomes the slot background, and a paired foreground is resolved from the built-in palette map so configs stay readable across theme switches. Custom hex codes outside the palette pass through literally.

## Example

```json
{
  "schema_version": 1,
  "theme": "minimal",
  "default_separator": "  ",
  "lines": [{
    "items": [
      { "id": "m", "type": "model", "style": { "color": "#957FB8", "bold": true } },
      { "id": "c", "type": "context_usage", "label": "Ctx:", "options": { "dynamic_color": true, "show_bar": true } },
      { "id": "g", "type": "git_branch", "style": { "color": "#98BB6C" } },
      { "id": "$", "type": "cost", "label": "$", "options": { "format": "usd2" } }
    ]
  }]
}
```

Themes: `minimal` · `pastel` · `powerline` (ribbon with arrow transitions, auto-mapped palette).

## TUI Editor Shortcuts

| Scope | Keys | Action |
|-------|------|--------|
| Layout page | `↑↓` / `n` / `d` / `x` | select / new item / duplicate / delete |
| Layout page | `q` / `r` / `s` | quit / reset / save |
| Edit modal | `↑↓` | switch field |
| Edit modal | `←→` / `Shift+←→` | change value / big step |
| Edit modal | `Space` | toggle boolean · open type picker |
| Edit modal | `Enter` / `Esc` | save / cancel |
| Type picker | type to filter · `↑↓` navigate · `Enter` select · `Esc` cancel |

## Development

```bash
git clone https://github.com/Hwwwww-dev/pulse
cd pulse
bun install

bun run typecheck   # tsc --noEmit
bun test            # 180+ tests, render + UI + cli
bun run dev         # launch TUI editor against a dummy stdin payload
bun run build       # bundle dist/pulse.js (bin) + dist/index.js
```

To iterate against a real Claude Code session, point `statusLine.command` in `~/.claude/settings.json` at your checkout:

```json
"statusLine": { "type": "command", "command": "bun run --cwd /abs/path/to/pulse src/cli/bin.ts" }
```

## Architecture

```
stdin payload ─┐
               ├─▶ SessionCounters (jsonl incremental cursor)
jsonl transcript ─┘        │
                           ▼
                    PulseSnapshot  ──▶  renderSafe(config)  ──▶  ANSI string
                           │
                           └──▶ ~/.pulse/.cache/{general,index,sessions/*}.json
```

Each Claude Code invocation is a one-shot process. The byte-offset cursor in `~/.pulse/.cache/sessions/<id>.json` keeps re-parse cost proportional to new jsonl lines only, so latency stays flat as sessions grow. External tools can consume the cache files directly — schema is published in `src/core/types.ts`.

## Environment

| Variable | Description |
|----------|-------------|
| `PULSE_HOME` | Override base dir (default `~`) |
| `NO_COLOR` | Disable ANSI colors |
| `COLORTERM=truecolor` | Enable 24-bit color |

## Acknowledgements

- [claude-hud](https://github.com/jarrodwatts/claude-hud) — inspired item design (context, tools, agents, todos)
- [ccstatusline](https://github.com/sirmalloc/ccstatusline) — inspired theming and rendering approach

## License

MIT
