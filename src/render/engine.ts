import type { PulseSnapshot } from "../core/types.ts";
import type { PulseConfig, Item } from "../config/schema.ts";
import { RENDERERS, LABEL_STYLE_OVERRIDES } from "./items/index.ts";
import { applyStyle, bgCode, fgCode, detectColorLevel } from "./ansi.ts";
import type { TextStyleInput, ColorLevel } from "./ansi.ts";
import { THEMES, type Theme, type PowerlineConfig } from "../config/themes.ts";
import { FG_TO_BG_COLOR, BG_TO_FG_COLOR } from "../config/palette.ts";

type Line = PulseConfig["lines"][number];
type UserStyle = Item["style"];

/**
 * Translate a user-facing TextStyle (`color` + booleans) into the
 * ANSI-facing TextStyleInput (`fg`/`bg` + booleans). The mapping is
 * theme-dependent: on powerline, a user's `color` selection becomes
 * the item background (overriding the palette slot). On every other
 * theme, it becomes the foreground. `bold`/`italic`/`dim`/`underline`
 * pass through unchanged.
 */
/**
 * Translate a user-facing color into the hex appropriate for the active
 * theme mode. A color picked under minimal (an fg hex) is looked up in
 * FG_TO_BG_COLOR when rendering powerline, and vice versa via
 * BG_TO_FG_COLOR. Custom hex codes the user typed in directly — or
 * legacy palette colors that aren't in the table — pass through
 * unchanged, so nothing ever silently disappears across theme switches.
 */
function mapColorForMode(color: string, mode: "fg" | "bg"): string {
  if (mode === "bg") return FG_TO_BG_COLOR.get(color) ?? color;
  return BG_TO_FG_COLOR.get(color) ?? color;
}

