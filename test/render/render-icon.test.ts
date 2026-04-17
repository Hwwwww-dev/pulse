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

function renderItem(icon: string | undefined, label: string | undefined, showLabel?: boolean): string {
  const config = {
    ...defaultConfig,
    lines: [
      {
        items: [
          {
            id: "a",
            type: "text" as const,
            icon,
            label,
            ...(showLabel !== undefined ? { show_label: showLabel } : {}),
            options: { literal: "VALUE" },
          },
        ],
      },
    ],
  };
  return stripAnsi(renderSafe(snap, config));
}

test("icon + label: output starts with icon then label then value", () => {
  const out = renderItem("\u{f02a2}", "Git:", undefined);
  expect(out).toContain("\u{f02a2} Git: VALUE");
});

test("label only (no icon): output starts with label", () => {
  const out = renderItem(undefined, "Label:", undefined);
  expect(out).toContain("Label: VALUE");
});

test("icon only (no label): output starts with icon then separator then value", () => {
  const out = renderItem("\u{f02a2}", undefined, undefined);
  expect(out).toContain("\u{f02a2} VALUE");
});

test("neither icon nor label: output is just the value", () => {
  const out = renderItem(undefined, undefined, undefined);
  expect(out).toBe("VALUE");
});

test("show_label false with icon: output is value only", () => {
  const out = renderItem("\u{f02a2}", "Label:", false);
  expect(out).toBe("VALUE");
});

test("show_label false with no icon no label: output is value only", () => {
  const out = renderItem(undefined, undefined, false);
  expect(out).toBe("VALUE");
});
