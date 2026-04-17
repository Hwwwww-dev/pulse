import { test, expect } from "bun:test";
import { parseJsonlIncremental } from "../src/input/jsonl.ts";

const ESC = "\u001b";

async function writeLine(content: string): Promise<string> {
  const path = `${Bun.env.TMPDIR ?? "/tmp"}/pulse-effort-${Date.now()}-${Math.random()}.jsonl`;
  await Bun.write(path, JSON.stringify({
    type: "user",
    timestamp: "2026-04-17T00:58:30.000Z",
    message: { content },
  }) + "\n");
  return path;
}

test("extracts xhigh from real-world ANSI-wrapped /model echo", async () => {
  const content = `<local-command-stdout>Set model to ${ESC}[1mOpus 4.7 (1M context) (default)${ESC}[22m with ${ESC}[1mxhigh${ESC}[22m effort</local-command-stdout>`;
  const path = await writeLine(content);
  const res = await parseJsonlIncremental(path, undefined, 1024 * 1024);
  expect(res.counters.thinking_effort).toBe("xhigh");
});

test("extracts every level (ANSI-wrapped)", async () => {
  const levels = ["low", "medium", "high", "xhigh", "max"] as const;
  for (const lv of levels) {
    const content = `<local-command-stdout>Set model to ${ESC}[1mX${ESC}[22m with ${ESC}[1m${lv}${ESC}[22m effort</local-command-stdout>`;
    const path = await writeLine(content);
    const res = await parseJsonlIncremental(path, undefined, 1024 * 1024);
    expect(res.counters.thinking_effort).toBe(lv);
  }
});

test("still works with plain (no-ANSI) echo", async () => {
  const content = "<local-command-stdout>Set model to Opus with high effort</local-command-stdout>";
  const path = await writeLine(content);
  const res = await parseJsonlIncremental(path, undefined, 1024 * 1024);
  expect(res.counters.thinking_effort).toBe("high");
});

test("no match → undefined", async () => {
  const path = await writeLine("hello world, nothing to see here");
  const res = await parseJsonlIncremental(path, undefined, 1024 * 1024);
  expect(res.counters.thinking_effort).toBeUndefined();
});

test("extracts level from /effort command echo", async () => {
  const content = "<local-command-stdout>Set effort level to max: Deeper reasoning…</local-command-stdout>";
  const path = await writeLine(content);
  const res = await parseJsonlIncremental(path, undefined, 1024 * 1024);
  expect(res.counters.thinking_effort).toBe("max");
});

test("extracts every level from /effort command echo", async () => {
  const levels = ["low", "medium", "high", "xhigh", "max"] as const;
  for (const lv of levels) {
    const content = `<local-command-stdout>Set effort level to ${lv}: Deeper reasoning…</local-command-stdout>`;
    const path = await writeLine(content);
    const res = await parseJsonlIncremental(path, undefined, 1024 * 1024);
    expect(res.counters.thinking_effort).toBe(lv);
  }
});
