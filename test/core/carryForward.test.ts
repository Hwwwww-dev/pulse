import { test, expect } from "bun:test";
import { carryForwardFromPrior } from "../../src/core/carryForward.ts";
import type { ClaudeStdinPayload, SessionCacheFile, PulseSnapshot } from "../../src/core/types.ts";
import { emptyCounters } from "../../src/input/jsonl.ts";

function makePayload(overrides: Partial<ClaudeStdinPayload> = {}): ClaudeStdinPayload {
  return {
    session_id: "cur-1",
    transcript_path: "/tmp/cur.jsonl",
    cwd: "/p",
    version: "2.1.90",
    model: { id: "claude-opus-4-6", display_name: "Opus" },
    workspace: { current_dir: "/p", project_dir: "/p", added_dirs: [] },
    cost: {
      total_cost_usd: 0,
      total_duration_ms: 0,
      total_api_duration_ms: 0,
      total_lines_added: 0,
      total_lines_removed: 0,
    },
    context_window: {
      total_input_tokens: 0,
      total_output_tokens: 0,
      context_window_size: 200_000,
      used_percentage: 0,
      remaining_percentage: 100,
      current_usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
    exceeds_200k_tokens: false,
    ...overrides,
  };
}

function makePrior(claude: ClaudeStdinPayload): SessionCacheFile {
  const snap: PulseSnapshot = {
    schema_version: 2,
    captured_at: Date.now() - 60_000,
    claude,
    counters: emptyCounters(),
  };
  return {
    schema_version: 2,
    session_id: claude.session_id,
    first_seen_at: snap.captured_at,
    last_updated_at: snap.captured_at,
    snapshot: snap,
    cursor: {
      transcript_path: claude.transcript_path,
      last_byte_offset: 0,
      last_line_number: 0,
      counters: emptyCounters(),
      updated_at: snap.captured_at,
    },
  };
}

test("carryForwardFromPrior: no prior → passthrough", () => {
  const cur = makePayload({ cost: { total_cost_usd: 0.5, total_duration_ms: 0, total_api_duration_ms: 0, total_lines_added: 0, total_lines_removed: 0 } });
  const out = carryForwardFromPrior(cur, undefined, Date.now());
  expect(out.cost.total_cost_usd).toBe(0.5);
});

test("carryForwardFromPrior: zeroed current inherits prior token + cost totals", () => {
  const cur = makePayload();
  const prior = makePrior(
    makePayload({
      session_id: "prev-1",
      cost: {
        total_cost_usd: 0.1380,
        total_duration_ms: 1000,
        total_api_duration_ms: 500,
        total_lines_added: 10,
        total_lines_removed: 2,
      },
      context_window: {
        ...makePayload().context_window,
        total_input_tokens: 343,
        total_output_tokens: 284,
        current_usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 99,
          cache_read_input_tokens: 18400,
        },
      },
    }),
  );
  const out = carryForwardFromPrior(cur, prior, Date.now());
  expect(out.cost.total_cost_usd).toBe(0.1380);
  expect(out.cost.total_lines_added).toBe(10);
  expect(out.context_window.total_input_tokens).toBe(343);
  expect(out.context_window.total_output_tokens).toBe(284);
  expect(out.context_window.current_usage.cache_read_input_tokens).toBe(18400);
});

test("carryForwardFromPrior: non-zero current wins via max", () => {
  const cur = makePayload({
    cost: { total_cost_usd: 5, total_duration_ms: 0, total_api_duration_ms: 0, total_lines_added: 0, total_lines_removed: 0 },
    context_window: {
      ...makePayload().context_window,
      total_output_tokens: 999,
    },
  });
  const prior = makePrior(
    makePayload({ session_id: "prev-1", cost: { total_cost_usd: 1, total_duration_ms: 0, total_api_duration_ms: 0, total_lines_added: 0, total_lines_removed: 0 } }),
  );
  const out = carryForwardFromPrior(cur, prior, Date.now());
  expect(out.cost.total_cost_usd).toBe(5);
  expect(out.context_window.total_output_tokens).toBe(999);
});

test("carryForwardFromPrior: rate_limits carried only while resets_at is in the future", () => {
  const now = Date.now();
  const priorPayload = makePayload({
    session_id: "prev-1",
    rate_limits: {
      five_hour: { used_percentage: 11, resets_at: Math.floor(now / 1000) + 3600 },
      seven_day: { used_percentage: 9, resets_at: Math.floor(now / 1000) - 3600 }, // expired
    },
  });
  const cur = makePayload(); // rate_limits undefined
  const out = carryForwardFromPrior(cur, makePrior(priorPayload), now);
  expect(out.rate_limits?.five_hour?.used_percentage).toBe(11);
  expect(out.rate_limits?.seven_day).toBeUndefined();
});

test("carryForwardFromPrior: stale prior (> 15min old) is ignored", () => {
  const now = Date.now();
  const stalePrior = makePrior(
    makePayload({
      session_id: "prev-old",
      cost: { total_cost_usd: 999, total_duration_ms: 0, total_api_duration_ms: 0, total_lines_added: 0, total_lines_removed: 0 },
    }),
  );
  stalePrior.last_updated_at = now - 30 * 60 * 1000; // 30 min ago
  const cur = makePayload(); // zeroed current
  const out = carryForwardFromPrior(cur, stalePrior, now);
  // Stale → ignored → cost stays zero, not 999
  expect(out.cost.total_cost_usd).toBe(0);
});

test("carryForwardFromPrior: current rate_limits takes precedence over prior", () => {
  const now = Date.now();
  const cur = makePayload({
    rate_limits: { five_hour: { used_percentage: 42, resets_at: Math.floor(now / 1000) + 100 } },
  });
  const prior = makePrior(
    makePayload({
      session_id: "prev-1",
      rate_limits: { five_hour: { used_percentage: 1, resets_at: Math.floor(now / 1000) + 9999 } },
    }),
  );
  const out = carryForwardFromPrior(cur, prior, now);
  expect(out.rate_limits?.five_hour?.used_percentage).toBe(42);
});
