import type {
  AgentEntry,
  JsonlCursor,
  RecentToolCall,
  SessionCounters,
  SessionUsageTotals,
  TodoItem,
  UsageSample,
} from "../core/types.ts";
import { MAX_AGENT_ENTRIES, MAX_RECENT_TOOLS } from "../core/types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyUsageTotals(): SessionUsageTotals {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
}

export function emptyCounters(): SessionCounters {
  return {
    tool_calls_total: 0,
    tool_calls_by_name: {},
    agent_calls_total: 0,
    agent_calls_by_type: {},
    message_count: { user: 0, assistant: 0 },
    skill_calls_total: 0,
    skill_calls_by_name: {},
    usage_totals: emptyUsageTotals(),
    // HUD enrichment fields are intentionally left undefined (lazy init)
  };
}

/** Parse ISO-8601 timestamp string to unix ms. Returns null on failure. */
function parseTimestamp(s: string | undefined): number | null {
  if (!s || typeof s !== "string") return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

function toNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export interface JsonlParseResult {
  counters: SessionCounters;
  cursor: JsonlCursor;
}

// ---------------------------------------------------------------------------
// cloneCounters — also used by cache.ts via re-export
// ---------------------------------------------------------------------------

export function cloneCounters(c: SessionCounters): SessionCounters {
  // Defensive: old cache files (pre-usage_totals schema) may omit the field.
  const ut = c.usage_totals ?? emptyUsageTotals();
  const result: SessionCounters = {
    tool_calls_total: c.tool_calls_total,
    tool_calls_by_name: { ...c.tool_calls_by_name },
    agent_calls_total: c.agent_calls_total,
    agent_calls_by_type: { ...c.agent_calls_by_type },
    message_count: { user: c.message_count.user, assistant: c.message_count.assistant },
    skill_calls_total: c.skill_calls_total,
    skill_calls_by_name: { ...c.skill_calls_by_name },
    usage_totals: {
      input_tokens: ut.input_tokens ?? 0,
      output_tokens: ut.output_tokens ?? 0,
      cache_read_input_tokens: ut.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: ut.cache_creation_input_tokens ?? 0,
    },
  };
  // Clone HUD enrichment fields (shallow copy arrays)
  if (c.agent_entries !== undefined) {
    result.agent_entries = c.agent_entries.map((e) => ({ ...e }));
  }
  if (c.recent_tools !== undefined) {
    result.recent_tools = [...c.recent_tools];
  }
  if (c.todos !== undefined) {
    result.todos = c.todos.map((t) => ({ ...t }));
  }
  if (c.usage_samples !== undefined) {
    result.usage_samples = [...c.usage_samples];
  }
  return result;
}

// ---------------------------------------------------------------------------
// consumeLine — core parsing logic
// ---------------------------------------------------------------------------

function consumeLine(counters: SessionCounters, line: string): void {
  if (!line) return;
  let row: unknown;
  try {
    row = JSON.parse(line);
  } catch {
    return;
  }
  if (!row || typeof row !== "object") return;

  const r = row as {
    type?: string;
    timestamp?: string;
    message?: { content?: unknown; usage?: unknown };
  };

  // Parse timestamp from entry (top-level field)
  const ts = parseTimestamp(r.timestamp) ?? Date.now();

  // -------------------------------------------------------------------------
  // User messages: increment counter + extract tool_result blocks
  // -------------------------------------------------------------------------
  if (r.type === "user") {
    counters.message_count.user += 1;
    const content = r.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const b = block as { type?: string; tool_use_id?: string };
        if (b.type === "tool_result" && typeof b.tool_use_id === "string") {
          // Pair with agent_entries by id
          if (counters.agent_entries) {
            const entry = counters.agent_entries.find((e) => e.id === b.tool_use_id);
            if (entry && entry.end_ts === undefined) {
              entry.end_ts = ts;
            }
          }
          // Do NOT count tool_result towards tool_calls_total
        }
      }
    }
    return;
  }

  // -------------------------------------------------------------------------
  // Assistant messages
  // -------------------------------------------------------------------------
  if (r.type !== "assistant") return;
  counters.message_count.assistant += 1;

  // Usage accumulation (cumulative totals, unchanged from v1)
  const usage = r.message?.usage;
  if (usage && typeof usage === "object") {
    const u = usage as Record<string, unknown>;
    const inDelta = toNum(u.input_tokens);
    const outDelta = toNum(u.output_tokens);
    counters.usage_totals.input_tokens += inDelta;
    counters.usage_totals.output_tokens += outDelta;
    counters.usage_totals.cache_read_input_tokens += toNum(u.cache_read_input_tokens);
    counters.usage_totals.cache_creation_input_tokens += toNum(u.cache_creation_input_tokens);

    // HUD: per-message usage sample (lazy init)
    if (!counters.usage_samples) counters.usage_samples = [];
    const sample: UsageSample = { ts, in_delta: inDelta, out_delta: outDelta };
    counters.usage_samples.push(sample);
  }

  const content = r.message?.content;
  if (!Array.isArray(content)) return;

  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as {
      type?: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
    };
    if (b.type !== "tool_use" || typeof b.name !== "string") continue;

    const toolName = b.name;
    const toolId = typeof b.id === "string" ? b.id : "";

    // Existing counters
    counters.tool_calls_total += 1;
    counters.tool_calls_by_name[toolName] = (counters.tool_calls_by_name[toolName] ?? 0) + 1;

    // HUD: recent_tools FIFO (lazy init)
    if (!counters.recent_tools) counters.recent_tools = [];
    const call: RecentToolCall = { name: toolName, ts };
    counters.recent_tools.push(call);
    if (counters.recent_tools.length > MAX_RECENT_TOOLS) {
      counters.recent_tools.shift();
    }

    if (toolName === "Task" || toolName === "Agent") {
      const input = b.input ?? {};
      const sub = input.subagent_type;
      if (typeof sub === "string") {
        counters.agent_calls_total += 1;
        counters.agent_calls_by_type[sub] = (counters.agent_calls_by_type[sub] ?? 0) + 1;
      }
      // HUD: agent_entries FIFO (lazy init)
      if (!counters.agent_entries) counters.agent_entries = [];
      const subType = typeof sub === "string" ? sub : "unknown";
      const desc = typeof input.description === "string" ? input.description : undefined;
      const entry: AgentEntry = { id: toolId, type: subType, start_ts: ts };
      if (desc !== undefined) entry.description = desc;
      counters.agent_entries.push(entry);
      if (counters.agent_entries.length > MAX_AGENT_ENTRIES) {
        counters.agent_entries.shift();
      }
    } else if (toolName === "TodoWrite") {
      const input = b.input ?? {};
      const rawTodos = input.todos;
      if (Array.isArray(rawTodos)) {
        const validated: TodoItem[] = [];
        for (const t of rawTodos) {
          if (
            t &&
            typeof t === "object" &&
            typeof (t as Record<string, unknown>).content === "string" &&
            ["pending", "in_progress", "completed"].includes(
              (t as Record<string, unknown>).status as string,
            )
          ) {
            validated.push({
              content: (t as Record<string, unknown>).content as string,
              status: (t as Record<string, unknown>).status as TodoItem["status"],
            });
          }
        }
        counters.todos = validated;
      }
    } else if (toolName === "Skill") {
      const skill = b.input?.skill;
      if (typeof skill === "string") {
        counters.skill_calls_total += 1;
        counters.skill_calls_by_name[skill] = (counters.skill_calls_by_name[skill] ?? 0) + 1;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// parseJsonlIncremental — public API
// ---------------------------------------------------------------------------

export async function parseJsonlIncremental(
  transcriptPath: string,
  prevCursor: JsonlCursor | undefined,
  maxBytesPerCall: number,
): Promise<JsonlParseResult> {
  // Schema v2 upgrade: force full replay when cursor is from v1
  if (prevCursor && ((prevCursor as { schema_version?: number }).schema_version ?? 1) < 2) {
    prevCursor = undefined;
  }

  const file = Bun.file(transcriptPath);
  const exists = await file.exists();
  if (!exists) {
    return {
      counters: emptyCounters(),
      cursor: {
        transcript_path: transcriptPath,
        last_byte_offset: 0,
        last_line_number: 0,
        counters: emptyCounters(),
        updated_at: Date.now(),
        schema_version: 2,
      } as JsonlCursor,
    };
  }
  const size = file.size;

  let startOffset = 0;
  let startCounters = emptyCounters();
  let startLine = 0;
  const sameFile =
    prevCursor !== undefined &&
    prevCursor.transcript_path === transcriptPath &&
    prevCursor.last_byte_offset <= size;
  if (sameFile && prevCursor) {
    startOffset = prevCursor.last_byte_offset;
    startCounters = cloneCounters(prevCursor.counters);
    startLine = prevCursor.last_line_number;
  }

  const counters = startCounters;
  let lineNumber = startLine;
  let offset = startOffset;
  const chunkSize = Math.max(maxBytesPerCall, 64 * 1024);

  // Loop chunks until EOF. maxBytesPerCall is a chunk-read cap (for memory),
  // not a total-read cap — otherwise `claude --resume` on a large replayed
  // transcript would undercount tools until many frames elapsed.
  while (offset < size) {
    const chunkEnd = Math.min(size, offset + chunkSize);
    const slice = await file.slice(offset, chunkEnd).text();
    let idx = 0;
    let chunkConsumed = 0;
    while (true) {
      const nl = slice.indexOf("\n", idx);
      if (nl < 0) break;
      // Strip optional trailing \r so CRLF transcripts parse identically to LF.
      const raw = slice.slice(idx, nl);
      const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
      consumeLine(counters, line);
      lineNumber += 1;
      chunkConsumed += new TextEncoder().encode(raw + "\n").length;
      idx = nl + 1;
    }
    if (chunkConsumed === 0) {
      // No complete line in this chunk.
      //  - At EOF: normal — partial trailing line, leave cursor at offset.
      //  - Mid-file: a single line is larger than chunkSize. Read remainder
      //    in one shot so oversized lines still get parsed.
      if (chunkEnd >= size) break;
      const rest = await file.slice(offset, size).text();
      let ri = 0;
      let rc = 0;
      while (true) {
        const nl = rest.indexOf("\n", ri);
        if (nl < 0) break;
        const raw = rest.slice(ri, nl);
        const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
        consumeLine(counters, line);
        lineNumber += 1;
        rc += new TextEncoder().encode(raw + "\n").length;
        ri = nl + 1;
      }
      offset += rc;
      break;
    }
    offset += chunkConsumed;
  }

  return {
    counters,
    cursor: {
      transcript_path: transcriptPath,
      last_byte_offset: offset,
      last_line_number: lineNumber,
      counters,
      updated_at: Date.now(),
      schema_version: 2,
    } as JsonlCursor,
  };
}
