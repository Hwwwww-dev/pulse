import { test, expect } from "bun:test";
import { formatNumber, formatDuration, formatClock, formatRelative, formatTokens } from "../../src/render/format.ts";

test("usd2 / usd4", () => {
  expect(formatNumber(0.1, "usd2")).toBe("$0.10");
  expect(formatNumber(0.1234, "usd4")).toBe("$0.1234");
});

test("compact", () => {
  expect(formatNumber(12345, "compact")).toBe("12.3k");
  expect(formatNumber(1234567, "compact")).toBe("1.2M");
  expect(formatNumber(42, "compact")).toBe("42");
});

test("integer", () => {
  expect(formatNumber(42.9, "integer")).toBe("42");
});

test("percent0 / percent1", () => {
  expect(formatNumber(45, "percent0")).toBe("45%");
  expect(formatNumber(45.23, "percent1")).toBe("45.2%");
});

test("duration_hms", () => {
  expect(formatDuration(0, "duration_hms")).toBe("0s");
  expect(formatDuration(45_000, "duration_hms")).toBe("45s");
  expect(formatDuration(125_000, "duration_hms")).toBe("2m 5s");
  expect(formatDuration(3_725_000, "duration_hms")).toBe("1h 2m 5s");
});

test("duration_compact", () => {
  expect(formatDuration(45_000, "duration_compact")).toBe("45s");
  expect(formatDuration(125_000, "duration_compact")).toBe("2m05s");
  expect(formatDuration(3_725_000, "duration_compact")).toBe("1h02m");
});

test("duration_ms", () => {
  expect(formatDuration(123, "duration_ms")).toBe("123ms");
});

test("clock_24 / clock_24_sec / clock_12", () => {
  const d = new Date(2026, 3, 13, 14, 5, 9).getTime();
  expect(formatClock(d, "clock_24")).toBe("14:05");
  expect(formatClock(d, "clock_24_sec")).toBe("14:05:09");
  expect(formatClock(d, "clock_12")).toBe("2:05 PM");
});

test("date_iso", () => {
  const d = new Date(2026, 3, 13, 14, 5, 9).getTime();
  expect(formatClock(d, "date_iso")).toBe("2026-04-13");
});

test("relative_eta and relative_ago", () => {
  const now = 1_000_000_000_000;
  expect(formatRelative(now + 60 * 1000, now, "relative_eta")).toBe("in 1m");
  expect(formatRelative(now + 3700 * 1000, now, "relative_eta")).toBe("in 1h 1m");
  expect(formatRelative(now - 120 * 1000, now, "relative_ago")).toBe("2m ago");
});

test("tokens_compact / tokens_full", () => {
  expect(formatTokens(12345, "tokens_compact")).toBe("12.3k");
  expect(formatTokens(1500000, "tokens_compact")).toBe("1.5M");
  expect(formatTokens(42, "tokens_compact")).toBe("42");
  expect(formatTokens(12345, "tokens_full")).toBe("12345");
});
