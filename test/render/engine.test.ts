import { test, expect, beforeEach } from "bun:test";
import { renderSafe } from "../../src/render/engine.ts";
import { aggregate } from "../../src/core/aggregator.ts";
import { emptyCounters } from "../../src/input/jsonl.ts";
import { parseStdinPayload } from "../../src/input/stdin.ts";
import { defaultConfig } from "../../src/config/schema.ts";
import { stripAnsi } from "../../src/render/ansi.ts";

const resetLevel = () =>
  ((globalThis as unknown) as Record<string, (() => void) | undefined>).__resetColorLevelForTests?.();

beforeEach(() => {
  resetLevel();
  delete (Bun.env as Record<string, string | undefined>).NO_COLOR;
  (Bun.env as Record<string, string>).COLORTERM = "truecolor";
});

const parsed = parseStdinPayload(await Bun.file("test/fixtures/stdin/full.json").text());
if (!parsed.ok) throw new Error("fixture broken");
const snap = aggregate(parsed.data, emptyCounters(), undefined);

test("renders two lines joined by newline", () => {
  const config = {
    ...defaultConfig,
    lines: [
      { items: [{ id: "a", type: "model" as const }] },
      { items: [{ id: "b", type: "version" as const }] },
    ],
  };
  const out = stripAnsi(renderSafe(snap, config));
  const lines = out.split("\n");
  expect(lines[0]).toBe("Opus");
  expect(lines[1]).toBe("2.1.90");
});

test("margin_left and margin_right wrap the rendered item", () => {
  const config = {
    ...defaultConfig,
    lines: [
      {
        items: [
          {
            id: "a",
            type: "model" as const,
            margin_left: "[ ",
            margin_right: " ]",
          },
        ],
      },
    ],
  };
  const out = stripAnsi(renderSafe(snap, config));
  expect(out).toBe("[ Opus ]");
});

test("separator applied between items", () => {
  const config = {
    ...defaultConfig,
    lines: [
      {
        separator: " | ",
        items: [
          { id: "a", type: "model" as const },
          { id: "b", type: "version" as const },
        ],
      },
    ],
  };
  const out = stripAnsi(renderSafe(snap, config));
  expect(out).toBe("Opus | 2.1.90");
});

test("renderer error produces ? placeholder", () => {
  const config = {
    ...defaultConfig,
    lines: [
      {
        items: [
          { id: "a", type: "text" as const, options: { literal: "ok" } },
          { id: "b", type: "cost" as const, style: {} },
        ],
      },
    ],
  };
  // Snapshot with missing cost — cast to any to simulate runtime crash.
  const broken = { ...snap, claude: { ...snap.claude, cost: undefined as unknown as typeof snap.claude.cost } };
  const out = stripAnsi(renderSafe(broken, config));
  expect(out).toContain("ok");
  expect(out).toContain("?");
});

test("hide_when_empty skips empty value", () => {
  const config = {
    ...defaultConfig,
    lines: [
      {
        items: [
          { id: "a", type: "model" as const },
          { id: "b", type: "worktree" as const, hide_when_empty: true },
        ],
      },
    ],
  };
  const out = stripAnsi(renderSafe(snap, config));
  expect(out).toBe("Opus");
});

test("item trailing_separator overrides line separator", () => {
  const config = {
    ...defaultConfig,
    lines: [
      {
        separator: " | ",
        items: [
          { id: "a", type: "text" as const, options: { literal: "A" }, trailing_separator: " :: " },
          { id: "b", type: "text" as const, options: { literal: "B" } },
          { id: "c", type: "text" as const, options: { literal: "C" } },
        ],
      },
    ],
  };
  const out = stripAnsi(renderSafe(snap, config));
  expect(out).toBe("A :: B | C");
});

test("line bg persists across separators and items", () => {
  // P0-1: verify bg code is re-emitted around items and separators
  const config = {
    ...defaultConfig,
    lines: [
      {
        bg: "#222222",
        separator: " | ",
        items: [
          { id: "a", type: "text" as const, options: { literal: "A" } },
          { id: "b", type: "text" as const, options: { literal: "B" } },
          { id: "c", type: "text" as const, options: { literal: "C" } },
        ],
      },
    ],
  };
  // DO NOT strip ANSI — check raw escape codes
  const out = renderSafe(snap, config);
  const bgCode = "\x1b[48;2;34;34;34m";
  const bgReset = "\x1b[49m";
  // Count occurrences of the bg code: 1 before each item + 1 before each separator = 3 items + 2 seps = 5
  const count = out.split(bgCode).length - 1;
  expect(count).toBeGreaterThanOrEqual(5);
  expect(out.endsWith(bgReset)).toBe(true);
});

test("label_style colors label independently from value", () => {
  // P0-2: engine applies label_style separately from item style
  const config = {
    ...defaultConfig,
    lines: [
      {
        items: [
          {
            id: "a",
            type: "text" as const,
            label: "X:",
            options: { literal: "val" },
            style: { fg: "red" },
            label_style: { fg: "blue", dim: true },
          },
        ],
      },
    ],
  };
  const out = renderSafe(snap, config);
  // Blue label
  expect(out).toContain("\x1b[34m"); // blue fg
  // Dim label
  expect(out).toContain("\x1b[2m"); // dim
  // Red value
  expect(out).toContain("\x1b[31m"); // red fg
});
