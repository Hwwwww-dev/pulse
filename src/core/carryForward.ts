import type { ClaudeStdinPayload, SessionCacheFile } from "./types.ts";

/**
 * Carry-forward window: only consider a prior session if it was updated within
 * this many ms of now. Beyond this, we assume the new session is a genuinely
 * fresh start, not a --resume fork, and show the current stdin verbatim.
 */
const CARRY_FORWARD_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Merge a current stdin payload with a prior session's cached snapshot for the
 * same project, producing an "effective" payload that carries forward cumulative
 * stats when Claude Code has zeroed them on --resume.
 *
 * Semantics (conservative — current wins unless clearly zeroed):
 *  - If `prior` is missing OR older than CARRY_FORWARD_WINDOW_MS → passthrough.
 *  - For each cumulative field: use current when it is non-zero; otherwise fall
 *    back to prior. This preserves user data on resume without inflating stats
 *    for unrelated sessions.
 *  - rate_limits: if current is absent, carry prior's entry provided its
 *    resets_at (unix seconds) is still in the future; otherwise drop.
 *  - Other fields (model, session_id, cwd, etc.) are passed through from current.
 *
 * Returns a NEW object; never mutates inputs.
 */
export function carryForwardFromPrior(
  current: ClaudeStdinPayload,
  prior: SessionCacheFile | undefined,
  nowMs: number,
): ClaudeStdinPayload {
  if (!prior) return current;
  if (nowMs - prior.last_updated_at > CARRY_FORWARD_WINDOW_MS) return current;

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

  const mergedRateLimits = mergeRateLimits(current.rate_limits, p.rate_limits, nowMs);

  return {
    ...current,
    context_window: mergedCw,
    cost: mergedCost,
    ...(mergedRateLimits !== undefined ? { rate_limits: mergedRateLimits } : {}),
  };
}

function mergeRateLimits(
  current: ClaudeStdinPayload["rate_limits"],
  prior: ClaudeStdinPayload["rate_limits"],
  nowMs: number,
): ClaudeStdinPayload["rate_limits"] | undefined {
  const nowSec = Math.floor(nowMs / 1000);
  const pickWindow = (
    cur: { used_percentage: number; resets_at: number } | undefined,
    pri: { used_percentage: number; resets_at: number } | undefined,
  ): { used_percentage: number; resets_at: number } | undefined => {
    if (cur !== undefined) return cur;
    if (pri !== undefined && pri.resets_at > nowSec) return pri;
    return undefined;
  };
  const five = pickWindow(current?.five_hour, prior?.five_hour);
  const seven = pickWindow(current?.seven_day, prior?.seven_day);
  if (five === undefined && seven === undefined) return current;
  return {
    ...(five !== undefined ? { five_hour: five } : {}),
    ...(seven !== undefined ? { seven_day: seven } : {}),
  };
}
