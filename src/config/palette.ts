// ============================================================
// Pulse — shared color palette + theme-mode mapping
//
// A "slot" is a semantic column in the 8-wide ColorPicker. Each
// slot has up to three foregrounds (accent, pastel, neutral) and
// one background suitable for powerline ribbon rendering. When
// the active theme switches between fg-mode (classic) and bg-mode
// (powerline), the render engine looks the user's picked color up
// in this table and substitutes the sibling for the new mode —
// so a config saved under minimal stays readable under powerline
// and vice versa.
//
// Colors outside the table (custom hex, legacy configs) are used
// literally by the engine — the mapping only kicks in for picks
// made through the built-in palette.
// ============================================================

// 24-color fg palette, tuned for dark terminals. Kanagawa-adjacent.
// Rows: accents (primary picks) / pastels (long-read softer) /
// neutrals (warm gray ramp). Each column shares a hue family so
// accent[i] and pastel[i] map to the same powerline slot bg.
export const PALETTE_ROWS: readonly (readonly string[])[] = [
  ["#E46876", "#E6C384", "#98BB6C", "#957FB8", "#7FB4CA", "#7E9CD8", "#D27E99", "#E8927C"],
  ["#F5B1B8", "#F6E0A8", "#C8DDA6", "#C5B8DF", "#B7D4DD", "#B9C5E6", "#EDC1D0", "#F3C7B7"],
  ["#F2EFE7", "#D6D2C6", "#A29E92", "#7A7668", "#4D4A41", "#2E2C25", "#1C1B16", "#000000"],
] as const;

export const PALETTE: readonly string[] = PALETTE_ROWS.flat();

// Powerline slot backgrounds, one per column. Hue-aligned with the fg
// columns above so column i looks coherent whichever row the user
// picked. These are also the cycled fallback palette when an item has
// no user-set color.
export const POWERLINE_SLOT_BGS: readonly string[] = [
  "#B05360", // col 0 — dusty red      ↔ #E46876 / #F5B1B8
  "#B8792D", // col 1 — honey amber    ↔ #E6C384 / #F6E0A8
  "#6C8A41", // col 2 — matcha green   ↔ #98BB6C / #C8DDA6
  "#7A5B96", // col 3 — iris purple    ↔ #957FB8 / #C5B8DF
  "#4D8077", // col 4 — spring teal    ↔ #7FB4CA / #B7D4DD
  "#4B7B9D", // col 5 — wave blue      ↔ #7E9CD8 / #B9C5E6
  "#8C4A62", // col 6 — muted rose     ↔ #D27E99 / #EDC1D0
  "#8C5340", // col 7 — terracotta     ↔ #E8927C / #F3C7B7
] as const;

/**
 * Map any fg in PALETTE_ROWS[0..1] (accents + pastels) to its powerline
 * slot bg. Neutrals (row 2) intentionally have no bg mapping — gray fgs
 * wouldn't read well as a ribbon slot, so we let the user's literal
 * choice pass through unchanged for those.
 */
export const FG_TO_BG_COLOR: ReadonlyMap<string, string> = new Map(
  [PALETTE_ROWS[0]!, PALETTE_ROWS[1]!].flatMap((row) =>
    row.map((fg, col) => [fg, POWERLINE_SLOT_BGS[col]!] as [string, string]),
  ),
);

/**
 * Map any slot bg back to its canonical accent fg (row 0). Used when
 * the user picked a color under powerline and then switches to a
 * classic theme — we swap the bg for a brighter sibling instead of
 * painting dark-teal fg text on a black terminal.
 */
export const BG_TO_FG_COLOR: ReadonlyMap<string, string> = new Map(
  POWERLINE_SLOT_BGS.map((bg, col) => [bg, PALETTE_ROWS[0]![col]!] as [string, string]),
);
