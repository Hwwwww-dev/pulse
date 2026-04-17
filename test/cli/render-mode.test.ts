import { test, expect, beforeEach } from "bun:test";
import { rm } from "fs/promises";
import { runRenderModeWithPayload } from "../../src/cli/render-mode.ts";
import { defaultConfig } from "../../src/config/schema.ts";
import { parseStdinPayload } from "../../src/input/stdin.ts";
import { paths } from "../../src/core/paths.ts";
import { stripAnsi } from "../../src/render/ansi.ts";

beforeEach(async () => {
  await rm(paths.root(), { recursive: true, force: true });
});

test("runs end-to-end and returns rendered text", async () => {
  const raw = await Bun.file("test/fixtures/stdin/full.json").text();
  const parsed = parseStdinPayload(raw);
  if (!parsed.ok) throw new Error("fixture broken");
  const config = { ...defaultConfig, git: { ...defaultConfig.git, enabled: false } };
  const out = await runRenderModeWithPayload(parsed.data, config);
  expect(out).toBeTruthy();
  expect(stripAnsi(out)).toContain("Opus");
});

test("writes cache files", async () => {
  const raw = await Bun.file("test/fixtures/stdin/full.json").text();
  const parsed = parseStdinPayload(raw);
  if (!parsed.ok) throw new Error("fixture broken");
  const config = { ...defaultConfig, git: { ...defaultConfig.git, enabled: false } };
  await runRenderModeWithPayload(parsed.data, config);
  const general = Bun.file(paths.generalCacheFile());
  expect(await general.exists()).toBe(true);
});

test("parseStdinPayload rejects invalid json", () => {
  const parsed = parseStdinPayload("{not json");
  expect(parsed.ok).toBe(false);
});
