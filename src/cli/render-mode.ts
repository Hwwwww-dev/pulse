import { readStdinJson } from "../input/stdin.ts";
import { parseJsonlIncremental, emptyCounters } from "../input/jsonl.ts";
import { readGitInfo } from "../input/git.ts";
import { aggregate } from "../core/aggregator.ts";
import {
  writeCache,
  readSession,
  findPriorSessionInProject,
} from "../core/cache.ts";
import { carryForwardFromPrior } from "../core/carryForward.ts";
import { runGc } from "../core/gc.ts";
import { renderSafe } from "../render/engine.ts";
import { loadConfig } from "../config/store.ts";
import type { PulseConfig } from "../config/schema.ts";
import type { ClaudeStdinPayload, PulseSnapshot } from "../core/types.ts";

/**
 * Build a snapshot with all counters/costs/tokens zeroed, used on startup
 * when no stdin payload has arrived yet. Keeps the statusline visible but
 * avoids leaking a previous session's numbers into a fresh context.
 */
function zeroSnapshot(): PulseSnapshot {
  const cwd = process.cwd();
  const claude: ClaudeStdinPayload = {
    session_id: "",
    transcript_path: "",
    cwd,
    version: "",
    model: { id: "", display_name: "" },
    workspace: { current_dir: cwd, project_dir: cwd, added_dirs: [] },
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
      context_window_size: 200000,
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
  };
  return {
    schema_version: 2,
    captured_at: Date.now(),
    claude,
    counters: emptyCounters(),
  };
}

export async function runRenderModeWithPayload(
  payload: ClaudeStdinPayload,
  config: PulseConfig,
): Promise<string> {
  const [existing, prior] = await Promise.all([
    readSession(payload.session_id),
    findPriorSessionInProject(payload.session_id, payload.workspace.project_dir),
  ]);
  const [jsonl, git] = await Promise.all([
    config.jsonl.enabled
      ? parseJsonlIncremental(
          payload.transcript_path,
          existing?.cursor,
          config.jsonl.max_bytes_per_call,
        )
      : Promise.resolve({
          counters: emptyCounters(),
          cursor: {
            transcript_path: payload.transcript_path,
            last_byte_offset: 0,
            last_line_number: 0,
            counters: emptyCounters(),
            updated_at: Date.now(),
          },
        }),
    config.git.enabled
      ? readGitInfo(payload.workspace.current_dir, config.git.timeout_ms).catch(() => undefined)
      : Promise.resolve(undefined),
  ]);

  const effectiveClaude = carryForwardFromPrior(payload, prior, Date.now());
  const snapshot = aggregate(effectiveClaude, jsonl.counters, git);
  const text = renderSafe(snapshot, config);

  if (config.cache.enabled) {
    try {
      await writeCache(snapshot, jsonl.cursor);
    } catch {
      // best-effort
    }
  }

  return text;
}

export async function runRenderMode(): Promise<void> {
  const config = await loadConfig();
  const stdin = await readStdinJson(200);
  if (!stdin.ok) {
    // No live payload — render a zero snapshot so the statusline is visible
    // at startup without leaking a prior session's numbers. Real data takes
    // over once the first stdin event arrives.
    process.stdout.write(`${renderSafe(zeroSnapshot(), config)}\n`);
    return;
  }
  const text = await runRenderModeWithPayload(stdin.data, config);
  process.stdout.write(`${text}\n`);

  if (Math.random() < 0.01 && config.cache.enabled) {
    runGc({ gcAfterDays: config.cache.gc_after_days, now: Date.now() }).catch(() => {});
  }
}
