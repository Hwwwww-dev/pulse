import { z } from "zod";
import type { ClaudeStdinPayload } from "../core/types.ts";

const Model = z.object({ id: z.string(), display_name: z.string() });

const Workspace = z.object({
  current_dir: z.string(),
  project_dir: z.string(),
  added_dirs: z.array(z.string()),
  git_worktree: z.string().optional(),
});

const Cost = z.object({
  total_cost_usd: z.number(),
  total_duration_ms: z.number(),
  total_api_duration_ms: z.number(),
  total_lines_added: z.number(),
  total_lines_removed: z.number(),
});

const CurrentUsage = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_creation_input_tokens: z.number(),
  cache_read_input_tokens: z.number(),
});

const ContextWindow = z.object({
  total_input_tokens: z.number(),
  total_output_tokens: z.number(),
  context_window_size: z.number(),
  used_percentage: z.number(),
  remaining_percentage: z.number(),
  current_usage: CurrentUsage,
});

const RateWindow = z.object({
  used_percentage: z.number(),
  resets_at: z.number(),
});

const RateLimits = z
  .object({
    five_hour: RateWindow.optional(),
    seven_day: RateWindow.optional(),
  })
  .optional();

const Worktree = z
  .object({
    name: z.string(),
    path: z.string(),
    branch: z.string().optional(),
    original_cwd: z.string().optional(),
    original_branch: z.string().optional(),
  })
  .optional();

const Payload = z.object({
  session_id: z.string(),
  session_name: z.string().optional(),
  transcript_path: z.string(),
  cwd: z.string(),
  version: z.string(),
  model: Model,
  workspace: Workspace,
  output_style: z.object({ name: z.string() }).optional(),
  cost: Cost,
  context_window: ContextWindow,
  exceeds_200k_tokens: z.boolean(),
  rate_limits: RateLimits,
  vim: z.object({ mode: z.enum(["NORMAL", "INSERT"]) }).optional(),
  agent: z.object({ name: z.string() }).optional(),
  worktree: Worktree,
});

export type ParseResult =
  | { ok: true; data: ClaudeStdinPayload }
  | { ok: false; error: string };

export function parseStdinPayload(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `invalid json: ${(e as Error).message}` };
  }
  const parsed = Payload.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.toString() };
  }
  return { ok: true, data: parsed.data as ClaudeStdinPayload };
}

export async function readStdinJson(timeoutMs: number): Promise<ParseResult> {
  const chunks: Uint8Array[] = [];
  const deadline = new Promise<ParseResult>((resolve) =>
    setTimeout(() => resolve({ ok: false, error: "stdin timeout" }), timeoutMs),
  );
  const reader = (async (): Promise<ParseResult> => {
    for await (const chunk of Bun.stdin.stream()) chunks.push(chunk);
    const raw = new TextDecoder().decode(Buffer.concat(chunks));
    return parseStdinPayload(raw);
  })();
  return Promise.race([reader, deadline]);
}
