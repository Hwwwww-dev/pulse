import { test, expect } from "bun:test";
import { RENDERERS } from "../../src/render/items/index.ts";
import { thresholdColor } from "../../src/render/items/helpers.ts";
import { aggregate } from "../../src/core/aggregator.ts";
import { emptyCounters } from "../../src/input/jsonl.ts";
import { parseStdinPayload } from "../../src/input/stdin.ts";
import { stripAnsi } from "../../src/render/ansi.ts";
import type { Item } from "../../src/config/schema.ts";

const full = parseStdinPayload(await Bun.file("test/fixtures/stdin/full.json").text());
if (!full.ok) throw new Error("fixture broken");
const snap = aggregate(full.data, emptyCounters(), undefined);

function renderRaw(type: Item["type"], item: Partial<Item> = {}): string {
  const full: Item = { id: "t", type, ...item };
  return stripAnsi(RENDERERS[type](snap, full));
}

test("model renders display_name", () => {
  expect(renderRaw("model")).toBe("Opus");
});

test("model strips ' context' inside parens", () => {
  const custom = {
    ...snap,
    claude: { ...snap.claude, model: { id: "x", display_name: "Opus 4.7 (1M context) (default)" } },
  };
  const out = stripAnsi(RENDERERS.model(custom, { id: "t", type: "model" }));
  expect(out).toBe("Opus 4.7 (1M) (default)");
});

test("session_name falls back to short id", () => {
  const claudeNoName = { ...snap.claude };
  delete (claudeNoName as { session_name?: string }).session_name;
  const noName = { ...snap, claude: claudeNoName } as typeof snap;
  const out = stripAnsi(RENDERERS.session_name(noName, { id: "t", type: "session_name" }));
  expect(out).toBe(snap.claude.session_id.slice(0, 6));
});

test("text renders literal", () => {
  expect(renderRaw("text", { options: { literal: "hello" } })).toBe("hello");
});

test("clock formatted", () => {
  const out = renderRaw("clock", { options: { format: "clock_24" } });
  expect(out).toMatch(/^\d{2}:\d{2}$/);
});

test("version renders", () => {
  expect(renderRaw("version")).toBe("2.1.90");
});

test("cwd basename", () => {
  const out = renderRaw("cwd", { options: { path_mode: "basename" } });
  expect(out).toBe("pulse");
});

test("cwd tilde", () => {
  const orig = Bun.env.PULSE_HOME;
  (Bun.env as Record<string, string>).PULSE_HOME = "/home/me";
  const out = renderRaw("cwd", { options: { path_mode: "tilde" } });
  if (orig !== undefined) (Bun.env as Record<string, string>).PULSE_HOME = orig;
  else delete (Bun.env as Record<string, string | undefined>).PULSE_HOME;
  expect(out).toBe("~/projects/pulse");
});

test("cwd short", () => {
  const orig = Bun.env.PULSE_HOME;
  (Bun.env as Record<string, string>).PULSE_HOME = "/home/me";
  const out = renderRaw("cwd", { options: { path_mode: "short" } });
  if (orig !== undefined) (Bun.env as Record<string, string>).PULSE_HOME = orig;
  else delete (Bun.env as Record<string, string | undefined>).PULSE_HOME;
  expect(out).toBe("~/p/pulse");
});

test("cost usd4", () => {
  expect(renderRaw("cost", { options: { format: "usd4" } })).toBe("$0.1234");
});

test("duration duration_compact", () => {
  expect(renderRaw("duration", { options: { format: "duration_compact" } })).toBe("23m45s");
});

test("api_duration duration_compact", () => {
  expect(renderRaw("api_duration", { options: { format: "duration_compact" } })).toBe("2m25s");
});

test("lines_changed", () => {
  expect(renderRaw("lines_changed")).toBe("+156/-23");
});

test("context_usage percent0", () => {
  expect(renderRaw("context_usage")).toBe("67%");
});

test("context_bar shows filled proportion", () => {
  // used_percentage = 67, width = 10 → round(6.7) = 7 filled, 3 empty
  const out = renderRaw("context_bar", {
    options: { bar_width: 10, bar_show_value: true },
  });
  expect(out).toMatch(/^▰{7}▱{3} 67%$/);
});

test("tokens_input compact", () => {
  expect(renderRaw("tokens_input")).toBe("15.2k");
});

