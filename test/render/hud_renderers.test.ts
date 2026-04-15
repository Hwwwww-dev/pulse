import { test, expect } from "bun:test";
import { RENDERERS } from "../../src/render/items/index.ts";
import { aggregate } from "../../src/core/aggregator.ts";
import { emptyCounters } from "../../src/input/jsonl.ts";
import { parseStdinPayload } from "../../src/input/stdin.ts";
import type { Item } from "../../src/config/schema.ts";
import type { AgentEntry, RecentToolCall, TodoItem, UsageSample } from "../../src/core/types.ts";

const full = parseStdinPayload(await Bun.file("test/fixtures/stdin/full.json").text());
if (!full.ok) throw new Error("fixture broken");
const baseSnap = aggregate(full.data, emptyCounters(), undefined);

function mkSnap(overrides: Partial<typeof baseSnap["counters"]>) {
  return { ...baseSnap, counters: { ...baseSnap.counters, ...overrides } };
}

function render(type: Item["type"], snap: typeof baseSnap, opts: Item["options"] = {}): string {
  const item: Item = { id: "t", type, options: opts };
  return RENDERERS[type](snap, item);
}

// ─────────────────────── recent_agents ───────────────────────

const NOW = baseSnap.captured_at;
const agentEntries: AgentEntry[] = [
  { id: "a1", type: "Explore", start_ts: NOW - 5000, end_ts: NOW - 0 },       // 5s, completed
  { id: "a2", type: "librarian", start_ts: NOW - 2000, end_ts: NOW - 0 },     // 2s, completed
  { id: "a3", type: "Plan", start_ts: NOW - 12000 },                           // 12s, in-flight
];

test("recent_agents: empty returns empty string", () => {
  expect(render("recent_agents", mkSnap({ agent_entries: [] }))).toBe("");
});

test("recent_agents: no agent_entries returns empty string", () => {
  const snap = mkSnap({});
  delete (snap.counters as Record<string, unknown>).agent_entries;
  expect(render("recent_agents", snap)).toBe("");
});

test("recent_agents: basic output with in-flight marker", () => {
  const out = render(
    "recent_agents",
    mkSnap({ agent_entries: agentEntries }),
    { parts_separator: " | " },
  );
  expect(out).toContain("Explore");
  expect(out).toContain("librarian");
  expect(out).toContain("Plan");
  expect(out).toContain("*");   // Plan is in-flight
  // completed ones have no *
  const parts = out.split(" | ");
  expect(parts.find((p) => p.startsWith("Explore"))?.includes("*")).toBe(false);
  expect(parts.find((p) => p.startsWith("Plan"))?.endsWith("*")).toBe(true);
});

test("recent_agents: limit=1 shows only last entry", () => {
  const out = render("recent_agents", mkSnap({ agent_entries: agentEntries }), { agents_limit: 1 });
  expect(out).not.toContain("Explore");
  expect(out).not.toContain("librarian");
  expect(out).toContain("Plan");
});

test("recent_agents: agents_show_completed=false hides completed", () => {
  const out = render("recent_agents", mkSnap({ agent_entries: agentEntries }), { agents_show_completed: false });
  expect(out).not.toContain("Explore");
  expect(out).not.toContain("librarian");
  expect(out).toContain("Plan");
});

test("recent_agents: custom separator", () => {
  const out = render("recent_agents", mkSnap({ agent_entries: agentEntries }), { parts_separator: " , " });
  expect(out).toContain(" , ");
});

test("recent_agents: elapsed format seconds", () => {
  const entry: AgentEntry = { id: "x", type: "Foo", start_ts: NOW - 45000, end_ts: NOW };
  const out = render("recent_agents", mkSnap({ agent_entries: [entry] }));
  expect(out).toBe("Foo: 45s");
});

test("recent_agents: elapsed format minutes", () => {
  const entry: AgentEntry = { id: "x", type: "Bar", start_ts: NOW - 90000, end_ts: NOW };
  const out = render("recent_agents", mkSnap({ agent_entries: [entry] }));
  expect(out).toBe("Bar: 1m30s");
});

test("recent_agents: elapsed format hours", () => {
  const entry: AgentEntry = { id: "x", type: "Baz", start_ts: NOW - 3660000, end_ts: NOW };
  const out = render("recent_agents", mkSnap({ agent_entries: [entry] }));
  expect(out).toBe("Baz: 1h01m");
});

// ─────────────────────── recent_tools ────────────────────────

const recentTools: RecentToolCall[] = [
  { name: "Glob", ts: NOW - 500 },
  { name: "Glob", ts: NOW - 400 },
  { name: "Skill", ts: NOW - 300 },
  { name: "TaskOutput", ts: NOW - 200 },
  { name: "TaskOutput", ts: NOW - 100 },
];

test("recent_tools: empty returns empty string", () => {
  expect(render("recent_tools", mkSnap({ recent_tools: [] }))).toBe("");
});

