import type {
  ClaudeStdinPayload,
  GitInfo,
  PulseSnapshot,
  SessionCounters,
} from "./types.ts";

export function aggregate(
  claude: ClaudeStdinPayload,
  counters: SessionCounters,
  git: GitInfo | undefined,
): PulseSnapshot {
  return {
    schema_version: 2,
    captured_at: Date.now(),
    claude,
    counters,
    ...(git !== undefined ? { git } : {}),
  };
}
