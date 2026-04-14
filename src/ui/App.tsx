import React, { useEffect, useMemo, useState } from "react";
import { Box, Text } from "ink";
import { useConfig } from "./hooks/useConfig.ts";
import { useKeymap } from "./hooks/useKeymap.ts";
import { LivePreview } from "./components/LivePreview.tsx";
import { LayoutPage } from "./pages/LayoutPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { DiagnosticsPage } from "./pages/DiagnosticsPage.tsx";
import { HelpPage } from "./pages/HelpPage.tsx";
import type { PulseSnapshot, TodoItem } from "../core/types.ts";

const BASE_NOW = Date.now();
const TICK_MS = 500;

// Triangle wave in [lo, hi] with the given period (in ticks).
function tri(tick: number, period: number, lo: number, hi: number): number {
  const phase = (tick % period) / period;
  const ramp = phase < 0.5 ? phase * 2 : 2 - phase * 2;
  return lo + (hi - lo) * ramp;
}

// Sawtooth: 0 → max over `period` ticks, then jumps back to 0 and repeats.
// Used for counts that should "accumulate then reset" rather than oscillate.
function saw(tick: number, period: number, max: number): number {
  return ((tick % period) / period) * max;
}

// Recent-tools snapshots cycled through to vary both the tool mix and the
// adjacent-grouping (×N) presentation.
const RECENT_TOOLS_CYCLES: ReadonlyArray<readonly string[]> = [
  ["Read", "Read", "Edit", "Bash", "Glob", "Skill"],
  ["Edit", "Bash", "Bash", "Bash", "Read", "Write"],
  ["Glob", "Read", "Edit", "Edit", "Edit", "TodoWrite"],
  ["Bash", "Bash", "Read", "Grep", "Grep", "WebSearch"],
  ["LSP", "LSP", "LSP", "Edit", "Read", "Bash"],
];

// Recent-agents snapshots: each cycle has its own type mix; the last entry
// may be in-flight so the elapsed timer is visibly counting up.
interface AgentSpec { type: string; startOffset: number; endOffset?: number }
const RECENT_AGENTS_CYCLES: ReadonlyArray<readonly AgentSpec[]> = [
  [
    { type: "Plan", startOffset: 12_000, endOffset: 4_000 },
    { type: "Explore", startOffset: 8_000, endOffset: 3_000 },
    { type: "librarian", startOffset: 2_000 },
  ],
  [
    { type: "Explore", startOffset: 15_000, endOffset: 7_000 },
    { type: "general-purpose", startOffset: 9_000, endOffset: 2_000 },
    { type: "reviewer", startOffset: 3_000 },
  ],
  [
    { type: "researcher", startOffset: 20_000, endOffset: 12_000 },
    { type: "Plan", startOffset: 11_000, endOffset: 5_000 },
    { type: "Explore", startOffset: 4_000 },
  ],
  [
    { type: "executor", startOffset: 18_000, endOffset: 6_000 },
    { type: "Plan", startOffset: 6_000 },
  ],
];