test("recent_tools: basic grouped output", () => {
  const out = render("recent_tools", mkSnap({ recent_tools: recentTools }));
  // default limit=5, group=true
  expect(out).toContain("Glob \u00d72");
  expect(out).toContain("Skill");
  expect(out).toContain("TaskOutput \u00d72");
});

test("recent_tools: group=false shows raw list", () => {
  const out = render(
    "recent_tools",
    mkSnap({ recent_tools: recentTools }),
    { recent_group: false, parts_separator: " | " },
  );
  expect(out).not.toContain("\u00d7");
  expect(out.split(" | ").length).toBe(5);
});

test("recent_tools: limit=2 shows last 2", () => {
  const out = render("recent_tools", mkSnap({ recent_tools: recentTools }), { recent_limit: 2 });
  // last 2: TaskOutput, TaskOutput → grouped as TaskOutput ×2
  expect(out).toBe("TaskOutput \u00d72");
});

test("recent_tools: name truncation", () => {
  const tools: RecentToolCall[] = [{ name: "VeryLongToolName123", ts: NOW }];
  const out = render("recent_tools", mkSnap({ recent_tools: tools }), { recent_name_max: 8 });
  // 8 chars: 7 + ellipsis
  expect(out.length).toBeLessThanOrEqual(8);
  expect(out).toContain("\u2026");
});

test("recent_tools: custom separator", () => {
  const tools: RecentToolCall[] = [
    { name: "Read", ts: NOW - 200 },
    { name: "Write", ts: NOW - 100 },
  ];
  const out = render("recent_tools", mkSnap({ recent_tools: tools }), { parts_separator: " > " });
  expect(out).toBe("Read > Write");
});

// ─────────────────────── todos_progress ──────────────────────

const todos: TodoItem[] = [
  { content: "Task A", status: "completed" },
  { content: "Task B", status: "completed" },
  { content: "Task C", status: "in_progress" },
  { content: "Task D", status: "pending" },
  { content: "Task E", status: "pending" },
];

test("todos_progress: empty returns empty string", () => {
  expect(render("todos_progress", mkSnap({ todos: [] }))).toBe("");
});

test("todos_progress: compact mode default", () => {
  const out = render("todos_progress", mkSnap({ todos }));
  expect(out).toBe("2/5 done");
});

test("todos_progress: compact mode explicit", () => {
  const out = render("todos_progress", mkSnap({ todos }), { todos_mode: "compact" });
  expect(out).toBe("2/5 done");
});

test("todos_progress: detail mode", () => {
  const out = render("todos_progress", mkSnap({ todos }), { todos_mode: "detail" });
  // 5: 2✓ 1· 2○
  expect(out).toBe("5: 2\u2713 1\u00b7 2\u25cb");
});

test("todos_progress: bar mode contains bar and count", () => {
  const out = render("todos_progress", mkSnap({ todos }), { todos_mode: "bar" });
  // 2/5 = 40%, bar + " 2/5"
  expect(out).toContain("2/5");
});

test("todos_progress: todos_show_current appends current task", () => {
  const out = render("todos_progress", mkSnap({ todos }), { todos_show_current: true });
  expect(out).toContain("\u00bb Task C");
});

test("todos_progress: todos_current_max truncates long task", () => {
  const longTodos: TodoItem[] = [
    { content: "A".repeat(50), status: "in_progress" },
  ];
  const out = render("todos_progress", mkSnap({ todos: longTodos }), {
    todos_show_current: true,
    todos_current_max: 10,
  });
  expect(out).toContain("\u2026");
  // content part should be at most 10 chars
  const contentPart = out.split("\u00bb ")[1] ?? "";
  expect(contentPart.length).toBeLessThanOrEqual(10);
});

test("todos_progress: todos_show_current with no in_progress task does not append", () => {
  const completedTodos: TodoItem[] = [
    { content: "Done A", status: "completed" },
    { content: "Pending B", status: "pending" },
  ];
  const out = render("todos_progress", mkSnap({ todos: completedTodos }), { todos_show_current: true });
  expect(out).not.toContain("\u00bb");
});

// ─────────────────────── token_rate ──────────────────────────

const samples: UsageSample[] = [
  { ts: NOW - 50000, in_delta: 1000, out_delta: 100 },
  { ts: NOW - 30000, in_delta: 2000, out_delta: 200 },
  { ts: NOW - 10000, in_delta: 1500, out_delta: 150 },
];

test("token_rate: empty returns empty string", () => {
  expect(render("token_rate", mkSnap({ usage_samples: [] }))).toBe("");
});

test("token_rate: no usage_samples returns empty string", () => {
  const snap = mkSnap({});
  delete (snap.counters as Record<string, unknown>).usage_samples;
  expect(render("token_rate", snap)).toBe("");
});

test("token_rate: basic per_sec output", () => {
  const out = render("token_rate", mkSnap({ usage_samples: samples }));
  // all 3 samples within 60s window (default)
  // sumIn=4500, sumOut=450, window=60s
  // inRate = round(4500/60) = 75, outRate = round(450/60) = 8 (round(7.5)=8)
  expect(out).toContain("tok/s");
  expect(out).toContain("\u2193"); // down arrow for input
  expect(out).toContain("\u2191"); // up arrow for output
});

