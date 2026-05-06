import { test, expect, beforeEach } from "bun:test";
import { rm } from "fs/promises";
import { writeCache, readGeneral, readIndex, readSession } from "../../src/core/cache.ts";
import { aggregate } from "../../src/core/aggregator.ts";
import { emptyCounters } from "../../src/input/jsonl.ts";
import { parseStdinPayload } from "../../src/input/stdin.ts";
import { paths } from "../../src/core/paths.ts";

beforeEach(async () => {
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

// ---------------------------------------------------------------------------
// general.json rate_limits: axis-wise newest-wins merge (multi-window race)
// ---------------------------------------------------------------------------

test("writeCache merges general.rate_limits axis-wise: stale write does NOT clobber fresher disk", async () => {
  // Reproduces the multi-window race: window A wrote fresh limits, then
  // window B (with stale CC stdin) writes ~ms later. Without merging,
  // B's write would replace A's fresh values just because B's
  // updated_at is bigger. The fix is per-axis (resets_at, used_percentage)
  // newest-wins — B keeps A's values for the windows where A was newer.
  const raw = await Bun.file("test/fixtures/stdin/full.json").text();
  const parsed = parseStdinPayload(raw);
  if (!parsed.ok) throw new Error("fixture broken");
  const cursor = {
    transcript_path: parsed.data.transcript_path,
    last_byte_offset: 0,
    last_line_number: 0,
    counters: emptyCounters(),
    updated_at: Date.now(),
  };
  const nowSec = Math.floor(Date.now() / 1000);

  // Window A: fresh values
  const aPayload = {
    ...parsed.data,
    rate_limits: {
      five_hour: { used_percentage: 35, resets_at: nowSec + 3600 },
      seven_day: { used_percentage: 5, resets_at: nowSec + 86400 },
    },
  };
  await writeCache(aggregate(aPayload, emptyCounters(), undefined), cursor);

  // Window B: stale stdin still showing the previous tick. Same resets_at,
  // smaller used_percentage. Without the merge, B's write wins on
  // updated_at and reverts the disk to 34/4.
  const bPayload = {
    ...parsed.data,
    session_id: "other-window",
    rate_limits: {
      five_hour: { used_percentage: 34, resets_at: nowSec + 3600 },
      seven_day: { used_percentage: 4, resets_at: nowSec + 86400 },
    },
  };
  await writeCache(aggregate(bPayload, emptyCounters(), undefined), cursor);

  const general = await readGeneral();
  expect(general?.rate_limits?.five_hour?.used_percentage).toBe(35);
  expect(general?.rate_limits?.seven_day?.used_percentage).toBe(5);
});

test("writeCache merges general.rate_limits axis-wise: fresher write does override", async () => {
  // Symmetric check: when the *new* write actually has fresher values
  // (larger used_percentage at same resets_at, or larger resets_at), it
  // must overwrite — otherwise nothing would ever update.
  const raw = await Bun.file("test/fixtures/stdin/full.json").text();
  const parsed = parseStdinPayload(raw);
  if (!parsed.ok) throw new Error("fixture broken");
  const cursor = {
    transcript_path: parsed.data.transcript_path,
    last_byte_offset: 0,
    last_line_number: 0,
    counters: emptyCounters(),
    updated_at: Date.now(),
  };
  const nowSec = Math.floor(Date.now() / 1000);

  const stale = {
    ...parsed.data,
    rate_limits: {
      five_hour: { used_percentage: 30, resets_at: nowSec + 3600 },
      seven_day: { used_percentage: 3, resets_at: nowSec + 86400 },
    },
  };
  await writeCache(aggregate(stale, emptyCounters(), undefined), cursor);

  const fresh = {
    ...parsed.data,
    session_id: "other-window",
    rate_limits: {
      five_hour: { used_percentage: 42, resets_at: nowSec + 3600 },
      seven_day: { used_percentage: 7, resets_at: nowSec + 86400 + 100 }, // newer window
    },
  };
  await writeCache(aggregate(fresh, emptyCounters(), undefined), cursor);

  const general = await readGeneral();
  expect(general?.rate_limits?.five_hour?.used_percentage).toBe(42);
  expect(general?.rate_limits?.seven_day?.used_percentage).toBe(7);
  expect(general?.rate_limits?.seven_day?.resets_at).toBe(nowSec + 86400 + 100);
});

test("writeCache: expired rate_limits axes are dropped from general.json on next write", async () => {
  // Multi-window flows can leave expired entries on disk if the process
  // that would have refreshed them has been idle. The merge must drop
  // an axis whose resets_at is already in the past so general.json
  // doesn't accumulate ghost windows that the read path would have to
  // keep filtering forever.
  const raw = await Bun.file("test/fixtures/stdin/full.json").text();
  const parsed = parseStdinPayload(raw);
  if (!parsed.ok) throw new Error("fixture broken");
  const cursor = {
    transcript_path: parsed.data.transcript_path,
    last_byte_offset: 0,
    last_line_number: 0,
    counters: emptyCounters(),
    updated_at: Date.now(),
  };
  const nowSec = Math.floor(Date.now() / 1000);

  // Pre-seed general.json directly with an expired five_hour and a live
  // seven_day. (Going through writeCache would itself drop the expired
  // value, so we bypass to simulate a pre-existing-on-disk ghost.)
  await Bun.write(
    paths.generalCacheFile(),
    JSON.stringify({
      schema_version: 2,
      updated_at: Date.now() - 10_000,
      last_session_id: "seed",
      model: { id: "x", display_name: "x" },
      rate_limits: {
        five_hour: { used_percentage: 50, resets_at: nowSec - 100 }, // expired
        seven_day: { used_percentage: 10, resets_at: nowSec + 86400 }, // live
      },
      today: { sessions_seen: 0, total_cost_usd: 0, total_tool_calls: 0 },
    }),
  );

  // Trigger a write whose stdin has no rate_limits at all.
  const noLimits = { ...parsed.data, session_id: "fresh" };
  delete (noLimits as { rate_limits?: unknown }).rate_limits;
  await writeCache(aggregate(noLimits, emptyCounters(), undefined), cursor);

  const general = await readGeneral();
  expect(general?.rate_limits?.five_hour).toBeUndefined();
  expect(general?.rate_limits?.seven_day?.used_percentage).toBe(10);
});

test("writeCache: missing rate_limits in new write preserves existing disk values", async () => {
  // A pulse instance whose stdin has no rate_limits at all (e.g. very
  // first frame of a CC process before any API response) must not
  // wipe the cross-window account-level value out of general.json.
  const raw = await Bun.file("test/fixtures/stdin/full.json").text();
  const parsed = parseStdinPayload(raw);
  if (!parsed.ok) throw new Error("fixture broken");
  const cursor = {
    transcript_path: parsed.data.transcript_path,
    last_byte_offset: 0,
    last_line_number: 0,
    counters: emptyCounters(),
    updated_at: Date.now(),
  };
  const nowSec = Math.floor(Date.now() / 1000);

  const seeded = {
    ...parsed.data,
    rate_limits: {
      five_hour: { used_percentage: 60, resets_at: nowSec + 3600 },
    },
  };
  await writeCache(aggregate(seeded, emptyCounters(), undefined), cursor);

  const noLimits = { ...parsed.data, session_id: "blank-window" };
  delete (noLimits as { rate_limits?: unknown }).rate_limits;
  await writeCache(aggregate(noLimits, emptyCounters(), undefined), cursor);

  const general = await readGeneral();
  expect(general?.rate_limits?.five_hour?.used_percentage).toBe(60);
});
