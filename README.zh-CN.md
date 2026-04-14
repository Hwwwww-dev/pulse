[English](./README.md) | [中文](./README.zh-CN.md)

# pulse

[![npm version](https://img.shields.io/npm/v/@hwwwww/pulse?color=crimson&logo=npm)](https://www.npmjs.com/package/@hwwwww/pulse)
[![npm downloads](https://img.shields.io/npm/dm/@hwwwww/pulse?color=blue&logo=npm)](https://www.npmjs.com/package/@hwwwww/pulse)
[![license](https://img.shields.io/npm/l/@hwwwww/pulse?color=green)](./LICENSE)
[![bun](https://img.shields.io/badge/bun-%E2%89%A51.3-black?logo=bun)](https://bun.sh)
[![typescript](https://img.shields.io/badge/typescript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![stars](https://img.shields.io/github/stars/Hwwwww-dev/pulse?style=flat&logo=github)](https://github.com/Hwwwww-dev/pulse)

> [Claude Code](https://claude.ai/code) 的轻量级、高度可定制状态栏——模型、上下文、Token、费用、Git、速率限制。

![pulse 截图](./assets/screenshot.png)

## 安装

```bash
npm i -g @hwwwww/pulse
```

## 接入

在 `~/.claude/settings.json` 中添加一行：

```json
"statusLine": { "type": "command", "command": "bunx @hwwwww/pulse" }
```

## 配置

```bash
bunx @hwwwww/pulse
```

打开交互式 TUI 编辑器，支持实时预览。配置保存在 `~/.pulse/config.json`。

## 条目

<details>
<summary>30+ 内置条目（点击展开）</summary>

| 分类 | 条目 |
|------|------|
| 会话 | `model` `session_name` `session_id` `version` `output_style` `vim_mode` `agent_name` `worktree` |
| 上下文 & Token | `context_usage` `context_bar` `tokens_input` `tokens_output` `tokens_cache_read` `tokens_cache_create` `tokens_summary` `token_rate` |
| 费用 & 耗时 | `cost` `duration` `api_duration` |
| 速率限制 | `five_hour_limit` `seven_day_limit` `five_hour_bar` `seven_day_bar` `reset_in_5h` `reset_in_7d` |
| Git | `git_branch` `lines_changed` |
| 工作区 | `cwd` `project_dir` |
| 计数器 | `tool_calls` `tool_call` `agent_calls` `skill_calls` `recent_tools` `recent_agents` `todos_progress` |
| 实用 | `clock` `text` `spacer` `custom_command` |

</details>

所有条目都支持 `label` / `style` / `margin_*` / `trailing_separator` / `hide_when_empty` 以及类型专属 `options`。进度条（`*_bar`）支持 `bar_width`、`bar_style`、`auto_color`；路径（`cwd`、`project_dir`）支持 `path_mode: basename|tilde|short|full`。完整选项请在 TUI 编辑器中查看。

## 示例

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

主题：`minimal` · `pastel` · `powerline`。

## 环境变量

| 变量 | 说明 |
|------|------|
| `PULSE_HOME` | 覆盖基目录（默认 `~`） |
| `NO_COLOR` | 禁用 ANSI 颜色 |
| `COLORTERM=truecolor` | 启用 24 位真彩色 |

## 鸣谢

- [claude-hud](https://github.com/jarrodwatts/claude-hud) — 启发了条目设计（上下文、工具、Agent、Todo）
- [ccstatusline](https://github.com/sirmalloc/ccstatusline) — 启发了主题与渲染思路

## 许可证

MIT
