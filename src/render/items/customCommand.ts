import { spawnSync } from "node:child_process";
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

function execCommand(cmd: string, timeoutMs: number): string {
  const result = spawnSync(SHELL, [SHELL_FLAG, cmd], {
    encoding: "utf8",
    timeout: timeoutMs,
    stdio: ["ignore", "pipe", "pipe"],
    // Windows needs shell: true semantics only if we were invoking via the
    // PATH resolver; here we already name the shell binary directly.
  });
  if (result.error) return "";
  return result.stdout ?? "";
}

export const customCommandRenderer = (_snap: PulseSnapshot, item: Item): string => {
  const cmd = item.options?.command;
  if (!cmd) return "(no command)";
  const timeout = item.options?.command_timeout_ms ?? 200;
  const cacheMs = item.options?.command_cache_ms ?? 0;
  const trim = item.options?.command_trim ?? true;

  let out: string | undefined;
  if (cacheMs > 0) {
    const hash = createHash("md5").update(cmd).digest("hex").slice(0, 16);
    const file = paths.commandCacheFile(hash);
    out = readCache(file, cacheMs);
    if (out === undefined) {
      out = execCommand(cmd, timeout);
      writeCache(file, out);
    }
  } else {
    out = execCommand(cmd, timeout);
  }

  return trim ? out.replace(/\s+$/, "") : out;
};
