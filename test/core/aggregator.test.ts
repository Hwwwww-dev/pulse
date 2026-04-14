import { test, expect } from "bun:test";
import { aggregate } from "../../src/core/aggregator.ts";
import { emptyCounters } from "../../src/input/jsonl.ts";
import { parseStdinPayload } from "../../src/input/stdin.ts";

const fullRaw = await Bun.file("test/fixtures/stdin/full.json").text();
const minimalRaw = await Bun.file("test/fixtures/stdin/minimal.json").text();

test("aggregate produces schema_version=2 snapshot", () => {
  const parsed = parseStdinPayload(fullRaw);
  if (!parsed.ok) throw new Error("fixture broken");
  const snap = aggregate(parsed.data, emptyCounters(), undefined);
  expect(snap.schema_version).toBe(2);
  expect(snap.claude.session_id).toBe("abc123def456");
  expect(snap.git).toBeUndefined();
});

test("aggregate includes git info when present", () => {
  const parsed = parseStdinPayload(fullRaw);
  if (!parsed.ok) throw new Error("fixture broken");
  const snap = aggregate(parsed.data, emptyCounters(), {
    branch: "main",
    is_dirty: true,
    ahead: 0,
    behind: 2,
  });
  expect(snap.git?.branch).toBe("main");
  expect(snap.git?.is_dirty).toBe(true);
});

test("aggregate passes through counters", () => {
  const parsed = parseStdinPayload(minimalRaw);
  if (!parsed.ok) throw new Error("fixture broken");
  const counters = emptyCounters();
  counters.tool_calls_total = 5;
  counters.tool_calls_by_name.Read = 5;
  const snap = aggregate(parsed.data, counters, undefined);
  expect(snap.counters.tool_calls_total).toBe(5);
});

test("captured_at is recent", () => {
  const parsed = parseStdinPayload(minimalRaw);
  if (!parsed.ok) throw new Error("fixture broken");
  const snap = aggregate(parsed.data, emptyCounters(), undefined);
  expect(Math.abs(snap.captured_at - Date.now())).toBeLessThan(1000);
});