function toAnsiStyle(
  style: UserStyle | undefined,
  mode: "fg" | "bg",
): TextStyleInput | undefined {
  if (!style) return undefined;
  const out: TextStyleInput = {};
  if (style.bold !== undefined) out.bold = style.bold;
  if (style.italic !== undefined) out.italic = style.italic;
  if (style.underline !== undefined) out.underline = style.underline;
  if (style.dim !== undefined) out.dim = style.dim;
  if (style.color) {
    const resolved = mapColorForMode(style.color, mode);
    if (mode === "bg") out.bg = resolved;
    else out.fg = resolved;
  }
  return out;
}

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
    // `color` → fg (classic) or bg (powerline) depends on the active
    // theme. Every caller of applyStyle / wrapPartial still speaks
    // fg/bg directly — translation happens at this boundary only.
    const styleMode: "fg" | "bg" = theme?.powerline ? "bg" : "fg";
    const themeStyle = toAnsiStyle(theme?.defaults.itemStyle, styleMode);
    const itemStyle = toAnsiStyle(item.style, styleMode);
    const labelStyle = toAnsiStyle(item.label_style, styleMode);

    // Value style = theme + item.style. Sub-part effects (dynamic_color,
    // blink targeted at bar/value) are pre-embedded by the renderer itself
    // via wrapPartial, so the engine must NOT also try to apply them here
    // (that would collide with the inner SGR toggles and break nesting).
    const valueStyle = mergeStyle(themeStyle, itemStyle);

    // P0-2: Engine owns label assembly
    // Icon + space + label. The space compensates for Nerd Font PUA glyphs
    // whose terminal width (2 cells) exceeds string-width's measurement (1),
    // preventing adjacent label text from overwriting the glyph's 2nd cell.
    // Only insert the spacer when both icon and label are present; when icon
    // stands alone the label_separator already provides adequate padding.
    const effectiveLabel = (item.icon ? item.icon + (item.label ? " " : "") : "") + (item.label ?? "");
    let styled: string;
    if (item.show_label === false || effectiveLabel === "") {
      styled = applyStyle(value, valueStyle);
    } else {
      // Label effective style: explicit label_style wins; otherwise inherit
      // the value's static style. Label-targeted dynamic color / blink is
      // layered on top via labelOverride regardless of which base applies.
      const baseLabelStyle = labelStyle
        ? mergeStyle(themeStyle, labelStyle)
        : valueStyle;
      const effectiveLabelStyle = mergeStyle(baseLabelStyle, undefined, labelOverride);
      const labelText = effectiveLabel + (item.label_separator ?? " ");
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
  const level = detectColorLevel();
  // Powerline mode takes a completely different render path: cycling bg
  // palette with arrow transitions between items. Everything else falls
  // through to the classic single-bg-line path below.
  if (theme?.powerline && level !== "none") {
    return renderPowerlineLine(snap, line, theme, theme.powerline, level);
  }

  const lineBg = line.bg ?? theme?.defaults.lineBg;
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

/**
 * Render a line in powerline mode: each visible item gets a background from
 * the theme's palette (cycling), and slots are joined with an arrow glyph
 * whose fg = previous slot's bg and bg = next slot's bg — producing the
 * classic "ribbon" effect. The line ends with a closing arrow that fades
 * into the default terminal background.
 */
function renderPowerlineLine(
  snap: PulseSnapshot,
  line: Line,
  theme: Theme,
  pl: PowerlineConfig,
  level: ColorLevel,
): string {
  const padding = " ".repeat(Math.max(0, pl.padding ?? 1));

  // Pre-render all visible slots so we know their assigned bg before
  // building transitions. Hidden items don't consume a palette slot so
  // colors stay packed across flickering items.
  const slots: { bg: string; text: string }[] = [];
  for (const item of line.items) {
    // Background: `item.style.color` (the user's ColorPicker choice) wins
    // over the palette cycle. If that color is an fg from PALETTE_ROWS
    // (e.g. config was saved under minimal), translate it to its paired
    // slot bg here so the ribbon stays dark enough for white text. Colors
    // outside the table pass through literally — that's how power users
    // with custom hex picks or legacy configs keep full control.
    const rawColor = item.style?.color;
    const bg = rawColor
      ? mapColorForMode(rawColor, "bg")
      : pl.palette[slots.length % pl.palette.length]!;
    // Powerline mode owns every foreground on the line. User `color`
    // was just consumed as the slot bg, so we clear item.style entirely
    // and rely on the forced white fg emitted by `style: { color: pl.fg }`
    // below + `toAnsiStyle`'s fg mapping. dynamic_color / blink ramps
    // are disabled because their sub-part fg overrides would punch
    // holes through the ribbon. `label_style` is cleared so labels
    // inherit the forced white instead of racing against it. Margins
    // are dropped because powerline provides its own padding via the
    // `padding` knob — they would leak untinted chars into the ribbon.
    const powerlineOptions = item.options
      ? {
          ...item.options,
          dynamic_color: false,
          blink: false,
        }
      : undefined;
    const forced: Item = {
      ...item,
      // The slot bg is painted by the outer powerline loop, so the
      // item only needs to carry the forced white fg. We smuggle it
      // through `color` + a "fg mode" override on renderItem by
      // temporarily swapping themes — but simpler: reach into the
      // ANSI layer directly via a custom marker theme.
      style: { color: pl.fg, bold: true },
      label_style: undefined,
      ...(powerlineOptions ? { options: powerlineOptions as Item["options"] } : {}),
      margin_left: "",
      margin_right: "",
    };
    // Render the item in "fg mode" (color → fg). We do that by passing
    // a shim theme without the powerline flag so toAnsiStyle resolves
    // `color` as a foreground. The outer loop then paints the bg on
    // top of the result.
    const fgTheme: Theme = { name: theme.name, defaults: theme.defaults };
    const rawText = renderItem(snap, forced, fgTheme);
    if (rawText === null) continue;
    // Inside a slot, `renderItem` may emit multiple applyStyle segments
    // (label + value) as well as sub-part wraps (bar fg toggles). Each
    // segment ends with ansi.ts's RESET_SEQ which includes `\x1b[49m`
    // (bg reset) — that drops the slot bg and shows black gaps between
    // label/value and inside bars. Re-inject the slot bg after every
    // `\x1b[49m` so the ribbon stays solid across every SGR boundary.
    const bgC = bgCode(bg, level);
    const text = rawText.replaceAll("\x1b[49m", `\x1b[49m${bgC}`);
    slots.push({ bg, text });
  }

  if (slots.length === 0) return "";

  // Assemble: [bg] pad text [bg] pad [arrow fg=this bg=next] ...
  // The trailing `bgCode(bg)` before the padding re-establishes the slot
  // bg after `applyStyle`'s internal reset inside `text`.
  let out = "";
  for (let i = 0; i < slots.length; i++) {
    const { bg, text } = slots[i]!;
    const bgC = bgCode(bg, level);
    out += bgC + padding + text + bgC + padding;
    if (i < slots.length - 1) {
      const nextBg = slots[i + 1]!.bg;
      // Transition: set new bg first so left edge of arrow is already on the
      // next color, then fg = current bg so the arrow glyph fills from the
      // previous color inward.
      out += bgCode(nextBg, level) + fgCode(bg, level) + pl.arrow;
    } else {
      // End cap: reset bg to terminal default and stamp the arrow in the
      // final slot's color so the ribbon closes cleanly.
      out += "\x1b[49m" + fgCode(bg, level) + pl.arrow + "\x1b[39m";
    }
  }
  return out;
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
