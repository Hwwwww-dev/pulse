import { join } from "node:path";
import { homedir } from "node:os";

// All pulse paths are derived from node:os.homedir() + node:path.join so
// they resolve correctly on Windows (C:\Users\...), macOS, and Linux.
// Tests and power-users can override the base directory via PULSE_HOME.
function home(): string {
  return process.env.PULSE_HOME || homedir();
}

export const paths = {
  home,
  root: (): string => join(home(), ".pulse"),
  configFile: (): string => join(home(), ".pulse", "config.json"),
  cacheDir: (): string => join(home(), ".pulse", ".cache"),
  sessionsDir: (): string => join(home(), ".pulse", ".cache", "sessions"),
  generalCacheFile: (): string => join(home(), ".pulse", ".cache", "general.json"),
  sessionCacheFile: (sessionId: string): string =>
    join(home(), ".pulse", ".cache", "sessions", `${sessionId}.json`),
  indexFile: (): string => join(home(), ".pulse", ".cache", "index.json"),
  logFile: (): string => join(home(), ".pulse", "pulse.log"),
  commandCacheFile: (hash: string): string =>
    join(home(), ".pulse", ".cache", "cmd", `${hash}.json`),
  gitCacheFile: (hash: string): string =>
    join(home(), ".pulse", ".cache", "git", `${hash}.json`),
};
