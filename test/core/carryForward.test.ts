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

test("carryForwardFromPrior: newer window (larger resets_at) wins regardless of source", () => {
  // Window rollover: prior cached the new 5h window's first reading
  // (low usage, far-future resets_at) before stdin caught up. The
  // stdin still carries the previous window's terminal value with a
  // smaller resets_at — so prior wins on freshness.
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
  expect(out.rate_limits?.five_hour?.used_percentage).toBe(1);
  expect(out.rate_limits?.five_hour?.resets_at).toBe(Math.floor(now / 1000) + 9999);
});

test("carryForwardFromPrior: same resets_at — higher used_percentage wins", () => {
  // Within a single 5h window, used_percentage only grows. Two readings
  // with the same resets_at mean the same window — the larger usage
  // is the more recent observation.
  const now = Date.now();
  const cur = makePayload({
    rate_limits: { five_hour: { used_percentage: 30, resets_at: Math.floor(now / 1000) + 1000 } },
  });
  const prior = makePrior(
    makePayload({
      session_id: "prev-1",
      rate_limits: { five_hour: { used_percentage: 50, resets_at: Math.floor(now / 1000) + 1000 } },
    }),
  );
  const out = carryForwardFromPrior(cur, prior, now);
  expect(out.rate_limits?.five_hour?.used_percentage).toBe(50);
});

// ─── account-level rate_limits (general.json fallback) ─────────────────────

test("carryForwardFromPrior: account rate_limits fill in when current is missing", () => {
  // Multi-window scenario: this window (project Y) hasn't issued a request
  // recently so current.rate_limits is undefined. Another window already
  // wrote fresh values to general.json — we should pick those up.
  const now = Date.now();
  const cur = makePayload(); // no rate_limits
  const prior = makePrior(makePayload({ session_id: "prev-1" })); // also no rate_limits
  const account = {
    five_hour: { used_percentage: 73, resets_at: Math.floor(now / 1000) + 3600 },
    seven_day: { used_percentage: 51, resets_at: Math.floor(now / 1000) + 86400 },
  };
  const out = carryForwardFromPrior(cur, prior, now, account);
  expect(out.rate_limits?.five_hour?.used_percentage).toBe(73);
  expect(out.rate_limits?.seven_day?.used_percentage).toBe(51);
});

test("carryForwardFromPrior: stale stdin loses to fresher account (multi-window core case)", () => {
  // Multi-window scenario the v0.6.11 fix targets: the foreground window's
  // CC process is holding a *cached* old rate_limits (its last API call's
  // response), while a sibling window already pushed a fresher value to
  // general.json after a more recent API hit. Prior to the lex-order fix
  // current always won and the foreground window kept showing the stale
  // numbers — now `account` wins on freshness.
  const now = Date.now();
  const cur = makePayload({
    rate_limits: {
      five_hour: { used_percentage: 10, resets_at: Math.floor(now / 1000) + 100 },
    },
  });
  const account = {
    five_hour: { used_percentage: 99, resets_at: Math.floor(now / 1000) + 9999 },
  };
  const out = carryForwardFromPrior(cur, makePrior(makePayload({ session_id: "p" })), now, account);
  expect(out.rate_limits?.five_hour?.used_percentage).toBe(99);
});

test("carryForwardFromPrior: same resets_at across all sources — fresher used_percentage wins", () => {
  // Steady-state mid-window: cur/account/prior all share resets_at; pick
  // the largest used_percentage. Account being slightly ahead is the
  // common shape (a sibling window just observed a tick).
  const now = Date.now();
  const r = Math.floor(now / 1000) + 1000;
  const cur = makePayload({
    rate_limits: { five_hour: { used_percentage: 40, resets_at: r } },
  });
  const account = { five_hour: { used_percentage: 55, resets_at: r } };
  const prior = makePrior(
    makePayload({
      session_id: "p",
      rate_limits: { five_hour: { used_percentage: 38, resets_at: r } },
    }),
  );
  const out = carryForwardFromPrior(cur, prior, now, account);
  expect(out.rate_limits?.five_hour?.used_percentage).toBe(55);
});

test("carryForwardFromPrior: account beats prior when prior is older same-project value", () => {
  const now = Date.now();
  const cur = makePayload(); // no rate_limits
  const prior = makePrior(
    makePayload({
      session_id: "prev-1",
      rate_limits: {
        five_hour: { used_percentage: 30, resets_at: Math.floor(now / 1000) + 3600 },
      },
    }),
  );
  // Account-level (cross-window) saw a newer value
  const account = {
    five_hour: { used_percentage: 88, resets_at: Math.floor(now / 1000) + 3600 },
  };
  const out = carryForwardFromPrior(cur, prior, now, account);
  // Account wins — prior is only the third-priority fallback.
  expect(out.rate_limits?.five_hour?.used_percentage).toBe(88);
});

test("carryForwardFromPrior: account fallback works even with stale prior (> 15min)", () => {
  // Edge case: same-project prior is too old, so the function would normally
  // bail out on the early-return path. Account-level rate_limits should still
  // be merged in — multi-window consistency must not depend on a recent
  // same-project session.
  const now = Date.now();
  const stalePrior = makePrior(makePayload({ session_id: "prev-old" }));
  stalePrior.last_updated_at = now - 30 * 60 * 1000; // 30 min ago
  const cur = makePayload(); // zeroed; no rate_limits
  const account = {
    seven_day: { used_percentage: 64, resets_at: Math.floor(now / 1000) + 86400 },
  };
  const out = carryForwardFromPrior(cur, stalePrior, now, account);
  expect(out.rate_limits?.seven_day?.used_percentage).toBe(64);
  // Cumulative fields still come from current (stale prior remains ignored).
  expect(out.cost.total_cost_usd).toBe(0);
});

test("carryForwardFromPrior: expired account rate_limits are not used", () => {
  // resets_at in the past → account value is stale; should fall through to
  // the next fallback layer (or stay undefined).
  const now = Date.now();
  const cur = makePayload();
  const prior = makePrior(makePayload({ session_id: "p" }));
  const account = {
    five_hour: { used_percentage: 99, resets_at: Math.floor(now / 1000) - 3600 },
  };
  const out = carryForwardFromPrior(cur, prior, now, account);
  expect(out.rate_limits?.five_hour).toBeUndefined();
});
