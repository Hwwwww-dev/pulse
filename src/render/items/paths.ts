import type { PulseSnapshot } from "../../core/types.ts";
import type { Item } from "../../config/schema.ts";
import { paths } from "../../core/paths.ts";

// Accept either POSIX (/) or Windows (\) separators in the input path,
// since the Claude stdin payload mirrors whichever platform the host runs on.
const SEP_RE = /[/\\]/;

function splitPath(path: string): string[] {
  return path.split(SEP_RE);
}

function tildify(path: string): string {
  const home = paths.home();
  if (!home) return path;
  if (path === home) return "~";
  // Match home + either separator; preserve the remainder verbatim.
  if (path.startsWith(home + "/") || path.startsWith(home + "\\")) {
    return "~/" + path.slice(home.length + 1).replace(/\\/g, "/");
  }
  return path;
}

function shorten(path: string): string {
  const parts = splitPath(path);
  if (parts.length <= 2) return path;
  const head = parts.slice(0, parts.length - 1).map((p) => (p ? p[0] : ""));
  head.push(parts[parts.length - 1]!);
  return head.join("/");
}

function format(path: string, mode: string): string {
  switch (mode) {
    case "basename": {
      const parts = splitPath(path).filter(Boolean);
      return parts[parts.length - 1] ?? path;
    }
    case "tilde":
      return tildify(path);
    case "short":
      return shorten(tildify(path));
    case "full":
    default:
      return path;
  }
}

export const cwdRenderer = (snap: PulseSnapshot, item: Item): string =>
  format(snap.claude.workspace.current_dir, item.options?.path_mode ?? "tilde");

export const projectDirRenderer = (snap: PulseSnapshot, item: Item): string =>
  format(snap.claude.workspace.project_dir, item.options?.path_mode ?? "tilde");
