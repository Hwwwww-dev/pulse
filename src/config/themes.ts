import type { TextStyle } from "../core/types.ts";
import { POWERLINE_SLOT_BGS } from "./palette.ts";

/**
 * Optional powerline config attached to a theme. When present, `renderLine`
 * switches to the powerline code path: items get backgrounds cycled from
 * `palette`, and transitions between items (and the end cap) are drawn with
 * the arrow glyph so adjacent colors flow into each other.
 */
export interface PowerlineConfig {
  /** Cycled background colors, one per visible item (wraps modulo length). */
  palette: readonly string[];
  /** Transition glyph drawn between slots. Defaults to "\ue0b0" ().  */
  arrow: string;
  /** Forced foreground that sits on top of every palette slot. */
  fg: string;
  /** Horizontal padding inserted on each side of the item content. */
  padding?: number;
}

export interface Theme {
  name: string;
  defaults: {
    itemStyle: TextStyle;
    lineBg?: string;
  };
  powerline?: PowerlineConfig;
}

export const THEMES: Record<string, Theme> = {
  minimal: { name: "minimal", defaults: { itemStyle: {} } },
  pastel: {
    name: "pastel",
    defaults: { itemStyle: { color: "#C792EA" } },
  },
  powerline: {
    name: "powerline",
    // Powerline forces its own bold white fg internally (see
    // renderPowerlineLine), so the theme-level itemStyle stays empty
    // and `color` on user items is instead translated to the slot bg.
    defaults: { itemStyle: {} },
    powerline: {
      palette: POWERLINE_SLOT_BGS,
      arrow: "\ue0b0",
      fg: "#FFFFFF",
      padding: 1,
    },
  },
};
