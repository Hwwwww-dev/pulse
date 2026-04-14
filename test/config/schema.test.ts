import { test, expect, beforeEach } from "bun:test";
import { rm } from "fs/promises";
import { PulseConfigSchema, defaultConfig } from "../../src/config/schema.ts";
import { loadConfig, saveConfig } from "../../src/config/store.ts";
import { paths } from "../../src/core/paths.ts";

beforeEach(async () => {
  (Bun.env as Record<string, string>).HOME = `${Bun.env.TMPDIR ?? "/tmp"}/pulse-config-test`;
  await rm(paths.root(), { recursive: true, force: true });
});

test("defaultConfig is valid", () => {
  const r = PulseConfigSchema.safeParse(defaultConfig);
  expect(r.success).toBe(true);
});

test("schema rejects unknown item type", () => {
  const bad = {
    ...defaultConfig,
    lines: [{ items: [{ id: "x", type: "unknown_type" }] }],
  };
  const r = PulseConfigSchema.safeParse(bad);
  expect(r.success).toBe(false);
});

test("schema rejects negative bar_width", () => {
  const bad = {
    ...defaultConfig,
    lines: [
      { items: [{ id: "x", type: "context_bar", options: { bar_width: -1 } }] },
    ],
  };
  const r = PulseConfigSchema.safeParse(bad);
  expect(r.success).toBe(false);
});

test("schema_version mismatch fails", () => {
  const bad = { ...defaultConfig, schema_version: 2 };
  const r = PulseConfigSchema.safeParse(bad);
  expect(r.success).toBe(false);
});

test("loadConfig returns defaults when file missing", async () => {
  const c = await loadConfig();
  expect(c).toEqual(defaultConfig);
});

test("saveConfig then loadConfig round-trips", async () => {
  const modified = { ...defaultConfig, theme: "pastel" };
  await saveConfig(modified);
  const loaded = await loadConfig();
  expect(loaded.theme).toBe("pastel");
});

test("loadConfig returns defaults when file is corrupt", async () => {
  await Bun.write(paths.configFile(), "{not json");
  const c = await loadConfig();
  expect(c).toEqual(defaultConfig);
});

test("schema rejects removed agent_call item type", () => {
  const bad = {
    ...defaultConfig,
    lines: [{ items: [{ id: "x", type: "agent_call" }] }],
  };
  const r = PulseConfigSchema.safeParse(bad);
  expect(r.success).toBe(false);
});

test("schema rejects removed skill_call item type", () => {
  const bad = {
    ...defaultConfig,
    lines: [{ items: [{ id: "x", type: "skill_call" }] }],
  };
  const r = PulseConfigSchema.safeParse(bad);
  expect(r.success).toBe(false);
});
