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

// Stable widths removed: layout is allowed to jump as digits flip in/out.
// Users can still opt in per-item via options.min_width.

function renderItem(snap: PulseSnapshot, item: Item, theme: Theme | undefined): string | null {
  try {
    const renderer = RENDERERS[item.type];
    let value = renderer(snap, item);
    if (item.hide_when_empty && !value.trim()) return null;
    // Empty-string from a renderer is also the auto-hide signal for counters
    // / cost / duration when the underlying value is zero. Skip even when
    // hide_when_empty is not explicitly set so fresh sessions stay clean.
    if (value === "") return null;
    // Only pad when user explicitly opts in via options.min_width.
    const minW = item.options?.min_width ?? 0;
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
