import type { ClaudeStdinPayload, SessionCacheFile } from "./types.ts";

/**
 * Carry-forward window: only consider a prior session if it was updated within
 * this many ms of now. Beyond this, we assume the new session is a genuinely
 * fresh start, not a --resume fork, and show the current stdin verbatim.
 */
const CARRY_FORWARD_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

type RateLimitWindow = { used_percentage: number; resets_at: number };

/**
 * Lexicographic "freshness" order for a single rate-limit window:
 *   1. larger `resets_at` is newer (a different — later — 5h/7d window)
 *   2. tie-break on larger `used_percentage` (within the same window,
 *      usage only accumulates, so the higher number is the more recent
 *      observation)
 *
 * Used by both the read path (carryForwardFromPrior) and the write path
 * (cache.writeCache) so concurrent writers from different Claude Code
 * windows converge on the freshest value rather than racing on
 * arrival timestamps.
 */
export function isRateLimitNewer(a: RateLimitWindow, b: RateLimitWindow): boolean {
  if (a.resets_at !== b.resets_at) return a.resets_at > b.resets_at;
  return a.used_percentage > b.used_percentage;
}

/**
 * Merge a current stdin payload with a prior session's cached snapshot for the
 * same project, producing an "effective" payload that carries forward cumulative
 * stats when Claude Code has zeroed them on --resume.
 *
 * Semantics (conservative — current wins unless clearly zeroed):
 *  - If `prior` is missing OR older than CARRY_FORWARD_WINDOW_MS → cumulative
 *    fields pass through from current. rate_limits may still be enriched from
 *    `accountRateLimits` (account-level, cross-window).
 *  - For each cumulative field: use current when it is non-zero; otherwise fall
 *    back to prior. This preserves user data on resume without inflating stats
 *    for unrelated sessions.
 *  - rate_limits: among current / account / prior, pick the freshest window
 *    via {@link isRateLimitNewer}. Each Claude Code window's stdin only
 *    reflects values *that CC process* received from the last API call;
 *    a busy window in project X may have a fresher `account` (general.json)
 *    than a quiet window's local `current`. Source-priority selection
 *    would let stale stdin clobber fresher cross-window state, so this
 *    instead compares (resets_at, used_percentage) lexicographically.
 *  - Other fields (model, session_id, cwd, etc.) are passed through from current.
 *
 * Returns a NEW object; never mutates inputs.
 */
export function carryForwardFromPrior(
  current: ClaudeStdinPayload,
  prior: SessionCacheFile | undefined,
  nowMs: number,
  accountRateLimits?: ClaudeStdinPayload["rate_limits"],
): ClaudeStdinPayload {
  if (!prior || nowMs - prior.last_updated_at > CARRY_FORWARD_WINDOW_MS) {
    // No same-project carry-forward, but still try to enrich rate_limits from
    // the account-level cache so multiple Claude Code windows stay consistent.
    const merged = mergeRateLimits(current.rate_limits, undefined, accountRateLimits, nowMs);
    if (merged === current.rate_limits) return current;
    return {
      ...current,
      ...(merged !== undefined ? { rate_limits: merged } : {}),
    };
  }

  const p = prior.snapshot.claude;
  const cw = current.context_window;
  const pcw = p.context_window;

  const fallback = (cur: number, pri: number | undefined): number =>
    cur > 0 ? cur : pri ?? 0;

  const mergedCw: ClaudeStdinPayload["context_window"] = {
    ...cw,
    total_input_tokens: fallback(cw.total_input_tokens, pcw.total_input_tokens),
    total_output_tokens: fallback(cw.total_output_tokens, pcw.total_output_tokens),
    current_usage: {
      input_tokens: cw.current_usage.input_tokens,
      output_tokens: cw.current_usage.output_tokens,
      cache_creation_input_tokens: fallback(
        cw.current_usage.cache_creation_input_tokens,
        pcw.current_usage?.cache_creation_input_tokens,
      ),
      cache_read_input_tokens: fallback(
        cw.current_usage.cache_read_input_tokens,
        pcw.current_usage?.cache_read_input_tokens,
      ),
    },
  };

  const c = current.cost;
  const pc = p.cost;
  const mergedCost: ClaudeStdinPayload["cost"] = {
    total_cost_usd: fallback(c.total_cost_usd, pc.total_cost_usd),
    total_duration_ms: fallback(c.total_duration_ms, pc.total_duration_ms),
    total_api_duration_ms: fallback(c.total_api_duration_ms, pc.total_api_duration_ms),
    total_lines_added: fallback(c.total_lines_added, pc.total_lines_added),
    total_lines_removed: fallback(c.total_lines_removed, pc.total_lines_removed),
  };

  const mergedRateLimits = mergeRateLimits(
    current.rate_limits,
    p.rate_limits,
    accountRateLimits,
    nowMs,
  );

  return {
    ...current,
    context_window: mergedCw,
    cost: mergedCost,
    ...(mergedRateLimits !== undefined ? { rate_limits: mergedRateLimits } : {}),
  };
}

/**
 * Pick the freshest rate-limit window per axis (five_hour / seven_day) from
 * three sources: this frame's stdin (current), general.json (account-level,
 * cross-window), and the same-project prior session.
 *
 * Freshness is lexicographic on (resets_at, used_percentage) — see
 * {@link isRateLimitNewer}. Expired sources (resets_at already in the
 * past) are filtered out. This converges multi-window setups on whichever
 * source last received a real API response, regardless of which CC
 * window is in the foreground.
 */
function mergeRateLimits(
  current: ClaudeStdinPayload["rate_limits"],
  prior: ClaudeStdinPayload["rate_limits"],
  account: ClaudeStdinPayload["rate_limits"],
  nowMs: number,
): ClaudeStdinPayload["rate_limits"] | undefined {
  const nowSec = Math.floor(nowMs / 1000);
  const pickWindow = (
    cur: RateLimitWindow | undefined,
    acc: RateLimitWindow | undefined,
    pri: RateLimitWindow | undefined,
  ): RateLimitWindow | undefined => {
    const live = [cur, acc, pri].filter(
      (w): w is RateLimitWindow => w !== undefined && w.resets_at > nowSec,
    );
    if (live.length === 0) return undefined;
    return live.reduce((best, w) => (isRateLimitNewer(w, best) ? w : best));
  };
  const five = pickWindow(current?.five_hour, account?.five_hour, prior?.five_hour);
  const seven = pickWindow(current?.seven_day, account?.seven_day, prior?.seven_day);
  if (five === undefined && seven === undefined) {
    // Nothing to merge — preserve the original reference so the caller can
    // detect "unchanged" via identity instead of a deep compare.
    return current;
  }
  return {
    ...(five !== undefined ? { five_hour: five } : {}),
    ...(seven !== undefined ? { seven_day: seven } : {}),
  };
}
