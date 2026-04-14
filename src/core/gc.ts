import { readdir, rm } from "fs/promises";
import type { CacheIndexFile } from "./types.ts";
import { paths } from "./paths.ts";

export interface GcOptions {
  gcAfterDays: number;
  now: number;
}

export async function runGc(opts: GcOptions): Promise<void> {
  const cutoff = opts.now - opts.gcAfterDays * 24 * 3600 * 1000;

  const idxFile = Bun.file(paths.indexFile());
  let freshIds = new Set<string>();
  if (await idxFile.exists()) {
    try {
      const idx = (await idxFile.json()) as CacheIndexFile;
      const fresh = idx.sessions.filter((s) => s.last_updated_at >= cutoff);
      freshIds = new Set(fresh.map((s) => s.session_id));
      const tmp = `${paths.indexFile()}.${process.pid}.tmp`;
      await Bun.write(
        tmp,
        JSON.stringify({ schema_version: 2, sessions: fresh } satisfies CacheIndexFile),
      );
      const { rename } = await import("fs/promises");
      await rename(tmp, paths.indexFile());
    } catch {
      // ignore corrupt index
    }
  }

  let entries: string[];
  try {
    entries = await readdir(paths.sessionsDir());
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const sessionId = entry.slice(0, -".json".length);
    if (freshIds.has(sessionId)) continue;
    await rm(`${paths.sessionsDir()}/${entry}`, { force: true });
  }
}
