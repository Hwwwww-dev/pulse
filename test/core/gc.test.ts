import { test, expect, beforeEach } from "bun:test";
import { rm, mkdir } from "fs/promises";
import { runGc } from "../../src/core/gc.ts";
import { paths } from "../../src/core/paths.ts";

beforeEach(async () => {
  (Bun.env as Record<string, string>).HOME = `${Bun.env.TMPDIR ?? "/tmp"}/pulse-gc-test`;
  await rm(paths.root(), { recursive: true, force: true });
  await mkdir(paths.sessionsDir(), { recursive: true });
});

async function writeSession(id: string, updated: number): Promise<void> {
  const file = paths.sessionCacheFile(id);
  await Bun.write(
    file,
    JSON.stringify({
      schema_version: 1,
      session_id: id,
      first_seen_at: updated,
      last_updated_at: updated,
      snapshot: {},
      cursor: {},
    }),
  );
}

async function writeIndexEntries(
  entries: Array<{ id: string; updated: number }>,
): Promise<void> {
  await Bun.write(
    paths.indexFile(),
    JSON.stringify({
      schema_version: 1,
      sessions: entries.map(({ id, updated }) => ({
        session_id: id,
        project_dir: "/tmp",
        last_updated_at: updated,
        total_cost_usd: 0,
      })),
    }),
  );
}

test("removes session files older than gc_after_days", async () => {
  const now = Date.now();
  const old = now - 10 * 24 * 3600 * 1000;
  const fresh = now - 1 * 24 * 3600 * 1000;

  await writeSession("old1", old);
  await writeSession("old2", old);
  await writeSession("fresh", fresh);
  await writeIndexEntries([
    { id: "old1", updated: old },
    { id: "old2", updated: old },
    { id: "fresh", updated: fresh },
  ]);

  await runGc({ gcAfterDays: 7, now });

  expect(await Bun.file(paths.sessionCacheFile("old1")).exists()).toBe(false);
  expect(await Bun.file(paths.sessionCacheFile("old2")).exists()).toBe(false);
  expect(await Bun.file(paths.sessionCacheFile("fresh")).exists()).toBe(true);
});

test("prunes stale entries from index", async () => {
  const now = Date.now();
  const old = now - 10 * 24 * 3600 * 1000;
  const fresh = now - 1 * 24 * 3600 * 1000;

  await writeSession("old1", old);
  await writeSession("fresh", fresh);
  await Bun.write(
    paths.indexFile(),
    JSON.stringify({
      schema_version: 1,
      sessions: [
        { session_id: "old1", project_dir: "/tmp", last_updated_at: old, total_cost_usd: 0 },
        { session_id: "fresh", project_dir: "/tmp", last_updated_at: fresh, total_cost_usd: 0 },
      ],
    }),
  );

  await runGc({ gcAfterDays: 7, now });

  const idx = await Bun.file(paths.indexFile()).json();
  expect(idx.sessions.map((s: { session_id: string }) => s.session_id)).toEqual(["fresh"]);
});
