import { test, expect, beforeAll, afterAll } from "bun:test";
import { readGitInfo } from "../../src/input/git.ts";
import { rm, mkdir } from "fs/promises";

const REPO = `${Bun.env.TMPDIR ?? "/tmp"}/pulse-git-fixture`;

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
