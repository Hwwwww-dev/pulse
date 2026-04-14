import type { PulseSnapshot } from "../core/types.ts";
import type { PulseConfig, Item } from "../config/schema.ts";
import { RENDERERS, LABEL_STYLE_OVERRIDES } from "./items/index.ts";
import { applyStyle, bgCode, detectColorLevel } from "./ansi.ts";
import type { TextStyleInput } from "./ansi.ts";
import { THEMES, type Theme } from "../config/themes.ts";

type Line = PulseConfig["lines"][number];

// P1-4: avoid creating merged object when not needed
function mergeStyle(
  a: TextStyleInput | undefined,
  b: TextStyleInput | undefined,
  override?: Partial<TextStyleInput>,
): TextStyleInput | undefined {
  if (!a && !b && !override) return undefined;
  return { ...(a ?? {}), ...(b ?? {}), ...(override ?? {}) };
}

function padToWidth(value: string, width: number, align: "left" | "right"): string {
  if (width <= 0 || value.length >= width) return value;
  const pad = " ".repeat(width - value.length);
  return align === "left" ? value + pad : pad + value;
}

// Default stable widths for numeric items so the surrounding layout stops
// jumping as digits flip in/out. Only applied when the user hasn't set an
// explicit options.min_width (opt-out via min_width: 0). Compound renderers
// (tokens_summary with multiple parts, breakdown-enabled counters, bars) are
// intentionally excluded — their width is inherently variable. Overflow is
// always allowed, so oversized values just push the surroundings out rather
// than truncate.
function defaultMinWidth(item: Item): number {
  const fmt = item.options?.format;
  switch (item.type) {
    case "cost":
      if (fmt === "usd4") return 8; // "$99.9999"
      if (fmt === "compact") return 5;
      return 6; // default usd2 — "$99.99"
    case "duration":
    case "api_duration":
      if (fmt === "duration_ms") return 0;
      if (fmt === "duration_hms") return 8; // "1h 2m 5s"
      return 5; // compact — "1h02m" / "2m05s"
    case "tokens_input":
    case "tokens_output":
    case "tokens_cache_read":
    case "tokens_cache_create":
      if (fmt === "tokens_full") return 0;
      return 5; // tokens_compact — "999.9k" / "1.2M"
    case "context_usage":
      if (item.options?.show_bar || item.options?.ctx_show_absolute) return 0;
      return fmt === "percent1" ? 6 : 4; // "100.0%" / "100%"
    case "tool_calls":
    case "agent_calls":
    case "skill_calls":
      if (item.options?.show_breakdown) return 0;
      return 3;
    case "lines_changed":
      return 8; // "+999/-99"
    default:
      return 0;
  }
}

function renderItem(snap: PulseSnapshot, item: Item, theme: Theme | undefined): string | null {
  try {
    const renderer = RENDERERS[item.type];
    let value = renderer(snap, item);
    if (item.hide_when_empty && !value.trim()) return null;
    // Empty-string from a renderer is also the auto-hide signal for counters
    // / cost / duration when the underlying value is zero. Skip even when
    // hide_when_empty is not explicitly set so fresh sessions stay clean.
    if (value === "") return null;
    // Explicit options.min_width (including 0 as opt-out) wins; otherwise
    // fall back to the type/format default so noisy numeric slots stay
    // stable out of the box.
    const minW = item.options?.min_width ?? defaultMinWidth(item);
    if (minW > 0) {
      value = padToWidth(value, minW, item.options?.min_width_align ?? "right");
    }

    const labelOverride = LABEL_STYLE_OVERRIDES[item.type]?.(snap, item);
    const themeStyle = theme?.defaults.itemStyle as TextStyleInput | undefined;
    const itemStyle = item.style as TextStyleInput | undefined;
    const labelStyle = item.label_style as TextStyleInput | undefined;

    // Value style = theme + item.style. Sub-part effects (dynamic_color,
    // blink targeted at bar/value) are pre-embedded by the renderer itself
    // via wrapPartial, so the engine must NOT also try to apply them here
    // (that would collide with the inner SGR toggles and break nesting).
    const valueStyle = mergeStyle(themeStyle, itemStyle);

    // P0-2: Engine owns label assembly
    let styled: string;
    if (item.show_label === false || !item.label) {
      styled = applyStyle(value, valueStyle);
    } else {
      // Label effective style: explicit label_style wins; otherwise inherit
      // the value's static style. Label-targeted dynamic color / blink is
      // layered on top via labelOverride regardless of which base applies.
      const baseLabelStyle = labelStyle
        ? mergeStyle(themeStyle, labelStyle)
        : valueStyle;
      const effectiveLabelStyle = mergeStyle(baseLabelStyle, undefined, labelOverride);
      const labelText = item.label + (item.label_separator ?? " ");
      styled = applyStyle(labelText, effectiveLabelStyle) + applyStyle(value, valueStyle);
    }

    // Margins live OUTSIDE of style so they don't get the item's bg/fg applied.
    const ml = item.margin_left ?? "";
    const mr = item.margin_right ?? "";
    return `${ml}${styled}${mr}`;
  } catch {
    return applyStyle("?", { fg: "red" });
  }
}

function renderLine(snap: PulseSnapshot, line: Line, fallbackSep: string, theme: Theme | undefined): string {
  const lineBg = line.bg ?? theme?.defaults.lineBg;
  const level = detectColorLevel();
  const bgPrefix = lineBg && level !== "none" ? bgCode(lineBg, level) : "";
  const bgSuffix = bgPrefix ? "\x1b[49m" : "";
  const defaultSep = line.separator ?? fallbackSep;

  // Single-pass: render each item, track its trailing separator, emit bgPrefix
  // before each item and before each separator so line bg survives item-level
  // resets (sequential single-param SGRs). Layout: bgPrefix item (bgPrefix sep bgPrefix item)* bgSuffix
  let result = "";
  let prevSep: string | null = null;
  let first = true;

  for (const item of line.items) {
    const text = renderItem(snap, item, theme);
    if (text === null) continue;
    if (first) {
      result = bgPrefix + text;
      first = false;
    } else {
      result += bgPrefix + (prevSep ?? defaultSep) + bgPrefix + text;
    }
    prevSep = item.trailing_separator ?? null;
  }

  return result ? result + bgSuffix : result;
}

export function renderSafe(snap: PulseSnapshot, config: PulseConfig): string {
  try {
    const theme: Theme | undefined = THEMES[config.theme];
    return config.lines
      .map((l) => renderLine(snap, l, config.default_separator, theme))
      .join("\n");
  } catch {
    return "";
  }
}
