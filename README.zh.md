[English](./README.md) | [中文](./README.zh.md)

# pulse

[Claude Code](https://claude.ai/code) 的轻量级、高度可定制状态栏。

实时显示模型、上下文用量、Token 数、费用、Git 状态、速率限制等信息——以紧凑、彩色的状态栏呈现，每次 Claude Code 操作后自动更新。

---

## 环境要求

- [Bun](https://bun.sh) ≥ 1.3
- Claude Code

---

## 安装

```bash
npm install -g @hwwwww/pulse
# 或
bunx @hwwwww/pulse
```

---

## 接入

在 Claude Code 配置文件（`~/.claude/settings.json`）中添加一行：

```json
"statusLine": { "type": "command", "command": "bunx @hwwwww/pulse" }
```

完成。Claude Code 会在每次操作时将状态通过管道传给 pulse，并将渲染结果显示为状态栏。

---

## 配置

在终端直接运行 pulse 可打开 TUI 配置编辑器：

```bash
bunx @hwwwww/pulse
```

编辑器支持添加/删除/排序条目、从调色盘选色，并可实时预览效果。配置保存至 `~/.pulse/config.json`。

也可以直接手动编辑该 JSON 文件。

---

## 可用条目

### 会话
| 类型 | 说明 |
|------|------|
| `model` | 当前模型名称 |
| `session_name` | 会话名（无名时显示短 ID）|
| `session_id` | 完整或短格式会话 ID |
| `version` | Claude Code 版本号 |
| `output_style` | 当前输出风格 |
| `vim_mode` | Vim 模式指示 |
| `agent_name` | 当前子 Agent 名称 |
| `worktree` | 活跃的 Git worktree |

### 上下文与 Token
| 类型 | 说明 |
|------|------|
| `context_usage` | 上下文窗口用量 % |
| `context_bar` | 上下文窗口进度条 |
| `tokens_input` | 输入 Token 数 |
| `tokens_output` | 输出 Token 数 |
| `tokens_cache_read` | 缓存读取 Token 数 |
| `tokens_cache_create` | 缓存创建 Token 数 |
| `tokens_summary` | Token 汇总 |
| `token_rate` | Token 速率（每秒/每分钟）|

### 费用与时长
| 类型 | 说明 |
|------|------|
| `cost` | 会话费用（USD）|
| `duration` | 会话总时长 |
| `api_duration` | API 请求总耗时 |

### 速率限制
| 类型 | 说明 |
|------|------|
| `five_hour_limit` | 5 小时用量限制 % |
| `seven_day_limit` | 7 天用量限制 % |
| `five_hour_bar` | 5 小时限制进度条 |
| `seven_day_bar` | 7 天限制进度条 |
| `reset_in_5h` | 5 小时限制重置倒计时 |
| `reset_in_7d` | 7 天限制重置倒计时 |

### Git
| 类型 | 说明 |
|------|------|
| `git_branch` | 分支名 + 脏标记 + ahead/behind |
| `lines_changed` | `+新增/-删除` 行数 |

### 工作区
| 类型 | 说明 |
|------|------|
| `cwd` | 当前工作目录 |
| `project_dir` | 项目根目录 |

### 计数器
| 类型 | 说明 |
|------|------|
| `tool_calls` | 工具调用总数 |
| `tool_call` | 指定工具的调用数（需设 `tool_name`）|
| `agent_calls` | 子 Agent 调用总数 |
| `skill_calls` | Skill 调用总数 |
| `recent_agents` | 最近 Agent 活动 |
| `recent_tools` | 最近工具调用列表 |
| `todos_progress` | Todo 进度 |

### 工具
| 类型 | 说明 |
|------|------|
| `clock` | 当前时间 |
| `text` | 静态文本 |
| `spacer` | 空白间隔 |
| `custom_command` | 任意 Shell 命令输出 |

---

## 条目选项

每个条目支持以下通用字段：

```jsonc
{
  "id": "my-item",
  "type": "context_usage",
  "label": "Ctx:",           // 前缀标签
  "label_separator": " ",    // 标签与值之间的分隔符
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

样式字段：`fg`（十六进制或命名颜色）、`bg`、`bold`、`italic`、`underline`、`dim`。

### 各类型关键 `options`

**进度条**（`context_bar`、`five_hour_bar` 等）
```jsonc
{
  "bar_width": 10,
  "bar_style": "dingbat",   // dingbat | shaded | block | line | double | dot | square | ascii
  "bar_show_value": true,
  "auto_color": true,        // 绿 → 黄 → 红渐变
  "bar_thresholds": [{ "at": 80, "fg": "#F07178" }]
}
```

**限制类**（`five_hour_limit`、`seven_day_limit`）
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
  "command_cache_ms": 5000   // 缓存 stdout 5 秒
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

## 主题

在配置中设置 `theme`：`minimal`（默认）· `pastel` · `powerline`

---

## 配置示例

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

## 环境变量

| 变量 | 说明 |
|------|------|
| `PULSE_HOME` | 覆盖根目录（默认：`~`）|
| `NO_COLOR` | 禁用所有 ANSI 颜色 |
| `COLORTERM` | 设为 `truecolor` 或 `24bit` 开启全彩 |

---

## 鸣谢

- [claude-hud](https://github.com/jarrodwatts/claude-hud) — 显示上下文用量、活跃工具、Agent 活动和 Todo 进度的 Claude Code 插件，启发了 pulse 的条目设计
- [ccstatusline](https://github.com/sirmalloc/ccstatusline) — 支持 powerline 和主题的高度可定制状态栏，启发了 pulse 的主题与渲染方案

---

## 许可证

MIT
