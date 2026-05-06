import { mkdir, rename } from "fs/promises";
import { dirname } from "path";
import type {
  CacheIndexFile,
  ClaudeStdinPayload,
  GeneralCacheFile,
  JsonlCursor,
  PulseSnapshot,
  SessionCacheFile,
} from "./types.ts";
import { USAGE_SAMPLES_GC_MS } from "./types.ts";
import { paths } from "./paths.ts";
import { isRateLimitNewer } from "./carryForward.ts";

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  await ensureDir(dirname(filePath));
  const tmp = `${filePath}.${process.pid}.tmp`;
  await Bun.write(tmp, JSON.stringify(data));
  await rename(tmp, filePath);
}

/**
 * Per-axis newest-wins merge for rate_limits. Used when writing general.json
 * so a concurrent pulse instance with a stale stdin view can't clobber
 * fresher values another window already published.
 *
 * Freshness is lexicographic on (resets_at, used_percentage) — see
 * {@link isRateLimitNewer}. Entries whose `resets_at` is already in the
 * past are filtered out so general.json drops expired windows on the
 * first write after rollover, instead of accumulating ghost values that
 * the read path would have to keep filtering. Side effect: a process
 * idle across the moment of rollover with no fresh axis data on either
 * side will let the file lose that axis — which is the correct outcome
 * (we genuinely have no current account-level value to display).
 *
 * Note: there is still a TOCTOU window between read-existing and the
 * atomic rename. Two concurrent writers can each compute different
 * merges and the later rename wins; worst case loses one tick on a
 * single axis. ~1000× rarer than the timestamp-only race this replaces.
 */
function mergeGeneralRateLimits(
  current: ClaudeStdinPayload["rate_limits"],
  existing: ClaudeStdinPayload["rate_limits"],
  nowMs: number,
): ClaudeStdinPayload["rate_limits"] | undefined {
  const nowSec = Math.floor(nowMs / 1000);
  const pick = <W extends { used_percentage: number; resets_at: number }>(
    a: W | undefined,
    b: W | undefined,
  ): W | undefined => {
    const liveA = a !== undefined && a.resets_at > nowSec ? a : undefined;
    const liveB = b !== undefined && b.resets_at > nowSec ? b : undefined;
    if (liveA === undefined) return liveB;
    if (liveB === undefined) return liveA;
    return isRateLimitNewer(liveA, liveB) ? liveA : liveB;
  };
  const five = pick(current?.five_hour, existing?.five_hour);
  const seven = pick(current?.seven_day, existing?.seven_day);
  if (five === undefined && seven === undefined) return undefined;
  return {
    ...(five !== undefined ? { five_hour: five } : {}),
    ...(seven !== undefined ? { seven_day: seven } : {}),
  };
}

async function readJson<T>(filePath: string): Promise<T | undefined> {
  const f = Bun.file(filePath);
  if (!(await f.exists())) return undefined;
  try {
    return (await f.json()) as T;
  } catch {
    return undefined;
  }
}

export function readGeneral(): Promise<GeneralCacheFile | undefined> {
  return readJson<GeneralCacheFile>(paths.generalCacheFile());
}

export function readIndex(): Promise<CacheIndexFile | undefined> {
  return readJson<CacheIndexFile>(paths.indexFile());
}

export function readSession(sessionId: string): Promise<SessionCacheFile | undefined> {
  return readJson<SessionCacheFile>(paths.sessionCacheFile(sessionId));
}

/**
 * Find the most recently updated cached session that shares the same project_dir
 * but is NOT the current session. Used as a carry-forward source when Claude Code
 * starts a fresh session (e.g. --resume) with zeroed cumulative stats.
 */
export async function findPriorSessionInProject(
  currentSessionId: string,
  projectDir: string,
): Promise<SessionCacheFile | undefined> {
  const index = await readIndex();
  if (!index) return undefined;
  const candidate = index.sessions
    .filter((s) => s.project_dir === projectDir && s.session_id !== currentSessionId)
    .sort((a, b) => b.last_updated_at - a.last_updated_at)[0];
  if (!candidate) return undefined;
  return readSession(candidate.session_id);
}

