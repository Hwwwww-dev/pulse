import { join } from "node:path";
import { homedir } from "node:os";
import type { ThinkingEffortLevel } from "../core/types.ts";

export interface ClaudeUserSettings {
  effortLevel?: ThinkingEffortLevel;
  outputStyle?: string;
  sandboxEnabled?: boolean;
}

const CACHE_TTL_MS = 300;
let cached: { at: number; value: ClaudeUserSettings } | undefined;

function settingsPath(): string {
  const home = process.env.PULSE_HOME || homedir();
  return join(home, ".claude", "settings.json");
}

function isThinkingEffortLevel(v: unknown): v is ThinkingEffortLevel {
  return v === "low" || v === "medium" || v === "high" || v === "xhigh" || v === "max";
}

export async function readClaudeSettings(now: number = Date.now()): Promise<ClaudeUserSettings> {
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.value;
  const result: ClaudeUserSettings = {};
  try {
    const f = Bun.file(settingsPath());
    if (await f.exists()) {
      const raw = (await f.json()) as Record<string, unknown>;
      if (isThinkingEffortLevel(raw.effortLevel)) result.effortLevel = raw.effortLevel;
      if (typeof raw.outputStyle === "string") result.outputStyle = raw.outputStyle;
      const sb = raw.sandbox;
      if (sb && typeof sb === "object" && "enabled" in sb) {
        const enabled = (sb as { enabled?: unknown }).enabled;
        if (typeof enabled === "boolean") result.sandboxEnabled = enabled;
      }
    }
  } catch {
    // Malformed / unreadable — return empty object, let renderers fall back.
  }
  cached = { at: now, value: result };
  return result;
}

/** Test-only: reset the 300ms cache so tests get deterministic reads. */
export function _resetClaudeSettingsCache(): void {
  cached = undefined;
}