test("tokens_input uses JSONL usage_totals when larger than stdin (resume case)", () => {
  const resumed = {
    ...snap,
    counters: {
      ...snap.counters,
      usage_totals: {
        input_tokens: 500_000,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
  };
  const out = stripAnsi(
    RENDERERS.tokens_input(resumed, { id: "t", type: "tokens_input", options: { format: "tokens_full" } }),
  );
  expect(out).toBe("500000");
});

test("tokens_output falls back to stdin when JSONL usage_totals is smaller", () => {
  const fresh = {
    ...snap,
    counters: {
      ...snap.counters,
      usage_totals: {
        input_tokens: 0,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
  };
  const out = stripAnsi(
    RENDERERS.tokens_output(fresh, { id: "t", type: "tokens_output", options: { format: "tokens_full" } }),
  );
  // stdin total_output_tokens in fixture (4521) > usage_totals (1) → stdin wins
  expect(out).toBe("4521");
});

test("tokens_summary default parts", () => {
  expect(
    renderRaw("tokens_summary", {
      options: { tokens_parts: ["input", "output"], format: "tokens_compact" },
    }),
  ).toBe("15.2k 4.5k");
});

test("five_hour_limit percent", () => {
  expect(renderRaw("five_hour_limit", { options: { format: "percent1" } })).toBe("23.5%");
});

test("seven_day_bar renders", () => {
  // rate_limits.seven_day.used_percentage = 41.2, width = 10 → round(4.12) = 4 filled, 6 empty
  const out = renderRaw("seven_day_bar", { options: { bar_width: 10, bar_show_value: true } });
  expect(out).toMatch(/^▰{4}▱{6} 41%$/);
});

test("reset_in_5h relative_eta", () => {
  const out = renderRaw("reset_in_5h", { options: { format: "relative_eta" } });
  expect(out).toMatch(/^in /);
});

test("reset_in_5h relative_eta_compact squeezes spaces", () => {
  const out = renderRaw("reset_in_5h", { options: { format: "relative_eta_compact" } });
  expect(out).toMatch(/^in \d+h\d+m$/);
});

test("reset_in_5h relative_eta_long_compact shows days", () => {
  const out = renderRaw("reset_in_5h", { options: { format: "relative_eta_long_compact" } });
  expect(out).toMatch(/^in \d+d/);
});

test("tool_calls default shows total", () => {
  const withCounters = {
    ...snap,
    counters: { ...snap.counters, tool_calls_total: 42 },
  };
  const out = stripAnsi(RENDERERS.tool_calls(withCounters, { id: "t", type: "tool_calls" }));
  expect(out).toBe("42");
});

test("agent_calls with breakdown", () => {
  const withCounters = {
    ...snap,
    counters: {
      ...snap.counters,
      agent_calls_total: 5,
      agent_calls_by_type: { Explore: 3, Plan: 2 },
    },
  };
  const out = stripAnsi(
    RENDERERS.agent_calls(withCounters, {
      id: "t",
      type: "agent_calls",
      options: { show_breakdown: true, breakdown_top_n: 2 },
    }),
  );
  expect(out).toBe("5 (Explore\u00d73 Plan\u00d72)");
});

test("git_branch shows dirty marker", () => {
  const withGit = {
    ...snap,
    git: { branch: "main", is_dirty: true, ahead: 1, behind: 0 },
  };
  const out = stripAnsi(
    RENDERERS.git_branch(withGit, {
      id: "t",
      type: "git_branch",
      options: { git_dirty_marker: "*" },
    }),
  );
  expect(out).toBe("main*/+1");
});

test("git_branch falls back to '-' when git info missing", () => {
  const noGit = { ...snap };
  delete (noGit as { git?: unknown }).git;
  const out = stripAnsi(
    RENDERERS.git_branch(noGit as typeof snap, { id: "t", type: "git_branch" }),
  );
  expect(out).toBe("-");
});

test("show_label: false hides label", () => {
  const out = stripAnsi(
    RENDERERS.cost(snap, { id: "t", type: "cost", label: "💰", show_label: false, options: { format: "usd4" } }),
  );
  expect(out).toBe("$0.1234");
});

test("cost format usd2", () => {
  const out = stripAnsi(
    RENDERERS.cost(snap, { id: "t", type: "cost", options: { format: "usd2" } }),
  );
  expect(out).toBe("$0.12");
});

test("cost format usd4", () => {
  const out = stripAnsi(
    RENDERERS.cost(snap, { id: "t", type: "cost", options: { format: "usd4" } }),
  );
  expect(out).toBe("$0.1234");
});

test("tokens_input format tokens_compact", () => {
  const out = stripAnsi(
    RENDERERS.tokens_input(snap, { id: "t", type: "tokens_input", options: { format: "tokens_compact" } }),
  );
  expect(out).toBe("15.2k");
});

test("model respects show_context_size: never", () => {
  const extended = {
    ...snap,
    claude: {
      ...snap.claude,
      context_window: { ...snap.claude.context_window, context_window_size: 1_000_000 },
    },
  };
  const out = stripAnsi(
    RENDERERS.model(extended, { id: "t", type: "model", options: { show_context_size: "never" } }),
  );
  expect(out).toBe("Opus");
});

test("skill_calls total", () => {
  const withCounters = {
    ...snap,
    counters: {
      ...snap.counters,
      skill_calls_total: 5,
      skill_calls_by_name: { brainstorming: 3, "writing-plans": 2 },
    },
  };
  const out = stripAnsi(
    RENDERERS.skill_calls(withCounters, {
      id: "t",
      type: "skill_calls",
      options: { show_breakdown: true, breakdown_top_n: 2 },
    }),
  );
  expect(out).toBe("5 (brainstorming\u00d73 writing-plans\u00d72)");
});

test("tool_call shows count for specified tool_name", () => {
  const withCounters = {
    ...snap,
    counters: {
      ...snap.counters,
      tool_calls_by_name: { Read: 12, Edit: 5, Bash: 8 },
    },
  };
  // P0-2: renderer returns raw value; engine handles label assembly
  const out = stripAnsi(
    RENDERERS.tool_call(withCounters, {
      id: "t",
      type: "tool_call",
      options: { tool_name: "Read" },
    }),
  );
  expect(out).toBe("12");
});

test("tool_call returns 0 for unknown tool", () => {
  const out = stripAnsi(
    RENDERERS.tool_call(snap, {
      id: "t",
      type: "tool_call",
      options: { tool_name: "NonExistent" },
    }),
  );
  expect(out).toBe("0");
});

test("tool_call with hide_when_empty and zero count returns empty", () => {
  const out = RENDERERS.tool_call(snap, {
    id: "t",
    type: "tool_call",
    hide_when_empty: true,
    options: { tool_name: "NonExistent" },
  });
  expect(out).toBe("");
});

test("thinking_effort returns '-' when no settings and no counter", () => {
  const bare = { ...snap };
  delete (bare as { claude_settings?: unknown }).claude_settings;
  const countersCopy = { ...bare.counters };
  delete (countersCopy as { thinking_effort?: unknown }).thinking_effort;
  const snapNone = { ...bare, counters: countersCopy } as typeof snap;
  const out = stripAnsi(
    RENDERERS.thinking_effort(snapNone, { id: "t", type: "thinking_effort" }),
  );
  expect(out).toBe("-");
});

test("thinking_effort: settings.effortLevel wins over counters.thinking_effort", () => {
  const both = {
    ...snap,
    claude_settings: { effortLevel: "high" as const },
    counters: { ...snap.counters, thinking_effort: "low" as const },
  };
  const out = stripAnsi(
    RENDERERS.thinking_effort(both, { id: "t", type: "thinking_effort" }),
  );
  expect(out).toBe("high");
});

test("thinking_effort: stdin claude.effort.level wins over settings and counters", () => {
  const triple = {
    ...snap,
    claude: { ...snap.claude, effort: { level: "xhigh" as const } },
    claude_settings: { effortLevel: "high" as const },
    counters: { ...snap.counters, thinking_effort: "low" as const },
  };
  const out = stripAnsi(
    RENDERERS.thinking_effort(triple, { id: "t", type: "thinking_effort" }),
  );
  expect(out).toBe("xhigh");
});

test("thinking_effort falls back to JSONL counter when settings missing", () => {
  const bare = { ...snap };
  delete (bare as { claude_settings?: unknown }).claude_settings;
  const withCounter = {
    ...bare,
    counters: { ...bare.counters, thinking_effort: "medium" as const },
  } as typeof snap;
  const out = stripAnsi(
    RENDERERS.thinking_effort(withCounter, { id: "t", type: "thinking_effort" }),
  );
  expect(out).toBe("medium");
});

test("output_style: stdin value wins", () => {
  const withStdin = {
    ...snap,
    claude: { ...snap.claude, output_style: { name: "explanatory" } },
    claude_settings: { outputStyle: "rem-engineer" },
  };
  const out = stripAnsi(
    RENDERERS.output_style(withStdin, { id: "t", type: "output_style" }),
  );
  expect(out).toBe("explanatory");
});

test("output_style: falls back to claude_settings.outputStyle when stdin absent", () => {
  const noStdin = { ...snap, claude: { ...snap.claude } };
  delete (noStdin.claude as { output_style?: unknown }).output_style;
  const withSettings = {
    ...noStdin,
    claude_settings: { outputStyle: "rem-engineer" },
  };
  const out = stripAnsi(
    RENDERERS.output_style(withSettings, { id: "t", type: "output_style" }),
  );
  expect(out).toBe("rem-engineer");
});

test("output_style: returns '-' when both absent", () => {
  const noStdin = { ...snap, claude: { ...snap.claude } };
  delete (noStdin.claude as { output_style?: unknown }).output_style;
  const cleaned = { ...noStdin };
  delete (cleaned as { claude_settings?: unknown }).claude_settings;
  const out = stripAnsi(
    RENDERERS.output_style(cleaned as typeof snap, { id: "t", type: "output_style" }),
  );
  expect(out).toBe("-");
});

test("sandbox_enabled: returns '-' when settings absent", () => {
  const bare = { ...snap };
  delete (bare as { claude_settings?: unknown }).claude_settings;
  const out = stripAnsi(
    RENDERERS.sandbox_enabled(bare as typeof snap, { id: "t", type: "sandbox_enabled" }),
  );
  expect(out).toBe("-");
});

test("sandbox_enabled: default format 'on'/'off'", () => {
  const on = { ...snap, claude_settings: { sandboxEnabled: true } };
  const off = { ...snap, claude_settings: { sandboxEnabled: false } };
  expect(
    stripAnsi(RENDERERS.sandbox_enabled(on, { id: "t", type: "sandbox_enabled" })),
  ).toBe("on");
  expect(
    stripAnsi(RENDERERS.sandbox_enabled(off, { id: "t", type: "sandbox_enabled" })),
  ).toBe("off");
});

test("sandbox_enabled: sandbox_bool format", () => {
  const on = { ...snap, claude_settings: { sandboxEnabled: true } };
  const out = stripAnsi(
    RENDERERS.sandbox_enabled(on, {
      id: "t",
      type: "sandbox_enabled",
      options: { format: "sandbox_bool" },
    }),
  );
  expect(out).toBe("true");
});

test("sandbox_enabled: sandbox_icon format", () => {
  const off = { ...snap, claude_settings: { sandboxEnabled: false } };
  const out = stripAnsi(
    RENDERERS.sandbox_enabled(off, {
      id: "t",
      type: "sandbox_enabled",
      options: { format: "sandbox_icon" },
    }),
  );
  expect(out).toBe("🔓");
});

test("thinking: returns '-' when stdin field absent", () => {
  const bare = { ...snap, claude: { ...snap.claude } };
  delete (bare.claude as { thinking?: unknown }).thinking;
  const out = stripAnsi(
    RENDERERS.thinking(bare, { id: "t", type: "thinking" }),
  );
  expect(out).toBe("-");
});

test("thinking: default format 'on'/'off'", () => {
  const on = { ...snap, claude: { ...snap.claude, thinking: { enabled: true } } };
  const off = { ...snap, claude: { ...snap.claude, thinking: { enabled: false } } };
  expect(
    stripAnsi(RENDERERS.thinking(on, { id: "t", type: "thinking" })),
  ).toBe("on");
  expect(
    stripAnsi(RENDERERS.thinking(off, { id: "t", type: "thinking" })),
  ).toBe("off");
});

test("thinking: thinking_bool format", () => {
  const on = { ...snap, claude: { ...snap.claude, thinking: { enabled: true } } };
  const out = stripAnsi(
    RENDERERS.thinking(on, {
      id: "t",
      type: "thinking",
      options: { format: "thinking_bool" },
    }),
  );
  expect(out).toBe("true");
});

test("thinking: thinking_icon format", () => {
  const on = { ...snap, claude: { ...snap.claude, thinking: { enabled: true } } };
  const off = { ...snap, claude: { ...snap.claude, thinking: { enabled: false } } };
  expect(
    stripAnsi(
      RENDERERS.thinking(on, { id: "t", type: "thinking", options: { format: "thinking_icon" } }),
    ),
  ).toBe("💭");
  expect(
    stripAnsi(
      RENDERERS.thinking(off, { id: "t", type: "thinking", options: { format: "thinking_icon" } }),
    ),
  ).toBe("💤");
});

test("fast_mode: returns '-' when stdin field absent", () => {
  const bare = { ...snap, claude: { ...snap.claude } };
  delete (bare.claude as { fast_mode?: unknown }).fast_mode;
  const out = stripAnsi(
    RENDERERS.fast_mode(bare, { id: "t", type: "fast_mode" }),
  );
  expect(out).toBe("-");
});

test("fast_mode: default format 'on'/'off'", () => {
  const on = { ...snap, claude: { ...snap.claude, fast_mode: true } };
  const off = { ...snap, claude: { ...snap.claude, fast_mode: false } };
  expect(
    stripAnsi(RENDERERS.fast_mode(on, { id: "t", type: "fast_mode" })),
  ).toBe("on");
  expect(
    stripAnsi(RENDERERS.fast_mode(off, { id: "t", type: "fast_mode" })),
  ).toBe("off");
});

test("fast_mode: fast_mode_icon format", () => {
  const on = { ...snap, claude: { ...snap.claude, fast_mode: true } };
  const off = { ...snap, claude: { ...snap.claude, fast_mode: false } };
  expect(
    stripAnsi(
      RENDERERS.fast_mode(on, { id: "t", type: "fast_mode", options: { format: "fast_mode_icon" } }),
    ),
  ).toBe("⚡");
  expect(
    stripAnsi(
      RENDERERS.fast_mode(off, { id: "t", type: "fast_mode", options: { format: "fast_mode_icon" } }),
    ),
  ).toBe("🐢");
});

test("thresholdColor returns undefined when dynamic_color is off", () => {
  const item: Item = { id: "t", type: "context_bar", options: {} };
  expect(thresholdColor(50, item)).toBeUndefined();
});

test("thresholdColor uses default 20%-step palette ramp when dynamic_color is on", () => {
  const mk = (): Item => ({ id: "t", type: "context_bar", options: { dynamic_color: true } });
  // Default ramp pulls from the in-app palette:
  //   0: pastel green, 20: vibrant green,
  //   40: pastel yellow, 60: vibrant yellow, 80: vibrant red
  expect(thresholdColor(0, mk())).toBe("#D8F0B1");
  expect(thresholdColor(15, mk())).toBe("#D8F0B1");
  expect(thresholdColor(20, mk())).toBe("#C3E88D");
  expect(thresholdColor(50, mk())).toBe("#FFE4A1");
  expect(thresholdColor(75, mk())).toBe("#FFCB6B");
  expect(thresholdColor(95, mk())).toBe("#F07178");
});

test("thresholdColor ignores legacy bar_thresholds even with dynamic_color on", () => {
  const item: Item = {
    id: "t",
    type: "context_bar",
    options: {
      dynamic_color: true,
      bar_thresholds: [
        { at: 0, color: "#000000" },
        { at: 100, color: "#ffffff" },
      ],
    },
  };
  // Picks from default ramp (40% band → pastel yellow), not user thresholds.
  expect(thresholdColor(50, item)).toBe("#FFE4A1");
});

test("thresholdColor honours custom color_ramp_stops (colors stay default)", () => {
  // Shift breakpoints inward so 30% already lands in the danger band.
  const item: Item = {
    id: "t",
    type: "context_bar",
    options: {
      dynamic_color: true,
      color_ramp_stops: [0, 5, 10, 20, 30],
    },
  };
  // Tier colors are unchanged (DEFAULT_DANGER_RAMP), only `at` values shift.
  expect(thresholdColor(0, item)).toBe("#D8F0B1");   // pastel green
  expect(thresholdColor(7, item)).toBe("#C3E88D");   // vibrant green (>=5)
  expect(thresholdColor(15, item)).toBe("#FFE4A1");  // pastel yellow (>=10)
  expect(thresholdColor(25, item)).toBe("#FFCB6B");  // vibrant yellow (>=20)
  expect(thresholdColor(50, item)).toBe("#F07178");  // vibrant red (>=30)
});
