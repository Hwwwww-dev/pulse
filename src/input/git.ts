import { mkdir, rename } from "fs/promises";
import { dirname } from "path";
import type { GitInfo } from "../core/types.ts";
import { paths } from "../core/paths.ts";

async function runGit(cwd: string, args: string[], timeoutMs: number): Promise<string | null> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = new Promise<null>((resolve) =>
    setTimeout(() => {
      try {
        proc.kill();
      } catch {
        // ignore
      }
      resolve(null);
    }, timeoutMs),
  );
  const reader = (async (): Promise<string | null> => {
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    return code === 0 ? out : null;
  })();
  return Promise.race([reader, timer]);
}

function parseGitStatus(out: string): GitInfo {
  let branch: string | undefined;
  let ahead = 0;
  let behind = 0;
  let dirty = false;
  // Windows git.exe may emit CRLF; split tolerates either.
  for (const raw of out.split(/\r?\n/)) {
    if (!raw) continue;
    if (raw.startsWith("# branch.head")) {
      const name = raw.slice("# branch.head ".length).trim();
      if (name !== "(detached)") branch = name;
      continue;
    }
    if (raw.startsWith("# branch.ab")) {
      const m = raw.match(/# branch\.ab \+(-?\d+) -(-?\d+)/);
      if (m) {
        ahead = Number(m[1]);
        behind = Number(m[2]);
      }
      continue;
    }
    if (raw.startsWith("#")) continue;
    dirty = true;
  }
  return { ...(branch !== undefined ? { branch } : {}), is_dirty: dirty, ahead, behind };
}

export async function readGitInfo(cwd: string, timeoutMs: number): Promise<GitInfo | undefined> {
  const out = await runGit(cwd, ["status", "--porcelain=v2", "-b"], timeoutMs);
  if (out === null) return undefined;
  return parseGitStatus(out);
}

// ─── Disk TTL cache ──────────────────────────────────────────────────────────
// Claude Code's "active" statusline refresh (refreshInterval=1) spawns a fresh
// pulse process each frame — process-level memoization is useless for
// cross-frame reuse. To avoid spawning `git status` (50–200ms) on every frame,
// we cache the parsed result to disk keyed by cwd hash and reuse it while
// fresh. Stale-by-up-to-`ttlMs` is acceptable for a statusline; the next frame
// after expiry pays the spawn cost and refreshes the file.

interface GitCacheEntry {
  cached_at: number;
  cwd: string;
  // null = git ran but not a repo / spawn failed (so we negative-cache the result)
  info: GitInfo | null;
}

// Stable, cheap path-key. Bun.hash is FNV-1a-style, fast, fine for cache keys.
function cwdHash(cwd: string): string {
  return Bun.hash(cwd).toString(16);
}

async function readGitCache(cwd: string): Promise<GitCacheEntry | undefined> {
  const f = Bun.file(paths.gitCacheFile(cwdHash(cwd)));
  if (!(await f.exists())) return undefined;
  try {
    const data = (await f.json()) as GitCacheEntry;
    // Defensive: if the same hash slot belongs to a different cwd (extremely
    // unlikely with Bun.hash but possible across upgrades), treat it as miss.
    if (data.cwd !== cwd) return undefined;
    return data;
  } catch {
    return undefined;
  }
}

async function writeGitCache(entry: GitCacheEntry): Promise<void> {
  const filePath = paths.gitCacheFile(cwdHash(entry.cwd));
  await mkdir(dirname(filePath), { recursive: true });
  // Atomic-ish write: if two concurrent pulse instances race, the loser's
  // tmp file simply overwrites the winner — both wrote near-identical
  // content, so consumers are unaffected.
  const tmp = `${filePath}.${process.pid}.tmp`;
  await Bun.write(tmp, JSON.stringify(entry));
  await rename(tmp, filePath);
}

/**
 * In-process hot cache. The disk cache is the cross-process source of
 * truth (each pulse spawn rebuilds this Map), but within a single
 * process — tests, library callers, anything that calls more than once
 * — we'd otherwise keep paying a disk read per call. The Map is
 * authoritative whenever populated for the same TTL window.
 */
const memGitCache = new Map<string, GitCacheEntry>();

/**
 * Disk-TTL-cached git status. Returns `undefined` on persistent failure
 * (spawn error, not a repo) just like {@link readGitInfo}, but caches that
 * negative result too — otherwise non-repo cwds would spawn git every frame.
 *
 * `cacheTtlMs <= 0` disables caching entirely (always spawn).
 */
export async function readGitInfoCached(
  cwd: string,
  timeoutMs: number,
  cacheTtlMs: number,
): Promise<GitInfo | undefined> {
  if (cacheTtlMs <= 0) return readGitInfo(cwd, timeoutMs);

  const now = Date.now();

  // Fast path: in-process Map hit. Avoids a disk read per call within
  // one process and — critically — keeps fire-and-forget disk writes
  // observable to the very next call without waiting for the rename
  // to settle.
  const mem = memGitCache.get(cwd);
  if (mem && now - mem.cached_at <= cacheTtlMs) return mem.info ?? undefined;

  const cached = await readGitCache(cwd);
  if (cached && now - cached.cached_at <= cacheTtlMs) {
    memGitCache.set(cwd, cached);
    return cached.info ?? undefined;
  }

  const fresh = await readGitInfo(cwd, timeoutMs);
  const entry: GitCacheEntry = { cached_at: now, cwd, info: fresh ?? null };
  memGitCache.set(cwd, entry);
  // Fire-and-forget the disk write so we don't block stdout flush on
  // cold/expired-TTL frames. The active-refresh perf path is built on
  // disk I/O happening AFTER stdout drains; awaiting here would defeat
  // that on exactly the frame that just paid the git-spawn cost. Bun
  // waits for pending promises before exiting, so a sibling pulse
  // spawn started in the next frame still sees the file. Errors stay
  // swallowed (a missing cache simply triggers a fresh spawn next time).
  void writeGitCache(entry).catch(() => {});
  return fresh;
}

/**
 * Test-only: clear the in-process git cache so consecutive tests
 * don't bleed into each other. Named export — production code never
 * imports it.
 */
export function __resetGitMemCacheForTests(): void {
  memGitCache.clear();
}
