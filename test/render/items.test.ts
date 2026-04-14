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
  (Bun.env as Record<string, string>).PULSE_HOME = "/home/me";
  const out = renderRaw("cwd", { options: { path_mode: "tilde" } });
  delete (Bun.env as Record<string, string | undefined>).PULSE_HOME;
  expect(out).toBe("~/projects/pulse");
});

test("cwd short", () => {
  (Bun.env as Record<string, string>).PULSE_HOME = "/home/me";
  const out = renderRaw("cwd", { options: { path_mode: "short" } });
  delete (Bun.env as Record<string, string | undefined>).PULSE_HOME;
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
        { at: 0, fg: "#000000" },
        { at: 100, fg: "#ffffff" },
      ],
    },
  };
  // Picks from default ramp (40% band → pastel yellow), not user thresholds.
  expect(thresholdColor(50, item)).toBe("#FFE4A1");
});