function buildMockSnapshot(tick: number): PulseSnapshot {
  const now = Date.now();

  // Triangle waves at different periods so each item animates independently.
  // Slowed ~2x so users can read the values as the bar moves.
  const ctxPct = tri(tick, 60, 5, 95);                   // ~30s
  const fiveHourPct = tri(tick, 120, 8, 88);             // ~60s
  const sevenDayPct = tri(tick, 180, 15, 75);            // ~90s

  const ctxSize = 200_000;
  const ctxAbs = Math.round((ctxSize * ctxPct) / 100);
  const totalInput = Math.round(ctxAbs * 0.78);
  const totalOutput = Math.round(ctxAbs * 0.22);

  // Cost: sawtooth — accumulates ~$1 over 100s then resets.
  const cost = saw(tick, 200, 1.0) + 0.05;

  // Recent tools cycle every 12 ticks (~6s) — slow enough to read the row.
  const toolsIdx = Math.floor(tick / 12) % RECENT_TOOLS_CYCLES.length;
  const toolsCycle = RECENT_TOOLS_CYCLES[toolsIdx]!;
  const recent_tools = toolsCycle.map((name, i) => ({
    name,
    ts: now - (toolsCycle.length - i) * 1500,
  }));

  // Recent agents cycle every 16 ticks (~8s). Anchor start_ts to the cycle
  // boundary so the in-flight elapsed counter restarts cleanly per cycle.
  const agentsIdx = Math.floor(tick / 16) % RECENT_AGENTS_CYCLES.length;
  const agentsCycleStartTs = BASE_NOW + Math.floor(tick / 16) * 16 * TICK_MS;
  const agent_entries = RECENT_AGENTS_CYCLES[agentsIdx]!.map((a, i) => ({
    id: `cyc${agentsIdx}-${i}`,
    type: a.type,
    start_ts: agentsCycleStartTs - a.startOffset,
    ...(a.endOffset !== undefined ? { end_ts: agentsCycleStartTs - a.endOffset } : {}),
  }));

  // Todos: cycle progress 1/4 → 4/4 over 24 ticks (~12s).
  const stage = Math.floor((tick / 6) % 4);
  const todos: TodoItem[] = [
    { content: "draft schema", status: stage >= 0 ? "completed" : "pending" },
    { content: "wire renderers", status: stage >= 1 ? "completed" : (stage === 0 ? "in_progress" : "pending") },
    { content: "edit-modal controls", status: stage >= 2 ? "completed" : (stage === 1 ? "in_progress" : "pending") },
    { content: "ship preview fix", status: stage >= 3 ? "completed" : (stage === 2 ? "in_progress" : "pending") },
  ];

  // Token-rate samples animate so the rate item visibly changes.
  const inWiggle = Math.round(tri(tick, 40, 800, 2400));
  const outWiggle = Math.round(tri(tick, 40, 400, 1500));

  // Sawtooth counters — accumulate then reset, slow enough to read.
  const toolsTotal = 50 + Math.floor(saw(tick, 240, 600));         // 0..600 over 120s
  const bashCount = 4 + Math.floor(saw(tick, 240, 80));
  const readCount = 8 + Math.floor(saw(tick, 240, 120));
  const editCount = 5 + Math.floor(saw(tick, 240, 60));
  const grepCount = 1 + Math.floor(saw(tick, 240, 30));
  const agentsTotal = 2 + Math.floor(saw(tick, 360, 25));          // slower, ~180s
  const skillsTotal = 1 + Math.floor(saw(tick, 360, 15));

  return {
    schema_version: 2,
    captured_at: now,
    claude: {
      session_id: "preview-session-id-1234",
      transcript_path: "/tmp/preview.jsonl",
      cwd: "/home/me/projects/pulse",
      version: "2.1.90",
      model: { id: "claude-opus-4-6", display_name: "Opus" },
      workspace: {
        current_dir: "/home/me/projects/pulse",
        project_dir: "/home/me/projects/pulse",
        added_dirs: [],
      },
      cost: {
        total_cost_usd: cost,
        total_duration_ms: 1_425_000 + tick * 500,
        total_api_duration_ms: 145_000 + tick * 120,
        total_lines_added: 156 + (tick % 100),
        total_lines_removed: 23 + Math.floor((tick % 100) / 4),
      },
      context_window: {
        total_input_tokens: totalInput,
        total_output_tokens: totalOutput,
        context_window_size: ctxSize,
        used_percentage: ctxPct,
        remaining_percentage: 100 - ctxPct,
        current_usage: {
          input_tokens: 8500,
          output_tokens: 1200,
          cache_creation_input_tokens: 5000,
          cache_read_input_tokens: 2000,
        },
      },
      exceeds_200k_tokens: false,
      rate_limits: {
        five_hour: { used_percentage: fiveHourPct, resets_at: Math.floor(BASE_NOW / 1000) + 3600 },
        seven_day: { used_percentage: sevenDayPct, resets_at: Math.floor(BASE_NOW / 1000) + 86400 },
      },
      agent: { name: "reviewer" },
    },
    counters: {
      tool_calls_total: toolsTotal,
      tool_calls_by_name: {
        Agent: 4,
        Bash: bashCount,
        Edit: editCount,
        Glob: 5,
        Grep: grepCount,
        LSP: 7,
        Read: readCount,
        Skill: 3,
        TodoWrite: 2,
        WebSearch: 4,
        Write: 3,
      },
      agent_calls_total: agentsTotal,
      agent_calls_by_type: { Explore: 2, Plan: 1, "general-purpose": 4, researcher: 1, reviewer: 1 },
      message_count: { user: 8, assistant: 15 },
      skill_calls_total: skillsTotal,
      skill_calls_by_name: { brainstorming: 3, "systematic-debugging": 1, "writing-plans": 2 },
      usage_totals: {
        input_tokens: totalInput,
        output_tokens: totalOutput,
        cache_read_input_tokens: 8_338_597,
        cache_creation_input_tokens: 854_963,
      },
      agent_entries,
      recent_tools,
      todos,
      usage_samples: [
        { ts: now - 45_000, in_delta: inWiggle, out_delta: outWiggle },
        { ts: now - 25_000, in_delta: 1_800, out_delta: 950 },
        { ts: now - 8_000, in_delta: inWiggle + 300, out_delta: outWiggle + 200 },
      ],
    },
    git: { branch: "main", is_dirty: true, ahead: 1, behind: 0 },
  };
}

