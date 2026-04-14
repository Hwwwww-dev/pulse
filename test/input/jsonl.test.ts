import { test, expect, describe } from "bun:test";
import { parseJsonlIncremental, emptyCounters } from "../../src/input/jsonl.ts";

test("emptyCounters returns zeroed structure", () => {
  const c = emptyCounters();
  expect(c.tool_calls_total).toBe(0);
  expect(c.agent_calls_total).toBe(0);
  expect(c.message_count.user).toBe(0);
  expect(c.message_count.assistant).toBe(0);
  expect(c.usage_totals.input_tokens).toBe(0);
  expect(c.usage_totals.output_tokens).toBe(0);
  expect(c.usage_totals.cache_read_input_tokens).toBe(0);
  expect(c.usage_totals.cache_creation_input_tokens).toBe(0);
});

test("aggregates message.usage across assistant messages", async () => {
  const r = await parseJsonlIncremental(
    "test/fixtures/jsonl/with-usage.jsonl",
    undefined,
    2 * 1024 * 1024,
  );
  // First two assistant msgs have usage blocks; third omits it entirely.
  expect(r.counters.usage_totals.input_tokens).toBe(15);
  expect(r.counters.usage_totals.output_tokens).toBe(35);
  expect(r.counters.usage_totals.cache_read_input_tokens).toBe(400);
  expect(r.counters.usage_totals.cache_creation_input_tokens).toBe(250);
  expect(r.counters.message_count.assistant).toBe(3);
});

test("usage_totals survive incremental cursor resume (no double-count)", async () => {
  const first = await parseJsonlIncremental(
    "test/fixtures/jsonl/with-usage.jsonl",
    undefined,
    2 * 1024 * 1024,
  );
  const second = await parseJsonlIncremental(
    "test/fixtures/jsonl/with-usage.jsonl",
    first.cursor,
    2 * 1024 * 1024,
  );
  // Resumed read covers no new bytes — totals must equal first pass exactly.
  expect(second.counters.usage_totals.input_tokens).toBe(first.counters.usage_totals.input_tokens);
  expect(second.counters.usage_totals.output_tokens).toBe(first.counters.usage_totals.output_tokens);
  expect(second.counters.usage_totals.cache_read_input_tokens).toBe(
    first.counters.usage_totals.cache_read_input_tokens,
  );
});

test("parses short.jsonl from zero cursor", async () => {
  const r = await parseJsonlIncremental(
    "test/fixtures/jsonl/short.jsonl",
    undefined,
    2 * 1024 * 1024,
  );
  expect(r.counters.message_count.user).toBe(1);
  expect(r.counters.message_count.assistant).toBe(1);
  expect(r.counters.tool_calls_total).toBe(0);
  expect(r.cursor.last_byte_offset).toBeGreaterThan(0);
});

test("counts tool_use blocks and splits by name", async () => {
  const r = await parseJsonlIncremental(
    "test/fixtures/jsonl/with-tools.jsonl",
    undefined,
    2 * 1024 * 1024,
  );
  expect(r.counters.tool_calls_total).toBe(4);
  expect(r.counters.tool_calls_by_name.Read).toBe(2);
  expect(r.counters.tool_calls_by_name.Edit).toBe(1);
  expect(r.counters.tool_calls_by_name.Bash).toBe(1);
});

test("counts Task subagent_type as agent call", async () => {
  const r = await parseJsonlIncremental(
    "test/fixtures/jsonl/with-agents.jsonl",
    undefined,
    2 * 1024 * 1024,
  );
  expect(r.counters.tool_calls_total).toBe(3);
  expect(r.counters.agent_calls_total).toBe(3);
  expect(r.counters.agent_calls_by_type.Explore).toBe(2);
  expect(r.counters.agent_calls_by_type.Plan).toBe(1);
});

test("resume from cursor skips already-parsed bytes", async () => {
  const first = await parseJsonlIncremental(
    "test/fixtures/jsonl/with-tools.jsonl",
    undefined,
    2 * 1024 * 1024,
  );
  const second = await parseJsonlIncremental(
    "test/fixtures/jsonl/with-tools.jsonl",
    first.cursor,
    2 * 1024 * 1024,
  );
  expect(second.counters.tool_calls_total).toBe(first.counters.tool_calls_total);
  expect(second.cursor.last_byte_offset).toBe(first.cursor.last_byte_offset);
});

