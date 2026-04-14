import type { PulseSnapshot } from "../../core/types.ts";
import type { Item } from "../../config/schema.ts";

export const tokenRateRenderer = (snap: PulseSnapshot, item: Item): string => {
  const samples = snap.counters?.usage_samples ?? [];
  if (samples.length === 0) return "";
  const windowSec = (item.options?.rate_window_sec as number | undefined) ?? 60;
  const now = snap.captured_at;
  const cutoff = now - windowSec * 1000;
  const recent = samples.filter((s) => s.ts >= cutoff);
  if (recent.length === 0) return "";
  const sumIn = recent.reduce((a, s) => a + s.in_delta, 0);
  const sumOut = recent.reduce((a, s) => a + s.out_delta, 0);
  const sep = (item.options?.parts_separator as string | undefined) ?? " ";
  const fmt = (item.options?.rate_format as string | undefined) ?? "per_sec";
  const inPerSec = sumIn / windowSec;
  const outPerSec = sumOut / windowSec;
  const factor = fmt === "per_min" ? 60 : 1;
  const inRate = Math.round(inPerSec * factor);
  const outRate = Math.round(outPerSec * factor);
  const unit = fmt === "per_min" ? "tok/min" : "tok/s";
  const partsCfg = (item.options?.rate_parts as string[] | undefined) ?? ["in", "out"];
  const parts: string[] = [];
  for (const p of partsCfg) {
    if (p === "in") parts.push(`\u2193 ${inRate} ${unit}`);
    else if (p === "out") parts.push(`\u2191 ${outRate} ${unit}`);
    else if (p === "total") parts.push(`\u03a3 ${inRate + outRate} ${unit}`);
  }
  return parts.join(sep);
};
