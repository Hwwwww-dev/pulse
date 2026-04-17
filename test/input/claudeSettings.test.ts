import { test, expect, beforeEach, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import {
  readClaudeSettings,
  _resetClaudeSettingsCache,
} from "../../src/input/claudeSettings.ts";

// PULSE_HOME is set by test/setup.ts to <repo>/.pulse/dev
const HOME = process.env.PULSE_HOME as string;
const CLAUDE_DIR = join(HOME, ".claude");
const SETTINGS = join(CLAUDE_DIR, "settings.json");

async function write(obj: unknown): Promise<void> {
  await mkdir(CLAUDE_DIR, { recursive: true });
  await writeFile(SETTINGS, JSON.stringify(obj));
}

async function writeRaw(text: string): Promise<void> {
  await mkdir(CLAUDE_DIR, { recursive: true });
  await writeFile(SETTINGS, text);
}

beforeEach(async () => {
  _resetClaudeSettingsCache();
  await rm(SETTINGS, { force: true });
});

afterAll(async () => {
  _resetClaudeSettingsCache();
  await rm(SETTINGS, { force: true });
});

test("returns empty object when file does not exist", async () => {
  const s = await readClaudeSettings();
  expect(s).toEqual({});
});

test("reads valid effortLevel: xhigh", async () => {
  await write({ effortLevel: "xhigh" });
  const s = await readClaudeSettings();
  expect(s.effortLevel).toBe("xhigh");
});

test("reads outputStyle and sandbox.enabled", async () => {
  await write({
    effortLevel: "high",
    outputStyle: "explanatory",
    sandbox: { enabled: true },
  });
  const s = await readClaudeSettings();
  expect(s.effortLevel).toBe("high");
  expect(s.outputStyle).toBe("explanatory");
  expect(s.sandboxEnabled).toBe(true);
});

test("sanitizes invalid effortLevel to undefined", async () => {
  await write({ effortLevel: "invalid" });
  const s = await readClaudeSettings();
  expect(s.effortLevel).toBeUndefined();
});

test("malformed JSON returns empty object without throwing", async () => {
  await writeRaw("{ not valid json");
  const s = await readClaudeSettings();
  expect(s).toEqual({});
});

test("caches for 300ms; reset forces fresh read", async () => {
  // First read: effortLevel=low
  await write({ effortLevel: "low" });
  const now = Date.now();
  const first = await readClaudeSettings(now);
  expect(first.effortLevel).toBe("low");

  // Mid-test: modify file to effortLevel=max, advance time <300ms
  await write({ effortLevel: "max" });
  const cached = await readClaudeSettings(now + 100);
  expect(cached.effortLevel).toBe("low"); // stale from cache

  // Reset cache -> fresh read picks up new value
  _resetClaudeSettingsCache();
  const fresh = await readClaudeSettings(now + 150);
  expect(fresh.effortLevel).toBe("max");
});
