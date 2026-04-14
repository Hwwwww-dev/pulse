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

## 特性

- **Powerline ribbon**：带箭头过渡的条带渲染；8 槽调色盘跨主题自动映射——在 `minimal` 下保存的配置切到 `powerline` 仍然可读，反之亦然。
- **动态进度条与闪烁告警**：`context_usage`、`*_limit`、`context_bar` 按 绿→黄→红 阈值给 bar/label/value 上色，达到危险阈值时脉冲闪烁。
- **增量 jsonl 游标**：每次一次性渲染只重新解析新增字节，长会话下延迟保持平稳。
- **丰富的活动条目**：`token_rate`（滑动窗口）、`recent_tools` / `recent_agents` 轨迹、`todos_progress`（`TodoWrite` 快照），以及带明细拆分的工具/Agent/Skill 计数器。
- **可搜索 TUI 编辑器**：分类类型选择器 + 24 色调色盘 + 实时预览 + 阈值/闪烁 就地调参。
- **便携缓存** `~/.pulse/.cache/`：外部面板可直接读 `general.json` / `sessions/*.json`，无需重解析 jsonl。

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

所有条目都支持 `label` / `style` / `margin_*` / `trailing_separator` / `hide_when_empty` 以及类型专属 `options`。进度条（`*_bar`）支持 `bar_width`、`bar_style`、`dynamic_color`；路径（`cwd`、`project_dir`）支持 `path_mode: basename|tilde|short|full`。完整选项请在 TUI 编辑器中查看。

### 样式

`style.color` 是一个语义字段：在 classic 主题（`minimal` / `pastel`）下被当作文字前景色；在 `powerline` 下自动映射为槽背景，并从内置调色盘查出配对前景，保证切换主题后配置依然可读。不在调色盘中的自定义 hex 会原样透传。

## 示例

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

主题：`minimal` · `pastel` · `powerline`（带箭头过渡的 ribbon 渲染，调色盘自动映射）。

## TUI 编辑器快捷键

| 作用域 | 按键 | 行为 |
|--------|------|------|
| 布局页 | `↑↓` / `n` / `d` / `x` | 选择 / 新增 / 复制 / 删除条目 |
| 布局页 | `q` / `r` / `s` | 退出 / 重置 / 保存 |
| 编辑弹窗 | `↑↓` | 切换字段 |
| 编辑弹窗 | `←→` / `Shift+←→` | 变更值 / 大步长 |
| 编辑弹窗 | `Space` | 切换布尔 · 打开类型选择器 |
| 编辑弹窗 | `Enter` / `Esc` | 保存 / 取消 |
| 类型选择器 | 直接输入过滤 · `↑↓` 导航 · `Enter` 确认 · `Esc` 取消 |

## 开发

```bash
git clone https://github.com/Hwwwww-dev/pulse
cd pulse
bun install

bun run typecheck   # tsc --noEmit
bun test            # 180+ 测试，覆盖 render/UI/cli
bun run dev         # 用 dummy stdin 启动 TUI 编辑器
bun run build       # 打包 dist/pulse.js (bin) + dist/index.js
```

如果想对接真实 Claude Code 会话进行本地联调，把 `~/.claude/settings.json` 里的 `statusLine.command` 指向当前仓库即可：

```json
"statusLine": { "type": "command", "command": "bun run --cwd /abs/path/to/pulse src/cli/bin.ts" }
```

## 架构

```
stdin payload ─┐
               ├─▶ SessionCounters（jsonl 增量游标）
jsonl transcript ─┘        │
                           ▼
                    PulseSnapshot  ──▶  renderSafe(config)  ──▶  ANSI 字符串
                           │
                           └──▶ ~/.pulse/.cache/{general,index,sessions/*}.json
```

每次 Claude Code 调用都是一次性进程。`~/.pulse/.cache/sessions/<id>.json` 里的字节偏移游标让再解析成本只和新增 jsonl 行数成正比，会话再长也不拖延迟。缓存文件结构在 `src/core/types.ts` 中公开声明，外部工具可直接消费。

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