test("token_rate: per_min format", () => {
  const out = render("token_rate", mkSnap({ usage_samples: samples }), { rate_format: "per_min" });
  expect(out).toContain("tok/min");
});

test("token_rate: window filters old samples", () => {
  // only keep samples within last 20s
  const out = render("token_rate", mkSnap({ usage_samples: samples }), { rate_window_sec: 20 });
  // only the sample at NOW-10000 is within 20s window
  // sumIn=1500, sumOut=150, window=20
  // inRate = round(1500/20) = 75, outRate = round(150/20) = 8 (round(7.5)=8)
  expect(out).not.toBe(""); // still has output
});

test("token_rate: rate_parts=[total] shows only total", () => {
  const out = render("token_rate", mkSnap({ usage_samples: samples }), { rate_parts: ["total"] });
  expect(out).toContain("\u03a3"); // sigma for total
  expect(out).not.toContain("\u2193");
  expect(out).not.toContain("\u2191");
});

test("token_rate: rate_parts=[in] shows only input", () => {
  const out = render("token_rate", mkSnap({ usage_samples: samples }), { rate_parts: ["in"] });
  expect(out).toContain("\u2193");
  expect(out).not.toContain("\u2191");
});

test("token_rate: all samples outside window returns empty", () => {
  const oldSamples: UsageSample[] = [
    { ts: NOW - 200000, in_delta: 1000, out_delta: 100 },
  ];
  // window = 60s, sample is 200s old → outside
  const out = render("token_rate", mkSnap({ usage_samples: oldSamples }));
  expect(out).toBe("");
});

// ─────────────────────── parts_separator ───────────────────────
// parts_separator joins TOP-LEVEL entries (the outer glue between repeated
// chunks like the " | " between agents). Inner spacing inside a chunk
// (e.g. "Plan 8s") stays hardcoded.

test("parts_separator: recent_agents joins entries with custom glue", () => {
  const entries: AgentEntry[] = [
    { id: "a", type: "Explore", start_ts: NOW - 5000, end_ts: NOW },
    { id: "b", type: "Plan", start_ts: NOW - 8000, end_ts: NOW },
  ];
  const out = render("recent_agents", mkSnap({ agent_entries: entries }), { parts_separator: " ~ " });
  expect(out).toBe("Explore: 5s ~ Plan: 8s");
});

test("parts_separator: recent_agents empty separator concatenates entries", () => {
  const entries: AgentEntry[] = [
    { id: "a", type: "Explore", start_ts: NOW - 5000, end_ts: NOW },
    { id: "b", type: "Plan", start_ts: NOW - 8000, end_ts: NOW },
  ];
  const out = render("recent_agents", mkSnap({ agent_entries: entries }), { parts_separator: "" });
  expect(out).toBe("Explore: 5sPlan: 8s");
});

test("parts_separator: recent_tools joins groups with custom glue", () => {
  const tools: RecentToolCall[] = [
    { name: "Read", ts: NOW - 200 },
    { name: "Write", ts: NOW - 100 },
  ];
  const out = render("recent_tools", mkSnap({ recent_tools: tools }), { parts_separator: " > " });
  expect(out).toBe("Read > Write");
});

test("parts_separator: token_rate joins parts with custom glue", () => {
  const samples: UsageSample[] = [
    { ts: NOW - 5000, in_delta: 600, out_delta: 300 },
  ];
  const out = render("token_rate", mkSnap({ usage_samples: samples }), {
    parts_separator: " / ",
  });
  // default rate_parts=["in","out"]; joined with " / "
  expect(out).toContain(" / ");
  expect(out).toContain("\u2193");
  expect(out).toContain("\u2191");
});

test("parts_separator: defaults are single space", () => {
  // recent_agents default = " "
  const entries: AgentEntry[] = [
    { id: "a", type: "Explore", start_ts: NOW - 5000, end_ts: NOW },
    { id: "b", type: "Plan", start_ts: NOW - 8000, end_ts: NOW },
  ];
  const out1 = render("recent_agents", mkSnap({ agent_entries: entries }));
  expect(out1).toBe("Explore: 5s Plan: 8s");
  // recent_tools default = " "
  const out2 = render("recent_tools", mkSnap({
    recent_tools: [
      { name: "Read", ts: NOW - 200 },
      { name: "Write", ts: NOW - 100 },
    ],
  }));
  expect(out2).toBe("Read Write");
});

test("recent_tools: recent_count_compact drops space before \u00d7N", () => {
  const tools: RecentToolCall[] = [
    { name: "Bash", ts: NOW - 1000 },
    { name: "Bash", ts: NOW - 500 },
  ];
  const out = render("recent_tools", mkSnap({ recent_tools: tools }), { recent_count_compact: true });
  expect(out).toBe("Bash\u00d72");
});
