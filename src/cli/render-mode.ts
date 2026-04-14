import { readStdinJson } from "../input/stdin.ts";
import { parseJsonlIncremental, emptyCounters } from "../input/jsonl.ts";
import { readGitInfo } from "../input/git.ts";
import { aggregate } from "../core/aggregator.ts";
import {
  writeCache,
  readSession,
  findPriorSessionInProject,
  readIndex,
} from "../core/cache.ts";
import { carryForwardFromPrior } from "../core/carryForward.ts";
import { runGc } from "../core/gc.ts";
import { renderSafe } from "../render/engine.ts";
import { loadConfig } from "../config/store.ts";
import type { PulseConfig } from "../config/schema.ts";
import type { ClaudeStdinPayload, PulseSnapshot } from "../core/types.ts";

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

/**
 * Startup replay: when Claude Code invokes pulse without a stdin payload
 * (e.g. on first statusline render before any session event), fall back to
 * the most recently cached session snapshot so the bar is populated instead
 * of empty. Best-effort — any failure returns undefined and the caller emits
 * an empty string.
 */
async function replayLatestSnapshot(): Promise<PulseSnapshot | undefined> {
  try {
    const index = await readIndex();
    const latest = index?.sessions[0];
    if (!latest) return undefined;
    const session = await readSession(latest.session_id);
    return session?.snapshot;
  } catch {
    return undefined;
  }
}

export async function runRenderMode(): Promise<void> {
  const config = await loadConfig();
  const stdin = await readStdinJson(200);
  if (!stdin.ok) {
    // No live payload — replay the most recent cached snapshot so the
    // statusline is not blank before the first session event.
    if (config.cache.enabled) {
      const snapshot = await replayLatestSnapshot();
      if (snapshot) {
        process.stdout.write(`${renderSafe(snapshot, config)}\n`);
        return;
      }
    }
    process.stdout.write("");
    return;
  }
  const text = await runRenderModeWithPayload(stdin.data, config);
  process.stdout.write(`${text}\n`);

  if (Math.random() < 0.01 && config.cache.enabled) {
    runGc({ gcAfterDays: config.cache.gc_after_days, now: Date.now() }).catch(() => {});
  }
}
