import { test, expect } from "bun:test";
import { graphemes } from "../src/lib/graphemes.ts";

test("ASCII string splits into individual chars", () => {
  expect(graphemes("abc")).toEqual(["a", "b", "c"]);
});

test("nerd font glyph counts as 1 grapheme", () => {
  const g = graphemes("\u{f02a2}");
  expect(g).toHaveLength(1);
  expect(g[0]).toBe("\u{f02a2}");
});

test("mixed ASCII + nerd font glyph", () => {
  const g = graphemes("a\u{f02a2}b");
  expect(g).toEqual(["a", "\u{f02a2}", "b"]);
});

test("ZWJ emoji stays as 1 grapheme", () => {
  // Man technologist: man + ZWJ + laptop
  const zwj = "\u{1f468}\u{200d}\u{1f4bb}";
  const g = graphemes(zwj);
  expect(g).toHaveLength(1);
  expect(g[0]).toBe(zwj);
});

test("empty string returns empty array", () => {
  expect(graphemes("")).toEqual([]);
});

test("multi-codepoint composed character counts as 1 grapheme", () => {
  // e + combining acute accent = 2 codepoints but 1 grapheme
  const composed = "e\u0301";
  const g = graphemes(composed);
  expect(g).toHaveLength(1);
});
