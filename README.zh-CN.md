[English](./README.md) | [中文](./README.zh-CN.md)

# pulse

[![npm version](https://img.shields.io/npm/v/@hwwwww/pulse?color=crimson&logo=npm)](https://www.npmjs.com/package/@hwwwww/pulse)
[![license](https://img.shields.io/npm/l/@hwwwww/pulse?color=green)](./LICENSE)
[![bun](https://img.shields.io/badge/bun-%E2%89%A51.3-black?logo=bun)](https://bun.sh)
[![npm downloads](https://img.shields.io/npm/dm/@hwwwww/pulse?color=blue&logo=npm)](https://www.npmjs.com/package/@hwwwww/pulse)
[![types](https://img.shields.io/npm/types/@hwwwww/pulse?color=blueviolet)](https://www.npmjs.com/package/@hwwwww/pulse)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](https://github.com/Hwwwww-dev/pulse/pulls)
[![issues](https://img.shields.io/github/issues/Hwwwww-dev/pulse?logo=github)](https://github.com/Hwwwww-dev/pulse/issues)
[![last commit](https://img.shields.io/github/last-commit/Hwwwww-dev/pulse?logo=github)](https://github.com/Hwwwww-dev/pulse/commits)
[![GitHub stars](https://img.shields.io/github/stars/Hwwwww-dev/pulse?style=social)](https://github.com/Hwwwww-dev/pulse/stargazers)

**让 [Claude Code](https://claude.ai/code) 的状态一目了然。**
上下文压力、Token 消耗、费用、速率限制、Git 状态——随时可见，随时可感知。

![pulse 截图](./assets/screenshot.png)

---

## ✨ 功能

- **交互式 TUI 编辑器** — 实时预览、颜色选择器、跨行拖拽排序，无需手写 JSON
- **30+ 条目类型** — 模型、费用、输入/输出/缓存 Token、上下文用量、5小时与每周限额及重置倒计时、最近工具/Agent、Todo 进度、Git 分支、时钟、自定义 Shell 命令
- **动态颜色渐变** — 进度条按阈值从绿→黄→红渐变；阈值每条目可独立配置
- **14 种进度条样式** — 细线、方块、盲文点阵等，每个条目单独设置
- **多行布局** — 每行独立背景色，支持丰富字形样式
- **子部件样式独立控制** — 对同一条目的标签、进度条、数值分别设色
- **增量 JSONL 游标** — 每次渲染只重解析新增字节，长会话下依然快

---

## 🔒 离线运行

> **Pulse 完全离线、100% 本地运行。** 不发起任何网络请求，无遥测，无需 API Key —— 仅读取：
>
> - Claude Code 通过 stdin 传入的 JSON payload，
> - 本机磁盘上 Claude Code 自身的 JSONL 会话记录，
> - Claude Code 的用户配置 `~/.claude/settings.json`（用于读取 thinking effort、output style、sandbox 模式等环境状态）。
>
> ⚠️ **5 小时** 与 **每周** 速率限制数据来源于 stdin payload，仅在 Claude Code 推送新的状态栏 tick 时刷新，可能比 Claude Code 内部实时计数略有延迟。

---

## 🚀 安装

```bash
bunx @hwwwww/pulse@latest
```

无需全局安装，直接通过 `bunx` 运行。如需频繁使用，可全局安装：`bun add -g @hwwwww/pulse`。

运行时要求：需安装 **Bun ≥ 1.3** —— 二进制使用 Bun shebang。

---

## ⚙️ 接入

在 `~/.claude/settings.json` 中添加：

```json
{
  "statusLine": {
    "type": "command",
    "command": "bunx @hwwwww/pulse@latest",
    "padding": 0
  }
}
```

重启 Claude Code，状态栏即刻生效。

---

## 🎨 自定义

无参数运行 `bunx @hwwwww/pulse@latest` 即可打开 TUI 编辑器（已全局安装则可直接运行 `pulse`）：

```bash
bunx @hwwwww/pulse@latest
```

配置文件位置：`~/.pulse/config.json`

可直接手动编辑，也可使用应用内编辑器——两者保持同步。TUI 提供实时预览、颜色选择器、阈值调节器，以及跨行条目排序功能。

手写示例：

```json
{
  "lines": [{
    "items": [
      { "id": "m", "type": "model",         "style": { "color": "#957FB8", "bold": true } },
      { "id": "c", "type": "context_usage", "options": { "dynamic_color": true, "show_bar": true } },
      { "id": "g", "type": "git_branch",    "style": { "color": "#98BB6C" } },
      { "id": "$", "type": "cost",          "options": { "format": "usd2" } }
    ]
  }]
}
```

---

## 📦 条目类型

40 个内置条目，按用途分组。可在应用内的类型选择器中添加。

| 分类 | 条目 |
|---|---|
| **会话** | `model` · `session_name` · `session_id` · `agent_name` · `output_style` · `vim_mode` · `version` · `clock` |
| **工作区** | `cwd` · `project_dir` · `worktree` · `git_branch` |
| **费用与耗时** | `cost` · `duration` · `api_duration` · `lines_changed` |
| **Token** | `tokens_input` · `tokens_output` · `tokens_cache_read` · `tokens_cache_create` · `tokens_summary` · `token_rate` |
| **上下文** | `context_usage` · `context_bar` |
| **速率限制** | `five_hour_limit` · `seven_day_limit` · `five_hour_bar` · `seven_day_bar` · `reset_in_5h` · `reset_in_7d` |
| **计数器** | `tool_calls` · `agent_calls` · `skill_calls` · `tool_call` |
| **活动** | `recent_agents` · `recent_tools` · `todos_progress` |
| **自定义** | `custom_command` · `text` · `spacer` |

每个条目都支持独立的 `style`、`label`、`format`、动态颜色阈值与宽度对齐。完整 schema 见 [`src/config/schema.ts`](./src/config/schema.ts)。

---

## 🛠️ 开发

想为 pulse 增加新条目类型或贡献代码？克隆仓库并本地运行：

```bash
git clone https://github.com/Hwwwww-dev/pulse.git
cd pulse
bun install
bun run dev          # run the editor against your real config
bun test             # run the test suite
bun run typecheck    # strict TypeScript check
bun run build        # produce dist/pulse.js
```

项目结构：

- `src/cli/`      — CLI 入口，渲染模式管道
- `src/render/`   — 条目渲染器、格式化工具、渲染引擎
- `src/ui/`       — 基于 Ink 的 TUI 编辑器（页面、组件、Hooks）
- `src/config/`   — Schema、主题、调色板、持久化
- `test/`         — Bun 测试套件

欢迎 PR 与 Issue —— 详见[问题追踪](https://github.com/Hwwwww-dev/pulse/issues)。

---

## ⭐ Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=Hwwwww-dev/pulse&type=Date)](https://star-history.com/#Hwwwww-dev/pulse&Date)

如果 pulse 对你的日常有帮助，欢迎在 GitHub 点一个 ⭐ ，多谢支持！

---

## 🙏 鸣谢

Pulse 站在巨人的肩膀上构建：

- [Claude Code](https://claude.ai/code) —— 本状态栏所服务的智能编码工具
- [Bun](https://bun.sh) —— 让 pulse 飞快的运行时、打包器与测试框架
- [Ink](https://github.com/vadimdemedes/ink) —— 命令行交互应用的 React，驱动 TUI 编辑器
- [Zod](https://zod.dev) —— 配置文件的运行时 schema 校验
- 灵感来自 [ccstatusline](https://github.com/sirmalloc/ccstatusline) 与 [claude-hud](https://github.com/jarrodwatts/claude-hud) —— 感谢前人铺路

特别感谢每一位提交 Issue、建议条目类型或为本仓库点亮 Star 的朋友。⭐

## 📜 许可证

MIT © [hwwwww](https://github.com/Hwwwww-dev)
