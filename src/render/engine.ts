import type { PulseSnapshot } from "../core/types.ts";
import type { PulseConfig, Item } from "../config/schema.ts";
import { RENDERERS, FG_OVERRIDES } from "./items/index.ts";
import { applyStyle, bgCode, detectColorLevel } from "./ansi.ts";
import type { TextStyleInput } from "./ansi.ts";
import { THEMES, type Theme } from "../config/themes.ts";

type Line = PulseConfig["lines"][number];

// P1-4: avoid creating merged object when not needed
function mergeStyle(a: TextStyleInput | undefined, b: TextStyleInput | undefined, fgOverride?: string): TextStyleInput | undefined {
  if (!a && !b && !fgOverride) return undefined;
  const base: TextStyleInput = { ...(a ?? {}), ...(b ?? {}) };
  if (fgOverride) base.fg = fgOverride;
  return base;
}

function renderItem(snap: PulseSnapshot, item: Item, theme: Theme | undefined): string | null {
  try {
    const renderer = RENDERERS[item.type];
    const value = renderer(snap, item);
    if (item.hide_when_empty && !value.trim()) return null;

    const fgOverride = FG_OVERRIDES[item.type]?.(snap, item);
    const themeStyle = theme?.defaults.itemStyle as TextStyleInput | undefined;
    const itemStyle = item.style as TextStyleInput | undefined;
    const labelStyle = item.label_style as TextStyleInput | undefined;

    // P1-4: only spread when at least one source is non-empty
    const valueStyle = mergeStyle(themeStyle, itemStyle, fgOverride);

    // P0-2: Engine owns label assembly
    let styled: string;
    if (item.show_label === false || !item.label) {
      styled = applyStyle(value, valueStyle);
    } else {
      // labelStyle inherits valueStyle if no explicit label_style
      const effectiveLabelStyle = labelStyle
        ? mergeStyle(themeStyle, labelStyle)
        : valueStyle;
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
