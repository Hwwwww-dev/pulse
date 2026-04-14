import { test, expect } from "bun:test";
import { parseStdinPayload } from "../../src/input/stdin.ts";

const minimal = await Bun.file("test/fixtures/stdin/minimal.json").text();
const full = await Bun.file("test/fixtures/stdin/full.json").text();

test("parses minimal payload", () => {
  const r = parseStdinPayload(minimal);
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.data.session_id).toBe("minimal-session");
    expect(r.data.model.display_name).toBe("Opus");
    expect(r.data.rate_limits).toBeUndefined();
  }
});

test("parses full payload with rate_limits", () => {
  const r = parseStdinPayload(full);
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.data.rate_limits?.five_hour?.used_percentage).toBe(23.5);
    expect(r.data.cost.total_cost_usd).toBe(0.1234);
  }
});

test("returns ok:false on invalid JSON", () => {
  const r = parseStdinPayload("{not json");
  expect(r.ok).toBe(false);
});

test("returns ok:false on missing required field", () => {
  const r = parseStdinPayload('{"session_id":"x"}');
  expect(r.ok).toBe(false);
});