function todayStart(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export async function writeCache(
  snapshot: PulseSnapshot,
  cursor: JsonlCursor,
): Promise<void> {
  const sessionId = snapshot.claude.session_id;
  const now = snapshot.captured_at;

  // GC usage_samples: drop entries older than USAGE_SAMPLES_GC_MS
  if (snapshot.counters.usage_samples && snapshot.counters.usage_samples.length > 0) {
    const cutoff = now - USAGE_SAMPLES_GC_MS;
    const kept = snapshot.counters.usage_samples.filter((s) => s.ts >= cutoff);
    if (kept.length === 0) {
      delete snapshot.counters.usage_samples;
    } else {
      snapshot.counters.usage_samples = kept;
    }
  }

  const existing = await readSession(sessionId);
  const firstSeenAt = existing?.first_seen_at ?? now;
  const session: SessionCacheFile = {
    schema_version: 2,
    session_id: sessionId,
    ...(snapshot.claude.session_name !== undefined
      ? { session_name: snapshot.claude.session_name }
      : {}),
    first_seen_at: firstSeenAt,
    last_updated_at: now,
    snapshot,
    cursor,
  };
  await atomicWriteJson(paths.sessionCacheFile(sessionId), session);

  const index = (await readIndex()) ?? { schema_version: 1, sessions: [] };
  const filtered = index.sessions.filter((s) => s.session_id !== sessionId);
  filtered.unshift({
    session_id: sessionId,
    ...(snapshot.claude.session_name !== undefined
      ? { session_name: snapshot.claude.session_name }
      : {}),
    project_dir: snapshot.claude.workspace.project_dir,
    last_updated_at: now,
    total_cost_usd: snapshot.claude.cost.total_cost_usd,
  });
  filtered.sort((a, b) => b.last_updated_at - a.last_updated_at);
  // Race-safe merge: re-read disk right before writing and merge by session_id,
  // preferring the entry with the newer last_updated_at. Protects against
  // concurrent writers (multiple pulse instances) dropping each other's sessions.
  const diskIndex = (await readIndex()) ?? { schema_version: 1, sessions: [] };
  const mergedMap = new Map<string, (typeof filtered)[number]>();
  for (const s of diskIndex.sessions) mergedMap.set(s.session_id, s);
  for (const s of filtered) {
    const prev = mergedMap.get(s.session_id);
    if (!prev || s.last_updated_at >= prev.last_updated_at) {
      mergedMap.set(s.session_id, s);
    }
  }
  const merged = Array.from(mergedMap.values()).sort(
    (a, b) => b.last_updated_at - a.last_updated_at,
  );
  await atomicWriteJson(paths.indexFile(), {
    schema_version: 2,
    sessions: merged,
  } satisfies CacheIndexFile);

  const startOfDay = todayStart(now);
  const todaySessions = merged.filter((s) => s.last_updated_at >= startOfDay);
  const todayTotalCost = todaySessions.reduce((a, s) => a + s.total_cost_usd, 0);
  const todayToolCalls = snapshot.counters.tool_calls_total;
  // Re-read disk right before writing general.json and merge rate_limits
  // axis-by-axis. Concurrent pulse instances each carry their own CC
  // process's stdin view, which may be stale relative to a sibling window
  // that just received an API response. A timestamp-only race (the old
  // writeLatestJson behavior) would let the later — but staler — write
  // win and clobber a fresher rate_limits already on disk; merging
  // axis-wise on (resets_at, used_percentage) preserves the freshest
  // value across windows.
  const existingGeneral = await readGeneral();
  const mergedRateLimits = mergeGeneralRateLimits(
    snapshot.claude.rate_limits,
    existingGeneral?.rate_limits,
    now,
  );
  const general: GeneralCacheFile = {
    schema_version: 2,
    updated_at: now,
    last_session_id: sessionId,
    model: {
      id: snapshot.claude.model.id,
      display_name: snapshot.claude.model.display_name,
    },
    ...(mergedRateLimits !== undefined ? { rate_limits: mergedRateLimits } : {}),
    today: {
      sessions_seen: todaySessions.length,
      total_cost_usd: todayTotalCost,
      total_tool_calls: todayToolCalls,
    },
  };
  await atomicWriteJson(paths.generalCacheFile(), general);
}
