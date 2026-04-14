import { test, expect, beforeEach } from "bun:test";
import { applyStyle, applyBg, stripAnsi, detectColorLevel } from "../../src/render/ansi.ts";

const resetLevel = () => ((globalThis as unknown) as Record<string, (() => void) | undefined>).__resetColorLevelForTests?.();

beforeEach(() => {
  resetLevel();
  delete (Bun.env as Record<string, string | undefined>).NO_COLOR;
  (Bun.env as Record<string, string>).COLORTERM = "truecolor";
});

test("applyStyle truecolor fg hex", () => {
  const out = applyStyle("hi", { fg: "#FFCB6B" });
  expect(out.startsWith("\x1b[38;2;255;203;107m")).toBe(true);
  expect(out.endsWith("\x1b[22m\x1b[23m\x1b[24m\x1b[25m\x1b[27m\x1b[39m\x1b[49m")).toBe(true);
  expect(stripAnsi(out)).toBe("hi");
});

test("applyStyle with bold italic underline dim", () => {
  const out = applyStyle("x", { bold: true, italic: true, underline: true, dim: true });
  expect(out).toContain("\x1b[1m");
  expect(out).toContain("\x1b[3m");
  expect(out).toContain("\x1b[4m");
  expect(out).toContain("\x1b[2m");
});

test("applyStyle emits blink SGR for glow effect", () => {
  const out = applyStyle("x", { bold: true, blink: true, fg: "#F07178" });
  expect(out).toContain("\x1b[5m"); // slow-blink
  expect(out).toContain("\x1b[1m"); // bold
});

test("named colors resolve to basic SGR", () => {
  const out = applyStyle("x", { fg: "red" });
  expect(out).toContain("\x1b[31m");
});

test("NO_COLOR produces plain text", () => {
  resetLevel();
  (Bun.env as Record<string, string>).NO_COLOR = "1";
  const out = applyStyle("hi", { fg: "#FFCB6B", bold: true });
  expect(out).toBe("hi");
});

test("detectColorLevel respects COLORTERM", () => {
  resetLevel();
  (Bun.env as Record<string, string>).COLORTERM = "truecolor";
  expect(detectColorLevel()).toBe("truecolor");
  resetLevel();
  (Bun.env as Record<string, string>).COLORTERM = "";
  (Bun.env as Record<string, string>).TERM = "xterm-256color";
  expect(detectColorLevel()).toBe("256");
});

test("applyBg wraps a line with bg color", () => {
  const line = applyBg("hello", "#112233");
  expect(line).toContain("\x1b[48;2;17;34;51m");
  expect(line).toContain("\x1b[49m");
});