const PAGES = ["Layout", "Settings", "Diagnostics", "Help"] as const;
type Page = (typeof PAGES)[number];

export function App(): React.ReactElement {
  const { config, setConfig, save, reload, dirty } = useConfig();
  const [page, setPage] = useState<Page>("Layout");
  const [layoutEditing, setLayoutEditing] = useState(false);
  const pageIndex = useMemo(() => PAGES.indexOf(page), [page]);

  // Animated mock snapshot — drives the live preview through value extremes
  // so the user can see how each item behaves at low / mid / high data.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);
  const snapshot = useMemo(() => buildMockSnapshot(tick), [tick]);

  useKeymap({
    enabled: !(page === "Layout" && layoutEditing),
    onTab: () => { const next = PAGES[(pageIndex + 1) % PAGES.length]; if (next) setPage(next); },
    onShiftTab: () => { const prev = PAGES[(pageIndex + PAGES.length - 1) % PAGES.length]; if (prev) setPage(prev); },
    onSave: () => void save(),
    onReload: () => void reload(),
  });

  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(
      Box,
      null,
      React.createElement(Text, { bold: true }, "Pulse v0.1.0"),
      React.createElement(Text, { dimColor: true }, "   [Tab] switch · [s] save · [r] reload · [q] quit"),
      dirty ? React.createElement(Text, { color: "yellow" }, "  ● unsaved") : null,
    ),
    React.createElement(
      Box,
      { marginTop: 1 },
      ...PAGES.map((p) =>
        React.createElement(
          Text,
          { key: p, ...(p === page ? { color: "cyan" as const, bold: true } : {}) },
          ` ${p} `,
        ),
      ),
    ),
    React.createElement(
      Box,
      { marginTop: 1, minHeight: 6 },
      page === "Layout"
        ? React.createElement(LayoutPage, {
            config,
            snapshot: snapshot,
            onChange: setConfig,
            onEditingChange: setLayoutEditing,
          })
        : page === "Settings"
        ? React.createElement(SettingsPage, { config, onChange: setConfig })
        : page === "Diagnostics"
        ? React.createElement(DiagnosticsPage)
        : React.createElement(HelpPage),
    ),
    React.createElement(LivePreview, { snapshot: snapshot, config }),
  );
}
