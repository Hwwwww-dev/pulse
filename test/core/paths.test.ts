import { test, expect } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { paths } from "../../src/core/paths.ts";

// Paths are derived from os.homedir() + node:path.join so they resolve
// correctly on Windows / macOS / Linux. These tests compare against the
// runtime-resolved home rather than a hardcoded fixture.
const HOME = process.env.PULSE_HOME ?? homedir();

test("root returns ~/.pulse", () => {
  expect(paths.root()).toBe(join(HOME, ".pulse"));
});

test("configFile returns ~/.pulse/config.json", () => {
  expect(paths.configFile()).toBe(join(HOME, ".pulse", "config.json"));
});

test("cacheDir returns ~/.pulse/.cache", () => {
  expect(paths.cacheDir()).toBe(join(HOME, ".pulse", ".cache"));
});

test("generalCacheFile returns ~/.pulse/.cache/general.json", () => {
  expect(paths.generalCacheFile()).toBe(join(HOME, ".pulse", ".cache", "general.json"));
});

test("sessionCacheFile uses session id", () => {
  expect(paths.sessionCacheFile("abc-123")).toBe(
    join(HOME, ".pulse", ".cache", "sessions", "abc-123.json"),
  );
});

test("indexFile returns ~/.pulse/.cache/index.json", () => {
  expect(paths.indexFile()).toBe(join(HOME, ".pulse", ".cache", "index.json"));
});

test("logFile returns ~/.pulse/pulse.log", () => {
  expect(paths.logFile()).toBe(join(HOME, ".pulse", "pulse.log"));
});
