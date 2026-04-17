import type {
  ClaudeStdinPayload,
  GitInfo,
  PulseSnapshot,
  SessionCounters,
} from "./types.ts";
import type { ClaudeUserSettings } from "../input/claudeSettings.ts";

export function aggregate(
  claude: ClaudeStdinPayload,
  counters: SessionCounters,
  git: GitInfo | undefined,
  settings?: ClaudeUserSettings,
): PulseSnapshot {
  return {
    schema_version: 2,
    captured_at: Date.now(),
    claude,
    counters,
    ...(git !== undefined ? { git } : {}),
    ...(settings !== undefined ? { claude_settings: settings } : {}),
  };
}
