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

test("blink emits slow-blink+bold (foreground-only, no reverse)", () => {
  const config = {
    ...defaultConfig,
    lines: [
      {
        items: [
          {
            id: "a",
            type: "context_usage" as const,
            options: { format: "percent0" as const, blink: true, blink_at: 20 },
          },
        ],
      },
    ],
  };
  const out = renderSafe(snap, config);
  expect(out).toContain("\x1b[5m"); // slow-blink (fg pulse per ECMA-48)
  expect(out).toContain("\x1b[1m"); // bold fallback
  expect(out).not.toContain("\x1b[7m"); // never reverse — fills whole cell bg
});

test("blink_bar: false exempts the bar from blinking", () => {
  const config = {
    ...defaultConfig,
    lines: [
      {
        items: [
          {
            id: "a",
            type: "context_usage" as const,
            options: {
              format: "percent0" as const,
              show_bar: true,
              blink: true,
              blink_at: 20,
              blink_bar: false,
            },
          },
        ],
      },
    ],
  };
  const out = renderSafe(snap, config);
  // Value sub-part still has blink-on, but the bar itself should NOT
  // have been wrapped with blink toggles. Hard to assert precisely from
  // the concatenated SGR stream, so instead verify there are fewer blink
  // opens than when blink_bar is on.
  const configFull = {
    ...config,
    lines: [
      {
        items: [
          {
            ...config.lines[0]!.items[0]!,
            options: { ...config.lines[0]!.items[0]!.options, blink_bar: true },
          },
        ],
      },
    ],
  };
  const outFull = renderSafe(snap, configFull);
  const cnt = (s: string): number => (s.match(/\x1b\[5m/g) ?? []).length;
  expect(cnt(outFull)).toBeGreaterThan(cnt(out));
});

test("blink option emits slow-blink SGR when pct >= blink_at", () => {
  // full.json: ctx used_percentage = 67. blink_at=20 → should trigger.
  const config = {
    ...defaultConfig,
    lines: [
      {
        items: [
          {
            id: "a",
            type: "context_usage" as const,
            options: { format: "percent0" as const, blink: true, blink_at: 20 },
          },
        ],
      },
    ],
  };
  const out = renderSafe(snap, config);
  expect(out).toContain("\x1b[5m"); // slow-blink SGR
  expect(out).toContain("\x1b[1m"); // bold paired with blink
});

test("blink option below threshold does nothing", () => {
  // ctx 67 < blink_at 90
  const config = {
    ...defaultConfig,
    lines: [
      {
        items: [
          {
            id: "a",
            type: "context_usage" as const,
            options: { format: "percent0" as const, blink: true, blink_at: 90 },
          },
        ],
      },
    ],
  };
  const out = renderSafe(snap, config);
  expect(out).not.toContain("\x1b[5m");
});

test("blink applies to session/weekly limits", () => {
  // 5h used = 23.5, 7d used = 41.2. blink_at 20 hits both.
  const config = {
    ...defaultConfig,
    lines: [
      {
        items: [
          {
            id: "a",
            type: "five_hour_limit" as const,
            options: { format: "percent0" as const, blink: true, blink_at: 20 },
          },
          {
            id: "b",
            type: "seven_day_limit" as const,
            options: { format: "percent0" as const, blink: true, blink_at: 20 },
          },
        ],
      },
    ],
  };
  const out = renderSafe(snap, config);
  // At least 2 blink SGRs (one per item)
  const count = (out.match(/\x1b\[5m/g) ?? []).length;
  expect(count).toBeGreaterThanOrEqual(2);
});

test("auto min_width pads numeric items by default", () => {
  // cost usd2 pads to 6 chars ("$99.99"), tokens_compact pads to 5 chars.
  const config = {
    ...defaultConfig,
    lines: [
      {
        separator: "|",
        items: [
          { id: "a", type: "cost" as const, options: { format: "usd2" as const } },
          { id: "b", type: "tokens_input" as const },
        ],
      },
    ],
  };
  const out = stripAnsi(renderSafe(snap, config));
  // Expect right-aligned padding
  const [costStr, tokStr] = out.split("|") as [string, string];
  expect(costStr.length).toBeGreaterThanOrEqual(6);
  expect(tokStr.length).toBeGreaterThanOrEqual(5);
});

test("explicit min_width: 0 opts out of auto padding", () => {
  const config = {
    ...defaultConfig,
    lines: [
      {
        items: [
          { id: "a", type: "cost" as const, options: { format: "usd2" as const, min_width: 0 } },
        ],
      },
    ],
  };
  const out = stripAnsi(renderSafe(snap, config));
  expect(out.startsWith(" ")).toBe(false);
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
