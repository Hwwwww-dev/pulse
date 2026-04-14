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

Every item supports `label` / `style` / `margin_*` / `trailing_separator` / `hide_when_empty` and type-specific `options`. Bars (`*_bar`) take `bar_width`, `bar_style`, `auto_color`. Paths (`cwd`, `project_dir`) take `path_mode: basename|tilde|short|full`. See the TUI editor for the full set.

## Example

```json
{
  "schema_version": 1,
  "theme": "minimal",
  "default_separator": "  ",
  "lines": [{
    "items": [
      { "id": "m", "type": "model", "style": { "fg": "#C792EA", "bold": true } },
      { "id": "c", "type": "context_usage", "label": "Ctx:", "options": { "auto_color": true } },
      { "id": "g", "type": "git_branch", "style": { "fg": "#C3E88D" } },
      { "id": "$", "type": "cost", "label": "$", "options": { "format": "usd2" } }
    ]
  }]
}
```

Themes: `minimal` · `pastel` · `powerline`.

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