test("missing file returns empty counters and cursor at 0", async () => {
  const r = await parseJsonlIncremental("/tmp/does-not-exist.jsonl", undefined, 1024);
  expect(r.counters.tool_calls_total).toBe(0);
  expect(r.cursor.last_byte_offset).toBe(0);
});

test("handles partial trailing line (no newline) without advancing", async () => {
  const tmpPath = `${Bun.env.TMPDIR ?? "/tmp"}/pulse-partial.jsonl`;
  const complete =
    '{"type":"user","message":{"role":"user","content":"a"}}\n' +
    '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"x","name":"Read","input":{}}';
  await Bun.write(tmpPath, complete);
  const r = await parseJsonlIncremental(tmpPath, undefined, 2 * 1024 * 1024);
  expect(r.counters.message_count.user).toBe(1);
  expect(r.counters.tool_calls_total).toBe(0);
});

test("counts Agent tool with subagent_type", async () => {
  const r = await parseJsonlIncremental(
    "test/fixtures/jsonl/with-skills.jsonl",
    undefined,
    2 * 1024 * 1024,
  );
  expect(r.counters.agent_calls_total).toBe(2);
  expect(r.counters.agent_calls_by_type["general-purpose"]).toBe(1);
  expect(r.counters.agent_calls_by_type.Explore).toBe(1);
});

test("counts Skill tool by input.skill", async () => {
  const r = await parseJsonlIncremental(
    "test/fixtures/jsonl/with-skills.jsonl",
    undefined,
    2 * 1024 * 1024,
  );
  expect(r.counters.skill_calls_total).toBe(3);
  expect(r.counters.skill_calls_by_name.brainstorming).toBe(2);
  expect(r.counters.skill_calls_by_name["writing-plans"]).toBe(1);
});

test("truncation resets cursor from zero", async () => {
  const tmp = `${Bun.env.TMPDIR ?? "/tmp"}/pulse-truncate.jsonl`;
  await Bun.write(tmp, '{"type":"user","message":{"role":"user","content":"a"}}\n'.repeat(3));
  const first = await parseJsonlIncremental(tmp, undefined, 1024);
  expect(first.counters.message_count.user).toBe(3);
  await Bun.write(tmp, '{"type":"user","message":{"role":"user","content":"a"}}\n');
  const second = await parseJsonlIncremental(tmp, first.cursor, 1024);
  expect(second.counters.message_count.user).toBe(1);
});

// ---------------------------------------------------------------------------
// HUD enrichment tests (schema v2)
// ---------------------------------------------------------------------------

describe("agent pairing", () => {
  test("pairs Task tool_use with tool_result via id", async () => {
    const r = await parseJsonlIncremental(
      "test/fixtures/jsonl/agents-paired.jsonl",
      undefined,
      2 * 1024 * 1024,
    );
    const entries = r.counters.agent_entries;
    expect(entries).toBeDefined();
    expect(entries!.length).toBe(1);
    const e0 = entries![0]!;
    expect(e0.type).toBe("Explore");
    expect(e0.description).toBe("search code");
    expect(typeof e0.start_ts).toBe("number");
    expect(typeof e0.end_ts).toBe("number");
    expect(e0.end_ts).toBeGreaterThan(e0.start_ts);
  });

  test("in-flight agent has no end_ts", async () => {
    // Only the tool_use line, no tool_result
    const line =
      '{"type":"assistant","timestamp":"2024-01-01T10:00:01.000Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"fly1","name":"Task","input":{"subagent_type":"Plan","prompt":"..."}}]}}\n';
    const tmp = `${Bun.env.TMPDIR ?? "/tmp"}/pulse-inflight.jsonl`;
    await Bun.write(tmp, line);
    const r = await parseJsonlIncremental(tmp, undefined, 2 * 1024 * 1024);
    const entries = r.counters.agent_entries;
    expect(entries).toBeDefined();
    expect(entries![0]!.end_ts).toBeUndefined();
  });
});

