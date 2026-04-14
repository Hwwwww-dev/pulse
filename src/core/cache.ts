import { mkdir, rename } from "fs/promises";
import { dirname } from "path";
import type {
  CacheIndexFile,
  GeneralCacheFile,
  JsonlCursor,
  PulseSnapshot,
  SessionCacheFile,
} from "./types.ts";
import { USAGE_SAMPLES_GC_MS } from "./types.ts";
import { paths } from "./paths.ts";

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  await ensureDir(dirname(filePath));
  const tmp = `${filePath}.${process.pid}.tmp`;
  await Bun.write(tmp, JSON.stringify(data));
  await rename(tmp, filePath);
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
  await atomicWriteJson(paths.indexFile(), {
    schema_version: 2,
    sessions: filtered,
  } satisfies CacheIndexFile);

  const startOfDay = todayStart(now);
  const todaySessions = filtered.filter((s) => s.last_updated_at >= startOfDay);
  const todayTotalCost = todaySessions.reduce((a, s) => a + s.total_cost_usd, 0);
  const todayToolCalls = snapshot.counters.tool_calls_total;
  const general: GeneralCacheFile = {
    schema_version: 2,
    updated_at: now,
    last_session_id: sessionId,
    model: {
      id: snapshot.claude.model.id,
      display_name: snapshot.claude.model.display_name,
    },
    ...(snapshot.claude.rate_limits !== undefined
      ? { rate_limits: snapshot.claude.rate_limits }
      : {}),
    today: {
      sessions_seen: todaySessions.length,
      total_cost_usd: todayTotalCost,
      total_tool_calls: todayToolCalls,
    },
  };
  await atomicWriteJson(paths.generalCacheFile(), general);
}
