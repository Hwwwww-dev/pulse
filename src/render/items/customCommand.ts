import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { PulseSnapshot } from "../../core/types.ts";
import type { Item } from "../../config/schema.ts";
import { paths } from "../../core/paths.ts";

interface CmdCacheEntry {
  ts: number;
  out: string;
}

function readCache(file: string, ttlMs: number): string | undefined {
  try {
    const raw = readFileSync(file, "utf8");
    const data = JSON.parse(raw) as CmdCacheEntry;
    if (Date.now() - data.ts <= ttlMs) return data.out;
  } catch {
    // miss / corrupt → ignore
  }
  return undefined;
}

function writeCache(file: string, out: string): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ ts: Date.now(), out } satisfies CmdCacheEntry));
  } catch {
    // best-effort
  }
}

// Platform-specific shell invocation so custom_command works identically
// on Windows (cmd.exe /c) and POSIX hosts (/bin/sh -c).
const IS_WIN = process.platform === "win32";
const SHELL = IS_WIN ? "cmd.exe" : "/bin/sh";
const SHELL_FLAG = IS_WIN ? "/c" : "-c";

// Contract — aligned with sirmalloc/ccstatusline's CustomCommand widget:
//   - stdin: full Claude Code statusline JSON payload (snap.claude) piped in
//   - env:   parent process.env inherited unchanged
//   - stdout: the rendered string (trimmed by default)
//   - stderr: surfaced only on non-zero exit / spawn failure, as a sentinel
//   - no template substitution — users parse stdin themselves (jq convention)
// Errors produce visible, short sentinels instead of an empty string so the
// render engine doesn't silently drop the whole item (engine hides on "").
function execCommand(cmd: string, timeoutMs: number, snap: PulseSnapshot): string {
  const payload = JSON.stringify(snap.claude);
  const result = spawnSync(SHELL, [SHELL_FLAG, cmd], {
    encoding: "utf8",
    timeout: timeoutMs,
    input: payload,
    // With `input` set, spawnSync forces stdio[0] to "pipe" regardless,
    // but naming all three explicitly keeps intent obvious.
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });

  if (result.error) {
    const err = result.error as NodeJS.ErrnoException;
    if (err.code === "ETIMEDOUT") return "[Timeout]";
    if (err.code === "ENOENT") return "[Cmd not found]";
    if (err.code === "EACCES") return "[Permission denied]";
    return `[Error: ${err.code ?? "spawn"}]`;
  }
  // Node kills the child via SIGTERM on timeout; on some Node/Bun builds
  // `result.error` is not populated — fall back to checking the signal.
  if (result.signal === "SIGTERM") return "[Timeout]";

  const stdout = result.stdout ?? "";
  if (stdout) return stdout;

  // Non-zero exit with no stdout: show the first line of stderr (capped) so
  // the user can see *something* went wrong without the item vanishing.
  const status = result.status ?? 0;
  if (status !== 0) {
    const stderrFirstLine = (result.stderr ?? "").split("\n")[0]?.trim() ?? "";
    return stderrFirstLine
      ? `[${stderrFirstLine.slice(0, 80)}]`
      : `[Exit ${status}]`;
  }

  // Clean exit with no stdout: intentional empty (renderer engine will hide).
  return "";
}

// -----------------------------------------------------------
// Preview mode (Edit modal LivePreview)
// -----------------------------------------------------------
// The Ink event loop must not be blocked by spawnSync during keystroke-driven
// re-renders. Strategy:
//   1. Flip `previewMode` ON around LivePreview's renderSafe() call.
//   2. In preview mode the sync renderer reads from `previewCache` (filled
//      lazily by refreshCommandPreview), and shows `$ <cmd> …` on a miss.
//   3. LivePreview debounces (400ms) and calls refreshCommandPreview to kick
//      off a non-blocking `spawn` (not spawnSync!). When it finishes, the
//      cache is updated and the subscribed listener triggers a React
//      re-render, revealing the fresh stdout.
let previewMode = false;
export function setCustomCommandPreview(on: boolean): void {
  previewMode = on;
}

const previewCache = new Map<string, string>();
const PREVIEW_CACHE_MAX = 64;
const pending = new Set<string>();
let previewListener: (() => void) | null = null;

export function subscribePreviewRefresh(fn: () => void): () => void {
  previewListener = fn;
  return () => {
    if (previewListener === fn) previewListener = null;
  };
}

function setPreview(cmd: string, out: string): void {
  // Simple FIFO eviction — the cache is small and short-lived; LRU would be
  // overkill for a preview-only store.
  if (previewCache.size >= PREVIEW_CACHE_MAX) {
    const first = previewCache.keys().next().value;
    if (first !== undefined) previewCache.delete(first);
  }
  previewCache.set(cmd, out);
  previewListener?.();
}

export function refreshCommandPreview(
  cmd: string,
  snap: PulseSnapshot,
  timeoutMs: number,
): void {
  if (!cmd || pending.has(cmd)) return;
  pending.add(cmd);

  let stdout = "";
  let stderr = "";
  let finished = false;
  const finish = (out: string): void => {
    if (finished) return;
    finished = true;
    pending.delete(cmd);
    setPreview(cmd, out);
  };

  try {
    const child = spawn(SHELL, [SHELL_FLAG, cmd], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch { /* already exited */ }
      finish("[Timeout]");
    }, timeoutMs);
    child.stdout?.on("data", (d: Buffer) => { stdout += d.toString("utf8"); });
    child.stderr?.on("data", (d: Buffer) => { stderr += d.toString("utf8"); });
    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === "ENOENT") return finish("[Cmd not found]");
      if (err.code === "EACCES") return finish("[Permission denied]");
      return finish(`[Error: ${err.code ?? "spawn"}]`);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (signal === "SIGTERM") return finish("[Timeout]");
      if (stdout) return finish(stdout.replace(/\s+$/, ""));
      if ((code ?? 0) !== 0) {
        const line = stderr.split("\n")[0]?.trim() ?? "";
        return finish(line ? `[${line.slice(0, 80)}]` : `[Exit ${code}]`);
      }
      return finish("");
    });
    try {
      child.stdin?.write(JSON.stringify(snap.claude));
      child.stdin?.end();
    } catch {
      // child may have already died; close/error handler will finish it
    }
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    finish(`[Error: ${err.code ?? "spawn"}]`);
  }
}

// Sentinels returned by execCommand on failure — never persist these to the
// disk cache, otherwise a one-off error locks the user out for the whole
// cache_ms window.
function isSentinel(out: string): boolean {
  return out.startsWith("[") && out.endsWith("]");
}

export const customCommandRenderer = (snap: PulseSnapshot, item: Item): string => {
  const cmd = item.options?.command;
  if (!cmd) return "(no command)";
  if (previewMode) {
    const cached = previewCache.get(cmd);
    if (cached !== undefined) return cached === "" ? `$ ${cmd}` : cached;
    return `$ ${cmd} …`;
  }
  const timeout = item.options?.command_timeout_ms ?? 1000;
  const cacheMs = item.options?.command_cache_ms ?? 0;
  const trim = item.options?.command_trim ?? true;

  let out: string | undefined;
  if (cacheMs > 0) {
    const hash = createHash("md5").update(cmd).digest("hex").slice(0, 16);
    const file = paths.commandCacheFile(hash);
    out = readCache(file, cacheMs);
    if (out === undefined) {
      out = execCommand(cmd, timeout, snap);
      if (out && !isSentinel(out)) writeCache(file, out);
    }
  } else {
    out = execCommand(cmd, timeout, snap);
  }

  return trim ? out.replace(/\s+$/, "") : out;
};