describe("recent_tools FIFO", () => {
  test("caps at MAX_RECENT_TOOLS (32)", async () => {
    // 35 tool_use blocks across assistant messages
    const lines = Array.from({ length: 35 }, (_, i) =>
      JSON.stringify({
        type: "assistant",
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: `id${i}`, name: "Read", input: {} }],
        },
      }),
    ).join("\n") + "\n";
    const tmp = `${Bun.env.TMPDIR ?? "/tmp"}/pulse-fifo.jsonl`;
    await Bun.write(tmp, lines);
    const r = await parseJsonlIncremental(tmp, undefined, 2 * 1024 * 1024);
    expect(r.counters.recent_tools).toBeDefined();
    expect(r.counters.recent_tools!.length).toBe(32);
    // tool_calls_total should still count all 35
    expect(r.counters.tool_calls_total).toBe(35);
  });
});

describe("TodoWrite snapshot", () => {
  test("replaces todos on second write", async () => {
    const first = JSON.stringify({
      type: "assistant",
      timestamp: "2024-01-01T10:00:01.000Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tw1",
            name: "TodoWrite",
            input: {
              todos: [{ content: "task A", status: "pending" }],
            },
          },
        ],
      },
    });
    const second = JSON.stringify({
      type: "assistant",
      timestamp: "2024-01-01T10:00:02.000Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tw2",
            name: "TodoWrite",
            input: {
              todos: [
                { content: "task B", status: "in_progress" },
                { content: "task C", status: "completed" },
              ],
            },
          },
        ],
      },
    });
    const tmp = `${Bun.env.TMPDIR ?? "/tmp"}/pulse-todos.jsonl`;
    await Bun.write(tmp, first + "\n" + second + "\n");
    const r = await parseJsonlIncremental(tmp, undefined, 2 * 1024 * 1024);
    expect(r.counters.todos).toBeDefined();
    expect(r.counters.todos!.length).toBe(2);
    expect(r.counters.todos![0]!.content).toBe("task B");
    expect(r.counters.todos![1]!.status).toBe("completed");
  });
});

describe("usage_samples", () => {
  test("collects one sample per assistant message with usage", async () => {
    const r = await parseJsonlIncremental(
      "test/fixtures/jsonl/with-usage.jsonl",
      undefined,
      2 * 1024 * 1024,
    );
    // 2 assistant messages have usage blocks; 1 has no usage block
    expect(r.counters.usage_samples).toBeDefined();
    expect(r.counters.usage_samples!.length).toBe(2);
    const s0 = r.counters.usage_samples![0]!;
    const s1 = r.counters.usage_samples![1]!;
    expect(s0.in_delta).toBe(10);
    expect(s0.out_delta).toBe(20);
    expect(s1.in_delta).toBe(5);
    expect(s1.out_delta).toBe(15);
  });
});

describe("timestamp parsing", () => {
  test("falls back to Date.now() when timestamp field missing", async () => {
    const before = Date.now();
    const line =
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hi"}],"usage":{"input_tokens":1,"output_tokens":1}}}\n';
    const tmp = `${Bun.env.TMPDIR ?? "/tmp"}/pulse-notimestamp.jsonl`;
    await Bun.write(tmp, line);
    const r = await parseJsonlIncremental(tmp, undefined, 2 * 1024 * 1024);
    const after = Date.now();
    expect(r.counters.usage_samples).toBeDefined();
    const sample = r.counters.usage_samples![0]!;
    expect(sample.ts).toBeGreaterThanOrEqual(before);
    expect(sample.ts).toBeLessThanOrEqual(after);
  });
});

describe("no double-count from tool_result", () => {
  test("tool_result does not increment tool_calls_total", async () => {
    const r = await parseJsonlIncremental(
      "test/fixtures/jsonl/agents-paired.jsonl",
      undefined,
      2 * 1024 * 1024,
    );
    // 1 tool_use (Task) in assistant message; tool_result in user message must not add
    expect(r.counters.tool_calls_total).toBe(1);
  });
});
