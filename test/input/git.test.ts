import { test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { readGitInfo, readGitInfoCached } from "../../src/input/git.ts";
import { rm, mkdir } from "fs/promises";
import { paths } from "../../src/core/paths.ts";

const REPO = `${Bun.env.TMPDIR ?? "/tmp"}/pulse-git-fixture`;
const PULSE_HOME = `${Bun.env.TMPDIR ?? "/tmp"}/pulse-git-fixture-home`;

beforeAll(async () => {
  await rm(REPO, { recursive: true, force: true });
  await mkdir(REPO, { recursive: true });
  const run = (args: string[]) =>
    Bun.spawn(["git", ...args], { cwd: REPO, stdout: "ignore", stderr: "ignore" }).exited;
  await run(["init", "-q", "-b", "main"]);
  await run(["config", "user.email", "t@t"]);
  await run(["config", "user.name", "t"]);
  await Bun.write(`${REPO}/a.txt`, "hi\n");
  await run(["add", "."]);
  await run(["commit", "-q", "-m", "init"]);
});

afterAll(async () => {
  await rm(REPO, { recursive: true, force: true });
});

test("returns branch and clean status", async () => {
  const info = await readGitInfo(REPO, 2000);
  expect(info?.branch).toBe("main");
  expect(info?.is_dirty).toBe(false);
});

test("detects dirty working tree", async () => {
  await Bun.write(`${REPO}/a.txt`, "changed\n");
  const info = await readGitInfo(REPO, 2000);
  expect(info?.is_dirty).toBe(true);
});

test("returns undefined outside a repo", async () => {
  const info = await readGitInfo("/tmp", 2000);
  expect(info).toBeUndefined();
});

// ─── Disk TTL cache ──────────────────────────────────────────────────────────

beforeEach(async () => {
  // Isolate disk-cache writes per-test under PULSE_HOME, then re-init repo
  // state so cached negative results don't leak across test ordering.
  await rm(PULSE_HOME, { recursive: true, force: true });
  Bun.env.PULSE_HOME = PULSE_HOME;
  await Bun.spawn(["git", "checkout", "--", "a.txt"], {
    cwd: REPO,
    stdout: "ignore",
    stderr: "ignore",
  }).exited;
});

test("readGitInfoCached: TTL=0 always spawns (cache disabled)", async () => {
  const a = await readGitInfoCached(REPO, 2000, 0);
  expect(a?.is_dirty).toBe(false);
  await Bun.write(`${REPO}/a.txt`, "dirty1\n");
  const b = await readGitInfoCached(REPO, 2000, 0);
  expect(b?.is_dirty).toBe(true);
});

test("readGitInfoCached: warm cache reused within TTL", async () => {
  // First call populates the cache file.
  const fresh = await readGitInfoCached(REPO, 2000, 60_000);
  expect(fresh?.is_dirty).toBe(false);

  // Wait until disk write completes, then mutate the working tree.
  // The cached read should still report clean because TTL hasn't expired.
  await Bun.write(`${REPO}/a.txt`, "dirty2\n");
  const reused = await readGitInfoCached(REPO, 2000, 60_000);
  expect(reused?.is_dirty).toBe(false);
});

test("readGitInfoCached: expired cache triggers a fresh spawn", async () => {
  // Prime cache at a stale timestamp (cached_at far in the past).
  const f = Bun.file(paths.gitCacheFile(Bun.hash(REPO).toString(16)));
  // Lazily ensure parent dir exists by issuing a real call first.
  await readGitInfoCached(REPO, 2000, 60_000);
  // Rewrite cache with stale timestamp + stale info (claim dirty).
  await Bun.write(
    f,
    JSON.stringify({
      cached_at: Date.now() - 10_000,
      cwd: REPO,
      info: { branch: "stale", is_dirty: true, ahead: 0, behind: 0 },
    }),
  );

  // TTL=100 → 10s-old entry is expired → must re-shell, ignoring stale info.
  const fresh = await readGitInfoCached(REPO, 2000, 100);
  expect(fresh?.branch).toBe("main");
  expect(fresh?.is_dirty).toBe(false);
});

test("readGitInfoCached: negative result is cached too", async () => {
  // /tmp is not a repo. First call: spawn → undefined; cache that.
  const a = await readGitInfoCached("/tmp", 2000, 60_000);
  expect(a).toBeUndefined();
  // Second call within TTL: should reuse the negative cache entry without
  // erroring. We can't easily prove no spawn happened from black-box tests,
  // but the result must remain consistent.
  const b = await readGitInfoCached("/tmp", 2000, 60_000);
  expect(b).toBeUndefined();
});
