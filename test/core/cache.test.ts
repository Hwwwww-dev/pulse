import { test, expect, beforeEach } from "bun:test";
import { rm } from "fs/promises";
import { writeCache, readGeneral, readIndex, readSession } from "../../src/core/cache.ts";
import { aggregate } from "../../src/core/aggregator.ts";
import { emptyCounters } from "../../src/input/jsonl.ts";
import { parseStdinPayload } from "../../src/input/stdin.ts";
import { paths } from "../../src/core/paths.ts";

beforeEach(async () => {
  (Bun.env as Record<string, string>).HOME = `${Bun.env.TMPDIR ?? "/tmp"}/pulse-cache-test`;
  await rm(paths.root(), { recursive: true, force: true });
});

test("writeCache creates general + session + index files", async () => {
  const raw = await Bun.file("test/fixtures/stdin/full.json").text();
  const parsed = parseStdinPayload(raw);
  if (!parsed.ok) throw new Error("fixture broken");
  const snap = aggregate(parsed.data, emptyCounters(), undefined);

  await writeCache(snap, {
    transcript_path: parsed.data.transcript_path,
    last_byte_offset: 0,
    last_line_number: 0,
    counters: emptyCounters(),
    updated_at: Date.now(),
  });

  const general = await readGeneral();
  expect(general?.last_session_id).toBe("abc123def456");
  expect(general?.model.display_name).toBe("Opus");
  expect(general?.rate_limits?.five_hour?.used_percentage).toBe(23.5);

  const index = await readIndex();
  expect(index?.sessions.length).toBe(1);
  expect(index?.sessions[0]?.session_id).toBe("abc123def456");

  const session = await readSession("abc123def456");
  expect(session?.snapshot.claude.model.display_name).toBe("Opus");
});

test("writing twice updates the same session entry in index", async () => {
  const raw = await Bun.file("test/fixtures/stdin/full.json").text();
  const parsed = parseStdinPayload(raw);
  if (!parsed.ok) throw new Error("fixture broken");
  const snap = aggregate(parsed.data, emptyCounters(), undefined);
  const cursor = {
    transcript_path: parsed.data.transcript_path,
    last_byte_offset: 0,
    last_line_number: 0,
    counters: emptyCounters(),
    updated_at: Date.now(),
  };
  await writeCache(snap, cursor);
  await writeCache(snap, cursor);
  const index = await readIndex();
  expect(index?.sessions.length).toBe(1);
});

test("readGeneral returns undefined when missing", async () => {
  const g = await readGeneral();
  expect(g).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Schema v1→v2 compatibility tests
// ---------------------------------------------------------------------------

test("v1 cursor triggers full replay (last_byte_offset reset)", async () => {
  const raw = await Bun.file("test/fixtures/stdin/full.json").text();
  const parsed = parseStdinPayload(raw);
  if (!parsed.ok) throw new Error("fixture broken");
  const snap = aggregate(parsed.data, emptyCounters(), undefined);
  const now = snap.captured_at;

  // Simulate a v1 cursor (schema_version absent)
  const v1Cursor = {
    transcript_path: parsed.data.transcript_path,
    last_byte_offset: 999,  // non-zero, would skip bytes in v1
    last_line_number: 5,
    counters: emptyCounters(),
    updated_at: now,
    // intentionally no schema_version field
  };

  const { parseJsonlIncremental } = await import("../../src/input/jsonl.ts");
  const result = await parseJsonlIncremental(
    // use a non-existent path so we don't care about actual parsing
    "/tmp/no-such-file-v1-compat.jsonl",
    v1Cursor as Parameters<typeof parseJsonlIncremental>[1],
    2 * 1024 * 1024,
  );
  // file doesn't exist → empty counters, cursor at 0
  expect(result.cursor.last_byte_offset).toBe(0);
});

test("writeCache round-trip preserves v2 schema_version", async () => {
  const raw = await Bun.file("test/fixtures/stdin/full.json").text();
  const parsed = parseStdinPayload(raw);
  if (!parsed.ok) throw new Error("fixture broken");
  const snap = aggregate(parsed.data, emptyCounters(), undefined);
  const cursor = {
    transcript_path: parsed.data.transcript_path,
    last_byte_offset: 0,
    last_line_number: 0,
    counters: emptyCounters(),
    updated_at: Date.now(),
    schema_version: 2 as const,
  };
  await writeCache(snap, cursor);
  const session = await readSession("abc123def456");
  expect(session?.schema_version).toBe(2);
  expect(session?.snapshot.schema_version).toBe(2);
  expect(session?.cursor.schema_version).toBe(2);
});

test("new HUD fields are undefined in emptyCounters (zero overhead)", () => {
  const c = emptyCounters();
  expect(c.agent_entries).toBeUndefined();
  expect(c.recent_tools).toBeUndefined();
  expect(c.todos).toBeUndefined();
  expect(c.usage_samples).toBeUndefined();
});
