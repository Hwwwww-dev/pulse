import type { PulseSnapshot } from "../../core/types.ts";
import type { Item } from "../../config/schema.ts";
import { formatNumber, formatTokens } from "../format.ts";
import { drawBar } from "./helpers.ts";

function resolveContextFormat(item: Item): "percent0" | "percent1" {
  const f = item.options?.format;
  if (f === "percent0" || f === "percent1") return f;
  return "percent0";
}

function resolveTokensFormat(item: Item): "tokens_compact" | "tokens_full" {
  const f = item.options?.format;
  if (f === "tokens_compact" || f === "tokens_full") return f;
  return "tokens_compact";
}

function resolvePct(rawUsed: number, item: Item): number {
  return item.options?.display_mode === "remaining" ? Math.max(0, 100 - rawUsed) : rawUsed;
}

export const contextUsageRenderer = (snap: PulseSnapshot, item: Item): string => {
  const used = snap.claude.context_window.used_percentage;
  const pct = resolvePct(used, item);
  const pieces: string[] = [];
  if (item.options?.show_bar) pieces.push(drawBar(pct, item));
  if (item.options?.ctx_show_absolute) {
    const size = snap.claude.context_window.context_window_size;
    const abs = Math.round((size * pct) / 100);
    const absFmt = item.options?.ctx_absolute_format ?? "tokens_compact";
    pieces.push(formatTokens(abs, absFmt));
  } else {
    pieces.push(formatNumber(pct, resolveContextFormat(item)));
  }
  // Bar↔value gap is HARDCODED at 2 spaces. parts_separator does NOT
  // affect bars — they always need a visible gap before adjacent text.
  return pieces.join("  ");
};

export const contextBarRenderer = (snap: PulseSnapshot, item: Item): string => {
  const used = snap.claude.context_window.used_percentage;
  return drawBar(resolvePct(used, item), item);
};

// Resolve the effective session total for each token dimension as
// max(stdin.context_window.*, counters.usage_totals.*).
// Rationale: after Claude Code --resume, stdin may report only the latest
// frame while JSONL aggregation accumulates the full history (or vice versa
// when JSONL hasn't been fully read yet). Taking the max guarantees the
// displayed value never regresses and converges to the true total once
// JSONL is fully parsed.
function totalInputTokens(snap: PulseSnapshot): number {
  return Math.max(
    snap.claude.context_window.total_input_tokens,
    snap.counters.usage_totals.input_tokens,
  );
}

function totalOutputTokens(snap: PulseSnapshot): number {
  return Math.max(
    snap.claude.context_window.total_output_tokens,
    snap.counters.usage_totals.output_tokens,
  );
}

function totalCacheReadTokens(snap: PulseSnapshot): number {
  return Math.max(
    snap.claude.context_window.current_usage.cache_read_input_tokens,
    snap.counters.usage_totals.cache_read_input_tokens,
  );
}

function totalCacheCreateTokens(snap: PulseSnapshot): number {
  return Math.max(
    snap.claude.context_window.current_usage.cache_creation_input_tokens,
    snap.counters.usage_totals.cache_creation_input_tokens,
  );
}

export const tokensInputRenderer = (snap: PulseSnapshot, item: Item): string =>
  formatTokens(totalInputTokens(snap), resolveTokensFormat(item));

export const tokensOutputRenderer = (snap: PulseSnapshot, item: Item): string =>
  formatTokens(totalOutputTokens(snap), resolveTokensFormat(item));

export const tokensCacheReadRenderer = (snap: PulseSnapshot, item: Item): string =>
  formatTokens(totalCacheReadTokens(snap), resolveTokensFormat(item));

export const tokensCacheCreateRenderer = (snap: PulseSnapshot, item: Item): string =>
  formatTokens(totalCacheCreateTokens(snap), resolveTokensFormat(item));

export const tokensSummaryRenderer = (snap: PulseSnapshot, item: Item): string => {
  const parts = item.options?.tokens_parts ?? ["input", "output", "cache_read"];
  const icons = item.options?.tokens_icons ?? {};
  const fmt = resolveTokensFormat(item);
  const get = (p: string): number => {
    switch (p) {
      case "input":
        return totalInputTokens(snap);
      case "output":
        return totalOutputTokens(snap);
      case "cache_read":
        return totalCacheReadTokens(snap);
      case "cache_create":
        return totalCacheCreateTokens(snap);
      case "total":
        return (
          totalInputTokens(snap) +
          totalOutputTokens(snap) +
          totalCacheReadTokens(snap) +
          totalCacheCreateTokens(snap)
        );
      default:
        return 0;
    }
  };
  const sep = item.options?.parts_separator ?? " ";
  return parts.map((p) => `${icons[p] ?? ""}${formatTokens(get(p), fmt)}`).join(sep);
};
